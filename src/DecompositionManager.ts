/**
 * Decomposition Manager - Handles breaking down complex issues into sub-issues
 */

import { GitHubClient } from './integrations/GitHubClient';
import { AgentRunner } from './AgentRunner';
import { TaskState } from './Orchestrator';
import { parseDecomposerOutput, validateDecomposition, formatSubIssueBody, ParsedDecomposition, SubTask } from './utils/decompositionUtils';
import { logger } from './utils/logger';

export class DecompositionManager {
  private githubClient: GitHubClient;
  private agentRunner: AgentRunner;

  constructor(githubClient: GitHubClient, agentRunner: AgentRunner) {
    this.githubClient = githubClient;
    this.agentRunner = agentRunner;
  }

  /**
   * Analyze if an issue should be decomposed
   * Checks intake output for complexity signals and calls decomposer agent if needed
   */
  async analyzeForDecomposition(taskState: TaskState, intakeOutput: string): Promise<boolean> {
    try {
      // Check if decomposition is enabled
      if (process.env.ENABLE_AUTO_DECOMPOSITION !== 'true') {
        logger.debug('Decomposition disabled via env var');
        return false;
      }

      // Check if this is already a sub-issue (prevent recursive decomposition)
      const issue = await this.githubClient.getIssue(taskState.issueNumber);
      const labels = issue.labels.map(l => l.name);
      if (labels.includes('sub-issue')) {
        logger.info('Issue is already a sub-issue, skipping decomposition', {
          issueNumber: taskState.issueNumber
        });
        return false;
      }

      // Look for complexity signals in intake output
      const hasComplexitySignals = this.detectComplexitySignals(intakeOutput);

      if (!hasComplexitySignals) {
        logger.debug('No complexity signals detected in intake output');
        return false;
      }

      // Call decomposer agent for detailed analysis
      logger.info('Complexity signals detected, running decomposer agent', {
        issueNumber: taskState.issueNumber
      });

      const decomposition = await this.runDecomposerAgent(taskState);

      // Validate decomposition
      const validation = validateDecomposition(decomposition);
      if (!validation.valid) {
        logger.warn('Decomposition validation failed', {
          issueNumber: taskState.issueNumber,
          errors: validation.errors
        });
        return false;
      }

      return decomposition.shouldDecompose;

    } catch (error: any) {
      logger.error('Error analyzing for decomposition', {
        issueNumber: taskState.issueNumber,
        error: error.message
      });
      return false; // Fail gracefully - don't decompose if unsure
    }
  }

