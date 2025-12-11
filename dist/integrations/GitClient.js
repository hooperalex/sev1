"use strict";
/**
 * GitClient: Integrates with local Git repository
 *
 * Provides access to:
 * - git blame (find when lines were changed)
 * - git log (commit history)
 * - git show (commit details)
 * - git diff (changes)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitClient = void 0;
const simple_git_1 = __importDefault(require("simple-git"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
class GitClient {
    constructor(repoPath = process.cwd()) {
        this.repoPath = repoPath;
        this.git = (0, simple_git_1.default)(repoPath);
        logger_1.logger.info('GitClient initialized', { repoPath });
    }
    /**
     * Get blame information for a file
     * Shows who changed each line and when
     */
    async blame(filePath) {
        try {
            logger_1.logger.debug('Running git blame', { filePath });
            const absolutePath = path.resolve(this.repoPath, filePath);
            const blameResult = await this.git.raw(['blame', '--line-porcelain', filePath]);
            // Parse blame output
            const lines = blameResult.split('\n');
            const blameInfo = [];
            let currentCommit = '';
            let currentAuthor = '';
            let currentDate = '';
            let currentLine = 0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.match(/^[0-9a-f]{40}/)) {
                    // Commit hash line
                    currentCommit = line.split(' ')[0];
                    currentLine = parseInt(line.split(' ')[2], 10);
                }
                else if (line.startsWith('author ')) {
                    currentAuthor = line.substring(7);
                }
                else if (line.startsWith('author-time ')) {
                    const timestamp = parseInt(line.substring(12), 10);
                    currentDate = new Date(timestamp * 1000).toISOString();
                }
                else if (line.startsWith('\t')) {
                    // Actual code line
                    blameInfo.push({
                        commit: currentCommit,
                        author: currentAuthor,
                        date: currentDate,
                        line: currentLine,
                        content: line.substring(1)
                    });
                }
            }
            logger_1.logger.debug('Blame completed', { filePath, lines: blameInfo.length });
            return blameInfo;
        }
        catch (error) {
            logger_1.logger.error('Blame failed', { filePath, error: error.message });
            throw new Error(`Failed to get blame for ${filePath}: ${error.message}`);
        }
    }
    /**
     * Get blame for specific line range
     */
    async blameLines(filePath, startLine, endLine) {
        const allBlame = await this.blame(filePath);
        return allBlame.filter(b => b.line >= startLine && b.line <= endLine);
    }
    /**
     * Get commit history for a file
     */
    async log(filePath, maxCount = 50) {
        try {
            logger_1.logger.debug('Running git log', { filePath, maxCount });
            const options = {
                maxCount,
                format: {
                    hash: '%H',
                    author: '%an',
                    date: '%ai',
                    message: '%s'
                }
            };
            if (filePath) {
                options.file = filePath;
            }
            const logResult = await this.git.log(options);
            const commits = await Promise.all(logResult.all.map(async (commit) => {
                // Get files changed in this commit
                const files = await this.getCommitFiles(commit.hash);
                return {
                    hash: commit.hash,
                    author: commit.author || '',
                    date: commit.date,
                    message: commit.message,
                    files
                };
            }));
            logger_1.logger.debug('Log completed', { commits: commits.length });
            return commits;
        }
        catch (error) {
            logger_1.logger.error('Log failed', { filePath, error: error.message });
            throw new Error(`Failed to get git log: ${error.message}`);
        }
    }
    /**
     * Get detailed information about a commit
     */
    async getCommit(commitHash, includeDiff = false) {
        try {
            logger_1.logger.debug('Getting commit details', { commitHash });
            const showResult = await this.git.show([
                commitHash,
                '--format=%H%n%an%n%ai%n%s',
                '--name-only'
            ]);
            const lines = showResult.split('\n');
            const hash = lines[0];
            const author = lines[1];
            const date = lines[2];
            const message = lines[3];
            const files = lines.slice(4).filter(line => line.trim() !== '');
            let diff;
            if (includeDiff) {
                diff = await this.git.show([commitHash]);
            }
            return {
                hash,
                author,
                date,
                message,
                files,
                diff
            };
        }
        catch (error) {
            logger_1.logger.error('Get commit failed', { commitHash, error: error.message });
            throw new Error(`Failed to get commit ${commitHash}: ${error.message}`);
        }
    }
    /**
     * Get files changed in a commit
     */
    async getCommitFiles(commitHash) {
        try {
            const result = await this.git.show([
                commitHash,
                '--name-only',
                '--format='
            ]);
            return result.split('\n').filter(line => line.trim() !== '');
        }
        catch (error) {
            logger_1.logger.warn('Failed to get commit files', { commitHash, error: error.message });
            return [];
        }
    }
    /**
     * Search commit messages
     */
    async searchCommits(query, maxCount = 20) {
        try {
            logger_1.logger.debug('Searching commits', { query });
            const logResult = await this.git.log({
                maxCount,
                '--grep': query,
                format: {
                    hash: '%H',
                    author: '%an',
                    date: '%ai',
                    message: '%s'
                }
            });
            const commits = await Promise.all(logResult.all.map(async (commit) => {
                const files = await this.getCommitFiles(commit.hash);
                return {
                    hash: commit.hash,
                    author: commit.author || '',
                    date: commit.date,
                    message: commit.message,
                    files
                };
            }));
            logger_1.logger.debug('Search completed', { query, results: commits.length });
            return commits;
        }
        catch (error) {
            logger_1.logger.error('Search commits failed', { query, error: error.message });
            throw new Error(`Failed to search commits: ${error.message}`);
        }
    }
    /**
     * Get current branch name
     */
    async getCurrentBranch() {
        try {
            const result = await this.git.revparse(['--abbrev-ref', 'HEAD']);
            return result.trim();
        }
        catch (error) {
            logger_1.logger.error('Get current branch failed', { error: error.message });
            throw new Error(`Failed to get current branch: ${error.message}`);
        }
    }
    /**
     * Get repository status
     */
    async getStatus() {
        try {
            return await this.git.status();
        }
        catch (error) {
            logger_1.logger.error('Get status failed', { error: error.message });
            throw new Error(`Failed to get git status: ${error.message}`);
        }
    }
    /**
     * Check if repository has uncommitted changes
     */
    async hasUncommittedChanges() {
        const status = await this.getStatus();
        return !status.isClean();
    }
    /**
     * Create and checkout a new branch
     */
    async createBranch(branchName, fromBranch = 'main') {
        try {
            logger_1.logger.info('Creating branch', { branchName, fromBranch });
            // Ensure we're on the base branch
            await this.git.checkout(fromBranch);
            // Pull latest changes
            await this.git.pull('origin', fromBranch);
            // Create and checkout new branch
            await this.git.checkoutLocalBranch(branchName);
            logger_1.logger.info('Branch created and checked out', { branchName });
        }
        catch (error) {
            logger_1.logger.error('Create branch failed', { branchName, error: error.message });
            throw new Error(`Failed to create branch ${branchName}: ${error.message}`);
        }
    }
    /**
     * Checkout an existing branch
     */
    async checkout(branchName) {
        try {
            logger_1.logger.info('Checking out branch', { branchName });
            await this.git.checkout(branchName);
            logger_1.logger.info('Branch checked out', { branchName });
        }
        catch (error) {
            logger_1.logger.error('Checkout failed', { branchName, error: error.message });
            throw new Error(`Failed to checkout branch ${branchName}: ${error.message}`);
        }
    }
    /**
     * Stage and commit changes
     */
    async commit(message, files) {
        try {
            logger_1.logger.info('Committing changes', { message, files: files?.length || 'all' });
            // Stage files
            if (files && files.length > 0) {
                await this.git.add(files);
            }
            else {
                await this.git.add('.');
            }
            // Commit
            const result = await this.git.commit(message);
            logger_1.logger.info('Changes committed', { commit: result.commit });
            return result.commit;
        }
        catch (error) {
            logger_1.logger.error('Commit failed', { message, error: error.message });
            throw new Error(`Failed to commit changes: ${error.message}`);
        }
    }
    /**
     * Push branch to remote
     */
    async push(branchName, remote = 'origin') {
        try {
            logger_1.logger.info('Pushing branch', { branchName, remote });
            await this.git.push(remote, branchName, ['--set-upstream']);
            logger_1.logger.info('Branch pushed', { branchName, remote });
        }
        catch (error) {
            logger_1.logger.error('Push failed', { branchName, error: error.message });
            throw new Error(`Failed to push branch ${branchName}: ${error.message}`);
        }
    }
    /**
     * Check if branch exists
     */
    async branchExists(branchName) {
        try {
            const branches = await this.git.branchLocal();
            return branches.all.includes(branchName);
        }
        catch (error) {
            logger_1.logger.error('Branch exists check failed', { branchName, error: error.message });
            return false;
        }
    }
}
exports.GitClient = GitClient;
//# sourceMappingURL=GitClient.js.map