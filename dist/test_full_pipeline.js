"use strict";
/**
 * Full Pipeline Test: Run all 12 agents
 *
 * Usage:
 *   npm run test:full -- <issue-number>
 *
 * This runs the COMPLETE pipeline: Detective → ... → Historian
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
const dotenv = __importStar(require("dotenv"));
const AgentRunner_1 = require("./AgentRunner");
const GitHubClient_1 = require("./integrations/GitHubClient");
const GitClient_1 = require("./integrations/GitClient");
const Orchestrator_1 = require("./Orchestrator");
const logger_1 = require("./utils/logger");
dotenv.config();
async function main() {
    console.log('🚀 AI Team MVP - FULL 12-STAGE PIPELINE TEST\n');
    console.log('Running all 12 agents: Detective → Archaeologist → Surgeon → Critic → Validator → Skeptic → Gatekeeper → Advocate → Planner → Commander → Guardian → Historian\n');
    const issueNumber = process.argv[2] ? parseInt(process.argv[2], 10) : null;
    if (!issueNumber) {
        console.error('❌ Please provide an issue number:');
        console.error('   npm run test:full -- 123');
        process.exit(1);
    }
    const requiredEnvVars = ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
    const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
    if (missingEnvVars.length > 0) {
        console.error(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
        process.exit(1);
    }
    try {
        console.log('📡 Initializing...');
        const githubClient = new GitHubClient_1.GitHubClient(process.env.GITHUB_TOKEN, process.env.GITHUB_OWNER, process.env.GITHUB_REPO);
        const gitClient = new GitClient_1.GitClient();
        const agentRunner = new AgentRunner_1.AgentRunner(process.env.ANTHROPIC_API_KEY, './.claude/agents');
        const orchestrator = new Orchestrator_1.Orchestrator(agentRunner, githubClient, gitClient, './tasks');
        // Start task
        console.log(`📥 Fetching issue #${issueNumber}...\n`);
        const taskState = await orchestrator.startTask(issueNumber);
        console.log(`✓ Task created: ${taskState.taskId}`);
        console.log(`  Title: ${taskState.issueTitle}`);
        console.log(`  Stages: ${taskState.stages.length}\n`);
        // Run pipeline until completion or approval needed
        console.log('🔄 Running pipeline...\n');
        let currentState = taskState;
        const startTime = Date.now();
        while (currentState.status === 'pending' || currentState.status === 'in_progress') {
            const stageIndex = currentState.currentStage;
            const stage = currentState.stages[stageIndex];
            console.log(`${'='.repeat(80)}`);
            console.log(`STAGE ${stageIndex + 1}: ${stage.stageName.toUpperCase()}`);
            console.log('='.repeat(80));
            currentState = await orchestrator.runNextStage(taskState.taskId);
            if (currentState.stages[stageIndex].status === 'failed') {
                console.error(`\n❌ ${stage.stageName} failed: ${currentState.stages[stageIndex].error}`);
                process.exit(1);
            }
            console.log(`\n✓ ${stage.stageName} completed:`);
            console.log(`  Tokens: ${currentState.stages[stageIndex].tokensUsed?.toLocaleString()}`);
            console.log(`  Duration: ${((currentState.stages[stageIndex].durationMs || 0) / 1000).toFixed(2)}s`);
            console.log(`  Artifact: ${currentState.stages[stageIndex].artifactPath}\n`);
            // Show preview of output
            const preview = currentState.stages[stageIndex].output?.substring(0, 400) + '...';
            console.log(`--- Output Preview ---`);
            console.log(preview);
            console.log();
            // Check for approval needed
            if (currentState.status === 'awaiting_approval') {
                console.log(`\n⚠️  HUMAN APPROVAL REQUIRED`);
                console.log(`\nThe pipeline has paused at an approval gate.`);
                console.log(`Stage ${stageIndex + 1} (${stage.stageName}) requires human review.\n`);
                console.log(`To approve and continue:`);
                console.log(`  1. Review the artifact: ${currentState.stages[stageIndex].artifactPath}`);
                console.log(`  2. Run: npm run approve -- ${taskState.taskId}\n`);
                console.log(`Pipeline status saved to: ./tasks/${taskState.taskId}/state.json`);
                break;
            }
        }
        // Pipeline completed
        if (currentState.status === 'completed') {
            const totalDuration = Date.now() - startTime;
            console.log(`\n${'='.repeat(80)}`);
            console.log('🎉 PIPELINE COMPLETED SUCCESSFULLY!');
            console.log('='.repeat(80));
            // Calculate totals
            let totalTokens = 0;
            let totalCost = 0;
            currentState.stages.forEach((stage, idx) => {
                if (stage.status === 'completed') {
                    totalTokens += stage.tokensUsed || 0;
                }
            });
            totalCost = (totalTokens / 1000000) * 3.0; // $3/M tokens estimate
            console.log(`\n📊 Pipeline Statistics:`);
            console.log(`  Total stages completed: ${currentState.stages.filter(s => s.status === 'completed').length}/12`);
            console.log(`  Total tokens: ${totalTokens.toLocaleString()}`);
            console.log(`  Total duration: ${(totalDuration / 1000).toFixed(2)}s (${(totalDuration / 60000).toFixed(1)}m)`);
            console.log(`  Estimated cost: $${totalCost.toFixed(4)}`);
            console.log(`\n📁 All artifacts saved to: ./tasks/${taskState.taskId}/`);
            currentState.stages.forEach((stage, idx) => {
                if (stage.status === 'completed' && stage.artifactPath) {
                    console.log(`  ${idx + 1}. ${stage.artifactPath.split('/').pop()}`);
                }
            });
            console.log(`\n✅ Issue #${issueNumber} has been processed through the complete pipeline!`);
            console.log(`\nReview the retrospective: ./tasks/${taskState.taskId}/retrospective.md\n`);
        }
    }
    catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        logger_1.logger.error('Full pipeline test failed', { error });
        process.exit(1);
    }
}
main();
//# sourceMappingURL=test_full_pipeline.js.map