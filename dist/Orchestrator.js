"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Orchestrator = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("./utils/logger");
class Orchestrator {
    constructor(agentRunner, githubClient, gitClient, tasksDir = './tasks') {
        this.agentRunner = agentRunner;
        this.githubClient = githubClient;
        this.gitClient = gitClient;
        this.tasksDir = tasksDir;
        // Define the 12-stage pipeline
        this.config = {
            stages: [
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
                { name: 'Stage 12: Documentation', agentName: 'historian', requiresApproval: false, artifactName: 'retrospective.md' }
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
    async startTask(issueNumber) {
        logger_1.logger.info('Starting new task', { issueNumber });
        // Fetch GitHub issue
        const issue = await this.githubClient.getIssue(issueNumber);
        // Create branch name (sanitize issue title for branch name)
        const branchName = `fix/issue-${issueNumber}-${issue.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .substring(0, 50)
            .replace(/-+$/, '')}`;
        // Create task state
        const taskId = `ISSUE-${issueNumber}`;
        const taskState = {
            taskId,
            issueNumber,
            issueTitle: issue.title,
            issueBody: issue.body || 'No description provided',
            issueUrl: issue.html_url,
            branchName,
            currentStage: 0,
            stages: this.config.stages.map(stage => ({
                stageName: stage.name,
                agentName: stage.agentName,
                status: 'pending'
            })),
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        // Save initial state
        this.saveTaskState(taskState);
        // Step 1: Create Git branch for this issue
        logger_1.logger.info('Creating Git branch', { branchName });
        try {
            await this.gitClient.createBranch(branchName);
            logger_1.logger.info('Branch created successfully', { branchName });
            // Comment on issue about branch creation
            await this.githubClient.addComment(issueNumber, `🌿 **Branch Created**\n\n` +
                `Created branch \`${branchName}\` for this issue.\n\n` +
                `The AI team will now begin working on the fix...`);
        }
        catch (error) {
            logger_1.logger.error('Failed to create branch', { branchName, error: error.message });
            throw new Error(`Failed to create branch: ${error.message}`);
        }
        logger_1.logger.info('Task created', { taskId, issueTitle: issue.title, branchName });
        return taskState;
    }
    /**
     * Run the next stage in the pipeline
     */
    async runNextStage(taskId) {
        // Load task state
        const taskState = this.loadTaskState(taskId);
        if (taskState.status === 'completed') {
            logger_1.logger.info('Task already completed', { taskId });
            return taskState;
        }
        if (taskState.status === 'awaiting_approval') {
            logger_1.logger.info('Task awaiting approval', { taskId, stage: taskState.currentStage });
            return taskState;
        }
        const stageIndex = taskState.currentStage;
        const stageConfig = this.config.stages[stageIndex];
        const stageResult = taskState.stages[stageIndex];
        logger_1.logger.info('Running stage', { taskId, stage: stageConfig.name, agent: stageConfig.agentName });
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
            // Run agent
            const result = await this.agentRunner.runAgent(stageConfig.agentName, context);
            if (!result.success) {
                throw new Error(result.error || 'Agent execution failed');
            }
            // Update stage result
            stageResult.status = 'completed';
            stageResult.completedAt = new Date().toISOString();
            stageResult.tokensUsed = result.tokensUsed;
            stageResult.durationMs = result.durationMs;
            stageResult.output = result.output;
            // Save artifact
            const artifactPath = this.saveArtifact(taskId, stageConfig.artifactName, result.output);
            stageResult.artifactPath = artifactPath;
            // Step 2: After Surgeon completes, commit and push changes
            if (stageIndex === 2 && stageConfig.agentName === 'surgeon') {
                await this.commitAndPushChanges(taskState);
            }
            // Add GitHub comment: Agent completed work
            await this.notifyStageComplete(taskState, stageIndex);
            // Step 3: After Surgeon completes, create PR
            if (stageIndex === 2 && stageConfig.agentName === 'surgeon' && !taskState.prNumber) {
                await this.createPullRequest(taskState);
            }
            // Check if approval is required
            if (stageConfig.requiresApproval) {
                taskState.status = 'awaiting_approval';
                logger_1.logger.info('Stage completed - awaiting approval', { taskId, stage: stageConfig.name });
            }
            else {
                // Move to next stage
                taskState.currentStage++;
                // Check if all stages are completed
                if (taskState.currentStage >= this.config.stages.length) {
                    taskState.status = 'completed';
                    await this.notifyPipelineComplete(taskState);
                    logger_1.logger.info('All stages completed', { taskId });
                }
                else {
                    taskState.status = 'pending';
                }
            }
            taskState.updatedAt = new Date().toISOString();
            this.saveTaskState(taskState);
            logger_1.logger.info('Stage completed', {
                taskId,
                stage: stageConfig.name,
                tokensUsed: result.tokensUsed,
                durationMs: result.durationMs
            });
            return taskState;
        }
        catch (error) {
            logger_1.logger.error('Stage failed', { taskId, stage: stageConfig.name, error: error.message });
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
    async approveStage(taskId) {
        const taskState = this.loadTaskState(taskId);
        if (taskState.status !== 'awaiting_approval') {
            throw new Error(`Task ${taskId} is not awaiting approval (status: ${taskState.status})`);
        }
        logger_1.logger.info('Stage approved', { taskId, stage: taskState.currentStage });
        // Move to next stage
        taskState.currentStage++;
        // Check if all stages are completed
        if (taskState.currentStage >= this.config.stages.length) {
            taskState.status = 'completed';
            logger_1.logger.info('All stages completed', { taskId });
        }
        else {
            taskState.status = 'pending';
        }
        taskState.updatedAt = new Date().toISOString();
        this.saveTaskState(taskState);
        return taskState;
    }
    /**
     * Run all stages until completion or approval needed
     */
    async runPipeline(taskId) {
        let taskState = this.loadTaskState(taskId);
        while (taskState.status === 'pending' || taskState.status === 'in_progress') {
            taskState = await this.runNextStage(taskId);
            if (taskState.status === 'awaiting_approval') {
                logger_1.logger.info('Pipeline paused - awaiting approval', { taskId });
                break;
            }
            if (taskState.status === 'failed') {
                logger_1.logger.error('Pipeline failed', { taskId, error: taskState.error });
                break;
            }
        }
        return taskState;
    }
    /**
     * Build agent context from task state and previous outputs
     */
    buildAgentContext(taskState, stageIndex) {
        const context = {
            issueNumber: taskState.issueNumber,
            issueTitle: taskState.issueTitle,
            issueBody: taskState.issueBody,
            issueUrl: taskState.issueUrl
        };
        // Add outputs from previous stages
        for (let i = 0; i < stageIndex; i++) {
            const previousStage = taskState.stages[i];
            if (previousStage.status === 'completed' && previousStage.output) {
                const key = `${previousStage.agentName}Output`;
                context[key] = previousStage.output;
            }
        }
        return context;
    }
    /**
     * Save artifact to task directory
     */
    saveArtifact(taskId, filename, content) {
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
    saveTaskState(taskState) {
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
    loadTaskState(taskId) {
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
    getTaskState(taskId) {
        return this.loadTaskState(taskId);
    }
    /**
     * List all tasks
     */
    listTasks() {
        if (!fs.existsSync(this.tasksDir)) {
            return [];
        }
        return fs.readdirSync(this.tasksDir)
            .filter(name => fs.existsSync(path.join(this.tasksDir, name, 'state.json')));
    }
    /**
     * Notify GitHub when a stage starts
     */
    async notifyStageStart(taskState, stageIndex) {
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
            logger_1.logger.info('GitHub notification sent', { stage: stageConfig.name, type: 'start' });
        }
        catch (error) {
            logger_1.logger.warn('Failed to send GitHub notification', { error: error.message });
            // Don't fail the pipeline if GitHub notification fails
        }
    }
    /**
     * Notify GitHub when a stage completes
     */
    async notifyStageComplete(taskState, stageIndex) {
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
            }
            else {
                comment += `🎉 **All stages completed!**`;
            }
            await this.githubClient.addComment(taskState.issueNumber, comment);
            logger_1.logger.info('GitHub notification sent', { stage: stageConfig.name, type: 'complete' });
        }
        catch (error) {
            logger_1.logger.warn('Failed to send GitHub notification', { error: error.message });
        }
    }
    /**
     * Notify GitHub when a stage fails
     */
    async notifyStageFailed(taskState, stageIndex, error) {
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
            logger_1.logger.info('GitHub notification sent', { stage: stageConfig.name, type: 'failed' });
        }
        catch (err) {
            logger_1.logger.warn('Failed to send GitHub notification', { error: err.message });
        }
    }
    /**
     * Notify GitHub when pipeline completes
     */
    async notifyPipelineComplete(taskState) {
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
            logger_1.logger.info('GitHub notification sent', { type: 'pipeline-complete' });
        }
        catch (error) {
            logger_1.logger.warn('Failed to send GitHub notification', { error: error.message });
        }
    }
    /**
     * Get emoji for agent
     */
    getAgentEmoji(agentName) {
        const emojiMap = {
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
    extractSummary(output) {
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
     * Step 2: Commit and push changes after implementation
     */
    async commitAndPushChanges(taskState) {
        try {
            logger_1.logger.info('Committing and pushing changes', { taskId: taskState.taskId, branch: taskState.branchName });
            // Check if there are changes to commit
            const hasChanges = await this.gitClient.hasUncommittedChanges();
            if (!hasChanges) {
                logger_1.logger.info('No changes to commit', { taskId: taskState.taskId });
                return;
            }
            // Commit message
            const commitMessage = `fix: ${taskState.issueTitle}\n\nImplemented fix for issue #${taskState.issueNumber}\n\nThis commit includes the changes made by the Surgeon agent to address the reported issue.`;
            // Commit changes
            const commitHash = await this.gitClient.commit(commitMessage);
            logger_1.logger.info('Changes committed', { taskId: taskState.taskId, commit: commitHash });
            // Push to remote
            await this.gitClient.push(taskState.branchName);
            logger_1.logger.info('Changes pushed to remote', { taskId: taskState.taskId, branch: taskState.branchName });
            // Notify on GitHub
            await this.githubClient.addComment(taskState.issueNumber, `📝 **Changes Committed**\n\n` +
                `Committed and pushed changes to branch \`${taskState.branchName}\`\n\n` +
                `Commit: \`${commitHash.substring(0, 7)}\`\n\n` +
                `The fix has been implemented and is ready for review.`);
        }
        catch (error) {
            logger_1.logger.error('Failed to commit and push changes', { taskId: taskState.taskId, error: error.message });
            throw new Error(`Failed to commit and push changes: ${error.message}`);
        }
    }
    /**
     * Step 3: Create pull request after implementation
     */
    async createPullRequest(taskState) {
        try {
            logger_1.logger.info('Creating pull request', { taskId: taskState.taskId, branch: taskState.branchName });
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
            const pr = await this.githubClient.createPullRequest(`Fix: ${taskState.issueTitle}`, prBody, taskState.branchName, 'main', taskState.issueNumber);
            // Update task state
            taskState.prNumber = pr.number;
            taskState.prUrl = pr.html_url;
            this.saveTaskState(taskState);
            logger_1.logger.info('Pull request created', { taskId: taskState.taskId, prNumber: pr.number, prUrl: pr.html_url });
            // Link PR to issue
            await this.githubClient.linkPullRequestToIssue(taskState.issueNumber, pr.number, pr.html_url);
        }
        catch (error) {
            // If PR already exists, just log and continue (don't fail the stage)
            if (error.message && error.message.includes('pull request already exists')) {
                logger_1.logger.info('Pull request already exists, skipping creation', { taskId: taskState.taskId, branch: taskState.branchName });
                return;
            }
            logger_1.logger.error('Failed to create pull request', { taskId: taskState.taskId, error: error.message });
            throw new Error(`Failed to create pull request: ${error.message}`);
        }
    }
}
exports.Orchestrator = Orchestrator;
//# sourceMappingURL=Orchestrator.js.map