  /**
   * Decompose an issue into sub-issues
   * Returns array of created sub-issue numbers
   */
  async decomposeIssue(taskState: TaskState): Promise<number[]> {
    try {
      logger.info('Starting issue decomposition', {
        issueNumber: taskState.issueNumber,
        issueTitle: taskState.issueTitle
      });

      // Run decomposer agent to get breakdown
      const decomposition = await this.runDecomposerAgent(taskState);

      // Validate again before creating
      const validation = validateDecomposition(decomposition);
      if (!validation.valid) {
        throw new Error(`Decomposition validation failed: ${validation.errors.join(', ')}`);
      }

      // Create sub-issues
      const subIssueNumbers = await this.createSubIssues(taskState, decomposition);

      // Update parent issue with task list
      await this.updateParentWithTaskList(taskState.issueNumber, subIssueNumbers, decomposition.subTasks);

      // Add comment to parent
      await this.githubClient.addComment(
        taskState.issueNumber,
        `🔀 **Issue Decomposed**\n\n` +
        `This issue has been broken down into ${subIssueNumbers.length} manageable sub-tasks. ` +
        `Each sub-issue will go through the full AI pipeline independently.\n\n` +
        `**Sub-issues:**\n` +
        subIssueNumbers.map((num, idx) => `- #${num} - ${decomposition.subTasks[idx].title}`).join('\n') +
        `\n\nThis parent issue will auto-close when all sub-tasks are completed.`
      );

      // Add decomposed label to parent
      await this.githubClient.addLabel(taskState.issueNumber, 'decomposed');

      logger.info('Issue decomposition complete', {
        parentIssue: taskState.issueNumber,
        subIssues: subIssueNumbers,
        count: subIssueNumbers.length
      });

      return subIssueNumbers;

    } catch (error: any) {
      logger.error('Failed to decompose issue', {
        issueNumber: taskState.issueNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if all sub-issues of a parent are completed
   */
  async checkParentCompletion(parentIssueNumber: number): Promise<boolean> {
    try {
      // Get all sub-issues via parent-{N} label
      const allIssues = await this.githubClient.listOpenIssues();
      const subIssues = allIssues.filter(issue => {
        const labels = issue.labels.map(l => l.name);
        return labels.includes(`parent-${parentIssueNumber}`);
      });

      if (subIssues.length === 0) {
        logger.warn('No sub-issues found for parent', { parentIssueNumber });
        return false;
      }

      // Check if ALL are completed
      const allCompleted = subIssues.every(issue => {
        const labels = issue.labels.map(l => l.name);
        return labels.includes('completed');
      });

      logger.debug('Checked parent completion', {
        parentIssue: parentIssueNumber,
        totalSubIssues: subIssues.length,
        allCompleted
      });

      return allCompleted;

    } catch (error: any) {
      logger.error('Error checking parent completion', {
        parentIssueNumber,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Close parent issue with aggregated summary from sub-issues
   */
  async closeParentWithSummary(parentIssueNumber: number): Promise<void> {
    try {
      logger.info('Closing parent issue with summary', { parentIssueNumber });

      // Get all sub-issues
      const allIssues = await this.githubClient.listOpenIssues();
      const subIssues = allIssues.filter(issue => {
        const labels = issue.labels.map(l => l.name);
        return labels.includes(`parent-${parentIssueNumber}`);
      });

      // Create summary
      const summary = `✅ **All Sub-Tasks Completed**\n\n` +
        `This issue was decomposed into ${subIssues.length} sub-tasks, all of which have been completed:\n\n` +
        subIssues.map(issue => `- ✅ #${issue.number} - ${issue.title}`).join('\n') +
        `\n\nAll work has been completed and merged. Closing this parent issue.`;

      // Close parent with summary
      await this.githubClient.closeIssue(parentIssueNumber, summary);

      logger.info('Parent issue closed successfully', { parentIssueNumber });

    } catch (error: any) {
      logger.error('Failed to close parent issue', {
        parentIssueNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Detect complexity signals in intake output
   * @private
   */
  private detectComplexitySignals(intakeOutput: string): boolean {
    const complexityKeywords = [
      'multiple tasks',
      'several tasks',
      'and also',
      'additionally',
      'furthermore',
      'multiple components',
      'complex issue',
      'various aspects',
      'different areas'
    ];

    const lowerOutput = intakeOutput.toLowerCase();

    // Check for keywords
    const hasKeywords = complexityKeywords.some(keyword => lowerOutput.includes(keyword));

    // Check for multiple bullet points in requirements
    const bulletPoints = (intakeOutput.match(/^[-*]\s+/gm) || []).length;
    const hasMultipleBullets = bulletPoints >= 4;

    // Check for "AND" patterns suggesting multiple tasks
    const hasMultipleAnds = (intakeOutput.match(/\band\b/gi) || []).length >= 3;

    return hasKeywords || hasMultipleBullets || hasMultipleAnds;
  }

  /**
   * Run decomposer agent to analyze and break down issue
   * @private
   */
  private async runDecomposerAgent(taskState: TaskState): Promise<ParsedDecomposition> {
    try {
      const context = {
        issueNumber: taskState.issueNumber,
        issueTitle: taskState.issueTitle,
        issueBody: taskState.issueBody,
        maxSubIssues: parseInt(process.env.MAX_SUB_ISSUES || '5', 10)
      };

      const result = await this.agentRunner.runAgent('decomposer', context);

      if (!result.success) {
        throw new Error('Decomposer agent failed');
      }

      // Parse output
      const parsed = parseDecomposerOutput(result.output);

      return parsed;

    } catch (error: any) {
      logger.error('Decomposer agent failed', {
        issueNumber: taskState.issueNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create sub-issues in GitHub
   * @private
   */
  private async createSubIssues(taskState: TaskState, decomposition: ParsedDecomposition): Promise<number[]> {
    const subIssueNumbers: number[] = [];
    const totalSubTasks = decomposition.subTasks.length;

    // Get parent issue to inherit labels
    const parentIssue = await this.githubClient.getIssue(taskState.issueNumber);
    const parentLabels = parentIssue.labels.map(l => l.name);

    // Filter out labels we don't want to inherit
    const labelsToInherit = parentLabels.filter(l =>
      !['in-progress', 'completed', 'awaiting-human-review', 'decomposed'].includes(l)
    );

    for (let i = 0; i < decomposition.subTasks.length; i++) {
      const subTask = decomposition.subTasks[i];

      try {
        // Format sub-issue title
        const subIssueTitle = `[Parent #${taskState.issueNumber}] [Sub ${i + 1}/${totalSubTasks}] ${subTask.title}`;

        // Format sub-issue body
        const subIssueBody = formatSubIssueBody(subTask, {
          issueNumber: taskState.issueNumber,
          issueTitle: taskState.issueTitle,
          issueBody: taskState.issueBody
        });

        // Prepare labels
        const subIssueLabels = [
          'sub-issue',
          `parent-${taskState.issueNumber}`,
          ...labelsToInherit
        ];

        // Create sub-issue
        const createdIssue = await this.githubClient.createIssue(
          subIssueTitle,
          subIssueBody,
          subIssueLabels
        );

        subIssueNumbers.push(createdIssue.number);

        logger.info('Sub-issue created', {
          parentIssue: taskState.issueNumber,
          subIssue: createdIssue.number,
          index: i + 1,
          total: totalSubTasks
        });

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error: any) {
        logger.error('Failed to create sub-issue', {
          parentIssue: taskState.issueNumber,
          index: i + 1,
          error: error.message
        });

        // If creation fails, we should rollback or handle gracefully
        // For now, we'll continue and let the next error handling layer deal with it
        throw new Error(`Failed to create sub-issue ${i + 1}/${totalSubTasks}: ${error.message}`);
      }
    }

    return subIssueNumbers;
  }

  /**
   * Update parent issue body with task list
   * @private
   */
  private async updateParentWithTaskList(
    parentIssueNumber: number,
    subIssueNumbers: number[],
    subTasks: SubTask[]
  ): Promise<void> {
    try {
      // Get current issue body
      const parentIssue = await this.githubClient.getIssue(parentIssueNumber);
      let currentBody = parentIssue.body || '';

      // Create task list
      const taskList = subIssueNumbers.map((num, idx) =>
        `- [ ] #${num} - ${subTasks[idx].title}`
      ).join('\n');

      // Append decomposition section
      const decompositionSection = `\n\n---\n\n## 🔀 Decomposition\n\n` +
        `This issue has been broken down into manageable sub-tasks:\n\n` +
        `${taskList}\n\n` +
        `Each sub-issue will go through the full AI pipeline independently. ` +
        `This parent issue will auto-close when all sub-tasks are completed.`;

      const updatedBody = currentBody + decompositionSection;

      // Update issue body
      await this.githubClient.updateIssueBody(parentIssueNumber, updatedBody);

      logger.info('Parent issue body updated with task list', {
        parentIssue: parentIssueNumber,
        subIssues: subIssueNumbers.length
      });

    } catch (error: any) {
      logger.error('Failed to update parent with task list', {
        parentIssue: parentIssueNumber,
        error: error.message
      });
      throw error;
    }
  }
}
