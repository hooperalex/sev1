/**
 * Issue Watcher: Automatically monitor GitHub issues and process them in the background
 *
 * This script continuously monitors for new issues and processes them through the
 * 12-stage pipeline as background tasks.
 */

import * as dotenv from 'dotenv';
import { AgentRunner } from './AgentRunner';
import { GitHubClient } from './integrations/GitHubClient';
import { GitClient } from './integrations/GitClient';
import { WikiClient } from './integrations/WikiClient';
import { Orchestrator } from './Orchestrator';
import { logger } from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

interface WatcherState {
  processedIssues: number[];
  lastCheckTime: string;
}

const STATE_FILE = './tasks/.watcher-state.json';
const CHECK_INTERVAL = 30000; // Check every 30 seconds

class IssueWatcher {
  private githubClient: GitHubClient;
  private gitClient: GitClient;
  private wikiClient: WikiClient | null;
  private orchestrator: Orchestrator;
  private state: WatcherState;
  private isRunning: boolean = false;
  private activeTaskCount: number = 0;
  private readonly MAX_CONCURRENT_TASKS = 3;

  constructor() {
    // Initialize clients
    this.githubClient = new GitHubClient(
      process.env.GITHUB_TOKEN!,
      process.env.GITHUB_OWNER!,
      process.env.GITHUB_REPO!
    );

    this.gitClient = new GitClient();

    // Initialize WikiClient if configuration is available
    if (process.env.WIKI_REPO_URL) {
      const wikiRepoUrl = process.env.WIKI_REPO_URL
        .replace('{GITHUB_OWNER}', process.env.GITHUB_OWNER!)
        .replace('{GITHUB_REPO}', process.env.GITHUB_REPO!);

      this.wikiClient = new WikiClient(
        wikiRepoUrl,
        process.env.WIKI_LOCAL_PATH || './wiki'
      );

      logger.info('WikiClient initialized', { repoUrl: wikiRepoUrl });
    } else {
      this.wikiClient = null;
      logger.warn('Wiki configuration not found, running without wiki integration');
    }

    const agentRunner = new AgentRunner(
      process.env.ANTHROPIC_API_KEY!,
      './.claude/agents',
      this.wikiClient
    );

    this.orchestrator = new Orchestrator(
      agentRunner,
      this.githubClient,
      this.gitClient,
      this.wikiClient,
      './tasks'
    );

    // Load or initialize state
    this.state = this.loadState();
  }

