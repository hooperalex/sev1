"use strict";
/**
 * Test script: Run Detective agent on a GitHub issue
 *
 * Usage:
 *   npm run test -- <issue-number>
 *
 * Example:
 *   npm run test -- 123
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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const AgentRunner_1 = require("./AgentRunner");
const GitHubClient_1 = require("./integrations/GitHubClient");
const logger_1 = require("./utils/logger");
// Load environment variables
dotenv.config();
async function main() {
    console.log('🔍 AI Team MVP - Detective Agent Test\n');
    // Get issue number from command line
    const issueNumber = process.argv[2] ? parseInt(process.argv[2], 10) : null;
    if (!issueNumber) {
        console.error('❌ Please provide an issue number:');
        console.error('   npm run test -- 123');
        process.exit(1);
    }
    // Check environment variables
    const requiredEnvVars = [
        'ANTHROPIC_API_KEY',
        'GITHUB_TOKEN',
        'GITHUB_OWNER',
        'GITHUB_REPO'
    ];
    const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
    if (missingEnvVars.length > 0) {
        console.error(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
        console.error('   Copy .env.example to .env and fill in your credentials');
        process.exit(1);
    }
    try {
        // Initialize clients
        console.log('📡 Initializing...');
        const githubClient = new GitHubClient_1.GitHubClient(process.env.GITHUB_TOKEN, process.env.GITHUB_OWNER, process.env.GITHUB_REPO);
        const agentRunner = new AgentRunner_1.AgentRunner(process.env.ANTHROPIC_API_KEY, './.claude/agents');
        // Fetch GitHub issue
        console.log(`📥 Fetching issue #${issueNumber}...`);
        const issue = await githubClient.getIssue(issueNumber);
        console.log(`\n✓ Issue fetched:`);
        console.log(`  Title: ${issue.title}`);
        console.log(`  URL: ${issue.html_url}`);
        console.log(`  State: ${issue.state}`);
        // Run Detective agent
        console.log(`\n🕵️  Running Detective agent...`);
        const result = await agentRunner.runAgent('detective', {
            issueNumber: issue.number,
            issueTitle: issue.title,
            issueBody: issue.body || 'No description provided',
            issueUrl: issue.html_url
        });
        if (!result.success) {
            console.error(`\n❌ Detective agent failed: ${result.error}`);
            process.exit(1);
        }
        // Display results
        console.log(`\n✓ Detective agent completed:`);
        console.log(`  Tokens used: ${result.tokensUsed}`);
        console.log(`  Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
        console.log(`\n${'='.repeat(80)}`);
        console.log('TRIAGE REPORT:');
        console.log('='.repeat(80));
        console.log(result.output);
        console.log('='.repeat(80));
        // Save output to file
        const tasksDir = path.join(process.cwd(), 'tasks');
        const taskDir = path.join(tasksDir, `ISSUE-${issueNumber}`);
        if (!fs.existsSync(taskDir)) {
            fs.mkdirSync(taskDir, { recursive: true });
        }
        const outputFile = path.join(taskDir, 'triage-report.md');
        fs.writeFileSync(outputFile, result.output);
        console.log(`\n💾 Triage report saved to: ${outputFile}`);
        // Log summary
        console.log(`\n✅ Test completed successfully!`);
        console.log(`\nNext steps:`);
        console.log(`  1. Review the triage report above`);
        console.log(`  2. Check if the analysis is accurate`);
        console.log(`  3. If good, we can build the next agent (Archaeologist)`);
    }
    catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        logger_1.logger.error('Test failed', { error });
        process.exit(1);
    }
}
// Run test
main();
//# sourceMappingURL=test.js.map