/**
 * GitClient: Integrates with local Git repository
 *
 * Provides access to:
 * - git blame (find when lines were changed)
 * - git log (commit history)
 * - git show (commit details)
 * - git diff (changes)
 */
export interface GitBlameInfo {
    commit: string;
    author: string;
    date: string;
    line: number;
    content: string;
}
export interface GitCommitInfo {
    hash: string;
    author: string;
    date: string;
    message: string;
    files: string[];
    diff?: string;
}
export declare class GitClient {
    private git;
    private repoPath;
    constructor(repoPath?: string);
    /**
     * Get blame information for a file
     * Shows who changed each line and when
     */
    blame(filePath: string): Promise<GitBlameInfo[]>;
    /**
     * Get blame for specific line range
     */
    blameLines(filePath: string, startLine: number, endLine: number): Promise<GitBlameInfo[]>;
    /**
     * Get commit history for a file
     */
    log(filePath?: string, maxCount?: number): Promise<GitCommitInfo[]>;
    /**
     * Get detailed information about a commit
     */
    getCommit(commitHash: string, includeDiff?: boolean): Promise<GitCommitInfo>;
    /**
     * Get files changed in a commit
     */
    private getCommitFiles;
    /**
     * Search commit messages
     */
    searchCommits(query: string, maxCount?: number): Promise<GitCommitInfo[]>;
    /**
     * Get current branch name
     */
    getCurrentBranch(): Promise<string>;
    /**
     * Get repository status
     */
    getStatus(): Promise<any>;
    /**
     * Check if repository has uncommitted changes
     */
    hasUncommittedChanges(): Promise<boolean>;
    /**
     * Create and checkout a new branch
     */
    createBranch(branchName: string, fromBranch?: string): Promise<void>;
    /**
     * Checkout an existing branch
     */
    checkout(branchName: string): Promise<void>;
    /**
     * Stage and commit changes
     */
    commit(message: string, files?: string[]): Promise<string>;
    /**
     * Push branch to remote
     */
    push(branchName: string, remote?: string): Promise<void>;
    /**
     * Check if branch exists
     */
    branchExists(branchName: string): Promise<boolean>;
}
//# sourceMappingURL=GitClient.d.ts.map