  /**
   * Load watcher state from disk
   */
  private loadState(): WatcherState {
    if (fs.existsSync(STATE_FILE)) {
      try {
        const content = fs.readFileSync(STATE_FILE, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        logger.warn('Failed to load watcher state, starting fresh');
      }
    }

    return {
      processedIssues: [],
      lastCheckTime: new Date().toISOString()
    };
  }

  /**
   * Save watcher state to disk
   */
  private saveState(): void {
    const tasksDir = path.dirname(STATE_FILE);
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true });
    }

    fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  /**
   * Check for new issues to process
   */
  private async checkForNewIssues(): Promise<void> {
    try {
      logger.info('Checking for new issues...');

      // Fetch all open issues that don't have 'in-progress' or 'completed' labels
      const openIssues = await this.githubClient.listOpenIssues();

      // Filter out issues that are already processed or in progress
      const newIssues = openIssues.filter(issue => {
        // Skip if already processed
        if (this.state.processedIssues.includes(issue.number)) {
          return false;
        }

        // Skip if has in-progress or completed label
        const labels = issue.labels.map(l => l.name);
        if (labels.includes('in-progress') || labels.includes('completed')) {
          return false;
        }

        return true;
      });

      if (newIssues.length === 0) {
        logger.info('No new issues found');
        return;
      }

      console.log(`\n📋 Found ${newIssues.length} new issue(s) to process:`);
      newIssues.forEach(issue => {
        console.log(`  #${issue.number}: ${issue.title}`);
      });

      // Process new issues (up to MAX_CONCURRENT_TASKS)
      for (const issue of newIssues) {
        if (this.activeTaskCount >= this.MAX_CONCURRENT_TASKS) {
          console.log(`⏸️  Max concurrent tasks (${this.MAX_CONCURRENT_TASKS}) reached, queuing remaining issues...`);
          break;
        }

        // Mark as processed immediately to avoid duplicate processing
        this.state.processedIssues.push(issue.number);
        this.saveState();

        // Process issue in background
        this.processIssue(issue.number).catch(error => {
          logger.error('Background task failed', { issueNumber: issue.number, error: error.message });
          // Remove from processed list if it failed to start
          this.state.processedIssues = this.state.processedIssues.filter(n => n !== issue.number);
          this.saveState();
        });
      }

      this.state.lastCheckTime = new Date().toISOString();
      this.saveState();

    } catch (error: any) {
      logger.error('Failed to check for new issues', { error: error.message });
    }
  }

  /**
   * Process a single issue through the pipeline (runs in background)
   */
  private async processIssue(issueNumber: number): Promise<void> {
    this.activeTaskCount++;

    try {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🚀 STARTING PIPELINE FOR ISSUE #${issueNumber}`);
      console.log('='.repeat(80));

      // Start the task
      const taskState = await this.orchestrator.startTask(issueNumber);
      console.log(`✓ Task created: ${taskState.taskId}`);
      console.log(`  Branch: ${taskState.branchName}`);
      console.log(`  Running in background...`);

      // Run the full pipeline
      await this.orchestrator.runPipeline(taskState.taskId);

      // Check final status
      const finalState = this.orchestrator.getTaskState(taskState.taskId);

      if (finalState.status === 'completed') {
        console.log(`\n✅ PIPELINE COMPLETED for issue #${issueNumber}`);
        if (finalState.prUrl) {
          console.log(`   PR: ${finalState.prUrl}`);
        }
      } else if (finalState.status === 'awaiting_approval') {
        console.log(`\n⏸️  PIPELINE PAUSED for issue #${issueNumber} - approval required`);
      } else if (finalState.status === 'failed') {
        console.log(`\n❌ PIPELINE FAILED for issue #${issueNumber}: ${finalState.error}`);
      }

    } catch (error: any) {
      console.error(`\n❌ Error processing issue #${issueNumber}: ${error.message}`);
      logger.error('Issue processing failed', { issueNumber, error: error.message });
    } finally {
      this.activeTaskCount--;
    }
  }

  /**
   * Start watching for issues
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Watcher is already running');
      return;
    }

    console.log('👁️  AI Team Issue Watcher Started');
    console.log('='.repeat(80));
    console.log(`📡 Monitoring: ${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`);
    console.log(`⏱️  Check interval: ${CHECK_INTERVAL / 1000}s`);
    console.log(`🔄 Max concurrent tasks: ${this.MAX_CONCURRENT_TASKS}`);
    console.log(`📝 Processed issues: ${this.state.processedIssues.length}`);
    console.log('='.repeat(80));

    // Initialize wiki if available
    if (this.wikiClient) {
      console.log('📚 Initializing wiki...');
      try {
        await this.wikiClient.initialize();
        await this.wikiClient.ensureWikiExists();
        console.log('✅ Wiki initialized successfully');
      } catch (error: any) {
        console.error(`⚠️  Wiki initialization failed: ${error.message}`);
        console.error('   Continuing without wiki integration...');
        this.wikiClient = null;
      }
    }

    console.log('='.repeat(80));
    console.log('\nPress Ctrl+C to stop\n');

    this.isRunning = true;

    // Initial check
    await this.checkForNewIssues();

    // Set up periodic checking
    const intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.checkForNewIssues();
      } else {
        clearInterval(intervalId);
      }
    }, CHECK_INTERVAL);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down watcher...');
      this.isRunning = false;
      clearInterval(intervalId);

      if (this.activeTaskCount > 0) {
        console.log(`⏳ Waiting for ${this.activeTaskCount} active task(s) to complete...`);
        console.log('   (Press Ctrl+C again to force quit)');
      } else {
        process.exit(0);
      }
    });
  }

  /**
   * Stop watching
   */
  stop(): void {
    this.isRunning = false;
    logger.info('Watcher stopped');
  }
}

// Main entry point
async function main() {
  // Validate environment variables
  const requiredEnvVars = ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

  if (missingEnvVars.length > 0) {
    console.error(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
  }

  try {
    const watcher = new IssueWatcher();
    await watcher.start();
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    logger.error('Issue watcher crashed', { error });
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
