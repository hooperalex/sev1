"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubClient = void 0;
const rest_1 = require("@octokit/rest");
const logger_1 = require("../utils/logger");
class GitHubClient {
    constructor(token, owner, repo) {
        this.octokit = new rest_1.Octokit({ auth: token });
        this.owner = owner;
        this.repo = repo;
    }
    /**
     * Get issue details
     */
    async getIssue(issueNumber) {
        try {
            logger_1.logger.info(`Fetching GitHub issue #${issueNumber}`);
            const response = await this.octokit.issues.get({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber
            });
            logger_1.logger.info(`Fetched issue: ${response.data.title}`);
            return response.data;
        }
        catch (error) {
            logger_1.logger.error(`Failed to fetch issue #${issueNumber}`, { error: error.message });
            throw new Error(`Failed to fetch GitHub issue: ${error.message}`);
        }
    }
    /**
     * Add comment to issue
     */
    async addComment(issueNumber, comment) {
        try {
            logger_1.logger.info(`Adding comment to issue #${issueNumber}`);
            await this.octokit.issues.createComment({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                body: comment
            });
            logger_1.logger.info(`Comment added to issue #${issueNumber}`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to add comment to #${issueNumber}`, { error: error.message });
            throw new Error(`Failed to add comment: ${error.message}`);
        }
    }
    /**
     * Update issue assignees
     */
    async updateAssignees(issueNumber, assignees) {
        try {
            logger_1.logger.info(`Updating assignees for issue #${issueNumber}`, { assignees });
            await this.octokit.issues.update({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                assignees
            });
            logger_1.logger.info(`Assignees updated for issue #${issueNumber}`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to update assignees for #${issueNumber}`, { error: error.message });
            throw new Error(`Failed to update assignees: ${error.message}`);
        }
    }
    /**
     * Add label to issue
     */
    async addLabel(issueNumber, label) {
        try {
            logger_1.logger.info(`Adding label '${label}' to issue #${issueNumber}`);
            await this.octokit.issues.addLabels({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                labels: [label]
            });
            logger_1.logger.info(`Label '${label}' added to issue #${issueNumber}`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to add label to #${issueNumber}`, { error: error.message });
            throw new Error(`Failed to add label: ${error.message}`);
        }
    }
    /**
     * Remove label from issue
     */
    async removeLabel(issueNumber, label) {
        try {
            logger_1.logger.info(`Removing label '${label}' from issue #${issueNumber}`);
            await this.octokit.issues.removeLabel({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                name: label
            });
            logger_1.logger.info(`Label '${label}' removed from issue #${issueNumber}`);
        }
        catch (error) {
            // Ignore if label doesn't exist
            if (error.status === 404) {
                logger_1.logger.info(`Label '${label}' not found on issue #${issueNumber}`);
                return;
            }
            logger_1.logger.error(`Failed to remove label from #${issueNumber}`, { error: error.message });
            throw new Error(`Failed to remove label: ${error.message}`);
        }
    }
    /**
     * Close issue
     */
    async closeIssue(issueNumber, comment) {
        try {
            logger_1.logger.info(`Closing issue #${issueNumber}`);
            if (comment) {
                await this.addComment(issueNumber, comment);
            }
            await this.octokit.issues.update({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                state: 'closed'
            });
            logger_1.logger.info(`Issue #${issueNumber} closed`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to close issue #${issueNumber}`, { error: error.message });
            throw new Error(`Failed to close issue: ${error.message}`);
        }
    }
    /**
     * Create a new issue
     */
    async createIssue(title, body, labels) {
        try {
            logger_1.logger.info('Creating GitHub issue', { title, labels });
            const response = await this.octokit.issues.create({
                owner: this.owner,
                repo: this.repo,
                title,
                body,
                labels: labels || []
            });
            logger_1.logger.info('Issue created', {
                number: response.data.number,
                url: response.data.html_url
            });
            return {
                number: response.data.number,
                html_url: response.data.html_url
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to create issue', { error: error.message });
            throw new Error(`Failed to create issue: ${error.message}`);
        }
    }
    /**
     * Update issue body
     */
    async updateIssueBody(issueNumber, body) {
        try {
            logger_1.logger.info('Updating issue body', { issueNumber });
            await this.octokit.issues.update({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                body
            });
            logger_1.logger.info('Issue body updated', { issueNumber });
        }
        catch (error) {
            logger_1.logger.error('Failed to update issue body', { error: error.message });
            throw new Error(`Failed to update issue body: ${error.message}`);
        }
    }
    /**
     * Create a pull request
     */
    async createPullRequest(title, body, headBranch, baseBranch = 'main', issueNumber) {
        try {
            logger_1.logger.info('Creating pull request', { title, headBranch, baseBranch });
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
            logger_1.logger.info('Pull request created', { number: response.data.number, url: response.data.html_url });
            return {
                number: response.data.number,
                html_url: response.data.html_url
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to create pull request', { error: error.message });
            throw new Error(`Failed to create pull request: ${error.message}`);
        }
    }
    /**
     * Link PR to issue by adding comment
     */
    async linkPullRequestToIssue(issueNumber, prNumber, prUrl) {
        try {
            logger_1.logger.info('Linking PR to issue', { issueNumber, prNumber });
            const comment = `🔗 **Pull Request Created**\n\n` +
                `The fix for this issue is ready for review: #${prNumber}\n\n` +
                `[View Pull Request →](${prUrl})`;
            await this.addComment(issueNumber, comment);
            logger_1.logger.info('PR linked to issue', { issueNumber, prNumber });
        }
        catch (error) {
            logger_1.logger.error('Failed to link PR to issue', { error: error.message });
            throw new Error(`Failed to link PR to issue: ${error.message}`);
        }
    }
    /**
     * Close a pull request
     */
    async closePullRequest(prNumber, comment) {
        try {
            logger_1.logger.info('Closing pull request', { prNumber });
            if (comment) {
                await this.octokit.issues.createComment({
                    owner: this.owner,
                    repo: this.repo,
                    issue_number: prNumber,
                    body: comment
                });
            }
            await this.octokit.pulls.update({
                owner: this.owner,
                repo: this.repo,
                pull_number: prNumber,
                state: 'closed'
            });
            logger_1.logger.info('Pull request closed', { prNumber });
        }
        catch (error) {
            logger_1.logger.error('Failed to close pull request', { prNumber, error: error.message });
            throw new Error(`Failed to close pull request: ${error.message}`);
        }
    }
    /**
     * List open issues with specific labels
     */
    async listOpenIssues(labels) {
        try {
            logger_1.logger.info('Fetching open issues', { labels });
            const response = await this.octokit.issues.listForRepo({
                owner: this.owner,
                repo: this.repo,
                state: 'open',
                labels: labels?.join(','),
                per_page: 100
            });
            logger_1.logger.info(`Fetched ${response.data.length} open issues`);
            return response.data;
        }
        catch (error) {
            logger_1.logger.error('Failed to fetch open issues', { error: error.message });
            throw new Error(`Failed to fetch open issues: ${error.message}`);
        }
    }
    /**
     * Parse issue URL to get number
     */
    static parseIssueUrl(url) {
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
exports.GitHubClient = GitHubClient;
//# sourceMappingURL=GitHubClient.js.map