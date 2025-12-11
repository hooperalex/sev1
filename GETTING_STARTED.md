# 🚀 Getting Started - AI Team MVP

**You now have a working 2-agent pipeline!** Detective → Archaeologist is ready to test.

---

## What I Built For You

✅ **Working Components:**
1. **AgentRunner** - Executes AI agents using Claude API
2. **Orchestrator** - Runs multi-agent pipeline sequentially
3. **GitHubClient** - Fetches issues from GitHub
4. **GitClient** - Git operations (blame, log, history)
5. **Detective Agent** - Stage 1 (bug triage)
6. **Archaeologist Agent** - Stage 2 (root cause analysis)
7. **Logger** - Tracks what happens
8. **Test Scripts** - Run single agent or full pipeline

**File Structure:**
```
ai-team-mvp/
├── src/
│   ├── AgentRunner.ts          ✅ Core agent executor
│   ├── Orchestrator.ts         ✅ Multi-agent pipeline
│   ├── test.ts                 ✅ Single agent test
│   ├── test_pipeline.ts        ✅ Pipeline test
│   ├── integrations/
│   │   ├── GitHubClient.ts     ✅ GitHub API
│   │   └── GitClient.ts        ✅ Git operations
│   └── utils/
│       └── logger.ts           ✅ Logging
├── .claude/agents/
│   ├── detective.md            ✅ Detective agent config
│   └── archaeologist.md        ✅ Archaeologist agent config
├── package.json                ✅ Dependencies
├── tsconfig.json               ✅ TypeScript config
├── .env.example                ✅ Environment template
└── README.md                   ✅ Full documentation
```

---

## Run It Right Now (5 minutes)

### Step 1: Install Dependencies

```bash
cd C:\Users\hoope\ai-team-mvp
npm install
```

This installs:
- @anthropic-ai/sdk (Claude API)
- @octokit/rest (GitHub API)
- TypeScript & other tools

### Step 2: Get API Keys

**Anthropic API Key:**
1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Go to "API Keys"
4. Create new key
5. Copy it

**GitHub Token:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` (full control)
4. Generate token
5. Copy it

### Step 3: Configure Environment

```bash
# Copy template
cp .env.example .env

# Edit .env with your favorite editor
notepad .env
```

Fill in:
```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
GITHUB_TOKEN=ghp_your-token-here
GITHUB_OWNER=your-github-username
GITHUB_REPO=your-repo-name
```

### Step 4: Run Detective Agent

```bash
# Test on GitHub issue #1 (or any issue number from your repo)
npm run test -- 1
```

**What Happens:**
1. ✅ Fetches issue from GitHub
2. ✅ Sends to Detective agent
3. ✅ Claude analyzes and creates triage report
4. ✅ Saves report to `tasks/ISSUE-1/triage-report.md`
5. ✅ Shows results in terminal

**Expected Output:**
```
🔍 AI Team MVP - Detective Agent Test

📡 Initializing...
📥 Fetching issue #1...

✓ Issue fetched:
  Title: [Your issue title]
  URL: https://github.com/[owner]/[repo]/issues/1
  State: open

🕵️  Running Detective agent...

✓ Detective agent completed:
  Tokens used: ~3,000
  Duration: ~5 seconds
  Cost: ~$0.01

================================================================================
TRIAGE REPORT:
================================================================================
[Detailed analysis from Claude...]
================================================================================

💾 Triage report saved to: ./tasks/ISSUE-1/triage-report.md

✅ Test completed successfully!
```

### Step 5: Run the Full Pipeline (Detective → Archaeologist) 🔥 **NEW!**

```bash
# Run both agents in sequence
npm run test:pipeline -- 1
```

**What Happens:**
1. ✅ Creates task state tracking
2. ✅ Runs Detective (bug triage)
3. ✅ Runs Archaeologist (root cause analysis)
4. ✅ Passes Detective's output to Archaeologist
5. ✅ Saves both artifacts to `tasks/ISSUE-1/`
6. ✅ Shows statistics and cost estimate

**Expected Output:**
```
🔬 AI Team MVP - Pipeline Integration Test

Running: Detective → Archaeologist

================================================================================
STAGE 1: DETECTIVE (BUG TRIAGE)
================================================================================

✓ Detective completed:
  Tokens: 2,847
  Duration: 5.23s
  Artifact: ./tasks/ISSUE-1/triage-report.md

================================================================================
STAGE 2: ARCHAEOLOGIST (ROOT CAUSE ANALYSIS)
================================================================================

✓ Archaeologist completed:
  Tokens: 4,125
  Duration: 8.15s
  Artifact: ./tasks/ISSUE-1/root-cause-analysis.md

================================================================================
PIPELINE SUMMARY
================================================================================

