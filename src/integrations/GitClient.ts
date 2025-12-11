/**
 * GitClient: Integrates with local Git repository
 *
 * Provides access to:
 * - git blame (find when lines were changed)
 * - git log (commit history)
 * - git show (commit details)
 * - git diff (changes)
 */

import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import { logger } from '../utils/logger';

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

export class GitClient {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
    logger.info('GitClient initialized', { repoPath });
  }

  /**
   * Get blame information for a file
   * Shows who changed each line and when
   */
  async blame(filePath: string): Promise<GitBlameInfo[]> {
    try {
      logger.debug('Running git blame', { filePath });

      const absolutePath = path.resolve(this.repoPath, filePath);
      const blameResult = await this.git.raw(['blame', '--line-porcelain', filePath]);

      // Parse blame output
      const lines = blameResult.split('\n');
      const blameInfo: GitBlameInfo[] = [];

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
        } else if (line.startsWith('author ')) {
          currentAuthor = line.substring(7);
        } else if (line.startsWith('author-time ')) {
          const timestamp = parseInt(line.substring(12), 10);
          currentDate = new Date(timestamp * 1000).toISOString();
        } else if (line.startsWith('\t')) {
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

      logger.debug('Blame completed', { filePath, lines: blameInfo.length });
      return blameInfo;

    } catch (error: any) {
      logger.error('Blame failed', { filePath, error: error.message });
      throw new Error(`Failed to get blame for ${filePath}: ${error.message}`);
    }
  }

  /**
   * Get blame for specific line range
   */
  async blameLines(filePath: string, startLine: number, endLine: number): Promise<GitBlameInfo[]> {
    const allBlame = await this.blame(filePath);
    return allBlame.filter(b => b.line >= startLine && b.line <= endLine);
  }

  /**
   * Get commit history for a file
   */
  async log(filePath?: string, maxCount: number = 50): Promise<GitCommitInfo[]> {
    try {
      logger.debug('Running git log', { filePath, maxCount });

      const options: any = {
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

      const commits: GitCommitInfo[] = await Promise.all(
        logResult.all.map(async (commit: any) => {
          // Get files changed in this commit
          const files = await this.getCommitFiles(commit.hash);

          return {
            hash: commit.hash,
            author: commit.author || '',
            date: commit.date,
            message: commit.message,
            files
          };
        })
      );

      logger.debug('Log completed', { commits: commits.length });
      return commits;

    } catch (error: any) {
      logger.error('Log failed', { filePath, error: error.message });
      throw new Error(`Failed to get git log: ${error.message}`);
    }
  }

  /**
   * Get detailed information about a commit
   */
  async getCommit(commitHash: string, includeDiff: boolean = false): Promise<GitCommitInfo> {
    try {
      logger.debug('Getting commit details', { commitHash });

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

      let diff: string | undefined;
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

    } catch (error: any) {
      logger.error('Get commit failed', { commitHash, error: error.message });
      throw new Error(`Failed to get commit ${commitHash}: ${error.message}`);
    }
  }

  /**
   * Get files changed in a commit
   */
  private async getCommitFiles(commitHash: string): Promise<string[]> {
    try {
      const result = await this.git.show([
        commitHash,
        '--name-only',
        '--format='
      ]);

      return result.split('\n').filter(line => line.trim() !== '');

    } catch (error: any) {
      logger.warn('Failed to get commit files', { commitHash, error: error.message });
      return [];
    }
  }

  /**
   * Search commit messages
   */
  async searchCommits(query: string, maxCount: number = 20): Promise<GitCommitInfo[]> {
    try {
      logger.debug('Searching commits', { query });

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

      const commits: GitCommitInfo[] = await Promise.all(
        logResult.all.map(async (commit: any) => {
          const files = await this.getCommitFiles(commit.hash);
          return {
            hash: commit.hash,
            author: commit.author || '',
            date: commit.date,
            message: commit.message,
            files
          };
        })
      );

      logger.debug('Search completed', { query, results: commits.length });
      return commits;

    } catch (error: any) {
      logger.error('Search commits failed', { query, error: error.message });
      throw new Error(`Failed to search commits: ${error.message}`);
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const result = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return result.trim();
    } catch (error: any) {
      logger.error('Get current branch failed', { error: error.message });
      throw new Error(`Failed to get current branch: ${error.message}`);
    }
  }

  /**
   * Get repository status
   */
  async getStatus(): Promise<any> {
    try {
      return await this.git.status();
    } catch (error: any) {
      logger.error('Get status failed', { error: error.message });
      throw new Error(`Failed to get git status: ${error.message}`);
    }
  }

  /**
   * Check if repository has uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.getStatus();
    return !status.isClean();
  }

  /**
   * Create and checkout a new branch
   */
  async createBranch(branchName: string, fromBranch: string = 'main'): Promise<void> {
    try {
      logger.info('Creating branch', { branchName, fromBranch });

      // Ensure we're on the base branch
      await this.git.checkout(fromBranch);

      // Pull latest changes
      await this.git.pull('origin', fromBranch);

      // Create and checkout new branch
      await this.git.checkoutLocalBranch(branchName);

      logger.info('Branch created and checked out', { branchName });
    } catch (error: any) {
      logger.error('Create branch failed', { branchName, error: error.message });
      throw new Error(`Failed to create branch ${branchName}: ${error.message}`);
    }
  }

  /**
   * Checkout an existing branch
   */
  async checkout(branchName: string): Promise<void> {
    try {
      logger.info('Checking out branch', { branchName });
      await this.git.checkout(branchName);
      logger.info('Branch checked out', { branchName });
    } catch (error: any) {
      logger.error('Checkout failed', { branchName, error: error.message });
      throw new Error(`Failed to checkout branch ${branchName}: ${error.message}`);
    }
  }

  /**
   * Stage and commit changes
   */
  async commit(message: string, files?: string[]): Promise<string> {
    try {
      logger.info('Committing changes', { message, files: files?.length || 'all' });

      // Stage files
      if (files && files.length > 0) {
        await this.git.add(files);
      } else {
        await this.git.add('.');
      }

      // Commit
      const result = await this.git.commit(message);

      logger.info('Changes committed', { commit: result.commit });
      return result.commit;
    } catch (error: any) {
      logger.error('Commit failed', { message, error: error.message });
      throw new Error(`Failed to commit changes: ${error.message}`);
    }
  }

  /**
   * Push branch to remote
   */
  async push(branchName: string, remote: string = 'origin'): Promise<void> {
    try {
      logger.info('Pushing branch', { branchName, remote });

      await this.git.push(remote, branchName, ['--set-upstream']);

      logger.info('Branch pushed', { branchName, remote });
    } catch (error: any) {
      logger.error('Push failed', { branchName, error: error.message });
      throw new Error(`Failed to push branch ${branchName}: ${error.message}`);
    }
  }

  /**
   * Check if branch exists
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      const branches = await this.git.branchLocal();
      return branches.all.includes(branchName);
    } catch (error: any) {
      logger.error('Branch exists check failed', { branchName, error: error.message });
      return false;
    }
  }

  /**
   * Delete a local branch
   */
  async deleteBranch(branchName: string, force: boolean = true): Promise<void> {
    try {
      logger.info('Deleting branch', { branchName, force });

      // Switch to main first if we're on the branch to delete
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch === branchName) {
        await this.checkout('main');
      }

      // Delete the branch
      await this.git.deleteLocalBranch(branchName, force);
      logger.info('Branch deleted', { branchName });
    } catch (error: any) {
      logger.error('Delete branch failed', { branchName, error: error.message });
      throw new Error(`Failed to delete branch ${branchName}: ${error.message}`);
    }
  }
}
