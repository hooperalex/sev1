# AI Team MVP

**Autonomous AI development team that fixes bugs automatically**

## What This Does

The system **continuously monitors your GitHub repository** and automatically processes issues through a 14-stage AI pipeline:

Create GitHub issue → AI agents validate, triage, analyze, code, review, test, deploy, and document → Bug fixed in production → PR created with full documentation

**Current Status:** ✅ All 14 agents complete. Full pipeline operational. Automated issue monitoring active.

---

## Quick Start

### 1. Install Dependencies

```bash
cd ai-team-mvp
npm install
npm run build
```

### 2. Configure Environment

```bash
# Copy template
cp .env.example .env

# Edit .env with your credentials:
ANTHROPIC_API_KEY=your_key_here     # Get from https://console.anthropic.com/
GITHUB_TOKEN=your_token_here        # Get from https://github.com/settings/tokens
GITHUB_OWNER=your_username          # Your GitHub username
GITHUB_REPO=your_repo_name          # Repository name
```

### 3. Start Automated Issue Monitoring

```bash
# Start the watcher - it will continuously monitor for new issues
npm run watch:issues
```

**What happens:**
- Checks for new GitHub issues every 30 seconds
- Automatically processes up to 3 issues concurrently
- Each issue goes through all 14 agents
- Creates branches, commits code, and opens PRs
- Comments on issues with progress updates
- No manual intervention needed (unless an error occurs)

**Example Output:**
```
🔍 AI Team MVP - Detective Agent Test

📡 Initializing...
📥 Fetching issue #123...

✓ Issue fetched:
  Title: Homepage displays blank instead of Hello World
  URL: https://github.com/owner/repo/issues/123
  State: open

🕵️  Running Detective agent...

✓ Detective agent completed:
  Tokens used: 2,847
  Duration: 5.23s

================================================================================
TRIAGE REPORT:
================================================================================
# Bug Triage Report

## Summary
Homepage component renders empty div instead of displaying "Hello World" text

## Severity Classification
**Priority:** P2 (Medium)

**Justification:**
User-facing issue affecting homepage visibility, but website remains functional...

[Full triage report...]
================================================================================

💾 Triage report saved to: ./tasks/ISSUE-123/triage-report.md

✅ Test completed successfully!
```

### 4. Manual Processing (Alternative)

If you want to process a specific issue manually:

```bash
# Run full 14-stage pipeline on a single issue
npm run test:full -- <issue-number>

# Continue a paused/failed pipeline
npm run continue -- ISSUE-<number>

# Clean up task artifacts and close PR
npm run cleanup -- ISSUE-<number>
```

**Example Output:**
```
🔬 AI Team MVP - Pipeline Integration Test

Running: Detective → Archaeologist

================================================================================
STAGE 1: DETECTIVE (BUG TRIAGE)
================================================================================

✓ Detective completed:
  Tokens: 2,847
  Duration: 5.23s
  Artifact: ./tasks/ISSUE-123/triage-report.md

================================================================================
STAGE 2: ARCHAEOLOGIST (ROOT CAUSE ANALYSIS)
================================================================================

✓ Archaeologist completed:
  Tokens: 4,125
  Duration: 8.15s
  Artifact: ./tasks/ISSUE-123/root-cause-analysis.md

================================================================================
PIPELINE SUMMARY
================================================================================

📊 Statistics:
  Total tokens: 6,972
  Total duration: 13.38s
  Estimated cost: $0.0209

📁 Artifacts saved to: ./tasks/ISSUE-123/
  - triage-report.md
  - root-cause-analysis.md
  - state.json

✅ Integration test completed successfully!
```

---

## Project Structure

```
ai-team-mvp/
├── src/
│   ├── AgentRunner.ts              # Executes agents via Claude API
│   ├── Orchestrator.ts             # ✅ Runs multi-agent pipeline
│   ├── integrations/
│   │   ├── GitHubClient.ts         # GitHub API integration
│   │   └── GitClient.ts            # ✅ Git operations (blame, log)
│   ├── utils/
│   │   └── logger.ts               # Winston logging
│   ├── test.ts                     # Single agent test
│   └── test_pipeline.ts            # ✅ Multi-agent pipeline test
│
├── .claude/
│   └── agents/
│       ├── intake.md               # ✅ Stage 0: Requirements validation
│       ├── detective.md            # ✅ Stage 1: Bug triage
│       ├── archaeologist.md        # ✅ Stage 2: Root cause analysis
│       ├── surgeon.md              # ✅ Stage 3: Implementation
│       ├── critic.md               # ✅ Stage 4: Code review
│       ├── validator.md            # ✅ Stage 5: Testing
│       ├── skeptic.md              # ✅ Stage 6: QA
│       ├── gatekeeper.md           # ✅ Stage 7: Staging deployment
│       ├── advocate.md             # ✅ Stage 8: UAT
│       ├── planner.md              # ✅ Stage 9: Production planning
│       ├── commander.md            # ✅ Stage 10: Production deployment
│       ├── guardian.md             # ✅ Stage 11: Monitoring
│       ├── historian.md            # ✅ Stage 12: Retrospective
│       └── archivist.md            # ✅ Stage 13: Wiki documentation
│
├── tasks/                          # Generated task artifacts
│   └── ISSUE-123/
│       └── triage-report.md
│
├── logs/                           # Application logs
│   ├── combined.log
│   └── error.log
│
├── package.json
├── tsconfig.json
└── README.md (this file)
```

