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
import { AgentRunner } from './AgentRunner';
import { GitHubClient } from './integrations/GitHubClient';
import { GitClient } from './integrations/GitClient';
export interface TaskState {
    taskId: string;
    issueNumber: number;
    issueTitle: string;
    issueBody: string;
    issueUrl: string;
    branchName: string;
    prNumber?: number;
    prUrl?: string;
    currentStage: number;
    stages: StageResult[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'awaiting_approval';
    createdAt: string;
    updatedAt: string;
    error?: string;
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
export declare class Orchestrator {
    private agentRunner;
    private githubClient;
    private gitClient;
    private tasksDir;
    private config;
    constructor(agentRunner: AgentRunner, githubClient: GitHubClient, gitClient: GitClient, tasksDir?: string);
    /**
     * Start a new task from a GitHub issue
     */
    startTask(issueNumber: number): Promise<TaskState>;
    /**
     * Run the next stage in the pipeline
     */
    runNextStage(taskId: string): Promise<TaskState>;
    /**
     * Approve the current stage and move to next
     */
    approveStage(taskId: string): Promise<TaskState>;
    /**
     * Run all stages until completion or approval needed
     */
    runPipeline(taskId: string): Promise<TaskState>;
    /**
     * Build agent context from task state and previous outputs
     */
    private buildAgentContext;
    /**
     * Save artifact to task directory
     */
    private saveArtifact;
    /**
     * Save task state to JSON file
     */
    private saveTaskState;
    /**
     * Load task state from JSON file
     */
    private loadTaskState;
    /**
     * Get task state
     */
    getTaskState(taskId: string): TaskState;
    /**
     * List all tasks
     */
    listTasks(): string[];
    /**
     * Notify GitHub when a stage starts
     */
    private notifyStageStart;
    /**
     * Notify GitHub when a stage completes
     */
    private notifyStageComplete;
    /**
     * Notify GitHub when a stage fails
     */
    private notifyStageFailed;
    /**
     * Notify GitHub when pipeline completes
     */
    private notifyPipelineComplete;
    /**
     * Get emoji for agent
     */
    private getAgentEmoji;
    /**
     * Extract summary from agent output
     */
    private extractSummary;
    /**
     * Step 2: Commit and push changes after implementation
     */
    private commitAndPushChanges;
    /**
     * Step 3: Create pull request after implementation
     */
    private createPullRequest;
}
//# sourceMappingURL=Orchestrator.d.ts.map