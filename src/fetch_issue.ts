/**
 * Fetch and display a GitHub issue
 */

import * as dotenv from 'dotenv';
import { GitHubClient } from './integrations/GitHubClient';

dotenv.config();

async function main() {
  const issueNumber = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  if (!issueNumber) {
    console.error('❌ Please provide an issue number:');
    console.error('   ts-node src/fetch_issue.ts 8');
    process.exit(1);
  }

  const githubClient = new GitHubClient(
    process.env.GITHUB_TOKEN!,
    process.env.GITHUB_OWNER!,
    process.env.GITHUB_REPO!
  );

  try {
    const issue = await githubClient.getIssue(issueNumber);

    console.log('================================================================================');
    console.log(`ISSUE #${issue.number}: ${issue.title}`);
    console.log('================================================================================');
    console.log(`URL: ${issue.html_url}`);
    console.log(`State: ${issue.state}`);
    console.log(`Author: ${issue.user.login}`);
    console.log(`Labels: ${issue.labels.map(l => l.name).join(', ') || 'None'}`);
    console.log(`Created: ${issue.created_at}`);
    console.log(`Updated: ${issue.updated_at}`);
    console.log('================================================================================');
    console.log('DESCRIPTION:');
    console.log('================================================================================');
    console.log(issue.body || '(No description provided)');
    console.log('================================================================================');

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