---

## What's Built

✅ **Core Infrastructure:**
- [x] AgentRunner (calls Claude API with agent configs)
- [x] Orchestrator (runs multi-agent pipeline sequentially)
- [x] GitHub integration (fetch issues, add comments)
- [x] Git integration (blame, log, commit history)
- [x] Logger (Winston)
- [x] TypeScript setup
- [x] Environment configuration

✅ **Agents (14-Stage Pipeline):**
- [x] Intake (Stage 0) - Requirements validation & issue classification
- [x] Detective (Stage 1) - Bug triage
- [x] Archaeologist (Stage 2) - Root cause analysis
- [x] Surgeon (Stage 3) - Implementation
- [x] Critic (Stage 4) - Code review
- [x] Validator (Stage 5) - Testing
- [x] Skeptic (Stage 6) - QA
- [x] Gatekeeper (Stage 7) - Staging deployment
- [x] Advocate (Stage 8) - UAT
- [x] Planner (Stage 9) - Production planning
- [x] Commander (Stage 10) - Production deployment
- [x] Guardian (Stage 11) - Monitoring
- [x] Historian (Stage 12) - Retrospective documentation
- [x] Archivist (Stage 13) - Wiki knowledge base updates

✅ **Automation:**
- [x] Automated issue monitoring
- [x] Concurrent issue processing (max 3)
- [x] Git branch creation per issue
- [x] Automated commits and PR creation
- [x] GitHub issue comments and labels
- [x] Pipeline state management
- [x] Error handling and recovery

✅ **Testing:**
- [x] Test script for Detective agent
- [x] Pipeline test for Detective → Archaeologist
- [x] Full 14-stage pipeline test

---

## Recent Improvements

✅ **Completed:**
- All 14 agents implemented and operational
- Intake agent for requirements validation (Stage 0)
- Archivist agent for wiki documentation (Stage 13)
- Automatic issue closure for invalid/low-quality issues
- Auto-request more info for incomplete issues
- Real Vercel deployment integration
- Wiki knowledge base integration
- Issue decomposition for complex tasks

---

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run single agent test (Detective only)
npm run test -- <issue-number>

# Run pipeline test (Detective → Archaeologist)
npm run test:pipeline -- <issue-number>

# Watch mode (auto-rebuild)
npm run watch

# Check logs
tail -f logs/combined.log
```

---

## How It Works

### 1. Submit Issue
```bash
npm run test -- 123
```

### 2. Agent Runner
- Loads agent config from `.claude/agents/detective.md`
- Fetches issue from GitHub
- Builds prompt with context
- Calls Claude API
- Returns structured output

### 3. Save Output
- Saves triage report to `tasks/ISSUE-123/`
- Logs to `logs/combined.log`

### 4. Pipeline Flow
- Intake validates requirements and classifies issue
- Detective triages and assigns severity
- Archaeologist analyzes root cause
- Surgeon implements fix
- ... and so on through all 14 stages

---

## Configuration

### .env Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-xxx        # From console.anthropic.com
GITHUB_TOKEN=ghp_xxx                # From github.com/settings/tokens
GITHUB_OWNER=your-username          # Your GitHub username
GITHUB_REPO=your-repo               # Repository name

# Optional
LOG_LEVEL=info                      # debug | info | warn | error
TASKS_DIR=./tasks                   # Where to save task artifacts
AGENTS_DIR=./.claude/agents         # Where agent configs live
```

### GitHub Token Permissions

Your GitHub token needs:
- `repo` (full control of private repositories)
- `read:org` (if working with organization repos)

---

## Troubleshooting

### "Missing environment variables"
- Copy `.env.example` to `.env`
- Fill in your API keys

### "Agent config not found"
- Check that `.claude/agents/detective.md` exists
- Run from project root directory

### "Failed to fetch GitHub issue"
- Check that issue number exists
- Verify GITHUB_OWNER and GITHUB_REPO are correct
- Check GitHub token has correct permissions

### Claude API errors
- Verify ANTHROPIC_API_KEY is correct
- Check you have API credits
- See logs in `logs/error.log`

---

## Cost Estimate

**Detective Agent:**
- ~3,000 tokens per issue
- Cost: ~$0.01 per issue (using Sonnet)

**Full Pipeline (all 14 agents):**
- ~100,000 tokens per issue
- Cost: ~$1.50 per bug fixed

---

## Contributing

1. Add new agent configs in `.claude/agents/`
2. Follow Detective pattern for structure
3. Test with `npm run test`
4. Update this README

---

## License

MIT

---

## Support

Issues? Open a GitHub issue or check logs in `./logs/`
