/**
 * Full Pipeline Test: Run all 12 agents
 *
 * Usage:
 *   npm run test:full -- <issue-number>
 *
 * This runs the COMPLETE pipeline: Detective → ... → Historian
 */

import * as dotenv from 'dotenv';
import { AgentRunner } from './AgentRunner';
import { GitHubClient } from './integrations/GitHubClient';
import { GitClient } from './integrations/GitClient';
import { Orchestrator } from './Orchestrator';
import { logger } from './utils/logger';

dotenv.config();

async function main() {
  console.log('🚀 AI Team MVP - FULL 12-STAGE PIPELINE TEST\n');
  console.log('Running all 12 agents: Detective → Archaeologist → Surgeon → Critic → Validator → Skeptic → Gatekeeper → Advocate → Planner → Commander → Guardian → Historian\n');

  const issueNumber = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  if (!issueNumber) {
    console.error('❌ Please provide an issue number:');
    console.error('   npm run test:full -- 123');
    process.exit(1);
  }

  const requiredEnvVars = ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

  if (missingEnvVars.length > 0) {
    console.error(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
  }

  try {
    console.log('📡 Initializing...');

    const githubClient = new GitHubClient(
      process.env.GITHUB_TOKEN!,
      process.env.GITHUB_OWNER!,
      process.env.GITHUB_REPO!
    );

    const gitClient = new GitClient();

    const agentRunner = new AgentRunner(
      process.env.ANTHROPIC_API_KEY!,
      './.claude/agents',
      null  // No wiki client for test script
    );

    const orchestrator = new Orchestrator(
      agentRunner,
      githubClient,
      gitClient,
      null,  // No wiki client
      null,  // No vercel client
      null,  // No discord client
      './tasks'
    );

    // Start task
    console.log(`📥 Fetching issue #${issueNumber}...\n`);
    const taskState = await orchestrator.startTask(issueNumber);

    console.log(`✓ Task created: ${taskState.taskId}`);
    console.log(`  Title: ${taskState.issueTitle}`);
    console.log(`  Stages: ${taskState.stages.length}\n`);

    // Run pipeline until completion or approval needed
    console.log('🔄 Running pipeline...\n');

    let currentState = taskState;
    const startTime = Date.now();

    while (currentState.status === 'pending' || currentState.status === 'in_progress') {
      const stageIndex = currentState.currentStage;
      const stage = currentState.stages[stageIndex];

      console.log(`${'='.repeat(80)}`);
      console.log(`STAGE ${stageIndex + 1}: ${stage.stageName.toUpperCase()}`);
      console.log('='.repeat(80));

      currentState = await orchestrator.runNextStage(taskState.taskId);

      if (currentState.stages[stageIndex].status === 'failed') {
        console.error(`\n❌ ${stage.stageName} failed: ${currentState.stages[stageIndex].error}`);
        process.exit(1);
      }

      console.log(`\n✓ ${stage.stageName} completed:`);
      console.log(`  Tokens: ${currentState.stages[stageIndex].tokensUsed?.toLocaleString()}`);
      console.log(`  Duration: ${((currentState.stages[stageIndex].durationMs || 0) / 1000).toFixed(2)}s`);
      console.log(`  Artifact: ${currentState.stages[stageIndex].artifactPath}\n`);

      // Show preview of output
      const preview = currentState.stages[stageIndex].output?.substring(0, 400) + '...';
      console.log(`--- Output Preview ---`);
      console.log(preview);
      console.log();

      // Check for approval needed
      if (currentState.status === 'awaiting_approval') {
        console.log(`\n⚠️  HUMAN APPROVAL REQUIRED`);
        console.log(`\nThe pipeline has paused at an approval gate.`);
        console.log(`Stage ${stageIndex + 1} (${stage.stageName}) requires human review.\n`);
        console.log(`To approve and continue:`);
        console.log(`  1. Review the artifact: ${currentState.stages[stageIndex].artifactPath}`);
        console.log(`  2. Run: npm run approve -- ${taskState.taskId}\n`);
        console.log(`Pipeline status saved to: ./tasks/${taskState.taskId}/state.json`);
        break;
      }
    }

    // Pipeline completed
    if (currentState.status === 'completed') {
      const totalDuration = Date.now() - startTime;

      console.log(`\n${'='.repeat(80)}`);
      console.log('🎉 PIPELINE COMPLETED SUCCESSFULLY!');
      console.log('='.repeat(80));

      // Calculate totals
      let totalTokens = 0;
      let totalCost = 0;

      currentState.stages.forEach((stage, idx) => {
        if (stage.status === 'completed') {
          totalTokens += stage.tokensUsed || 0;
        }
      });

      totalCost = (totalTokens / 1000000) * 3.0; // $3/M tokens estimate

      console.log(`\n📊 Pipeline Statistics:`);
      console.log(`  Total stages completed: ${currentState.stages.filter(s => s.status === 'completed').length}/12`);
      console.log(`  Total tokens: ${totalTokens.toLocaleString()}`);
      console.log(`  Total duration: ${(totalDuration / 1000).toFixed(2)}s (${(totalDuration / 60000).toFixed(1)}m)`);
      console.log(`  Estimated cost: $${totalCost.toFixed(4)}`);

      console.log(`\n📁 All artifacts saved to: ./tasks/${taskState.taskId}/`);

      currentState.stages.forEach((stage, idx) => {
        if (stage.status === 'completed' && stage.artifactPath) {
          console.log(`  ${idx + 1}. ${stage.artifactPath.split('/').pop()}`);
        }
      });

      console.log(`\n✅ Issue #${issueNumber} has been processed through the complete pipeline!`);
      console.log(`\nReview the retrospective: ./tasks/${taskState.taskId}/retrospective.md\n`);
    }

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    logger.error('Full pipeline test failed', { error });
    process.exit(1);
  }
}

main();
