import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger';

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  user: {
    login: string;
  };
  labels: Array<{ name: string }>;
  created_at: string;
  updated_at: string;
}

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Get issue details
   */
  async getIssue(issueNumber: number): Promise<GitHubIssue> {
    try {
      logger.info(`Fetching GitHub issue #${issueNumber}`);

      const response = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      logger.info(`Fetched issue: ${response.data.title}`);

      return response.data as GitHubIssue;

    } catch (error: any) {
      logger.error(`Failed to fetch issue #${issueNumber}`, { error: error.message });
      throw new Error(`Failed to fetch GitHub issue: ${error.message}`);
    }
  }

  /**
   * Add comment to issue
   */
  async addComment(issueNumber: number, comment: string): Promise<void> {
    try {
      logger.info(`Adding comment to issue #${issueNumber}`);

      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body: comment
      });

      logger.info(`Comment added to issue #${issueNumber}`);

    } catch (error: any) {
      logger.error(`Failed to add comment to #${issueNumber}`, { error: error.message });
      throw new Error(`Failed to add comment: ${error.message}`);
    }
  }

  /**
   * Update issue assignees
   */
  async updateAssignees(issueNumber: number, assignees: string[]): Promise<void> {
    try {
      logger.info(`Updating assignees for issue #${issueNumber}`, { assignees });

      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        assignees
      });

      logger.info(`Assignees updated for issue #${issueNumber}`);

    } catch (error: any) {
      logger.error(`Failed to update assignees for #${issueNumber}`, { error: error.message });
      throw new Error(`Failed to update assignees: ${error.message}`);
    }
  }

  /**
   * Add label to issue
   */
  async addLabel(issueNumber: number, label: string): Promise<void> {
    try {
      logger.info(`Adding label '${label}' to issue #${issueNumber}`);

      await this.octokit.issues.addLabels({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        labels: [label]
      });

      logger.info(`Label '${label}' added to issue #${issueNumber}`);

    } catch (error: any) {
      logger.error(`Failed to add label to #${issueNumber}`, { error: error.message });
      throw new Error(`Failed to add label: ${error.message}`);
    }
  }

  /**
   * Remove label from issue
   */
  async removeLabel(issueNumber: number, label: string): Promise<void> {
    try {
      logger.info(`Removing label '${label}' from issue #${issueNumber}`);

      await this.octokit.issues.removeLabel({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        name: label
      });

      logger.info(`Label '${label}' removed from issue #${issueNumber}`);

    } catch (error: any) {
      // Ignore if label doesn't exist
      if (error.status === 404) {
        logger.info(`Label '${label}' not found on issue #${issueNumber}`);
        return;
      }
      logger.error(`Failed to remove label from #${issueNumber}`, { error: error.message });
      throw new Error(`Failed to remove label: ${error.message}`);
    }
  }

  /**
   * Close issue
   */
  async closeIssue(issueNumber: number, comment?: string): Promise<void> {
    try {
      logger.info(`Closing issue #${issueNumber}`);

      if (comment) {
        await this.addComment(issueNumber, comment);
      }

      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        state: 'closed'
      });

      logger.info(`Issue #${issueNumber} closed`);

    } catch (error: any) {
      logger.error(`Failed to close issue #${issueNumber}`, { error: error.message });
      throw new Error(`Failed to close issue: ${error.message}`);
    }
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    title: string,
    body: string,
    headBranch: string,
    baseBranch: string = 'main',
    issueNumber?: number
  ): Promise<{ number: number; html_url: string }> {
    try {
      logger.info('Creating pull request', { title, headBranch, baseBranch });

      // Add "Closes #X" to body if issue number provided
      let prBody = body;
      if (issueNumber) {
        prBody = `${body}\n\nCloses #${issueNumber}`;
      }

      const response = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body: prBody,
        head: headBranch,
        base: baseBranch
      });

      logger.info('Pull request created', { number: response.data.number, url: response.data.html_url });

      return {
        number: response.data.number,
        html_url: response.data.html_url
      };
    } catch (error: any) {
      logger.error('Failed to create pull request', { error: error.message });
      throw new Error(`Failed to create pull request: ${error.message}`);
    }
  }

  /**
   * Link PR to issue by adding comment
   */
  async linkPullRequestToIssue(issueNumber: number, prNumber: number, prUrl: string): Promise<void> {
    try {
      logger.info('Linking PR to issue', { issueNumber, prNumber });

      const comment = `🔗 **Pull Request Created**\n\n` +
        `The fix for this issue is ready for review: #${prNumber}\n\n` +
        `[View Pull Request →](${prUrl})`;

      await this.addComment(issueNumber, comment);

      logger.info('PR linked to issue', { issueNumber, prNumber });
    } catch (error: any) {
      logger.error('Failed to link PR to issue', { error: error.message });
      throw new Error(`Failed to link PR to issue: ${error.message}`);
    }
  }

  /**
   * Parse issue URL to get number
   */
  static parseIssueUrl(url: string): { owner: string; repo: string; number: number } | null {
    // Example: https://github.com/owner/repo/issues/123
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/);

    if (!match) {
      return null;
    }

    return {
      owner: match[1],
      repo: match[2],
      number: parseInt(match[3], 10)
    };
  }
}
