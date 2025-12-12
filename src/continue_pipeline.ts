/**
 * Continue Pipeline: Resume an existing task and run remaining stages
 */

import * as dotenv from 'dotenv';
import { AgentRunner } from './AgentRunner';
import { GitHubClient } from './integrations/GitHubClient';
import { GitClient } from './integrations/GitClient';
import { Orchestrator } from './Orchestrator';
import { logger } from './utils/logger';

dotenv.config();

async function main() {
  console.log('🔄 AI Team MVP - CONTINUE PIPELINE\n');

  const taskId = process.argv[2];

  if (!taskId) {
    console.error('❌ Please provide a task ID:');
    console.error('   npm run continue -- ISSUE-2');
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
      null  // No wiki client for continue script
    );

    const orchestrator = new Orchestrator(
      agentRunner,
      githubClient,
      gitClient,
      null,  // No wiki client
      null,  // No vercel client
      './tasks'
    );

    // Load existing task
    console.log(`📥 Loading task ${taskId}...\n`);
    let taskState = (orchestrator as any).loadTaskState(taskId);

    console.log(`✓ Task loaded: ${taskState.taskId}`);
    console.log(`  Title: ${taskState.issueTitle}`);
    console.log(`  Current Stage: ${taskState.currentStage + 1}/12`);
    console.log(`  Status: ${taskState.status}\n`);

    // Run remaining stages
    console.log('🔄 Running remaining stages...\n');

    const startTime = Date.now();

    while (taskState.status === 'pending' || taskState.status === 'in_progress') {
      const stageIndex = taskState.currentStage;
      const stage = taskState.stages[stageIndex];

      console.log(`${'='.repeat(80)}`);
      console.log(`STAGE ${stageIndex + 1}: ${stage.stageName.toUpperCase()}`);
      console.log('='.repeat(80));

      taskState = await orchestrator.runNextStage(taskState.taskId);

      if (taskState.stages[stageIndex].status === 'failed') {
        console.error(`\n❌ ${stage.stageName} failed: ${taskState.stages[stageIndex].error}`);
        process.exit(1);
      }

      console.log(`\n✓ ${stage.stageName} completed:`);
      console.log(`  Tokens: ${taskState.stages[stageIndex].tokensUsed?.toLocaleString()}`);
      console.log(`  Duration: ${((taskState.stages[stageIndex].durationMs || 0) / 1000).toFixed(2)}s`);
      console.log(`  Artifact: ${taskState.stages[stageIndex].artifactPath}\n`);

      if (taskState.status === 'awaiting_approval') {
        console.log(`\n⚠️  HUMAN APPROVAL REQUIRED`);
        console.log(`Stage ${stageIndex + 1} requires approval.`);
        break;
      }
    }

    // Pipeline completed
    if (taskState.status === 'completed') {
      const totalDuration = Date.now() - startTime;

      console.log(`\n${'='.repeat(80)}`);
      console.log('🎉 PIPELINE COMPLETED SUCCESSFULLY!');
      console.log('='.repeat(80));

      // Calculate totals
      let totalTokens = 0;
      taskState.stages.forEach((stage: any) => {
        if (stage.status === 'completed') {
          totalTokens += stage.tokensUsed || 0;
        }
      });

      const totalCost = (totalTokens / 1000000) * 3.0;

      console.log(`\n📊 Pipeline Statistics:`);
      console.log(`  Total stages completed: ${taskState.stages.filter((s: any) => s.status === 'completed').length}/12`);
      console.log(`  Total tokens: ${totalTokens.toLocaleString()}`);
      console.log(`  Total duration: ${(totalDuration / 1000).toFixed(2)}s`);
      console.log(`  Estimated cost: $${totalCost.toFixed(4)}`);

      console.log(`\n✅ Task completed!`);
      if (taskState.prUrl) {
        console.log(`\n🔗 Pull Request: ${taskState.prUrl}\n`);
      }
    }

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    logger.error('Continue pipeline failed', { error });
    process.exit(1);
  }
}

main();
