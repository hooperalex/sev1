/**
 * Test script: Run Detective agent on a GitHub issue
 *
 * Usage:
 *   npm run test -- <issue-number>
 *
 * Example:
 *   npm run test -- 123
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { AgentRunner } from './AgentRunner';
import { GitHubClient } from './integrations/GitHubClient';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🔍 AI Team MVP - Detective Agent Test\n');

  // Get issue number from command line
  const issueNumber = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  if (!issueNumber) {
    console.error('❌ Please provide an issue number:');
    console.error('   npm run test -- 123');
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
      './.claude/agents'
    );

    // Fetch GitHub issue
    console.log(`📥 Fetching issue #${issueNumber}...`);
    const issue = await githubClient.getIssue(issueNumber);

    console.log(`\n✓ Issue fetched:`);
    console.log(`  Title: ${issue.title}`);
    console.log(`  URL: ${issue.html_url}`);
    console.log(`  State: ${issue.state}`);

    // Run Detective agent
    console.log(`\n🕵️  Running Detective agent...`);
    const result = await agentRunner.runAgent('detective', {
      issueNumber: issue.number,
      issueTitle: issue.title,
      issueBody: issue.body || 'No description provided',
      issueUrl: issue.html_url
    });

    if (!result.success) {
      console.error(`\n❌ Detective agent failed: ${result.error}`);
      process.exit(1);
    }

    // Display results
    console.log(`\n✓ Detective agent completed:`);
    console.log(`  Tokens used: ${result.tokensUsed}`);
    console.log(`  Duration: ${(result.durationMs! / 1000).toFixed(2)}s`);

    console.log(`\n${'='.repeat(80)}`);
    console.log('TRIAGE REPORT:');
    console.log('='.repeat(80));
    console.log(result.output);
    console.log('='.repeat(80));

    // Save output to file
    const tasksDir = path.join(process.cwd(), 'tasks');
    const taskDir = path.join(tasksDir, `ISSUE-${issueNumber}`);

    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }

    const outputFile = path.join(taskDir, 'triage-report.md');
    fs.writeFileSync(outputFile, result.output);

    console.log(`\n💾 Triage report saved to: ${outputFile}`);

    // Log summary
    console.log(`\n✅ Test completed successfully!`);
    console.log(`\nNext steps:`);
    console.log(`  1. Review the triage report above`);
    console.log(`  2. Check if the analysis is accurate`);
    console.log(`  3. If good, we can build the next agent (Archaeologist)`);

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    logger.error('Test failed', { error });
    process.exit(1);
  }
}

// Run test
main();
