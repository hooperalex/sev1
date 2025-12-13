# AI Team MVP - Project Context

## Quick Start
- **Session state**: See `knowledge/SESSION_STATE.md` for current progress
- **Test RAG**: `npx ts-node src/scripts/test_rag.ts`
- **Reindex codebase**: `npx ts-node src/scripts/reindex.ts`

## Project Overview
Automated bug-fixing pipeline using AI agents. Monitors GitHub issues, analyzes bugs, implements fixes, and creates PRs.

## Key Architecture
- **Pipeline**: 14-stage orchestrated workflow (`src/pipeline/`)
- **Agents**: Triage + Surgeon agents (`.claude/agents/`)
- **Tools**: File ops, Todo, Supabase, RAG search (`src/tools/`)
- **Storage**: Supabase (Postgres + pgvector for embeddings)

## Environment
- Use `dotenv.config({ override: true })` - there's a stale system env var
- SSL disabled for Supabase dev: `NODE_TLS_REJECT_UNAUTHORIZED=0`

## MCP Servers Available
- sequential-thinking, memory, filesystem, mcp-installer
- playwright, fetch, brave-search, context7
- github, supabase (need `/mcp` auth)

## Knowledge Base
`knowledge/` folder is Obsidian-compatible:
- `runbooks/` - Troubleshooting procedures
- `post-mortems/` - Bug fix documentation
- `architecture/` - System design docs
- `learnings/` - Patterns and gotchas
