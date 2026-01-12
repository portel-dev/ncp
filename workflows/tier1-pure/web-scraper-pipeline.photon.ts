/**
 * Web Scraper Data Pipeline
 *
 * A multi-step data collection pipeline that demonstrates:
 * - Progressive data extraction with checkpoints
 * - Human-in-the-loop for data quality decisions
 * - Error recovery with retry/skip options
 * - Multiple output format support
 *
 * Inspired by n8n's Property Data Scraping workflows.
 *
 * @name web-scraper-pipeline
 * @description Multi-step web scraping with human review
 * @category Data Collection
 * @complexity intermediate
 * @version 1.0.0
 *
 * @dependencies cheerio@^1.0.0, csv-stringify@^6.4.0
 */

import { promises as fs } from 'fs';

interface ScrapedItem {
  url: string;
  title: string;
  data: Record<string, string>;
  scrapedAt: string;
  status: 'success' | 'partial' | 'failed';
}

interface ScrapeConfig {
  /** Base URL to scrape */
  baseUrl: string;
  /** CSS selectors for data extraction */
  selectors: {
    /** Selector for listing items */
    items: string;
    /** Selector for item link */
    link: string;
    /** Selectors for data fields (name -> selector) */
    fields: Record<string, string>;
  };
  /** Maximum pages to scrape */
  maxPages?: number;
  /** Delay between requests (ms) */
  delayMs?: number;
}

interface PipelineResult {
  success: boolean;
  itemsScraped: number;
  itemsFailed: number;
  outputFile?: string;
}

export default class WebScraperPipeline {
  /**
   * Run the full scraping pipeline with human review
   */
  async *run(config: ScrapeConfig): AsyncGenerator<any, PipelineResult, any> {
    const cheerio = await import('cheerio');
    const maxPages = config.maxPages ?? 5;
    const delayMs = config.delayMs ?? 1000;

    const allItems: ScrapedItem[] = [];
    const failedUrls: string[] = [];

    yield { emit: 'status', message: `Starting scrape of ${config.baseUrl}` };
    yield { emit: 'thinking', active: true };

    // STEP 1: Discover items from listing pages
    yield { emit: 'status', message: 'Step 1: Discovering items...' };

    const itemUrls: string[] = [];

    for (let page = 1; page <= maxPages; page++) {
      yield { emit: 'progress', value: (page / maxPages) * 0.3, message: `Scanning page ${page}/${maxPages}` };

      try {
        const pageUrl = page === 1 ? config.baseUrl : `${config.baseUrl}?page=${page}`;
        const response = await fetch(pageUrl, {
          headers: { 'User-Agent': 'NCP-Scraper/1.0' }
        });

        if (!response.ok) {
          yield { emit: 'log', message: `Page ${page}: HTTP ${response.status}`, level: 'warn' };
          break;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const links = $(config.selectors.items)
          .find(config.selectors.link)
          .map((_, el) => $(el).attr('href'))
          .get()
          .filter((href): href is string => !!href)
          .map(href => href.startsWith('http') ? href : new URL(href, config.baseUrl).toString());

        if (links.length === 0) {
          yield { emit: 'log', message: `Page ${page}: No items found`, level: 'info' };
          break;
        }

        itemUrls.push(...links);
        yield { emit: 'log', message: `Page ${page}: Found ${links.length} items`, level: 'info' };

        await this.delay(delayMs);

      } catch (error: any) {
        yield { emit: 'log', message: `Page ${page}: ${error.message}`, level: 'error' };
        break;
      }
    }

    yield { emit: 'thinking', active: false };

    if (itemUrls.length === 0) {
      yield { emit: 'toast', message: 'No items found to scrape', type: 'warning' };
      return { success: false, itemsScraped: 0, itemsFailed: 0 };
    }

    // CHECKPOINT: Ask user to confirm before detailed scraping
    const proceed: boolean = yield {
      ask: 'confirm',
      id: 'proceed_scraping',
      message: `Found ${itemUrls.length} items. Proceed with detailed scraping?`,
      dangerous: false
    };

    if (!proceed) {
      yield { emit: 'status', message: 'Scraping cancelled by user' };
      return { success: false, itemsScraped: 0, itemsFailed: 0 };
    }

    // STEP 2: Scrape individual items
    yield { emit: 'status', message: 'Step 2: Extracting item details...' };
    yield { emit: 'thinking', active: true };

    for (let i = 0; i < itemUrls.length; i++) {
      const url = itemUrls[i];
      const progress = 0.3 + ((i + 1) / itemUrls.length) * 0.5;

      yield { emit: 'progress', value: progress, message: `Scraping ${i + 1}/${itemUrls.length}` };

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'NCP-Scraper/1.0' }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        const $ = cheerio.load(html);

        const data: Record<string, string> = {};
        let fieldsFound = 0;

        for (const [fieldName, selector] of Object.entries(config.selectors.fields)) {
          const value = $(selector).first().text().trim();
          if (value) {
            data[fieldName] = value;
            fieldsFound++;
          }
        }

        const title = $('h1, .title, [class*="title"]').first().text().trim() || url;

        allItems.push({
          url,
          title,
          data,
          scrapedAt: new Date().toISOString(),
          status: fieldsFound === Object.keys(config.selectors.fields).length ? 'success' : 'partial'
        });

        await this.delay(delayMs);

      } catch (error: any) {
        failedUrls.push(url);
        allItems.push({
          url,
          title: '',
          data: {},
          scrapedAt: new Date().toISOString(),
          status: 'failed'
        });

        yield { emit: 'log', message: `Failed: ${url} - ${error.message}`, level: 'warn' };

        // After 3 failures, ask if user wants to continue
        if (failedUrls.length === 3) {
          yield { emit: 'thinking', active: false };

          const continueAfterErrors: boolean = yield {
            ask: 'confirm',
            id: 'continue_after_errors',
            message: `3 items have failed. Continue scraping?`,
            dangerous: false
          };

          if (!continueAfterErrors) {
            yield { emit: 'status', message: 'Stopping due to errors' };
            break;
          }

          yield { emit: 'thinking', active: true };
        }
      }
    }

