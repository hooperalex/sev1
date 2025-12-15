# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Team MVP is an autonomous AI development pipeline that monitors GitHub issues and processes them through a 14-stage agent pipeline. Each stage has a specialized AI agent (Detective, Surgeon, Critic, etc.) that performs specific tasks like bug triage, code implementation, code review, testing, and deployment.

## Common Commands

```bash
# Build
npm run build                    # Compile TypeScript

# Development
npm run watch                    # Watch mode (auto-rebuild)
npm run dev                      # Run src/index.ts

# Automated Issue Monitoring (primary use)
npm run watch:issues             # Start continuous GitHub monitoring (polls every 30s, max 3 concurrent)

# Manual Pipeline Execution
npm run test:full -- <issue#>    # Run full 14-stage pipeline on single issue
npm run continue -- ISSUE-<#>    # Resume paused/failed pipeline from last stage
npm run cleanup -- ISSUE-<#>     # Clean up task artifacts and close PR

# Single Agent Testing
npm run test -- <issue#>         # Run Detective agent only
npm run test:pipeline -- <issue#> # Run Detective → Archaeologist
npm run test:github              # Test GitHub integration
npm run test:vercel              # Test Vercel deployment

# Management
npm run approve-closure          # Approve issue closure
npm run override                 # Override pipeline termination
```

## Architecture

### 14-Stage Pipeline

```
Issue → Intake(0) → Detective(1) → Archaeologist(2) → Surgeon(3) → Critic(4)
      → Validator(5) → Skeptic(6) → Gatekeeper(7) → Advocate(8) → Planner(9)
      → Commander(10) → Guardian(11) → Historian(12) → Archivist(13) → PR
```

| Stage | Agent | Purpose |
|-------|-------|---------|
| 0 | Intake | Validates requirements, classifies issue type/priority |
| 1 | Detective | Bug triage, severity classification, enhances vague requirements |
| 2 | Archaeologist | Root cause analysis using git blame/log |
| 3 | Surgeon | **Implements code** using file tools (read_file, write_file) |
| 4 | Critic | Code review |
| 5 | Validator | Unit testing |
| 6 | Skeptic | QA/black box testing |
| 7 | Gatekeeper | Staging deployment (Vercel) |
| 8 | Advocate | User acceptance testing |
| 9 | Planner | Production deployment planning |
| 10 | Commander | Production deployment execution |
| 11 | Guardian | Post-deployment monitoring |
| 12 | Historian | Retrospective documentation |
| 13 | Archivist | Wiki knowledge base updates |

### Core Components

- **`src/Orchestrator.ts`** - Pipeline orchestration, manages TaskState, runs agents sequentially, handles Git/PR/deployments
- **`src/AgentRunner.ts`** - Executes individual agents via Claude API with tool support
- **`src/issue_watcher.ts`** - Continuous GitHub polling, concurrent task processing, state persistence
- **`src/integrations/`** - External service clients (GitHub, Git, Vercel, Wiki, Memory, Discord)
- **`src/tools/ToolExecutor.ts`** - Routes and executes tool calls from agents (file operations, todos)
- **`.claude/agents/*.md`** - Agent configuration files (role, mission, output format)

### State Management

- **Task state**: `./tasks/ISSUE-{number}/state.json` - Full pipeline state, allows resume from any stage
- **Watcher state**: `./tasks/.watcher-state.json` - Tracks processed issues, in-memory during runtime
- **Artifacts**: `./tasks/ISSUE-{number}/*.md` - Agent outputs (triage-report.md, root-cause-analysis.md, etc.)

### Agent Tool Usage

The Surgeon agent (and optionally Debugger) can use file tools:
- `read_file(path)` - Read file contents
- `write_file(path, content)` - Write complete file
- `list_directory(path)` - List directory contents
- `file_exists(path)` - Check file existence

All agents can use todo tools for task tracking within their stage.

## Key Patterns

1. **Sequential context passing**: Each agent receives the previous agent's output as context
2. **Graceful degradation**: Optional integrations (Wiki, Vercel, Discord) fail silently if unconfigured
3. **State persistence**: Pipeline can pause/resume at any stage via state.json
4. **Memory enrichment**: MemoryClient injects solutions from similar past issues
5. **Wiki enrichment**: WikiClient provides relevant documentation context

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` - Claude API key
- `GITHUB_TOKEN` - GitHub personal access token (needs `repo` scope)
- `GITHUB_OWNER` - Repository owner/username
- `GITHUB_REPO` - Repository name

Optional:
- `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID` - For deployment stages
- `WIKI_REPO_URL`, `WIKI_LOCAL_PATH` - For wiki integration
- `ENABLE_AUTO_DECOMPOSITION` - Break complex issues into sub-tasks
- `GIT_USER_NAME`, `GIT_USER_EMAIL` - Git commit identity

## Debugging

- Logs: `./logs/combined.log` (all), `./logs/error.log` (errors only)
- Task artifacts: `./tasks/ISSUE-{number}/`
- Watcher state: `./tasks/.watcher-state.json`

## Windows-Specific Notes

- Avoid creating files named `nul`, `con`, `aux`, etc. (Windows reserved names cause git errors)
- Git lock files (`.git/index.lock`) may need manual deletion if processes crash
- Use PowerShell for file operations involving reserved names: `Remove-Item -Force`
