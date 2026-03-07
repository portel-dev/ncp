/**
 * GitHub Release Tracker Workflow
 *
 * Monitors GitHub repositories for new releases. Tracks seen releases
 * to avoid duplicate notifications. Supports human-in-the-loop for
 * deciding which releases to act on.
 *
 * @name github-release-tracker
 * @description Track new releases from GitHub repositories
 * @category Monitoring
 * @complexity intermediate
 * @version 1.0.0
 *
 * @dependencies
 */

import { promises as fs } from 'fs';
import { join } from 'path';

interface Release {
  repo: string;
  tag: string;
  name: string;
  publishedAt: string;
  htmlUrl: string;
  body: string;
  isNew: boolean;
}

interface TrackParams {
  /** GitHub repositories to track (format: owner/repo) */
  repos: string[];
  /** Path to state file for tracking seen releases */
  stateFile?: string;
  /** Whether to ask before marking releases as seen */
  interactive?: boolean;
}

interface TrackResult {
  success: boolean;
  totalRepos: number;
  newReleases: Release[];
  failedRepos: string[];
}

export default class GitHubReleaseTracker {
  /**
   * Track releases from multiple GitHub repositories
   *
   * Fetches latest releases, compares against seen state, and optionally
   * prompts user for actions on new releases.
   */
  async *track(params: TrackParams): AsyncGenerator<any, TrackResult, any> {
    const stateFile = params.stateFile ?? './github-releases-state.json';
    const interactive = params.interactive ?? true;

    // Load existing state
    let seenReleases: Record<string, string> = {}; // repo -> latest seen tag
    try {
      const state = await fs.readFile(stateFile, 'utf-8');
      seenReleases = JSON.parse(state);
      yield { emit: 'log', message: `Loaded state: tracking ${Object.keys(seenReleases).length} repos`, level: 'debug' };
    } catch {
      yield { emit: 'status', message: 'Starting fresh (no previous state)' };
    }

    const allReleases: Release[] = [];
    const newReleases: Release[] = [];
    const failedRepos: string[] = [];

    yield { emit: 'status', message: `Checking ${params.repos.length} repositories...` };

    // Fetch releases from each repo
    for (let i = 0; i < params.repos.length; i++) {
      const repo = params.repos[i];
      const progress = (i + 1) / params.repos.length;

      yield { emit: 'progress', value: progress * 0.7, message: `Checking ${repo}` };

      try {
        const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'NCP-Workflow/1.0'
          }
        });

