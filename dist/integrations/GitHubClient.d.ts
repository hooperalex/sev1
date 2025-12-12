export interface GitHubIssue {
    number: number;
    title: string;
    body: string | null;
    state: string;
    html_url: string;
    user: {
        login: string;
    };
    labels: Array<{
        name: string;
    }>;
    created_at: string;
    updated_at: string;
}
export declare class GitHubClient {
    private octokit;
    private owner;
    private repo;
    constructor(token: string, owner: string, repo: string);
    /**
     * Get issue details
     */
    getIssue(issueNumber: number): Promise<GitHubIssue>;
    /**
     * Add comment to issue
     */
    addComment(issueNumber: number, comment: string): Promise<void>;
    /**
     * Update issue assignees
     */
    updateAssignees(issueNumber: number, assignees: string[]): Promise<void>;
    /**
     * Add label to issue
     */
    addLabel(issueNumber: number, label: string): Promise<void>;
    /**
     * Remove label from issue
     */
    removeLabel(issueNumber: number, label: string): Promise<void>;
    /**
     * Close issue
     */
    closeIssue(issueNumber: number, comment?: string): Promise<void>;
    /**
     * Create a new issue
     */
    createIssue(title: string, body: string, labels?: string[]): Promise<{
        number: number;
        html_url: string;
    }>;
    /**
     * Update issue body
     */
    updateIssueBody(issueNumber: number, body: string): Promise<void>;
    /**
     * Create a pull request
     */
    createPullRequest(title: string, body: string, headBranch: string, baseBranch?: string, issueNumber?: number): Promise<{
        number: number;
        html_url: string;
    }>;
    /**
     * Link PR to issue by adding comment
     */
    linkPullRequestToIssue(issueNumber: number, prNumber: number, prUrl: string): Promise<void>;
    /**
     * Close a pull request
     */
    closePullRequest(prNumber: number, comment?: string): Promise<void>;
    /**
     * List open issues with specific labels
     */
    listOpenIssues(labels?: string[]): Promise<GitHubIssue[]>;
    /**
     * Parse issue URL to get number
     */
    static parseIssueUrl(url: string): {
        owner: string;
        repo: string;
        number: number;
    } | null;
}
//# sourceMappingURL=GitHubClient.d.ts.map