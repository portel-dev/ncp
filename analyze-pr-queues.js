#!/usr/bin/env node

/**
 * PR Queue Analysis Tool
 * Analyzes each repository where NCP PRs were submitted to determine:
 * 1. Average time to merge PRs
 * 2. Current queue position
 * 3. Estimated acceptance timeline
 */

import { execSync } from 'child_process';

const NCP_PRS = [
  { repo: 'modelcontextprotocol/servers', prNumber: 2781, priority: 'HIGH', title: 'Official MCP Repository' },
  { repo: 'langchain-ai/langchain-mcp-adapters', prNumber: 331, priority: 'HIGH', title: 'LangChain Integration' },
  { repo: 'appcypher/awesome-mcp-servers', prNumber: 185, priority: 'MEDIUM', title: 'Major Community List' },
  { repo: 'habitoai/awesome-mcp-servers', prNumber: 8, priority: 'MEDIUM', title: 'Community List' },
  { repo: 'austindimmer/awesome-mcp', prNumber: 1, priority: 'MEDIUM', title: 'Community List' },
  { repo: 'PipedreamHQ/awesome-mcp-servers', prNumber: 10, priority: 'MEDIUM', title: 'Pipedream Community' },
  { repo: 'collabnix/awesome-mcp-lists', prNumber: 12, priority: 'MEDIUM', title: 'Collabnix Community' },
  { repo: 'MobinX/awesome-mcp-list', prNumber: 29, priority: 'MEDIUM', title: 'MobinX Community' },
  { repo: 'punkpeye/awesome-mcp-servers', prNumber: 1370, priority: 'MEDIUM', title: 'Punkpeye Community' },
  { repo: 'VeriTeknik/pluggedin-mcp', prNumber: 29, priority: 'LOW', title: 'Complementary Tool' },
  { repo: 'toolprint/hypertool-mcp', prNumber: 37, priority: 'LOW', title: 'Complementary Tool' },
  { repo: 'ComposioHQ/Rube', prNumber: 10, priority: 'LOW', title: 'Complementary Tool' },
  { repo: 'sitbon/magg', prNumber: 3, priority: 'LOW', title: 'Complementary Tool' }
];

class PRQueueAnalyzer {
  constructor() {
    this.results = [];
  }

  async analyzeRepository(repoInfo) {
    console.log(`\n🔍 Analyzing ${repoInfo.repo}...`);

    try {
      // Get recent merged PRs to calculate average merge time
      const mergedPRs = await this.getRecentMergedPRs(repoInfo.repo);
      const avgMergeTime = this.calculateAverageMergeTime(mergedPRs);

      // Get current open PRs to determine queue position
      const openPRs = await this.getOpenPRs(repoInfo.repo);
      const queuePosition = this.findQueuePosition(openPRs, repoInfo.prNumber);

      // Get our specific PR details
      const ourPR = await this.getPRDetails(repoInfo.repo, repoInfo.prNumber);

      // Calculate estimated wait time
      const estimatedWait = this.calculateEstimatedWait(avgMergeTime, queuePosition);

      const analysis = {
        repo: repoInfo.repo,
        prNumber: repoInfo.prNumber,
        priority: repoInfo.priority,
        title: repoInfo.title,
        avgMergeTimeHours: avgMergeTime,
        totalOpenPRs: openPRs.length,
        queuePosition: queuePosition,
        createdAt: ourPR.createdAt,
        daysSinceCreated: this.daysSince(ourPR.createdAt),
        estimatedWaitDays: Math.ceil(estimatedWait / 24),
        status: ourPR.state,
        lastActivity: this.getLastActivity(ourPR)
      };

      this.results.push(analysis);
      console.log(`   ✅ Queue position: ${queuePosition}/${openPRs.length}, Avg merge: ${Math.round(avgMergeTime)}h`);

    } catch (error) {
      console.log(`   ❌ Failed to analyze: ${error.message}`);
      this.results.push({
        repo: repoInfo.repo,
        prNumber: repoInfo.prNumber,
        priority: repoInfo.priority,
        title: repoInfo.title,
        error: error.message
      });
    }
  }

