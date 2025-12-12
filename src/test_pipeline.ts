/**
 * Integration test: Run Detective → Archaeologist pipeline
 *
 * Usage:
 *   npm run test:pipeline -- <issue-number>
 *
 * Example:
 *   npm run test:pipeline -- 123
 *
 * This tests the Orchestrator running multiple agents in sequence
 */

import * as dotenv from 'dotenv';
import { AgentRunner } from './AgentRunner';
import { GitHubClient } from './integrations/GitHubClient';
import { GitClient } from './integrations/GitClient';
import { Orchestrator } from './Orchestrator';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🔬 AI Team MVP - Pipeline Integration Test\n');
  console.log('Running: Detective → Archaeologist → Surgeon\n');

  // Get issue number from command line
  const issueNumber = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  if (!issueNumber) {
    console.error('❌ Please provide an issue number:');
    console.error('   npm run test:pipeline -- 123');
    process.exit(1);
  }

  // Check environment variables
  const requiredEnvVars = [
    'ANTHROPIC_API_KEY',
    'GITHUB_TOKEN',
    'GITHUB_OWNER',
    'GITHUB_REPO'
  ];

  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
  if (missingEnvVars.length > 0) {
    console.error(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
    console.error('   Copy .env.example to .env and fill in your credentials');
    process.exit(1);
  }

  try {
    // Initialize clients
    console.log('📡 Initializing...');
    const githubClient = new GitHubClient(
      process.env.GITHUB_TOKEN!,
      process.env.GITHUB_OWNER!,
      process.env.GITHUB_REPO!
    );

    const agentRunner = new AgentRunner(
      process.env.ANTHROPIC_API_KEY!,
      './.claude/agents',
      null  // No wiki client for test script
    );

    const gitClient = new GitClient(process.cwd());

    const orchestrator = new Orchestrator(
      agentRunner,
      githubClient,
      gitClient,
      null,  // No wiki client
      null,  // No vercel client
      './tasks'
    );

    // Start task from GitHub issue
    console.log(`📥 Fetching issue #${issueNumber}...`);
    const taskState = await orchestrator.startTask(issueNumber);

    console.log(`\n✓ Task created: ${taskState.taskId}`);
    console.log(`  Title: ${taskState.issueTitle}`);
    console.log(`  URL: ${taskState.issueUrl}`);
    console.log(`  Stages: ${taskState.stages.length}`);

    // Run Stage 1: Detective
    console.log(`\n${'='.repeat(80)}`);
    console.log('STAGE 1: DETECTIVE (BUG TRIAGE)');
    console.log('='.repeat(80));

    let state = await orchestrator.runNextStage(taskState.taskId);

    if (state.stages[0].status === 'failed') {
      console.error(`\n❌ Detective failed: ${state.stages[0].error}`);
      process.exit(1);
    }

    console.log(`\n✓ Detective completed:`);
    console.log(`  Tokens: ${state.stages[0].tokensUsed}`);
    console.log(`  Duration: ${((state.stages[0].durationMs || 0) / 1000).toFixed(2)}s`);
    console.log(`  Artifact: ${state.stages[0].artifactPath}`);

    console.log(`\n--- Triage Report Preview ---`);
    const triagePreview = state.stages[0].output?.substring(0, 500) + '...';
    console.log(triagePreview);

    // Run Stage 2: Archaeologist
    console.log(`\n${'='.repeat(80)}`);
    console.log('STAGE 2: ARCHAEOLOGIST (ROOT CAUSE ANALYSIS)');
    console.log('='.repeat(80));

    state = await orchestrator.runNextStage(taskState.taskId);

    if (state.stages[1].status === 'failed') {
      console.error(`\n❌ Archaeologist failed: ${state.stages[1].error}`);
      process.exit(1);
    }

    console.log(`\n✓ Archaeologist completed:`);
    console.log(`  Tokens: ${state.stages[1].tokensUsed}`);
    console.log(`  Duration: ${((state.stages[1].durationMs || 0) / 1000).toFixed(2)}s`);
    console.log(`  Artifact: ${state.stages[1].artifactPath}`);

    console.log(`\n--- Root Cause Analysis Preview ---`);
    const archaeologistPreview = state.stages[1].output?.substring(0, 500) + '...';
    console.log(archaeologistPreview);

    // Run Stage 3: Surgeon
    console.log(`\n${'='.repeat(80)}`);
    console.log('STAGE 3: SURGEON (IMPLEMENTATION)');
    console.log('='.repeat(80));

    state = await orchestrator.runNextStage(taskState.taskId);

    if (state.stages[2].status === 'failed') {
      console.error(`\n❌ Surgeon failed: ${state.stages[2].error}`);
      process.exit(1);
    }

    console.log(`\n✓ Surgeon completed:`);
    console.log(`  Tokens: ${state.stages[2].tokensUsed}`);
    console.log(`  Duration: ${((state.stages[2].durationMs || 0) / 1000).toFixed(2)}s`);
    console.log(`  Artifact: ${state.stages[2].artifactPath}`);

    console.log(`\n--- Implementation Plan Preview ---`);
    const surgeonPreview = state.stages[2].output?.substring(0, 500) + '...';
    console.log(surgeonPreview);

    // Display summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('PIPELINE SUMMARY');
    console.log('='.repeat(80));

    const totalTokens = (state.stages[0].tokensUsed || 0) + (state.stages[1].tokensUsed || 0) + (state.stages[2].tokensUsed || 0);
    const totalDuration = (state.stages[0].durationMs || 0) + (state.stages[1].durationMs || 0) + (state.stages[2].durationMs || 0);
    const estimatedCost = (totalTokens / 1000000) * 3.0; // Rough estimate at $3/M tokens

    console.log(`\n📊 Statistics:`);
    console.log(`  Total tokens: ${totalTokens.toLocaleString()}`);
    console.log(`  Total duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`  Estimated cost: $${estimatedCost.toFixed(4)}`);

    console.log(`\n📁 Artifacts saved to: ./tasks/${taskState.taskId}/`);
    console.log(`  - triage-report.md`);
    console.log(`  - root-cause-analysis.md`);
    console.log(`  - implementation-plan.md`);
    console.log(`  - state.json`);

    console.log(`\n✅ Integration test completed successfully!`);

    console.log(`\nNext steps:`);
    console.log(`  1. Review artifacts in ./tasks/${taskState.taskId}/`);
    console.log(`  2. Check if Detective's triage is accurate`);
    console.log(`  3. Check if Archaeologist found the root cause`);
    console.log(`  4. Check if Surgeon's implementation plan looks good`);
    console.log(`  5. If good, we can build the next agent (Critic)`);

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    logger.error('Pipeline test failed', { error });
    process.exit(1);
  }
}

// Run test
main();
