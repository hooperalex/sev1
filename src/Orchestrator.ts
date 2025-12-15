/**
 * Orchestrator: Runs multiple agents sequentially through the 12-stage pipeline
 *
 * Responsibilities:
 * - Load and save task state
 * - Run agents in sequence
 * - Pass outputs between stages
 * - Handle errors and retries
 * - Support resuming from any stage
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgentRunner, AgentContext, AgentResult } from './AgentRunner';
import { GitHubClient } from './integrations/GitHubClient';
import { GitClient } from './integrations/GitClient';
import { WikiClient } from './integrations/WikiClient';
import { VercelClient } from './integrations/VercelClient';
import { DiscordClient } from './integrations/DiscordClient';
import { DecompositionManager } from './DecompositionManager';
import { parseArchivistOutput, applySectionUpdate } from './utils/parseArchivistOutput';
import { logger } from './utils/logger';
import type { TodoState } from './tools/todoTools';

export interface IssueComment {
  user: string;
  body: string;
  createdAt: string;
}

export interface TaskState {
  taskId: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  issueUrl: string;
  issueComments: IssueComment[];
  issueLabels: string[];
  branchName: string;
  prNumber?: number;
  prUrl?: string;
  currentStage: number;
  stages: StageResult[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'awaiting_approval' | 'awaiting_closure_approval' | 'decomposed';
  createdAt: string;
  updatedAt: string;
  error?: string;
  isDecomposed?: boolean;
  subIssues?: number[];      // Child issue numbers
  parentIssue?: number;      // Parent issue number (for child tasks)
  stagingDeployment?: {
    deploymentId: string;
    deploymentUrl: string;
    status: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
    deployedAt: string;
    healthy: boolean;
  };
  productionDeployment?: {
    deploymentId: string;
    deploymentUrl: string;
    status: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
    deployedAt: string;
    healthy: boolean;
  };
  todoState?: TodoState;  // Shared todo list across agents
}

export interface StageResult {
  stageName: string;
  agentName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  tokensUsed?: number;
  durationMs?: number;
  output?: string;
  error?: string;
  artifactPath?: string;
}

export interface PipelineConfig {
  stages: {
    name: string;
    agentName: string;
    requiresApproval: boolean;
    artifactName: string;
  }[];
}

export class Orchestrator {
  private agentRunner: AgentRunner;
  private githubClient: GitHubClient;
  private gitClient: GitClient;
  private wikiClient: WikiClient | null;
  private vercelClient: VercelClient | null;
  private discordClient: DiscordClient | null;
  private decompositionManager: DecompositionManager;
  private tasksDir: string;
  private config: PipelineConfig;

  constructor(
    agentRunner: AgentRunner,
    githubClient: GitHubClient,
    gitClient: GitClient,
    wikiClient: WikiClient | null = null,
    vercelClient: VercelClient | null = null,
    discordClient: DiscordClient | null = null,
    tasksDir: string = './tasks'
  ) {
    this.agentRunner = agentRunner;
    this.githubClient = githubClient;
    this.gitClient = gitClient;
    this.wikiClient = wikiClient;
    this.vercelClient = vercelClient;
    this.discordClient = discordClient;
    this.decompositionManager = new DecompositionManager(githubClient, agentRunner);
    this.tasksDir = tasksDir;

    // Define the 14-stage pipeline (added Intake as Stage 0, Archivist as Stage 13)
    this.config = {
      stages: [
        { name: 'Stage 0: Intake & Validation', agentName: 'intake', requiresApproval: false, artifactName: 'intake-analysis.md' },
        { name: 'Stage 1: Triage', agentName: 'detective', requiresApproval: false, artifactName: 'triage-report.md' },
        { name: 'Stage 2: Root Cause Analysis', agentName: 'archaeologist', requiresApproval: false, artifactName: 'root-cause-analysis.md' },
        { name: 'Stage 3: Implementation', agentName: 'surgeon', requiresApproval: false, artifactName: 'implementation-plan.md' },
        { name: 'Stage 4: Code Review', agentName: 'critic', requiresApproval: false, artifactName: 'code-review.md' },
        { name: 'Stage 5: Testing', agentName: 'validator', requiresApproval: false, artifactName: 'test-results.md' },
        { name: 'Stage 6: QA', agentName: 'skeptic', requiresApproval: false, artifactName: 'qa-report.md' },
        { name: 'Stage 7: Staging Deployment', agentName: 'gatekeeper', requiresApproval: false, artifactName: 'staging-deployment.md' },
        { name: 'Stage 8: UAT', agentName: 'advocate', requiresApproval: false, artifactName: 'uat-results.md' },
        { name: 'Stage 9: Production Planning', agentName: 'planner', requiresApproval: false, artifactName: 'production-plan.md' },
        { name: 'Stage 10: Production Deployment', agentName: 'commander', requiresApproval: false, artifactName: 'deployment-log.md' },
        { name: 'Stage 11: Monitoring', agentName: 'guardian', requiresApproval: false, artifactName: 'monitoring-report.md' },
        { name: 'Stage 12: Documentation', agentName: 'historian', requiresApproval: false, artifactName: 'retrospective.md' },
        { name: 'Stage 13: Wiki Documentation', agentName: 'archivist', requiresApproval: false, artifactName: 'wiki-updates.md' }
      ]
    };

    // Ensure tasks directory exists
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true });
    }
  }

  /**
   * Start a new task from a GitHub issue
   */
  async startTask(issueNumber: number): Promise<TaskState> {
    logger.info('Starting new task', { issueNumber });

    // Fetch GitHub issue with comments
    const { issue, comments } = await this.githubClient.getIssueWithComments(issueNumber);

    // Convert comments to our format
    const issueComments: IssueComment[] = comments.map(c => ({
      user: c.user.login,
      body: c.body,
      createdAt: c.created_at
    }));

    // Extract labels
    const issueLabels = issue.labels.map(l => l.name);

    // Check if this is a re-run (has 'failed' label or previous comments from agents)
    const isRerun = issueLabels.includes('failed') ||
                    comments.some(c => c.user.login === 'github-actions[bot]');

    // Always start from stage 0 - agents will read previous comments for context
    // This ensures full pipeline execution and proper context passing between stages
    const resumeStage = 0;
    if (isRerun) {
      logger.info('Re-run detected - starting fresh but agents will read previous comments for context');
    }

    // Create branch name (sanitize issue title for branch name)
    const branchName = `fix/issue-${issueNumber}-${issue.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .substring(0, 50)
      .replace(/-+$/, '')}`;

    // Create task state
    const taskId = `ISSUE-${issueNumber}`;
    const taskState: TaskState = {
      taskId,
      issueNumber,
      issueTitle: issue.title,
      issueBody: issue.body || 'No description provided',
      issueUrl: issue.html_url,
      issueComments,
      issueLabels,
      branchName,
      currentStage: resumeStage,
      stages: this.config.stages.map((stage) => ({
        stageName: stage.name,
        agentName: stage.agentName,
        status: 'pending' as const
      })),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save initial state
    this.saveTaskState(taskState);

    // Step 1: Create Git branch for this issue (or use existing)
    logger.info('Creating Git branch', { branchName });
    try {
      await this.gitClient.createBranch(branchName);
      logger.info('Branch created successfully', { branchName });

      // Only comment on new runs, not re-runs
      if (!isRerun) {
        await this.githubClient.addComment(
          issueNumber,
          `🌿 **Branch Created**\n\n` +
          `Created branch \`${branchName}\` for this issue.\n\n` +
          `The AI team will now begin working on the fix...`
        );
      } else {
        await this.githubClient.addComment(
          issueNumber,
          `🔄 **Pipeline Resumed**\n\n` +
          `Resuming from Stage ${resumeStage + 1} on branch \`${branchName}\`.\n\n` +
          `Previous comments and context have been loaded.`
        );
      }
    } catch (error: any) {
      logger.error('Failed to create branch', { branchName, error: error.message });
      throw new Error(`Failed to create branch: ${error.message}`);
    }

    // Clean up labels from previous runs
    if (isRerun) {
      const labelsToRemove = ['failed', 'in-progress', ...issueLabels.filter(l => l.match(/^stage-\d+$/))];
      for (const label of labelsToRemove) {
        try {
          await this.githubClient.removeLabel(issueNumber, label);
        } catch (e) {
          // Ignore if label removal fails
        }
      }
    }

    logger.info('Task created', { taskId, issueTitle: issue.title, branchName, isRerun, resumeStage });

    // Send Discord notification for pipeline start
    if (this.discordClient) {
      await this.discordClient.notifyPipelineStart(issueNumber, issue.title, branchName);
    }

    return taskState;
  }

  /**
   * Run the next stage in the pipeline
   */
  async runNextStage(taskId: string): Promise<TaskState> {
    // Load task state
    const taskState = this.loadTaskState(taskId);

    if (taskState.status === 'completed') {
      logger.info('Task already completed', { taskId });
      return taskState;
    }

    if (taskState.status === 'awaiting_approval') {
      logger.info('Task awaiting approval', { taskId, stage: taskState.currentStage });
      return taskState;
    }

    const stageIndex = taskState.currentStage;
    const stageConfig = this.config.stages[stageIndex];
    const stageResult = taskState.stages[stageIndex];

    logger.info('Running stage', { taskId, stage: stageConfig.name, agent: stageConfig.agentName });

    // Update stage status
    stageResult.status = 'in_progress';
    stageResult.startedAt = new Date().toISOString();
    taskState.status = 'in_progress';
    this.saveTaskState(taskState);

    // Add GitHub comment: Agent starting work
    await this.notifyStageStart(taskState, stageIndex);

    try {
      // Build context for agent
      const context = this.buildAgentContext(taskState, stageIndex);

      // Run agent with tools enabled for Surgeon
      const result = await this.agentRunner.runAgent(
        stageConfig.agentName,
        context,
        { toolsEnabled: stageConfig.agentName === 'surgeon' }
      );

      if (!result.success) {
        throw new Error(result.error || 'Agent execution failed');
      }

      // Update stage result
      stageResult.status = 'completed';
      stageResult.completedAt = new Date().toISOString();
      stageResult.tokensUsed = result.tokensUsed;
      stageResult.durationMs = result.durationMs;
      stageResult.output = result.output;

      // Save todo state from agent (carries forward to next stages)
      if (result.todoState) {
        taskState.todoState = result.todoState;
        logger.info('Updated task todo state', {
          todoCount: result.todoState.todos.length
        });
      }

      // Save artifact
      const artifactPath = this.saveArtifact(taskId, stageConfig.artifactName, result.output);
      stageResult.artifactPath = artifactPath;

      // Step 2: After Surgeon completes, commit and push changes (only if implementation occurred)
      if (stageIndex === 3 && stageConfig.agentName === 'surgeon') {
        const surgeonOutput = result.output.toLowerCase();
        if (!surgeonOutput.includes('implementation halted') &&
            !surgeonOutput.includes('cannot implement')) {
          await this.commitAndPushChanges(taskState);
        }
      }

      // Add GitHub comment: Agent completed work
      await this.notifyStageComplete(taskState, stageIndex);

      // Check if we should halt pipeline based on agent consensus
      const shouldHalt = await this.checkForEarlyTermination(taskState, stageIndex);
      if (shouldHalt) {
        logger.info('Early termination requested, awaiting human approval', { taskId: taskState.taskId, stage: stageIndex });
        taskState.status = 'awaiting_closure_approval';
        taskState.updatedAt = new Date().toISOString();
        this.saveTaskState(taskState);

        await this.notifyEarlyTermination(taskState, stageIndex);
        return taskState;
      }

      // Step 3: After Surgeon completes, create PR (only if implementation occurred)
      if (stageIndex === 3 && stageConfig.agentName === 'surgeon' && !taskState.prNumber) {
        const surgeonOutput = result.output.toLowerCase();
        if (!surgeonOutput.includes('implementation halted') &&
            !surgeonOutput.includes('cannot implement')) {
          await this.createPullRequest(taskState);
        }
      }

      // Step 4: After Archivist completes, update wiki with documented insights
      if (stageIndex === 13 && stageConfig.agentName === 'archivist' && this.wikiClient) {
        await this.processArchivistUpdates(taskState, result.output);
      }

      // Step 5: After Gatekeeper completes, deploy to Vercel staging
      if (stageIndex === 7 && stageConfig.agentName === 'gatekeeper') {
        await this.deployStagingToVercel(taskState);
      }

      // Step 6: After Commander completes, deploy to Vercel production
      if (stageIndex === 10 && stageConfig.agentName === 'commander') {
        await this.deployProductionToVercel(taskState);
      }

      // Check if approval is required
      if (stageConfig.requiresApproval) {
        taskState.status = 'awaiting_approval';
        logger.info('Stage completed - awaiting approval', { taskId, stage: stageConfig.name });
      } else {
        // Move to next stage
        taskState.currentStage++;

        // Check if all stages are completed
        if (taskState.currentStage >= this.config.stages.length) {
          taskState.status = 'completed';
          await this.notifyPipelineComplete(taskState);
          logger.info('All stages completed', { taskId });
        } else {
          taskState.status = 'pending';
        }
      }

      taskState.updatedAt = new Date().toISOString();
      this.saveTaskState(taskState);

      logger.info('Stage completed', {
        taskId,
        stage: stageConfig.name,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs
      });

      return taskState;

    } catch (error: any) {
      logger.error('Stage failed', { taskId, stage: stageConfig.name, error: error.message });

      // Attempt self-healing
      const healed = await this.attemptSelfHealing(taskState, stageIndex, error);

      if (healed) {
        logger.info('Self-healing successful, retrying stage', { taskId, stage: stageConfig.name });
        // Retry the stage after healing
        return this.runNextStage(taskId);
      }

      // Self-healing failed, mark as failed
      stageResult.status = 'failed';
      stageResult.error = error.message;
      taskState.status = 'failed';
      taskState.error = error.message;
      taskState.updatedAt = new Date().toISOString();

      this.saveTaskState(taskState);

      // Add GitHub comment: Agent failed
      await this.notifyStageFailed(taskState, stageIndex, error.message);

      throw error;
    }
  }

  /**
   * Approve the current stage and move to next
   */
  async approveStage(taskId: string): Promise<TaskState> {
    const taskState = this.loadTaskState(taskId);

    if (taskState.status !== 'awaiting_approval') {
      throw new Error(`Task ${taskId} is not awaiting approval (status: ${taskState.status})`);
    }

    logger.info('Stage approved', { taskId, stage: taskState.currentStage });

    // Move to next stage
    taskState.currentStage++;

    // Check if all stages are completed
    if (taskState.currentStage >= this.config.stages.length) {
      taskState.status = 'completed';
      logger.info('All stages completed', { taskId });
    } else {
      taskState.status = 'pending';
    }

    taskState.updatedAt = new Date().toISOString();
    this.saveTaskState(taskState);

    return taskState;
  }

  /**
   * Run all stages until completion or approval needed
   */
  async runPipeline(taskId: string): Promise<TaskState> {
    let taskState = this.loadTaskState(taskId);

    while (taskState.status === 'pending' || taskState.status === 'in_progress') {
      taskState = await this.runNextStage(taskId);

      if (taskState.status === 'awaiting_approval') {
        logger.info('Pipeline paused - awaiting approval', { taskId });
        break;
      }

      if (taskState.status === 'failed') {
        logger.error('Pipeline failed', { taskId, error: taskState.error });
        break;
      }
    }

    return taskState;
  }

  /**
   * Build agent context from task state and previous outputs
   */
  private buildAgentContext(taskState: TaskState, stageIndex: number): AgentContext {
    // Format comments as readable text for agents
    let formattedComments = '';
    if (taskState.issueComments && taskState.issueComments.length > 0) {
      formattedComments = taskState.issueComments.map(c =>
        `[${c.createdAt}] @${c.user}:\n${c.body}`
      ).join('\n\n---\n\n');
    }

    const context: AgentContext = {
      issueNumber: taskState.issueNumber,
      issueTitle: taskState.issueTitle,
      issueBody: taskState.issueBody,
      issueUrl: taskState.issueUrl,
      issueComments: formattedComments,
      issueLabels: taskState.issueLabels?.join(', ') || '',
      taskId: taskState.taskId,
      stageIndex: stageIndex,
      todoState: taskState.todoState  // Pass todo state to agent
    };

    // Add outputs from previous stages (including skipped stages that have output)
    for (let i = 0; i < stageIndex; i++) {
      const previousStage = taskState.stages[i];
      if ((previousStage.status === 'completed' || previousStage.status === 'skipped') && previousStage.output) {
        const key = `${previousStage.agentName}Output`;
        (context as any)[key] = previousStage.output;
      }
    }

    // Add production deployment info if available
    if (taskState.productionDeployment) {
      (context as any).productionDeployment = taskState.productionDeployment;
    }

    return context;
  }

  /**
   * Run production health checks and return formatted report
   */
  async runProductionHealthChecks(): Promise<string> {
    if (!this.vercelClient) {
      return 'Vercel not configured - unable to run production health checks';
    }

    try {
      const report = await this.vercelClient.runProductionHealthChecks({
        endpoints: [
          { path: '/' },
          { path: '/api/health', expectedStatus: 200 }
        ],
        responseTimeThreshold: 3000
      });

      // Format the report for the agent
      let formattedReport = `## Production Health Check Results\n\n`;
      formattedReport += `**Overall Status:** ${report.overall}\n`;
      formattedReport += `**Timestamp:** ${report.timestamp}\n`;
      formattedReport += `**Deployment ID:** ${report.deploymentId}\n`;
      formattedReport += `**Deployment URL:** ${report.deploymentUrl}\n\n`;

      formattedReport += `### Checks Summary\n`;
      formattedReport += `- Total: ${report.summary.totalChecks}\n`;
      formattedReport += `- Passed: ${report.summary.passed}\n`;
      formattedReport += `- Failed: ${report.summary.failed}\n`;
      formattedReport += `- Warnings: ${report.summary.warnings}\n\n`;

      formattedReport += `### DNS Check\n`;
      formattedReport += `- Resolved: ${report.checks.dns.resolved ? 'Yes ✅' : 'No ❌'}\n`;
      if (report.checks.dns.error) {
        formattedReport += `- Error: ${report.checks.dns.error}\n`;
      }
      formattedReport += `\n`;

      formattedReport += `### SSL Check\n`;
      formattedReport += `- Valid: ${report.checks.ssl.valid ? 'Yes ✅' : 'No ❌'}\n`;
      if (report.checks.ssl.error) {
        formattedReport += `- Error: ${report.checks.ssl.error}\n`;
      }
      formattedReport += `\n`;

      formattedReport += `### Endpoint Checks\n`;
      for (const ep of report.checks.endpoints) {
        formattedReport += `- **${ep.endpoint}**\n`;
        formattedReport += `  - Status: ${ep.healthy ? 'Healthy ✅' : 'Unhealthy ❌'}\n`;
        formattedReport += `  - HTTP Status: ${ep.statusCode}\n`;
        formattedReport += `  - Response Time: ${ep.responseTime}ms\n`;
        if (ep.error) {
          formattedReport += `  - Error: ${ep.error}\n`;
        }
      }
      formattedReport += `\n`;

      formattedReport += `### Response Time Metrics\n`;
      formattedReport += `- Average: ${report.checks.responseTime.avg}ms\n`;
      formattedReport += `- Maximum: ${report.checks.responseTime.max}ms\n`;
      formattedReport += `- Acceptable: ${report.checks.responseTime.acceptable ? 'Yes ✅' : 'No ⚠️'}\n\n`;

      if (report.recommendations.length > 0) {
        formattedReport += `### Recommendations\n`;
        for (const rec of report.recommendations) {
          formattedReport += `- ${rec}\n`;
        }
      }

      return formattedReport;
    } catch (error: any) {
      logger.error('Failed to run production health checks', { error: error.message });
      return `Production health check failed: ${error.message}`;
    }
  }

  /**
   * Get quick production status
   */
  async getProductionStatus(): Promise<{ status: string; url: string | null; details: string }> {
    if (!this.vercelClient) {
      return { status: 'UNKNOWN', url: null, details: 'Vercel not configured' };
    }

    try {
      const status = await this.vercelClient.getProductionStatus();
      return {
        status: status.status,
        url: status.url,
        details: `Last deployed: ${status.lastDeployed || 'unknown'}, Response time: ${status.responseTime || 'N/A'}ms`
      };
    } catch (error: any) {
      return { status: 'ERROR', url: null, details: error.message };
    }
  }

  /**
   * Save artifact to task directory
   */
  private saveArtifact(taskId: string, filename: string, content: string): string {
    const taskDir = path.join(this.tasksDir, taskId);

    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }

    const artifactPath = path.join(taskDir, filename);
    fs.writeFileSync(artifactPath, content, 'utf-8');

    return artifactPath;
  }

  /**
   * Save task state to JSON file
   */
  private saveTaskState(taskState: TaskState): void {
    const taskDir = path.join(this.tasksDir, taskState.taskId);

    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }

    const statePath = path.join(taskDir, 'state.json');
    fs.writeFileSync(statePath, JSON.stringify(taskState, null, 2), 'utf-8');
  }

  /**
   * Load task state from JSON file
   */
  private loadTaskState(taskId: string): TaskState {
    const statePath = path.join(this.tasksDir, taskId, 'state.json');

    if (!fs.existsSync(statePath)) {
      throw new Error(`Task state not found: ${taskId}`);
    }

    const content = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Get task state
   */
  getTaskState(taskId: string): TaskState {
    return this.loadTaskState(taskId);
  }

  /**
   * List all tasks
   */
  listTasks(): string[] {
    if (!fs.existsSync(this.tasksDir)) {
      return [];
    }

    return fs.readdirSync(this.tasksDir)
      .filter(name => fs.existsSync(path.join(this.tasksDir, name, 'state.json')));
  }

  /**
   * Notify GitHub when a stage starts
   */
  private async notifyStageStart(taskState: TaskState, stageIndex: number): Promise<void> {
    try {
      const stageConfig = this.config.stages[stageIndex];
      const agentEmoji = this.getAgentEmoji(stageConfig.agentName);
      const previousLabel = stageIndex > 0 ? `stage-${stageIndex}` : null;
      const currentLabel = `stage-${stageIndex + 1}`;

      // Remove previous stage label
      if (previousLabel) {
        await this.githubClient.removeLabel(taskState.issueNumber, previousLabel);
      }

      // Add current stage label
      await this.githubClient.addLabel(taskState.issueNumber, currentLabel);
      await this.githubClient.addLabel(taskState.issueNumber, 'in-progress');

      // Add comment
      const comment = `${agentEmoji} **${stageConfig.agentName.toUpperCase()}** is now working on this issue\n\n` +
        `**Stage ${stageIndex + 1}/12:** ${stageConfig.name}\n` +
        `**Started:** ${new Date().toLocaleString()}\n\n` +
        `_The AI team is analyzing and processing this issue..._`;

      await this.githubClient.addComment(taskState.issueNumber, comment);

      logger.info('GitHub notification sent', { stage: stageConfig.name, type: 'start' });

    } catch (error: any) {
      logger.warn('Failed to send GitHub notification', { error: error.message });
      // Don't fail the pipeline if GitHub notification fails
    }
  }

  /**
   * Notify GitHub when a stage completes
   */
  private async notifyStageComplete(taskState: TaskState, stageIndex: number): Promise<void> {
    try {
      const stageConfig = this.config.stages[stageIndex];
      const stageResult = taskState.stages[stageIndex];
      const agentEmoji = this.getAgentEmoji(stageConfig.agentName);

      // Extract summary from output (first 500 chars)
      const summary = this.extractSummary(stageResult.output || '');

      // Build comment
      let comment = `✅ **${stageConfig.agentName.toUpperCase()}** has completed their analysis\n\n` +
        `**Stage ${stageIndex + 1}/12:** ${stageConfig.name}\n` +
        `**Duration:** ${((stageResult.durationMs || 0) / 1000).toFixed(1)}s\n` +
        `**Tokens:** ${(stageResult.tokensUsed || 0).toLocaleString()}\n\n`;

      if (summary) {
        comment += `### Summary\n${summary}\n\n`;
      }

      if (stageResult.artifactPath) {
        comment += `📄 **Artifact:** \`${stageResult.artifactPath.split('/').pop()}\`\n\n`;
      }

      // Add next steps
      if (stageIndex + 1 < this.config.stages.length) {
        const nextStage = this.config.stages[stageIndex + 1];
        comment += `⏭️ **Next:** ${nextStage.name} (${nextStage.agentName})`;
      } else {
        comment += `🎉 **All stages completed!**`;
      }

      await this.githubClient.addComment(taskState.issueNumber, comment);

      logger.info('GitHub notification sent', { stage: stageConfig.name, type: 'complete' });

      // Send Discord notification for stage completion
      if (this.discordClient) {
        await this.discordClient.notifyStageComplete(
          taskState.issueNumber,
          stageConfig.name,
          stageIndex,
          this.config.stages.length,
          summary
        );
      }

    } catch (error: any) {
      logger.warn('Failed to send GitHub notification', { error: error.message });
    }
  }

  /**
   * Notify GitHub when a stage fails
   */
  private async notifyStageFailed(taskState: TaskState, stageIndex: number, error: string): Promise<void> {
    try {
      const stageConfig = this.config.stages[stageIndex];
      const agentEmoji = this.getAgentEmoji(stageConfig.agentName);

      await this.githubClient.addLabel(taskState.issueNumber, 'failed');
      await this.githubClient.removeLabel(taskState.issueNumber, 'in-progress');

      const comment = `❌ **${stageConfig.agentName.toUpperCase()}** encountered an error\n\n` +
        `**Stage ${stageIndex + 1}/12:** ${stageConfig.name}\n` +
        `**Error:** ${error}\n\n` +
        `_The pipeline has been halted. Please review the error and retry._`;

      await this.githubClient.addComment(taskState.issueNumber, comment);

      logger.info('GitHub notification sent', { stage: stageConfig.name, type: 'failed' });

      // Send Discord notification for stage failure
      if (this.discordClient) {
        await this.discordClient.notifyPipelineFailed(
          taskState.issueNumber,
          taskState.issueTitle,
          stageConfig.name,
          error
        );
      }

    } catch (err: any) {
      logger.warn('Failed to send GitHub notification', { error: err.message });
    }
  }

  /**
   * Notify GitHub and Discord when pipeline completes
   */
  private async notifyPipelineComplete(taskState: TaskState): Promise<void> {
    try {
      // Calculate stats
      const completedStages = taskState.stages.filter(s => s.status === 'completed');
      const totalTokens = completedStages.reduce((sum, s) => sum + (s.tokensUsed || 0), 0);
      const totalDuration = completedStages.reduce((sum, s) => sum + (s.durationMs || 0), 0);
      const estimatedCost = (totalTokens / 1000000) * 3.0;

      // Remove in-progress labels
      await this.githubClient.removeLabel(taskState.issueNumber, 'in-progress');
      await this.githubClient.removeLabel(taskState.issueNumber, `stage-${taskState.stages.length}`);
      await this.githubClient.addLabel(taskState.issueNumber, 'completed');

      const comment = `🎉 **PIPELINE COMPLETED SUCCESSFULLY!**\n\n` +
        `All 12 stages have been executed by the AI team.\n\n` +
        `### 📊 Statistics\n` +
        `- **Stages Completed:** ${completedStages.length}/12\n` +
        `- **Total Duration:** ${(totalDuration / 1000).toFixed(1)}s (${(totalDuration / 60000).toFixed(1)}m)\n` +
        `- **Total Tokens:** ${totalTokens.toLocaleString()}\n` +
        `- **Estimated Cost:** $${estimatedCost.toFixed(4)}\n\n` +
        `### 📁 Artifacts\n` +
        `All artifacts have been saved to \`./tasks/${taskState.taskId}/\`\n\n` +
        `### 🔍 Review\n` +
        `Please review the retrospective document for a complete summary of the work performed.`;

      await this.githubClient.addComment(taskState.issueNumber, comment);

      // Discord notification for pipeline completion
      if (this.discordClient) {
        await this.discordClient.notifyPipelineComplete(
          taskState.issueNumber,
          taskState.issueTitle,
          taskState.prUrl,
          taskState.productionDeployment?.deploymentUrl
        );
      }

      logger.info('GitHub notification sent', { type: 'pipeline-complete' });

    } catch (error: any) {
      logger.warn('Failed to send GitHub notification', { error: error.message });
    }
  }

  /**
   * Get emoji for agent
   */
  private getAgentEmoji(agentName: string): string {
    const emojiMap: { [key: string]: string } = {
      intake: '📥',
      detective: '🔍',
      archaeologist: '⛏️',
      surgeon: '🔧',
      critic: '👁️',
      validator: '✅',
      skeptic: '🤔',
      gatekeeper: '🚪',
      advocate: '👤',
      planner: '📋',
      commander: '🚀',
      guardian: '🛡️',
      historian: '📜'
    };
    return emojiMap[agentName] || '🤖';
  }

  /**
   * Extract summary from agent output
   */
  private extractSummary(output: string): string {
    // Look for "Executive Summary" or "Summary" section
    const summaryMatch = output.match(/##\s*(Executive\s+)?Summary\s*\n+([\s\S]{0,500}?)(?=\n##|\n\n##|$)/i);

    if (summaryMatch && summaryMatch[2]) {
      return summaryMatch[2].trim();
    }

    // Otherwise, return first 300 chars
    const lines = output.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    const preview = lines.slice(0, 5).join('\n');
    return preview.length > 300 ? preview.substring(0, 300) + '...' : preview;
  }

  /**
   * Check if pipeline should halt based on agent consensus
   * Halts on REDIRECT/INVALID intake decisions, continues otherwise
   */
  private async checkForEarlyTermination(taskState: TaskState, currentStageIndex: number): Promise<boolean> {
    if (currentStageIndex === 0) {
      const intakeOutput = taskState.stages[0].output || '';
      const intakeDecision = this.extractDecision(intakeOutput);

      logger.info('Intake decision', {
        taskId: taskState.taskId,
        decision: intakeDecision
      });

      // Halt pipeline on REDIRECT or INVALID decisions
      if (intakeDecision === 'REDIRECT' || intakeDecision === 'INVALID') {
        logger.info('Halting pipeline due to intake decision', {
          taskId: taskState.taskId,
          decision: intakeDecision
        });
        return true;
      }

      // Check for issue decomposition (if enabled)
      if (process.env.ENABLE_AUTO_DECOMPOSITION === 'true') {
        try {
          const shouldDecompose = await this.decompositionManager.analyzeForDecomposition(
            taskState,
            intakeOutput
          );

          if (shouldDecompose) {
            logger.info('Issue complexity detected, initiating decomposition', {
              taskId: taskState.taskId,
              issueNumber: taskState.issueNumber
            });

            // Run decomposition
            const subIssues = await this.decompositionManager.decomposeIssue(taskState);

            // Mark parent as decomposed
            taskState.isDecomposed = true;
            taskState.subIssues = subIssues;
            taskState.status = 'decomposed';
            this.saveTaskState(taskState);

            logger.info('Issue decomposition complete', {
              taskId: taskState.taskId,
              parentIssue: taskState.issueNumber,
              subIssues: subIssues,
              count: subIssues.length
            });

            return false;
          }
        } catch (error: any) {
          logger.error('Decomposition failed, continuing with parent issue', {
            taskId: taskState.taskId,
            error: error.message
          });
        }
      }
    }

    // Never halt - always return false
    return false;
  }

  /**
   * Attempt to self-heal a failed stage
   * Returns true if fixed and stage should be retried
   */
  private async attemptSelfHealing(
    taskState: TaskState,
    stageIndex: number,
    error: any
  ): Promise<boolean> {
    // Track retry attempts to prevent infinite loops
    const retryKey = `${taskState.taskId}-stage-${stageIndex}`;
    const retryCount = (taskState as any)._retryCount?.[retryKey] || 0;

    if (retryCount >= 3) {
      logger.warn('Max retry attempts reached, giving up on self-healing', {
        taskId: taskState.taskId,
        stage: stageIndex,
        retryCount
      });
      return false;
    }

    // Increment retry count
    (taskState as any)._retryCount = (taskState as any)._retryCount || {};
    (taskState as any)._retryCount[retryKey] = retryCount + 1;

    const errorMessage = error.message || String(error);
    const stageConfig = this.config.stages[stageIndex];

    logger.info('Attempting self-healing', {
      taskId: taskState.taskId,
      stage: stageConfig.name,
      error: errorMessage,
      retryAttempt: retryCount + 1
    });

    // Notify GitHub about self-healing attempt
    await this.githubClient.addComment(
      taskState.issueNumber,
      `🔧 **Self-Healing Attempt ${retryCount + 1}/3**\n\n` +
      `Stage **${stageConfig.name}** failed with error:\n\`\`\`\n${errorMessage}\n\`\`\`\n\n` +
      `Analyzing error and attempting automatic fix...`
    );

    // Discord notification for self-healing
    if (this.discordClient) {
      await this.discordClient.notifySelfHealing(
        taskState.issueNumber,
        stageConfig.name,
        retryCount + 1,
        3,
        errorMessage
      );
    }

    try {
      // Call the Debugger agent to analyze and fix
      const debugContext = {
        issueNumber: taskState.issueNumber,
        issueTitle: taskState.issueTitle,
        issueBody: taskState.issueBody,
        issueUrl: taskState.issueUrl,
        failedStage: stageConfig.name,
        failedAgentName: stageConfig.agentName,
        errorMessage: errorMessage,
        errorStack: error.stack || '',
        previousStageOutputs: this.buildAgentContext(taskState, stageIndex)
      };

      const result = await this.agentRunner.runAgent(
        'debugger',
        debugContext,
        { toolsEnabled: true }
      );

      if (!result.success) {
        logger.warn('Debugger agent failed', { error: result.error });
        await this.githubClient.addComment(
          taskState.issueNumber,
          `❌ **Self-Healing Failed**\n\nDebugger could not resolve the issue: ${result.error}`
        );
        return false;
      }

      // Check if the debugger fixed the issue
      const output = result.output.toLowerCase();
      const wasFixed = output.includes('fixed_automatically') ||
                       output.includes('status:** fixed') ||
                       output.includes('fix applied');

      if (wasFixed) {
        logger.info('Self-healing successful', { taskId: taskState.taskId, stage: stageConfig.name });
        await this.githubClient.addComment(
          taskState.issueNumber,
          `✅ **Self-Healing Successful**\n\n${this.extractFixSummary(result.output)}\n\nRetrying stage...`
        );
        return true;
      } else {
        logger.warn('Debugger could not fix the issue', { output: result.output.substring(0, 500) });
        await this.githubClient.addComment(
          taskState.issueNumber,
          `⚠️ **Self-Healing Incomplete**\n\n` +
          `The debugger analyzed the error but could not automatically fix it.\n\n` +
          `**Analysis:**\n${this.extractFixSummary(result.output)}\n\n` +
          `Human intervention may be required.`
        );
        return false;
      }

    } catch (healingError: any) {
      logger.error('Self-healing process failed', { error: healingError.message });
      await this.githubClient.addComment(
        taskState.issueNumber,
        `❌ **Self-Healing Error**\n\nThe self-healing process itself failed: ${healingError.message}`
      );
      return false;
    }
  }

  /**
   * Extract a summary from the debugger output
   */
  private extractFixSummary(output: string): string {
    // Try to extract the fix summary section
    const summaryMatch = output.match(/## Fix Applied[\s\S]*?(?=##|$)/i) ||
                        output.match(/## Root Cause[\s\S]*?(?=##|$)/i) ||
                        output.match(/## Error Summary[\s\S]*?(?=##|$)/i);

    if (summaryMatch) {
      return summaryMatch[0].trim().substring(0, 1000);
    }

    // Fallback to first 500 chars
    return output.substring(0, 500) + (output.length > 500 ? '...' : '');
  }

  /**
   * Auto-close issue without human approval
   */
  private async autoCloseIssue(taskState: TaskState, reason: string): Promise<void> {
    try {
      const comment = `🤖 **Automatically Closed by AI Pipeline**\n\n` +
        `**Reason:** ${reason}\n\n` +
        `This issue was automatically closed after analysis by the AI team. The agents determined:\n\n`;

      // Add agent summaries
      let summaries = '';
      for (let i = 0; i <= taskState.currentStage; i++) {
        const stage = taskState.stages[i];
        if (stage.status === 'completed' && stage.output) {
          const summary = this.extractSummary(stage.output);
          summaries += `**${stage.agentName}:** ${summary.substring(0, 150)}...\n\n`;
        }
      }

      const fullComment = comment + summaries +
        `\nIf you believe this is incorrect, please provide more details and reopen the issue.`;

      await this.githubClient.closeIssue(taskState.issueNumber, fullComment);
      await this.githubClient.addLabel(taskState.issueNumber, 'auto-closed');
      await this.githubClient.removeLabel(taskState.issueNumber, 'in-progress');

      logger.info('Issue auto-closed', { taskId: taskState.taskId, reason });
    } catch (error: any) {
      logger.error('Failed to auto-close issue', { taskId: taskState.taskId, error: error.message });
    }
  }

  /**
   * Request more information from issue reporter
   */
  private async requestMoreInformation(taskState: TaskState): Promise<void> {
    try {
      const intakeOutput = taskState.stages[0].output || '';

      // Extract what's missing from intake analysis
      const missingMatch = intakeOutput.match(/\*\*What's Missing:\*\*\s*\n([\s\S]*?)(?=\n##|\n\*\*|$)/i);
      const missing = missingMatch ? missingMatch[1].trim() : 'Additional details';

      const comment = `ℹ️ **More Information Needed**\n\n` +
        `Thank you for your submission! To help us address this issue, please provide:\n\n` +
        `${missing}\n\n` +
        `**For bugs, please include:**\n` +
        `- Steps to reproduce the issue\n` +
        `- Expected behavior vs actual behavior\n` +
        `- Environment details (browser, OS, etc.)\n\n` +
        `**For feature requests, please include:**\n` +
        `- What problem this would solve\n` +
        `- How you envision it working\n` +
        `- Any acceptance criteria\n\n` +
        `Once you've added this information, the AI team will automatically re-process this issue.`;

      await this.githubClient.addComment(taskState.issueNumber, comment);
      await this.githubClient.addLabel(taskState.issueNumber, 'needs-more-info');
      await this.githubClient.removeLabel(taskState.issueNumber, 'in-progress');

      logger.info('Requested more information', { taskId: taskState.taskId });
    } catch (error: any) {
      logger.error('Failed to request more info', { taskId: taskState.taskId, error: error.message });
    }
  }

  /**
   * Extract requirements quality score from Intake output
   */
  private extractRequirementsQuality(output: string): number | null {
    const match = output.match(/##\s*Requirements Quality:\s*(\d+)%/i);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Extract decision from Intake output
   */
  private extractDecision(output: string): string | null {
    const match = output.match(/##\s*Decision:\s*(\w+)/i);
    return match ? match[1].toUpperCase() : null;
  }

  /**
   * Notify about early termination and request human approval (GitHub + Discord)
   */
  private async notifyEarlyTermination(taskState: TaskState, stageIndex: number): Promise<void> {
    try {
      const stageConfig = this.config.stages[stageIndex];

      let reason = '';
      if (stageIndex === 0) {
        const intakeDecision = this.extractDecision(taskState.stages[0].output || '');
        reason = `Intake Agent recommends: ${intakeDecision}`;
      } else if (stageIndex === 1) {
        reason = 'Detective identified this as NOT A BUG';
      } else if (stageIndex === 2) {
        reason = 'Multiple agents recommend closing this issue';
      }

      const comment = `⚠️ **EARLY TERMINATION REQUESTED**\n\n` +
        `The AI pipeline has detected this issue should not proceed to full implementation.\n\n` +
        `**Stage:** ${stageConfig.name}\n` +
        `**Reason:** ${reason}\n\n` +
        `### Agent Recommendations:\n\n`;

      // Add each agent's recommendation
      let recommendations = '';
      for (let i = 0; i <= stageIndex; i++) {
        const stage = taskState.stages[i];
        if (stage.status === 'completed' && stage.output) {
          const summary = this.extractSummary(stage.output);
          recommendations += `**${stage.agentName}:** ${summary.substring(0, 200)}...\n\n`;
        }
      }

      const fullComment = comment + recommendations +
        `\n### Human Approval Required\n\n` +
        `Please review the agent analyses and decide:\n\n` +
        `1. **Approve Closure:** Close this issue as recommended\n` +
        `   - Command: \`npm run approve-closure -- ${taskState.taskId}\`\n\n` +
        `2. **Override & Continue:** Force the pipeline to continue\n` +
        `   - Command: \`npm run override -- ${taskState.taskId}\`\n` +
        `   - Use with caution - agents identified valid concerns\n\n` +
        `**Recommendation:** Review the artifacts in \`./tasks/${taskState.taskId}/\` before deciding.`;

      await this.githubClient.addComment(taskState.issueNumber, fullComment);
      await this.githubClient.addLabel(taskState.issueNumber, 'awaiting-human-review');

      // Discord notification for approval needed
      if (this.discordClient) {
        await this.discordClient.notifyAwaitingApproval(
          taskState.issueNumber,
          taskState.issueTitle,
          taskState.prUrl || taskState.issueUrl,
          'closure'
        );
      }

      logger.info('Early termination notification sent', { taskId: taskState.taskId });

    } catch (error: any) {
      logger.warn('Failed to send early termination notification', { error: error.message });
    }
  }

  /**
   * Step 2: Commit and push changes after implementation
   */
  private async commitAndPushChanges(taskState: TaskState): Promise<void> {
    try {
      logger.info('Committing and pushing changes', { taskId: taskState.taskId, branch: taskState.branchName });

      // Check if there are changes to commit
      const hasChanges = await this.gitClient.hasUncommittedChanges();

      if (!hasChanges) {
        logger.info('No changes to commit', { taskId: taskState.taskId });
        return;
      }

      // Commit message
      const commitMessage = `fix: ${taskState.issueTitle}\n\nImplemented fix for issue #${taskState.issueNumber}\n\nThis commit includes the changes made by the Surgeon agent to address the reported issue.`;

      // Commit changes
      const commitHash = await this.gitClient.commit(commitMessage);
      logger.info('Changes committed', { taskId: taskState.taskId, commit: commitHash });

      // Push to remote
      await this.gitClient.push(taskState.branchName);
      logger.info('Changes pushed to remote', { taskId: taskState.taskId, branch: taskState.branchName });

      // Notify on GitHub
      await this.githubClient.addComment(
        taskState.issueNumber,
        `📝 **Changes Committed**\n\n` +
        `Committed and pushed changes to branch \`${taskState.branchName}\`\n\n` +
        `Commit: \`${commitHash.substring(0, 7)}\`\n\n` +
        `The fix has been implemented and is ready for review.`
      );

    } catch (error: any) {
      logger.error('Failed to commit and push changes', { taskId: taskState.taskId, error: error.message });
      throw new Error(`Failed to commit and push changes: ${error.message}`);
    }
  }

  /**
   * Step 3: Create pull request after implementation
   */
  private async createPullRequest(taskState: TaskState): Promise<void> {
    try {
      logger.info('Creating pull request', { taskId: taskState.taskId, branch: taskState.branchName });

      // Build PR description
      const prBody = `## Summary\n\n` +
        `This PR fixes the issue: ${taskState.issueTitle}\n\n` +
        `## Changes\n\n` +
        `The AI team has analyzed and implemented a fix for this issue through a 12-stage pipeline:\n\n` +
        `1. ✅ **Detective** - Triaged the issue\n` +
        `2. ✅ **Archaeologist** - Performed root cause analysis\n` +
        `3. ✅ **Surgeon** - Implemented the fix\n` +
        `4. 🔄 **Critic** - Code review (in progress)\n` +
        `5. ⏳ **Validator** - Testing\n` +
        `6. ⏳ **Skeptic** - QA\n` +
        `7. ⏳ **Gatekeeper** - Staging deployment\n` +
        `8. ⏳ **Advocate** - UAT\n` +
        `9. ⏳ **Planner** - Production planning\n` +
        `10. ⏳ **Commander** - Production deployment\n` +
        `11. ⏳ **Guardian** - Monitoring\n` +
        `12. ⏳ **Historian** - Documentation\n\n` +
        `## Review\n\n` +
        `Please review the changes. The AI team will continue through the remaining pipeline stages.`;

      // Create PR
      const pr = await this.githubClient.createPullRequest(
        `Fix: ${taskState.issueTitle}`,
        prBody,
        taskState.branchName,
        'main',
        taskState.issueNumber
      );

      // Update task state
      taskState.prNumber = pr.number;
      taskState.prUrl = pr.html_url;
      this.saveTaskState(taskState);

      logger.info('Pull request created', { taskId: taskState.taskId, prNumber: pr.number, prUrl: pr.html_url });

      // Link PR to issue
      await this.githubClient.linkPullRequestToIssue(taskState.issueNumber, pr.number, pr.html_url);

    } catch (error: any) {
      // If PR already exists, just log and continue (don't fail the stage)
      if (error.message && error.message.includes('pull request already exists')) {
        logger.info('Pull request already exists, skipping creation', { taskId: taskState.taskId, branch: taskState.branchName });
        return;
      }

      logger.error('Failed to create pull request', { taskId: taskState.taskId, error: error.message });
      throw new Error(`Failed to create pull request: ${error.message}`);
    }
  }

  /**
   * Step 4: Process Archivist updates and commit to wiki
   */
  private async processArchivistUpdates(taskState: TaskState, archivistOutput: string): Promise<void> {
    try {
      logger.info('Processing Archivist wiki updates', { taskId: taskState.taskId });

      // Parse Archivist output
      const parsed = parseArchivistOutput(archivistOutput);

      if (parsed.updates.length === 0) {
        logger.warn('No wiki updates found in Archivist output', { taskId: taskState.taskId });
        return;
      }

      logger.info(`Applying ${parsed.updates.length} wiki updates`, { taskId: taskState.taskId });

      // Apply each update
      for (const update of parsed.updates) {
        try {
          if (update.action === 'append') {
            // Check if section-based append
            if (update.section) {
              const existingContent = await this.wikiClient!.getPage(update.page);
              const updatedContent = applySectionUpdate(existingContent, update.section, update.content, 'append');
              await this.wikiClient!.updatePage(update.page, updatedContent);
              logger.info('Updated wiki page with section append', {
                page: update.page,
                section: update.section
              });
            } else {
              // Simple append to end
              await this.wikiClient!.appendToPage(update.page, update.content);
              logger.info('Appended to wiki page', { page: update.page });
            }
          } else if (update.action === 'update') {
            await this.wikiClient!.updatePage(update.page, update.content);
            logger.info('Updated wiki page', { page: update.page });
          } else if (update.action === 'create') {
            await this.wikiClient!.createPage(update.page, update.content);
            logger.info('Created wiki page', { page: update.page });
          }
        } catch (error: any) {
          logger.error(`Failed to apply wiki update for ${update.page}`, {
            error: error.message,
            page: update.page,
            action: update.action
          });
          // Continue with other updates even if one fails
        }
      }

      // Commit and push changes
      await this.wikiClient!.commit(parsed.commitMessage);
      await this.wikiClient!.push();

      logger.info('Wiki updates committed and pushed successfully', {
        taskId: taskState.taskId,
        updatesApplied: parsed.updates.length,
        commitMessage: parsed.commitMessage
      });

      // Notify on GitHub
      await this.githubClient.addComment(
        taskState.issueNumber,
        `📚 **Wiki Updated**\n\n` +
        `The Archivist has documented insights from this issue in the team wiki.\n\n` +
        `**Pages Updated:** ${parsed.updates.map(u => u.page.replace('.md', '')).join(', ')}\n\n` +
        `Check the [wiki](../../wiki) for accumulated knowledge from this and previous issues.`
      );

    } catch (error: any) {
      logger.error('Failed to process Archivist updates', {
        taskId: taskState.taskId,
        error: error.message
      });
      // Don't throw - wiki update failure shouldn't break the pipeline
      // Just log and continue
    }
  }

  /**
   * Deploy to Vercel staging after Gatekeeper (Stage 7) completes
   */
  private async deployStagingToVercel(taskState: TaskState): Promise<void> {
    if (!this.vercelClient) {
      logger.info('Vercel not configured, skipping staging deployment');
      return;
    }

    try {
      logger.info('Starting Vercel staging deployment', {
        taskId: taskState.taskId,
        branch: taskState.branchName
      });

      // Notify GitHub
      await this.githubClient.addComment(
        taskState.issueNumber,
        `🚀 **Deploying to Vercel Staging**\n\nBranch: \`${taskState.branchName}\`\nTriggering deployment...`
      );

      // 1. Create deployment
      const deployment = await this.vercelClient.createDeployment(
        taskState.branchName,
        'staging'
      );

      logger.info('Staging deployment created', {
        deploymentId: deployment.id,
        url: deployment.url
      });

      // 2. Wait for deployment to be ready (10 minute timeout)
      await this.githubClient.addComment(
        taskState.issueNumber,
        `⏳ Waiting for deployment to complete...\nDeployment ID: \`${deployment.id}\``
      );

      const readyDeployment = await this.vercelClient.waitForDeployment(deployment.id);

      // 3. Get logs
      const logs = await this.vercelClient.getDeploymentLogs(deployment.id);

      // 4. Health check
      const health = await this.vercelClient.checkDeploymentHealth(readyDeployment.url);

      // 5. Store deployment info
      taskState.stagingDeployment = {
        deploymentId: readyDeployment.id,
        deploymentUrl: readyDeployment.url,
        status: readyDeployment.readyState,
        deployedAt: new Date().toISOString(),
        healthy: health.healthy
      };
      this.saveTaskState(taskState);

      // 6. Append deployment info to staging-deployment.md artifact
      const stageResult = taskState.stages[7]; // Stage 7 = Gatekeeper
      if (stageResult && stageResult.artifactPath) {
        // artifactPath is already an absolute path from saveArtifact()
        const artifactPath = stageResult.artifactPath;
        const deploymentInfo = `

---

## 🚀 Actual Vercel Deployment

**Deployment ID:** \`${readyDeployment.id}\`
**Deployment URL:** ${readyDeployment.url}
**Status:** ${readyDeployment.readyState} ${health.healthy ? '✅' : '❌'}
**Deployed At:** ${taskState.stagingDeployment!.deployedAt}

**Health Check:**
- HTTP Status: ${health.statusCode}
- Response Time: ${health.responseTime}ms
- Healthy: ${health.healthy ? 'Yes ✅' : 'No ❌'}

**Build Logs (Last 10 lines):**
\`\`\`
${logs.logs.slice(-10).map(l => l.message).join('\n')}
\`\`\`
`;

        fs.appendFileSync(artifactPath, deploymentInfo, 'utf-8');
        logger.info('Appended deployment info to artifact', { artifactPath });
      }

      // 7. Notify GitHub with success
      await this.githubClient.addComment(
        taskState.issueNumber,
        `✅ **Staging Deployment Complete**\n\n` +
        `🌐 **URL:** ${readyDeployment.url}\n` +
        `📊 **Status:** ${readyDeployment.readyState}\n` +
        `❤️ **Health:** ${health.healthy ? 'Healthy' : 'Unhealthy'} (${health.statusCode})\n` +
        `⏱️ **Response Time:** ${health.responseTime}ms`
      );

      logger.info('Staging deployment successful', {
        deploymentId: readyDeployment.id,
        url: readyDeployment.url,
        healthy: health.healthy
      });

    } catch (error: any) {
      logger.error('Staging deployment failed', {
        taskId: taskState.taskId,
        error: error.message
      });

      // Notify GitHub of failure
      await this.githubClient.addComment(
        taskState.issueNumber,
        `❌ **Staging Deployment Failed**\n\n` +
        `Error: ${error.message}\n\n` +
        `The pipeline will continue, but staging deployment was unsuccessful.`
      );

      // Don't throw - staging failures shouldn't block the pipeline
    }
  }

  /**
   * Deploy to Vercel production after Commander (Stage 10) completes
   */
  private async deployProductionToVercel(taskState: TaskState): Promise<void> {
    if (!this.vercelClient) {
      logger.info('Vercel not configured, skipping production deployment');
      return;
    }

    try {
      logger.info('Starting Vercel production deployment', {
        taskId: taskState.taskId,
        branch: taskState.branchName
      });

      // Notify GitHub
      await this.githubClient.addComment(
        taskState.issueNumber,
        `🚀 **Deploying to Vercel Production**\n\nBranch: \`${taskState.branchName}\`\nTriggering deployment...`
      );

      // 1. Create deployment
      const deployment = await this.vercelClient.createDeployment(
        taskState.branchName,
        'production'
      );

      logger.info('Production deployment created', {
        deploymentId: deployment.id,
        url: deployment.url
      });

      // 2. Wait for deployment to be ready
      await this.githubClient.addComment(
        taskState.issueNumber,
        `⏳ Waiting for production deployment...\nDeployment ID: \`${deployment.id}\``
      );

      const readyDeployment = await this.vercelClient.waitForDeployment(deployment.id);

      // 3. Get logs
      const logs = await this.vercelClient.getDeploymentLogs(deployment.id);

      // 4. Health check
      const health = await this.vercelClient.checkDeploymentHealth(readyDeployment.url);

      // 5. Store deployment info
      taskState.productionDeployment = {
        deploymentId: readyDeployment.id,
        deploymentUrl: readyDeployment.url,
        status: readyDeployment.readyState,
        deployedAt: new Date().toISOString(),
        healthy: health.healthy
      };
      this.saveTaskState(taskState);

      // 6. Append deployment info to deployment-log.md artifact
      const stageResult = taskState.stages[10]; // Stage 10 = Commander
      if (stageResult && stageResult.artifactPath) {
        // artifactPath is already an absolute path from saveArtifact()
        const artifactPath = stageResult.artifactPath;
        const deploymentInfo = `

---

## 🚀 Actual Vercel Production Deployment

**Deployment ID:** \`${readyDeployment.id}\`
**Deployment URL:** ${readyDeployment.url}
**Status:** ${readyDeployment.readyState} ${health.healthy ? '✅' : '❌'}
**Deployed At:** ${taskState.productionDeployment!.deployedAt}

**Health Check:**
- HTTP Status: ${health.statusCode}
- Response Time: ${health.responseTime}ms
- Healthy: ${health.healthy ? 'Yes ✅' : 'No ❌'}

**Build Logs (Last 10 lines):**
\`\`\`
${logs.logs.slice(-10).map(l => l.message).join('\n')}
\`\`\`
`;

        fs.appendFileSync(artifactPath, deploymentInfo, 'utf-8');
        logger.info('Appended deployment info to artifact', { artifactPath });
      }

      // 7. Handle based on health status
      if (health.healthy) {
        await this.handleProductionSuccess(taskState, readyDeployment.url, health);
      } else {
        await this.handleProductionFailure(taskState, 'Health check failed', {
          url: readyDeployment.url,
          statusCode: health.statusCode,
          responseTime: health.responseTime
        });
      }

      logger.info('Production deployment completed', {
        deploymentId: readyDeployment.id,
        url: readyDeployment.url,
        healthy: health.healthy
      });

    } catch (error: any) {
      logger.error('Production deployment failed', {
        taskId: taskState.taskId,
        error: error.message
      });

      await this.handleProductionFailure(taskState, error.message);

      // Production failures SHOULD block the pipeline
      throw new Error(`Production deployment failed: ${error.message}`);
    }
  }

  /**
   * Handle successful production deployment
   * - Add verified-in-production label
   * - Post success comment
   * - Ensure issue is properly closed
   */
  private async handleProductionSuccess(
    taskState: TaskState,
    deploymentUrl: string,
    health: { statusCode: number; responseTime: number }
  ): Promise<void> {
    try {
      // Add success label
      await this.githubClient.addLabel(taskState.issueNumber, 'verified-in-production');

      // Remove any failure labels
      try {
        await this.githubClient.removeLabel(taskState.issueNumber, 'deployment-failed');
      } catch {
        // Label might not exist, that's fine
      }

      // Post success comment
      await this.githubClient.addComment(
        taskState.issueNumber,
        `✅ **Production Deployment Verified**\n\n` +
        `🌐 **URL:** ${deploymentUrl}\n` +
        `📊 **Status:** HEALTHY\n` +
        `🔒 **HTTP Status:** ${health.statusCode}\n` +
        `⏱️ **Response Time:** ${health.responseTime}ms\n\n` +
        `The fix has been deployed to production and verified working.\n` +
        `This issue can now be considered complete.`
      );

      logger.info('Production deployment verified healthy', {
        taskId: taskState.taskId,
        url: deploymentUrl
      });

    } catch (error: any) {
      logger.error('Failed to handle production success', { error: error.message });
    }
  }

  /**
   * Handle failed production deployment
   * - Reopen the issue if closed
   * - Add deployment-failed label
   * - Post detailed failure comment
   * - Create follow-up action
   */
  private async handleProductionFailure(
    taskState: TaskState,
    reason: string,
    details?: { url?: string; statusCode?: number; responseTime?: number; logs?: string }
  ): Promise<void> {
    try {
      logger.warn('Handling production deployment failure', {
        taskId: taskState.taskId,
        reason
      });

      // 1. Reopen the issue
      await this.githubClient.reopenIssue(taskState.issueNumber);

      // 2. Add failure label
      await this.githubClient.addLabel(taskState.issueNumber, 'deployment-failed');

      // 3. Remove success labels if present
      try {
        await this.githubClient.removeLabel(taskState.issueNumber, 'verified-in-production');
      } catch {
        // Label might not exist
      }

      // 4. Build detailed failure comment
      let comment = `🚨 **Production Deployment Failed**\n\n`;
      comment += `**Reason:** ${reason}\n\n`;

      if (details) {
        comment += `**Details:**\n`;
        if (details.url) comment += `- URL: ${details.url}\n`;
        if (details.statusCode) comment += `- HTTP Status: ${details.statusCode}\n`;
        if (details.responseTime) comment += `- Response Time: ${details.responseTime}ms\n`;
        comment += `\n`;
      }

      comment += `**Issue has been reopened for investigation.**\n\n`;
      comment += `**Recommended Actions:**\n`;
      comment += `1. Check the Vercel deployment logs for build errors\n`;
      comment += `2. Verify the code changes don't have runtime errors\n`;
      comment += `3. Check if dependencies are correctly installed\n`;
      comment += `4. Review the health check endpoint responses\n\n`;
      comment += `The AI team will re-attempt the fix once the issue is investigated.`;

      await this.githubClient.addComment(taskState.issueNumber, comment);

      // 5. Update task state
      taskState.status = 'failed';
      if (taskState.productionDeployment) {
        taskState.productionDeployment.healthy = false;
      }
      this.saveTaskState(taskState);

      logger.info('Production failure handled - issue reopened', {
        taskId: taskState.taskId,
        issueNumber: taskState.issueNumber
      });

    } catch (error: any) {
      logger.error('Failed to handle production failure', { error: error.message });
    }
  }

  /**
   * Run comprehensive production health verification
   * Called by Guardian agent or manually to verify production status
   */
  async verifyProductionHealth(taskState: TaskState): Promise<{
    healthy: boolean;
    report: string;
  }> {
    if (!this.vercelClient) {
      return { healthy: false, report: 'Vercel not configured' };
    }

    try {
      const report = await this.runProductionHealthChecks();
      const isHealthy = report.includes('Overall Status:** HEALTHY');

      if (!isHealthy) {
        // Trigger failure handling
        await this.handleProductionFailure(
          taskState,
          'Production health check failed after deployment',
          { logs: report }
        );
      }

      return { healthy: isHealthy, report };
    } catch (error: any) {
      return { healthy: false, report: `Health check error: ${error.message}` };
    }
  }
}
