/**
 * RSS Feed Aggregator Workflow
 *
 * Fetches multiple RSS feeds, merges entries, deduplicates, and outputs to CSV.
 * Inspired by n8n's RSS aggregation workflows.
 *
 * @name rss-aggregator
 * @description Aggregate multiple RSS feeds into a single CSV file
 * @category Data Collection
 * @complexity beginner
 * @author NCP Team
 * @version 1.0.0
 *
 * @dependencies rss-parser@^3.13.0, csv-stringify@^6.4.0
 */

import { promises as fs } from 'fs';
import { join } from 'path';

interface FeedEntry {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  guid: string;
}

interface WorkflowConfig {
  feeds: string[];           // RSS feed URLs
  outputPath: string;        // Where to save CSV
  maxEntriesPerFeed?: number; // Limit entries per feed (default: 20)
  deduplicateByLink?: boolean; // Remove duplicates (default: true)
}

interface WorkflowResult {
  success: boolean;
  entriesCollected: number;
  feedsProcessed: number;
  feedsFailed: string[];
  outputFile: string;
}

/**
 * RSS Feed Aggregator
 *
 * Example usage:
 * ```typescript
 * const result = await run({
 *   feeds: [
 *     "https://hnrss.org/frontpage",
 *     "https://www.reddit.com/r/programming/.rss",
 *     "https://dev.to/feed"
 *   ],
 *   outputPath: "./aggregated-feeds.csv",
 *   maxEntriesPerFeed: 10
 * });
 * ```
 */
export async function run(config: WorkflowConfig): Promise<WorkflowResult> {
  const Parser = (await import('rss-parser')).default;
  const { stringify } = await import('csv-stringify/sync');

  const parser = new Parser({
    timeout: 10000,
    headers: {
      'User-Agent': 'NCP-Workflow-RSS-Aggregator/1.0'
    }
  });

  const maxEntries = config.maxEntriesPerFeed ?? 20;
  const deduplicate = config.deduplicateByLink ?? true;

  const allEntries: FeedEntry[] = [];
  const feedsFailed: string[] = [];

  // Fetch all feeds
  console.log(`📡 Fetching ${config.feeds.length} RSS feeds...`);

  for (const feedUrl of config.feeds) {
    try {
      console.log(`  → ${feedUrl}`);
      const feed = await parser.parseURL(feedUrl);

      const entries = (feed.items || [])
        .slice(0, maxEntries)
        .map((item: any) => ({
          title: item.title || 'Untitled',
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
          source: feed.title || feedUrl,
          guid: item.guid || item.link || item.title
        }));

      allEntries.push(...entries);
      console.log(`    ✓ ${entries.length} entries`);

    } catch (error: any) {
      console.error(`    ✗ Failed: ${error.message}`);
      feedsFailed.push(feedUrl);
    }
  }

  // Deduplicate by link
  let finalEntries = allEntries;
  if (deduplicate) {
    const seen = new Set<string>();
    finalEntries = allEntries.filter(entry => {
      if (seen.has(entry.link)) return false;
      seen.add(entry.link);
      return true;
    });
    console.log(`🔄 Deduplicated: ${allEntries.length} → ${finalEntries.length} entries`);
  }

  // Sort by date (newest first)
  finalEntries.sort((a, b) =>
    new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  // Generate CSV
  const csvContent = stringify(finalEntries, {
    header: true,
    columns: ['title', 'link', 'pubDate', 'source', 'guid']
  });

  // Write to file
  const outputPath = config.outputPath.startsWith('/')
    ? config.outputPath
    : join(process.cwd(), config.outputPath);

  await fs.writeFile(outputPath, csvContent, 'utf-8');
  console.log(`💾 Saved to: ${outputPath}`);

  return {
    success: feedsFailed.length < config.feeds.length,
    entriesCollected: finalEntries.length,
    feedsProcessed: config.feeds.length - feedsFailed.length,
    feedsFailed,
    outputFile: outputPath
  };
}

// Default export for Photon compatibility
export default { run };
