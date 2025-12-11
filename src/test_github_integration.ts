/**
 * GitHub Integration Test: Verify agents comment on issues
 *
 * Usage:
 *   npm run test:github -- <issue-number>
 *
 * This runs just Stage 1 (Detective) to demonstrate GitHub commenting
 */

import * as dotenv from 'dotenv';
import { AgentRunner } from './AgentRunner';
import { GitHubClient } from './integrations/GitHubClient';
import { GitClient } from './integrations/GitClient';
import { Orchestrator } from './Orchestrator';
import { logger } from './utils/logger';

dotenv.config();

async function main() {
  console.log('🧪 AI Team MVP - GitHub Integration Test\n');
  console.log('Testing that agents comment on issues like real team members\n');

  const issueNumber = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  if (!issueNumber) {
    console.error('❌ Please provide an issue number:');
    console.error('   npm run test:github -- 123');
    process.exit(1);
  }

  const requiredEnvVars = ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

  if (missingEnvVars.length > 0) {
    console.error(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
  }

  try {
    console.log('📡 Initializing...\n');

    const githubClient = new GitHubClient(
      process.env.GITHUB_TOKEN!,
      process.env.GITHUB_OWNER!,
      process.env.GITHUB_REPO!
    );

    const gitClient = new GitClient();

    const agentRunner = new AgentRunner(
      process.env.ANTHROPIC_API_KEY!,
      './.claude/agents'
    );

    const orchestrator = new Orchestrator(
      agentRunner,
      githubClient,
      gitClient,
      './tasks'
    );

    // Start task
    console.log(`📥 Fetching issue #${issueNumber}...\n`);
    const taskState = await orchestrator.startTask(issueNumber);

    console.log(`✓ Task created: ${taskState.taskId}`);
    console.log(`  Title: ${taskState.issueTitle}`);
    console.log(`  URL: ${taskState.issueUrl}\n`);

    // Run Stage 1 only
    console.log('🔄 Running Stage 1: Detective (Triage)...\n');
    console.log('Expected GitHub behavior:');
    console.log('  1. 🔍 Comment when Detective starts work');
    console.log('  2. 🏷️  Add labels: "stage-1", "in-progress"');
    console.log('  3. ✅ Comment when Detective completes with summary');
    console.log('  4. ⏭️  Show next stage in comment\n');

    const result = await orchestrator.runNextStage(taskState.taskId);

    if (result.stages[0].status === 'completed') {
      console.log('✅ Stage 1 completed successfully!\n');
      console.log(`Duration: ${((result.stages[0].durationMs || 0) / 1000).toFixed(1)}s`);
      console.log(`Tokens: ${(result.stages[0].tokensUsed || 0).toLocaleString()}`);
      console.log(`\n🔗 Check the GitHub issue to see the comments:`);
      console.log(`   ${taskState.issueUrl}\n`);
      console.log('You should see:');
      console.log('  - A comment from the Detective announcing they started work');
      console.log('  - A comment from the Detective with their triage findings');
      console.log('  - Labels showing "stage-1" and "in-progress"\n');
    } else {
      console.error('❌ Stage 1 failed');
      process.exit(1);
    }

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    logger.error('GitHub integration test failed', { error });
    process.exit(1);
  }
}

main();