  async getRecentMergedPRs(repo) {
    try {
      const cmd = `gh pr list --repo ${repo} --state merged --limit 20 --json number,createdAt,mergedAt`;
      const output = execSync(cmd, { encoding: 'utf8' });
      return JSON.parse(output);
    } catch (error) {
      return [];
    }
  }

  async getOpenPRs(repo) {
    try {
      const cmd = `gh pr list --repo ${repo} --state open --limit 100 --json number,createdAt`;
      const output = execSync(cmd, { encoding: 'utf8' });
      return JSON.parse(output);
    } catch (error) {
      return [];
    }
  }

  async getPRDetails(repo, prNumber) {
    try {
      const cmd = `gh pr view ${prNumber} --repo ${repo} --json state,createdAt,updatedAt,comments`;
      const output = execSync(cmd, { encoding: 'utf8' });
      return JSON.parse(output);
    } catch (error) {
      return { state: 'unknown', createdAt: '2025-09-26T00:00:00Z', updatedAt: '2025-09-26T00:00:00Z' };
    }
  }

  calculateAverageMergeTime(mergedPRs) {
    if (mergedPRs.length === 0) return 72; // Default 3 days if no data

    const mergeTimes = mergedPRs
      .filter(pr => pr.mergedAt && pr.createdAt)
      .map(pr => {
        const created = new Date(pr.createdAt);
        const merged = new Date(pr.mergedAt);
        return (merged - created) / (1000 * 60 * 60); // Hours
      });

    if (mergeTimes.length === 0) return 72;

    const avg = mergeTimes.reduce((sum, time) => sum + time, 0) / mergeTimes.length;
    return Math.max(avg, 1); // At least 1 hour
  }

  findQueuePosition(openPRs, ourPRNumber) {
    const sortedPRs = openPRs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const position = sortedPRs.findIndex(pr => pr.number === ourPRNumber);
    return position === -1 ? sortedPRs.length + 1 : position + 1;
  }

  calculateEstimatedWait(avgMergeTimeHours, queuePosition) {
    // Assume they process PRs in FIFO order at their average rate
    return avgMergeTimeHours * queuePosition;
  }

  daysSince(dateString) {
    const created = new Date(dateString);
    const now = new Date();
    return Math.floor((now - created) / (1000 * 60 * 60 * 24));
  }

  getLastActivity(prDetails) {
    if (prDetails.comments && prDetails.comments.length > 0) {
      return 'Recent comments';
    }
    return this.daysSince(prDetails.updatedAt) + ' days ago';
  }