📊 Statistics:
  Total tokens: 6,972
  Total duration: 13.38s
  Estimated cost: $0.0209

📁 Artifacts saved to: ./tasks/ISSUE-1/
  - triage-report.md
  - root-cause-analysis.md
  - state.json

✅ Integration test completed successfully!
```

---

## What to Do Next

### Option 1: Test on More Issues ✅ **RECOMMENDED**

Try different types of issues to see how Detective performs:

```bash
# Simple bug
npm run test -- 5

# Complex bug
npm run test -- 23

# Feature request
npm run test -- 42
```

Check the quality of triage reports in `tasks/ISSUE-*/triage-report.md`

### Option 2: Build Next Agent (Surgeon) 🚧

Now that Detective + Archaeologist work, let's build Stage 3:

**Surgeon does:**
- Reads Detective's triage + Archaeologist's root cause analysis
- Generates the actual code fix
- Creates implementation plan
- Considers edge cases and side effects

### Option 3: Create Remaining Agent Configs ⚡

The Orchestrator is already built! Now we just need the remaining 10 agent configs:
- Surgeon (Stage 3) - Implementation
- Critic (Stage 4) - Code review
- Validator (Stage 5) - Testing
- Skeptic (Stage 6) - QA
- Gatekeeper (Stage 7) - Staging deployment
- Advocate (Stage 8) - UAT
- Planner (Stage 9) - Production planning
- Commander (Stage 10) - Production deployment
- Guardian (Stage 11) - Monitoring
- Historian (Stage 12) - Documentation

---

## Troubleshooting

### "Cannot find module '@anthropic-ai/sdk'"

```bash
npm install
```

### "Missing environment variables"

```bash
# Make sure .env exists
ls .env

# If not, copy template
cp .env.example .env

# Edit with your keys
notepad .env
```

### "Failed to fetch GitHub issue"

Check:
- Issue number exists in your repo
- GITHUB_OWNER and GITHUB_REPO are correct
- GitHub token has `repo` permissions

### "Anthropic API error"

Check:
- API key is correct
- You have API credits (https://console.anthropic.com/)
- Key starts with `sk-ant-`

### Issues persist?

```bash
# Check detailed logs
cat logs/error.log
cat logs/combined.log
```

---

## Project Timeline

### ✅ Week 1: Detective Agent (DONE!)
- [x] Core infrastructure
- [x] Detective agent
- [x] GitHub integration
- [x] Test script

### 📋 Week 2: All 12 Agents
- [ ] Create 11 more agent configs
- [ ] Build Orchestrator
- [ ] Test full pipeline
- [ ] Add human approvals

### 📋 Week 3: Deploy MVP
- [ ] Error handling
- [ ] CLI tool
- [ ] Deploy to staging
- [ ] Documentation

---

## Success Criteria

**You'll know it's working when:**

1. ✅ Detective agent runs without errors
2. ✅ Triage report is accurate and detailed
3. ✅ Cost is ~$0.01 per issue (not $10+)
4. ✅ Takes ~5 seconds (not 5 minutes)
5. ✅ Saved to tasks/ directory
6. ✅ Logs show no errors

**Then you can confidently build the rest!**

---

## Cost Tracking

**So Far:**
- Testing Detective: ~$0.01-0.05 per test
- Build phase: ~$0.50-1.00 total

**Full MVP:**
- Detective: $0.01
- All 12 agents: ~$1.20 per bug fixed
- Monthly (fixing 100 bugs): ~$120

---

## Next Agent: Surgeon

After Detective + Archaeologist work, I'll build Surgeon which:

**Input:** Triage report from Detective + Root cause analysis from Archaeologist
**Does:**
- Generates the actual code fix
- Creates implementation plan with step-by-step changes
- Considers edge cases and potential side effects
- Writes or modifies code files

**Output:** Implementation plan + code changes

**New integrations needed:**
- File write operations
- Code formatting/linting
- Syntax validation

---

## Questions?

**"Can I test this on a private repo?"**
Yes! Just make sure your GitHub token has access to that repo.

**"What if I don't have a bug to test?"**
Create a simple test issue:
- Title: "Test bug for AI team"
- Description: "The homepage displays 'Helo World' instead of 'Hello World' (typo)"

**"How do I know if the triage is good?"**
Read `tasks/ISSUE-*/triage-report.md` and check:
- Did it correctly identify the severity?
- Did it identify affected components?
- Is the analysis reasonable?

**"Can I customize the Detective?"**
Yes! Edit `.claude/agents/detective.md` to change how it analyzes issues.

---

## Ready to Run?

```bash
# 1. Install
npm install

# 2. Configure .env
cp .env.example .env
notepad .env

# 3. Test
npm run test -- 1

# 4. Review report
cat tasks/ISSUE-1/triage-report.md
```

**Good luck! 🚀**
