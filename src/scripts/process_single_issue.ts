/**
 * Process Single Issue: Script for GitHub Actions to process one issue
 *
 * Usage: npx ts-node src/scripts/process_single_issue.ts <issue_number>
 */

import * as dotenv from 'dotenv';
import { AgentRunner } from '../AgentRunner';
import { GitHubClient } from '../integrations/GitHubClient';
import { GitClient } from '../integrations/GitClient';
import { WikiClient } from '../integrations/WikiClient';
import { VercelClient } from '../integrations/VercelClient';
import { Orchestrator } from '../Orchestrator';
import { logger } from '../utils/logger';

dotenv.config();

async function main() {
  const issueNumber = parseInt(process.argv[2], 10);

  if (isNaN(issueNumber) || issueNumber <= 0) {
    console.error('Usage: npx ts-node src/scripts/process_single_issue.ts <issue_number>');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🤖 AI Agent Processing Issue #${issueNumber}`);
  console.log('='.repeat(80));

  // Parse GITHUB_REPO if in "owner/repo" format
  let githubOwner = process.env.GITHUB_OWNER;
  let githubRepo = process.env.GITHUB_REPO;

  if (process.env.GITHUB_REPO?.includes('/')) {
    [githubOwner, githubRepo] = process.env.GITHUB_REPO.split('/');
  }

  // Validate required environment variables
  const requiredEnvVars = ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (!githubOwner || !githubRepo) {
    console.error('Missing GITHUB_OWNER or GITHUB_REPO environment variables');
    process.exit(1);
  }

  try {
    // Initialize clients
    const githubClient = new GitHubClient(
      process.env.GITHUB_TOKEN!,
      githubOwner,
      githubRepo
    );

    const gitClient = new GitClient();

    // Initialize WikiClient if configuration is available
    let wikiClient: WikiClient | null = null;
    if (process.env.WIKI_REPO_URL) {
      const wikiRepoUrl = process.env.WIKI_REPO_URL
        .replace('{GITHUB_OWNER}', githubOwner)
        .replace('{GITHUB_REPO}', githubRepo);

      wikiClient = new WikiClient(
        wikiRepoUrl,
        process.env.WIKI_LOCAL_PATH || './wiki'
      );

      try {
        await wikiClient.initialize();
        console.log('📚 Wiki initialized');
      } catch (error: any) {
        console.warn(`⚠️ Wiki init failed: ${error.message}`);
        wikiClient = null;
      }
    }

    // Initialize VercelClient if configuration is available
    let vercelClient: VercelClient | null = null;
    if (process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID) {
      vercelClient = new VercelClient(
        process.env.VERCEL_TOKEN,
        process.env.VERCEL_PROJECT_ID,
        process.env.VERCEL_ORG_ID || ''
      );
      console.log('🔺 Vercel client initialized');
    }

    // Initialize AgentRunner and Orchestrator
    const agentRunner = new AgentRunner(
      process.env.ANTHROPIC_API_KEY!,
      './.claude/agents',
      wikiClient
    );

    const orchestrator = new Orchestrator(
      agentRunner,
      githubClient,
      gitClient,
      wikiClient,
      vercelClient,
      null,  // No discord client for single issue script
      './tasks'
    );

    // Start the task
    console.log(`\n📥 Creating task for issue #${issueNumber}...`);
    const taskState = await orchestrator.startTask(issueNumber);
    console.log(`✓ Task created: ${taskState.taskId}`);
    console.log(`  Branch: ${taskState.branchName}`);

    // Run the full pipeline
    console.log(`\n🚀 Running pipeline...`);
    await orchestrator.runPipeline(taskState.taskId);

    // Check final status
    const finalState = orchestrator.getTaskState(taskState.taskId);

    console.log(`\n${'='.repeat(80)}`);
    if (finalState.status === 'completed') {
      console.log(`✅ PIPELINE COMPLETED for issue #${issueNumber}`);
      if (finalState.prUrl) {
        console.log(`   PR: ${finalState.prUrl}`);
      }
      process.exit(0);
    } else if (finalState.status === 'awaiting_approval') {
      console.log(`⏸️ PIPELINE PAUSED - awaiting approval`);
      if (finalState.prUrl) {
        console.log(`   PR: ${finalState.prUrl}`);
      }
      process.exit(0);
    } else if (finalState.status === 'decomposed') {
      console.log(`📋 Issue decomposed into sub-issues`);
      if (finalState.subIssues && finalState.subIssues.length > 0) {
        console.log(`   Sub-issues: ${finalState.subIssues.join(', ')}`);
      }
      process.exit(0);
    } else if (finalState.status === 'failed') {
      console.log(`❌ PIPELINE FAILED: ${finalState.error}`);
      process.exit(1);
    } else {
      console.log(`⚠️ Pipeline ended with status: ${finalState.status}`);
      process.exit(0);
    }

  } catch (error: any) {
    console.error(`\n❌ Error processing issue #${issueNumber}: ${error.message}`);
    logger.error('Issue processing failed', { issueNumber, error: error.message, stack: error.stack });
    process.exit(1);
  }
}

main();