  generateMarkdownTable() {
    const priorityOrder = { 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
    const sortedResults = this.results
      .filter(r => !r.error)
      .sort((a, b) => {
        // First by priority, then by queue position
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return a.queuePosition - b.queuePosition;
      });

    let markdown = `
# NCP PR Queue Analysis Report

*Generated: ${new Date().toISOString().split('T')[0]}*

## 🚀 High-Priority Repositories

| Repository | PR# | Queue Position | Total Open | Avg Merge Time | Days Since Created | Est. Wait | Status |
|------------|-----|----------------|------------|----------------|-------------------|-----------|--------|
`;

    // High priority repos
    sortedResults.filter(r => r.priority === 'HIGH').forEach(r => {
      markdown += `| **${r.repo}** | [#${r.prNumber}](https://github.com/${r.repo}/pull/${r.prNumber}) | ${r.queuePosition}/${r.totalOpenPRs} | ${r.totalOpenPRs} | ${Math.round(r.avgMergeTimeHours)}h | ${r.daysSinceCreated} | ${r.estimatedWaitDays}d | ${r.status} |\n`;
    });

    markdown += `\n## 📊 Community Lists\n\n| Repository | PR# | Queue Position | Total Open | Avg Merge Time | Days Since Created | Est. Wait | Status |\n|------------|-----|----------------|------------|----------------|-------------------|-----------|--------|\n`;

    // Medium priority repos
    sortedResults.filter(r => r.priority === 'MEDIUM').forEach(r => {
      markdown += `| ${r.repo} | [#${r.prNumber}](https://github.com/${r.repo}/pull/${r.prNumber}) | ${r.queuePosition}/${r.totalOpenPRs} | ${r.totalOpenPRs} | ${Math.round(r.avgMergeTimeHours)}h | ${r.daysSinceCreated} | ${r.estimatedWaitDays}d | ${r.status} |\n`;
    });

    markdown += `\n## 🔧 Complementary Tools\n\n| Repository | PR# | Queue Position | Total Open | Avg Merge Time | Days Since Created | Est. Wait | Status |\n|------------|-----|----------------|------------|----------------|-------------------|-----------|--------|\n`;

    // Low priority repos
    sortedResults.filter(r => r.priority === 'LOW').forEach(r => {
      markdown += `| ${r.repo} | [#${r.prNumber}](https://github.com/${r.repo}/pull/${r.prNumber}) | ${r.queuePosition}/${r.totalOpenPRs} | ${r.totalOpenPRs} | ${Math.round(r.avgMergeTimeHours)}h | ${r.daysSinceCreated} | ${r.estimatedWaitDays}d | ${r.status} |\n`;
    });

    // Add summary insights
    markdown += this.generateInsights(sortedResults);

    return markdown;
  }

  generateInsights(results) {
    const validResults = results.filter(r => !r.error);
    const avgWaitTime = validResults.reduce((sum, r) => sum + r.estimatedWaitDays, 0) / validResults.length;
    const fastestRepo = validResults.sort((a, b) => a.estimatedWaitDays - b.estimatedWaitDays)[0];
    const slowestRepo = validResults.sort((a, b) => b.estimatedWaitDays - a.estimatedWaitDays)[0];

    return `
## 📈 Key Insights

### ⚡ Quick Wins
- **Fastest Expected**: ${fastestRepo?.repo} (~${fastestRepo?.estimatedWaitDays} days)
- **Best Queue Position**: ${validResults.sort((a, b) => a.queuePosition - b.queuePosition)[0]?.repo} (${validResults.sort((a, b) => a.queuePosition - b.queuePosition)[0]?.queuePosition}/${validResults.sort((a, b) => a.queuePosition - b.queuePosition)[0]?.totalOpenPRs})

### 📊 Overall Statistics
- **Average Estimated Wait**: ${Math.round(avgWaitTime)} days
- **Total Repositories**: ${validResults.length}
- **High Priority**: ${validResults.filter(r => r.priority === 'HIGH').length} repos
- **Longest Wait**: ${slowestRepo?.repo} (~${slowestRepo?.estimatedWaitDays} days)

### 🎯 Recommendations
1. **Monitor High-Priority**: Focus on modelcontextprotocol/servers and langchain-ai repos
2. **Quick Wins**: Follow up on repos with <7 day estimates
3. **Long-term**: Be patient with high-volume repos (100+ open PRs)
4. **Active Engagement**: Consider gentle follow-ups after estimated wait time

*Note: Estimates based on recent merge patterns and current queue position. Actual times may vary based on repository activity and maintainer availability.*
`;
  }

  async run() {
    console.log('🎯 Starting PR Queue Analysis for NCP Campaign\n');
    console.log(`Analyzing ${NCP_PRS.length} repositories...`);

    for (const repoInfo of NCP_PRS) {
      await this.analyzeRepository(repoInfo);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n📊 Generating analysis report...');
    const markdown = this.generateMarkdownTable();

    // Save to file
    const fs = await import('fs');
    const filename = `pr-queue-analysis-${new Date().toISOString().slice(0, 10)}.md`;
    fs.writeFileSync(filename, markdown);

    console.log(`\n✅ Analysis complete! Report saved to: ${filename}`);
    console.log('\n📋 Summary:');

    const validResults = this.results.filter(r => !r.error);
    console.log(`   • ${validResults.length} repositories analyzed`);
    console.log(`   • Average wait time: ${Math.round(validResults.reduce((sum, r) => sum + r.estimatedWaitDays, 0) / validResults.length)} days`);
    console.log(`   • Fastest expected: ${validResults.sort((a, b) => a.estimatedWaitDays - b.estimatedWaitDays)[0]?.repo}`);

    return markdown;
  }
}

// Run the analysis
if (import.meta.url === `file://${process.argv[1]}`) {
  const analyzer = new PRQueueAnalyzer();
  analyzer.run().catch(console.error);
}

export { PRQueueAnalyzer };