/**
 * Cleanup Task: Remove task artifacts and close associated PR
 */

import * as dotenv from 'dotenv';
import { GitHubClient } from './integrations/GitHubClient';
import { GitClient } from './integrations/GitClient';
import { logger } from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

async function main() {
  const taskId = process.argv[2];

  if (!taskId) {
    console.error('❌ Please provide a task ID:');
    console.error('   npm run cleanup -- ISSUE-2');
    process.exit(1);
  }

  const requiredEnvVars = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

  if (missingEnvVars.length > 0) {
    console.error(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
  }

  try {
    console.log(`🧹 Cleaning up task: ${taskId}\n`);

    const githubClient = new GitHubClient(
      process.env.GITHUB_TOKEN!,
      process.env.GITHUB_OWNER!,
      process.env.GITHUB_REPO!
    );

    const gitClient = new GitClient();

    // Load task state
    const taskDir = path.join('./tasks', taskId);
    const statePath = path.join(taskDir, 'state.json');

    if (!fs.existsSync(statePath)) {
      console.error(`❌ Task not found: ${taskId}`);
      process.exit(1);
    }

    const content = fs.readFileSync(statePath, 'utf-8');
    const taskState = JSON.parse(content);

    console.log(`Task: ${taskState.taskId}`);
    console.log(`Issue: #${taskState.issueNumber} - ${taskState.issueTitle}`);
    console.log(`Branch: ${taskState.branchName}`);
    if (taskState.prNumber) {
      console.log(`PR: #${taskState.prNumber}`);
    }
    console.log();

    // Close PR if it exists
    if (taskState.prNumber) {
      try {
        console.log(`Closing PR #${taskState.prNumber}...`);
        await githubClient.closePullRequest(
          taskState.prNumber,
          '🧹 Closing PR as the associated issue was deleted or task was cancelled.'
        );
        console.log(`✓ PR #${taskState.prNumber} closed`);
      } catch (error: any) {
        console.warn(`⚠️  Failed to close PR: ${error.message}`);
      }
    }

    // Delete branch
    if (taskState.branchName) {
      try {
        console.log(`Deleting branch ${taskState.branchName}...`);
        await gitClient.deleteBranch(taskState.branchName);
        console.log(`✓ Branch deleted locally`);
      } catch (error: any) {
        console.warn(`⚠️  Failed to delete branch: ${error.message}`);
      }
    }

    // Remove task directory
    console.log(`Removing task directory...`);
    if (fs.existsSync(taskDir)) {
      fs.rmSync(taskDir, { recursive: true, force: true });
      console.log(`✓ Task directory removed`);
    }

    console.log(`\n✅ Cleanup complete for ${taskId}`);

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    logger.error('Cleanup failed', { error });
    process.exit(1);
  }
}

main();
