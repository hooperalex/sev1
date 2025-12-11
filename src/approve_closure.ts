/**
 * Approve Closure: Close issue as recommended by agents
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
    console.error('   npm run approve-closure -- ISSUE-8');
    process.exit(1);
  }

  const requiredEnvVars = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

  if (missingEnvVars.length > 0) {
    console.error(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
  }

  try {
    console.log(`✅ Approving closure for task: ${taskId}\n`);

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
    console.log(`Current Stage: ${taskState.currentStage + 1}`);
    console.log();

    // Get decision summary from completed agents
    let summary = '### Agent Analysis Summary:\n\n';
    for (let i = 0; i <= taskState.currentStage; i++) {
      const stage = taskState.stages[i];
      if (stage.status === 'completed') {
        summary += `**${stage.stageName}** (${stage.agentName}):\n`;
        summary += `- Status: ✅ Completed\n`;
        summary += `- Output: ${stage.artifactPath}\n\n`;
      }
    }

    // Close the issue with explanation
    const closureComment =
      `🔒 **Issue Closed by Human Approval**\n\n` +
      `After AI agent analysis, this issue has been closed as recommended.\n\n` +
      summary +
      `### Decision\n\n` +
      `A human reviewer has approved the agents' recommendation to close this issue.\n\n` +
      `**Reason:** Agents identified this issue should not proceed through the bug fix pipeline.\n\n` +
      `**Artifacts:** All agent analyses are available in \`./tasks/${taskState.taskId}/\`\n\n` +
      `Thank you for your submission. If you believe this decision is incorrect, please provide additional information and reopen.`;

    await githubClient.closeIssue(taskState.issueNumber, closureComment);
    await githubClient.removeLabel(taskState.issueNumber, 'awaiting-human-review');
    await githubClient.removeLabel(taskState.issueNumber, 'in-progress');
    await githubClient.addLabel(taskState.issueNumber, 'closed-by-approval');

    // Update task state
    taskState.status = 'completed';
    taskState.updatedAt = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(taskState, null, 2), 'utf-8');

    console.log(`✅ Issue #${taskState.issueNumber} closed successfully`);
    console.log(`📝 Task marked as completed`);
    console.log(`🏷️  Labels updated\n`);

    logger.info('Closure approved', { taskId, issueNumber: taskState.issueNumber });

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    logger.error('Approve closure failed', { error });
    process.exit(1);
  }
}

main();