        if (response.status === 404) {
          yield { emit: 'log', message: `${repo}: No releases found`, level: 'info' };
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const isNew = seenReleases[repo] !== data.tag_name;

        const release: Release = {
          repo,
          tag: data.tag_name,
          name: data.name || data.tag_name,
          publishedAt: data.published_at,
          htmlUrl: data.html_url,
          body: (data.body || '').slice(0, 500), // Truncate long bodies
          isNew
        };

        allReleases.push(release);

        if (isNew) {
          newReleases.push(release);
          yield { emit: 'toast', message: `New: ${repo} ${release.tag}`, type: 'info' };
        }

      } catch (error: any) {
        failedRepos.push(repo);
        yield { emit: 'log', message: `${repo}: ${error.message}`, level: 'warn' };
      }
    }

    yield { emit: 'progress', value: 0.8, message: `Found ${newReleases.length} new releases` };

    // If no new releases, we're done
    if (newReleases.length === 0) {
      yield { emit: 'status', message: 'No new releases found', type: 'info' };

      return {
        success: true,
        totalRepos: params.repos.length,
        newReleases: [],
        failedRepos
      };
    }

    // Show new releases
    yield {
      emit: 'artifact',
      type: 'json',
      title: 'New Releases',
      content: JSON.stringify(newReleases.map(r => ({
        repo: r.repo,
        tag: r.tag,
        name: r.name,
        url: r.htmlUrl
      })), null, 2)
    };

    // Interactive mode: ask what to do
    if (interactive) {
      const action: string = yield {
        ask: 'select',
        id: 'action',
        message: `Found ${newReleases.length} new release(s). What would you like to do?`,
        options: [
          { value: 'mark_all', label: 'Mark all as seen' },
          { value: 'select', label: 'Select which to mark' },
          { value: 'skip', label: 'Skip (don\'t update state)' }
        ]
      };

      if (action === 'mark_all') {
        // Update state with all new releases
        for (const release of newReleases) {
          seenReleases[release.repo] = release.tag;
        }
        yield { emit: 'status', message: `Marked ${newReleases.length} releases as seen` };

      } else if (action === 'select') {
        // Let user pick which to mark
        const options = newReleases.map(r => ({
          value: r.repo,
          label: `${r.repo} ${r.tag}`
        }));

        const selected: string[] = yield {
          ask: 'select',
          id: 'selected_repos',
          message: 'Select releases to mark as seen:',
          options,
          multi: true
        };

        for (const repo of selected) {
          const release = newReleases.find(r => r.repo === repo);
          if (release) {
            seenReleases[repo] = release.tag;
          }
        }
        yield { emit: 'status', message: `Marked ${selected.length} releases as seen` };

      } else {
        yield { emit: 'status', message: 'Skipped - state not updated' };
      }
    } else {
      // Non-interactive: automatically mark all as seen
      for (const release of newReleases) {
        seenReleases[release.repo] = release.tag;
      }
    }

    // Save state
    yield { emit: 'progress', value: 0.95, message: 'Saving state...' };

    await fs.writeFile(stateFile, JSON.stringify(seenReleases, null, 2));

    yield { emit: 'progress', value: 1.0, message: 'Complete!' };
    yield { emit: 'toast', message: `Tracked ${newReleases.length} new releases`, type: 'success' };

    return {
      success: true,
      totalRepos: params.repos.length,
      newReleases,
      failedRepos
    };
  }

  /**
   * Automated tracking for scheduled runs (no prompts)
   *
   * Perfect for cron jobs - automatically marks all new releases as seen
   * and returns the results for downstream processing.
   */
  async *autoTrack(params: {
    repos: string[];
    stateFile?: string;
  }): AsyncGenerator<any, TrackResult, any> {
    // Run track with interactive=false and pre-provided inputs
    const generator = this.track({
      repos: params.repos,
      stateFile: params.stateFile,
      interactive: false
    });

    // Forward all yields
    let result = await generator.next();
    while (!result.done) {
      const response = yield result.value;
      result = await generator.next(response);
    }

    return result.value;
  }

  /**
   * Add repositories to track
   */
  async *addRepos(params: {
    stateFile?: string;
  }): AsyncGenerator<any, { added: string[] }, any> {
    const stateFile = params.stateFile ?? './github-releases-state.json';

    // Load existing state
    let seenReleases: Record<string, string> = {};
    try {
      const state = await fs.readFile(stateFile, 'utf-8');
      seenReleases = JSON.parse(state);
    } catch {
      // Fresh state
    }

    yield { emit: 'status', message: `Currently tracking ${Object.keys(seenReleases).length} repos` };

    // Ask for repos to add
    const reposInput: string = yield {
      ask: 'text',
      id: 'new_repos',
      message: 'Enter repositories to track (comma-separated, format: owner/repo):',
      placeholder: 'facebook/react, vercel/next.js'
    };

    const newRepos = reposInput
      .split(',')
      .map(r => r.trim())
      .filter(r => r.includes('/'));

    if (newRepos.length === 0) {
      yield { emit: 'toast', message: 'No valid repos provided', type: 'warning' };
      return { added: [] };
    }

    // Initialize them with empty tag (will be detected as "new" on first run)
    for (const repo of newRepos) {
      if (!(repo in seenReleases)) {
        seenReleases[repo] = '';
      }
    }

    await fs.writeFile(stateFile, JSON.stringify(seenReleases, null, 2));

    yield { emit: 'toast', message: `Added ${newRepos.length} repos`, type: 'success' };

    return { added: newRepos };
  }
}
