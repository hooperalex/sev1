# AI Team MVP

**End-to-end AI development team that fixes bugs automatically**

## What This Does

Submit a GitHub issue → AI agents triage, analyze, code, test, and deploy the fix → Bug fixed in production

**Current Status:** Detective + Archaeologist agents working. Orchestrator running multi-agent pipeline. Building remaining 10 agents.

---

## Quick Start

### 1. Install Dependencies

```bash
cd ai-team-mvp
npm install
```

### 2. Configure Environment

```bash
# Copy template
cp .env.example .env

# Edit .env with your credentials:
# - ANTHROPIC_API_KEY (get from https://console.anthropic.com/)
# - GITHUB_TOKEN (get from https://github.com/settings/tokens)
# - GITHUB_OWNER (your GitHub username)
# - GITHUB_REPO (repository name)
```

### 3. Test Detective Agent

```bash
# Run on a GitHub issue
npm run test -- 123

# Replace 123 with your issue number
```

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

### 4. Test Multi-Agent Pipeline (NEW!)

```bash
# Run Detective → Archaeologist pipeline
npm run test:pipeline -- 123

# Replace 123 with your issue number
```

**What Happens:**
- Stage 1: Detective analyzes the issue and creates triage report
- Stage 2: Archaeologist reads triage, searches codebase, finds root cause
- Both outputs saved to `tasks/ISSUE-123/`
- State tracking in `tasks/ISSUE-123/state.json`

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
│       ├── detective.md            # ✅ Stage 1: Bug triage
│       ├── archaeologist.md        # ✅ Stage 2: Root cause analysis
│       ├── surgeon.md              # 📋 Stage 3: Implementation (TODO)
│       └── ... (9 more agents)
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

✅ **Agents:**
- [x] Detective (Stage 1) - Bug triage
- [x] Archaeologist (Stage 2) - Root cause analysis
- [ ] Surgeon (Stage 3) - Implementation
- [ ] Critic (Stage 4) - Code review
- [ ] Validator (Stage 5) - Testing
- [ ] Skeptic (Stage 6) - QA
- [ ] Gatekeeper (Stage 7) - Staging deployment
- [ ] Advocate (Stage 8) - UAT
- [ ] Planner (Stage 9) - Production planning
- [ ] Commander (Stage 10) - Production deployment
- [ ] Guardian (Stage 11) - Monitoring
- [ ] Historian (Stage 12) - Documentation

✅ **Testing:**
- [x] Test script for Detective agent
- [x] Pipeline test for Detective → Archaeologist
- [ ] Full 12-stage pipeline test

---

## Next Steps

### Phase 1: Complete All Agents (Week 1)
1. Create agent configs for remaining 11 agents
2. Test each agent individually
3. Build Orchestrator to run them sequentially

### Phase 2: Human Approvals (Week 2)
1. Add approval checkpoints (3 required)
2. Build CLI for approvals
3. Test end-to-end flow

### Phase 3: Deploy MVP (Week 3)
1. Error handling & retries
2. Documentation
3. Deploy to staging

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

### 4. Next Agent (Future)
- Archaeologist reads triage report
- Analyzes root cause
- Passes to Surgeon
- ... and so on through all 12 stages

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

**Full Pipeline (all 12 agents):**
- ~90,000 tokens per issue
- Cost: ~$1.20 per bug fixed

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
