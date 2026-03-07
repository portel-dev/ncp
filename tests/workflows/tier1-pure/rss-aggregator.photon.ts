/**
 * RSS Feed Aggregator Workflow
 *
 * A Photon-based workflow that aggregates multiple RSS feeds with:
 * - Progress reporting via emit
 * - Human-in-the-loop confirmations via ask
 * - Resumable execution via generators
 *
 * @name rss-aggregator
 * @description Aggregate multiple RSS feeds into a single output
 * @category Data Collection
 * @complexity beginner
 * @version 1.0.0
 *
 * @dependencies rss-parser@^3.13.0, csv-stringify@^6.4.0
 */

interface FeedEntry {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

interface AggregateParams {
  /** RSS feed URLs to aggregate */
  feeds: string[];
  /** Maximum entries per feed */
  maxPerFeed?: number;
}

interface AggregateResult {
  success: boolean;
  entriesCollected: number;
  feedsProcessed: number;
  feedsFailed: string[];
  outputFile?: string;
  entries?: FeedEntry[];
}

export default class RSSAggregator {
  /**
   * Aggregate multiple RSS feeds with progress reporting
   *
   * @param feeds Array of RSS feed URLs
   * @param maxPerFeed Maximum entries per feed (default: 10)
   */
  async *aggregate(params: AggregateParams): AsyncGenerator<any, AggregateResult, any> {
    const Parser = (await import('rss-parser')).default;
    const parser = new Parser({
      timeout: 10000,
      headers: { 'User-Agent': 'NCP-Workflow/1.0' }
    });

    const maxPerFeed = params.maxPerFeed ?? 10;
    const allEntries: FeedEntry[] = [];
    const feedsFailed: string[] = [];

    yield { emit: 'status', message: `Starting RSS aggregation for ${params.feeds.length} feeds` };

    // Process each feed
    for (let i = 0; i < params.feeds.length; i++) {
      const feedUrl = params.feeds[i];
      const progress = (i + 1) / params.feeds.length;

      yield { emit: 'progress', value: progress * 0.8, message: `Fetching: ${feedUrl}` };

      try {
        const feed = await parser.parseURL(feedUrl);
        const entries = (feed.items || []).slice(0, maxPerFeed).map((item: any) => ({
          title: item.title || 'Untitled',
          link: item.link || '',
          pubDate: item.pubDate || new Date().toISOString(),
          source: feed.title || feedUrl
        }));

        allEntries.push(...entries);

        yield { emit: 'log', message: `${feed.title}: ${entries.length} entries`, level: 'info' };

      } catch (error: any) {
        feedsFailed.push(feedUrl);
        yield { emit: 'log', message: `Failed: ${feedUrl} - ${error.message}`, level: 'warn' };
      }
    }

    // Deduplicate by link
    const seen = new Set<string>();
    const uniqueEntries = allEntries.filter(entry => {
      if (seen.has(entry.link)) return false;
      seen.add(entry.link);
      return true;
    });

    yield { emit: 'progress', value: 0.9, message: `Deduplicated: ${allEntries.length} → ${uniqueEntries.length}` };

    // Sort by date
    uniqueEntries.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    // Ask user for output format
    const format: string = yield {
      ask: 'select',
      id: 'output_format',
      message: `Found ${uniqueEntries.length} entries. Choose output format:`,
      options: [
        { value: 'json', label: 'JSON' },
        { value: 'csv', label: 'CSV' },
        { value: 'return', label: 'Return data (no file)' }
      ],
      default: 'json'
    };

    // Handle output based on format
    if (format === 'return') {
      yield { emit: 'progress', value: 1.0, message: 'Complete!' };
      yield { emit: 'toast', message: `Aggregated ${uniqueEntries.length} entries`, type: 'success' };

      return {
        success: true,
        entriesCollected: uniqueEntries.length,
        feedsProcessed: params.feeds.length - feedsFailed.length,
        feedsFailed,
        entries: uniqueEntries
      };
    }

    // Ask for output path
    const outputPath: string = yield {
      ask: 'text',
      id: 'output_path',
      message: 'Enter output file path:',
      default: `./rss-aggregated-${new Date().toISOString().split('T')[0]}.${format}`,
      pattern: format === 'json' ? '.*\\.json$' : '.*\\.csv$'
    };

    // Write output
    const fs = await import('fs/promises');

    if (format === 'json') {
      await fs.writeFile(outputPath, JSON.stringify(uniqueEntries, null, 2));
    } else {
      const { stringify } = await import('csv-stringify/sync');
      const csv = stringify(uniqueEntries, { header: true });
      await fs.writeFile(outputPath, csv);
    }

    yield { emit: 'progress', value: 1.0, message: 'Complete!' };
    yield { emit: 'toast', message: `Saved to ${outputPath}`, type: 'success' };
    yield { emit: 'artifact', type: 'document', title: 'Output File', content: outputPath };

    return {
      success: true,
      entriesCollected: uniqueEntries.length,
      feedsProcessed: params.feeds.length - feedsFailed.length,
      feedsFailed,
      outputFile: outputPath
    };
  }

  /**
   * Quick aggregate without prompts (for scheduled runs)
   * Uses pre-provided inputs for fully automated execution
   *
   * @param feeds Array of RSS feed URLs
   * @param outputPath Where to save the output
   * @param format Output format (json or csv)
   */
  async *quickAggregate(params: {
    feeds: string[];
    outputPath: string;
    format: 'json' | 'csv';
    maxPerFeed?: number;
  }): AsyncGenerator<any, AggregateResult, any> {
    // Call aggregate with pre-filled answers
    // The runtime will use preProvidedInputs to skip asks
    const generator = this.aggregate({
      feeds: params.feeds,
      maxPerFeed: params.maxPerFeed
    });

    // Forward yields but intercept asks with our values
    let result = await generator.next();

    while (!result.done) {
      const yielded = result.value;

      // If it's an ask, provide our pre-configured value
      if (yielded && 'ask' in yielded) {
        if (yielded.id === 'output_format') {
          result = await generator.next(params.format);
        } else if (yielded.id === 'output_path') {
          result = await generator.next(params.outputPath);
        } else {
          // Unknown ask, pass through
          const response = yield yielded;
          result = await generator.next(response);
        }
      } else {
        // Emit yields, pass through
        yield yielded;
        result = await generator.next();
      }
    }

    return result.value;
  }
}
