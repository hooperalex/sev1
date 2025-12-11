/**
 * Override Termination: Force pipeline to continue despite agent recommendations
 */

import * as dotenv from 'dotenv';
import { GitHubClient } from './integrations/GitHubClient';
import { logger } from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

async function main() {
  const taskId = process.argv[2];

  if (!taskId) {
    console.error('❌ Please provide a task ID:');
    console.error('   npm run override -- ISSUE-8');
    process.exit(1);
  }

  const requiredEnvVars = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

  if (missingEnvVars.length > 0) {
    console.error(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
  }

  try {
    console.log(`⚠️  OVERRIDING termination for task: ${taskId}\n`);

    const githubClient = new GitHubClient(
      process.env.GITHUB_TOKEN!,
      process.env.GITHUB_OWNER!,
      process.env.GITHUB_REPO!
    );

    // Load task state
    const taskDir = path.join('./tasks', taskId);
    const statePath = path.join(taskDir, 'state.json');

    if (!fs.existsSync(statePath)) {
      console.error(`❌ Task not found: ${taskId}`);
      process.exit(1);
    }

    const content = fs.readFileSync(statePath, 'utf-8');
    const taskState = JSON.parse(content);

    if (taskState.status !== 'awaiting_closure_approval') {
      console.error(`❌ Task is not awaiting closure approval (status: ${taskState.status})`);
      process.exit(1);
    }

    console.log(`Task: ${taskState.taskId}`);
    console.log(`Issue: #${taskState.issueNumber} - ${taskState.issueTitle}`);
    console.log(`Current Stage: ${taskState.currentStage + 1}/13`);
    console.log();

    console.log('⚠️  WARNING: You are overriding agent recommendations.');
    console.log('The AI agents identified concerns with proceeding. Use caution.\n');

    // Update task state to continue
    taskState.status = 'pending';
    taskState.currentStage += 1; // Move to next stage
    taskState.updatedAt = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(taskState, null, 2), 'utf-8');

    // Comment on issue
    const overrideComment =
      `⚡ **Human Override - Pipeline Continuing**\n\n` +
      `A human reviewer has chosen to override the AI agents' recommendation to halt.\n\n` +
      `**Override Reason:** Manual decision to continue despite agent concerns\n\n` +
      `The pipeline will now continue from Stage ${taskState.currentStage + 1}.\n\n` +
      `⚠️  Note: This override bypasses agent recommendations. Please monitor the results carefully.`;

    await githubClient.addComment(taskState.issueNumber, overrideComment);
    await githubClient.removeLabel(taskState.issueNumber, 'awaiting-human-review');
    await githubClient.addLabel(taskState.issueNumber, 'human-override');

    console.log(`✅ Override approved`);
    console.log(`🔄 Pipeline will continue from Stage ${taskState.currentStage + 1}`);
    console.log(`⚠️  Labels updated to indicate human override\n`);

    console.log(`To continue the pipeline, run:`);
    console.log(`   npm run continue -- ${taskId}\n`);

    logger.info('Termination overridden', { taskId, issueNumber: taskState.issueNumber });

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    logger.error('Override failed', { error });
    process.exit(1);
  }
}

main();