    yield { emit: 'thinking', active: false };

    // STEP 3: Data quality review
    const successItems = allItems.filter(i => i.status === 'success');
    const partialItems = allItems.filter(i => i.status === 'partial');

    yield {
      emit: 'artifact',
      type: 'json',
      title: 'Scraping Summary',
      content: JSON.stringify({
        total: allItems.length,
        success: successItems.length,
        partial: partialItems.length,
        failed: failedUrls.length
      }, null, 2)
    };

    // STEP 4: Output options
    const outputFormat: string = yield {
      ask: 'select',
      id: 'output_format',
      message: `Scraped ${successItems.length + partialItems.length} items. Choose output:`,
      options: [
        { value: 'json', label: 'JSON file' },
        { value: 'csv', label: 'CSV file' },
        { value: 'both', label: 'Both JSON and CSV' },
        { value: 'return', label: 'Return data only' }
      ]
    };

    let outputFile: string | undefined;

    if (outputFormat !== 'return') {
      const filename: string = yield {
        ask: 'text',
        id: 'filename',
        message: 'Enter output filename (without extension):',
        default: `scraped-${Date.now()}`,
        pattern: '^[a-zA-Z0-9_-]+$'
      };

      yield { emit: 'progress', value: 0.9, message: 'Saving output...' };

      const validItems = allItems.filter(i => i.status !== 'failed');

      if (outputFormat === 'json' || outputFormat === 'both') {
        outputFile = `${filename}.json`;
        await fs.writeFile(outputFile, JSON.stringify(validItems, null, 2));
        yield { emit: 'log', message: `Saved: ${outputFile}`, level: 'info' };
      }

      if (outputFormat === 'csv' || outputFormat === 'both') {
        const { stringify } = await import('csv-stringify/sync');

        // Flatten data for CSV
        const csvData = validItems.map(item => ({
          url: item.url,
          title: item.title,
          status: item.status,
          scrapedAt: item.scrapedAt,
          ...item.data
        }));

        const csvFile = `${filename}.csv`;
        await fs.writeFile(csvFile, stringify(csvData, { header: true }));
        yield { emit: 'log', message: `Saved: ${csvFile}`, level: 'info' };

        if (outputFormat === 'csv') outputFile = csvFile;
      }
    }

    yield { emit: 'progress', value: 1.0, message: 'Pipeline complete!' };
    yield {
      emit: 'toast',
      message: `Scraped ${successItems.length + partialItems.length} items`,
      type: 'success'
    };

    return {
      success: true,
      itemsScraped: successItems.length + partialItems.length,
      itemsFailed: failedUrls.length,
      outputFile
    };
  }

  /**
   * Automated scraping for scheduled runs
   */
  async *autoScrape(config: ScrapeConfig & {
    outputPath: string;
    format: 'json' | 'csv';
  }): AsyncGenerator<any, PipelineResult, any> {
    // Run with pre-provided inputs
    const generator = this.run({
      baseUrl: config.baseUrl,
      selectors: config.selectors,
      maxPages: config.maxPages,
      delayMs: config.delayMs
    });

    const preProvided: Record<string, any> = {
      proceed_scraping: true,
      continue_after_errors: true,
      output_format: config.format,
      filename: config.outputPath.replace(/\.(json|csv)$/, '')
    };

    let result = await generator.next();

    while (!result.done) {
      const yielded = result.value;

      if (yielded && 'ask' in yielded && yielded.id && yielded.id in preProvided) {
        result = await generator.next(preProvided[yielded.id]);
      } else if (yielded && 'ask' in yielded) {
        // Unknown ask - use default or first option
        const defaultValue = 'default' in yielded ? yielded.default :
          'options' in yielded ? (typeof yielded.options[0] === 'string' ? yielded.options[0] : yielded.options[0].value) :
            true;
        result = await generator.next(defaultValue);
      } else {
        yield yielded;
        result = await generator.next();
      }
    }

    return result.value;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
