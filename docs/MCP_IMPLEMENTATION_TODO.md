# MCP Server Implementation Todo List

> Priority-ordered list of MCP servers to integrate into the AI Agent Pipeline

## High Priority (Core Functionality)

### 1. GitHub MCP Server
- [ ] Install `@modelcontextprotocol/server-github`
- [ ] Configure with GITHUB_TOKEN
- [ ] Expose tools to agents:
  - `github_create_issue` - Create follow-up issues
  - `github_create_pr` - Create pull requests
  - `github_get_issue` - Read issue details
  - `github_list_issues` - List repo issues
  - `github_add_comment` - Comment on issues/PRs
  - `github_get_workflow_runs` - Check CI/CD status
  - `github_get_workflow_logs` - Debug failed workflows
- **Source**: [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)

### 2. Brave Search MCP Server
- [ ] Get Brave Search API key (2,000 free queries/month)
- [ ] Install `@modelcontextprotocol/server-brave-search`
- [ ] Expose tools to agents:
  - `brave_web_search` - Search the web
  - `brave_local_search` - Local business search
  - `brave_news_search` - News search
  - `brave_image_search` - Image search
- **Source**: [Brave Search MCP](https://brave.com/search/api/guides/use-with-claude-desktop-with-mcp/)

### 3. Context7 MCP Server (Up-to-date Docs)
- [ ] Install `@upstash/context7-mcp`
- [ ] No API key needed
- [ ] Expose tools to agents:
  - `resolve-library-id` - Find library in Context7
  - `get-library-docs` - Get current docs for any library
- **Why**: Agents get latest documentation instead of outdated training data
- **Source**: [upstash/context7](https://github.com/upstash/context7)

---

## Medium Priority (Enhanced Capabilities)

### 4. Supabase MCP Server
- [ ] Install `@supabase/mcp-server-supabase`
- [ ] Configure with Supabase project URL and anon key
- [ ] Expose tools to agents:
  - `supabase_query` - Execute SQL queries
  - `supabase_insert` - Insert data
  - `supabase_update` - Update data
  - `supabase_create_table` - Create tables
  - `supabase_list_tables` - List all tables
  - `supabase_get_schema` - Get table schema
- **Use Case**: Persistent memory, storing past fixes, learning from history
- **Source**: [supabase-community/supabase-mcp](https://github.com/supabase-community/supabase-mcp)

### 5. Vercel MCP Server
- [ ] Install Vercel MCP server (community)
- [ ] Configure with VERCEL_TOKEN
- [ ] Expose tools to agents:
  - `vercel_deploy` - Trigger deployment
  - `vercel_get_deployments` - List deployments
  - `vercel_get_deployment_status` - Check deployment status
  - `vercel_get_logs` - Get deployment logs
  - `vercel_rollback` - Rollback to previous deployment
- **Source**: [Vercel MCP on awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)

### 6. Filesystem MCP Server (Enhanced)
- [ ] Install `@modelcontextprotocol/server-filesystem`
- [ ] Upgrade from current basic file tools
- [ ] Additional tools:
  - `search_files` - Grep/search in files
  - `get_file_info` - File metadata
  - `move_file` - Move/rename files
  - `directory_tree` - Full tree view

---

## Lower Priority (Nice to Have)

### 7. Shell/Terminal MCP Server
- [ ] Install shell execution MCP
- [ ] Security: Sandbox with allowed commands only
- [ ] Expose tools:
  - `run_command` - Execute shell commands
  - `run_npm` - Run npm scripts
  - `run_git` - Git operations
- **Caution**: Needs strict sandboxing

### 8. Memory/Knowledge MCP Server
- [ ] Install `@modelcontextprotocol/server-memory`
- [ ] Configure persistent storage
- [ ] Expose tools:
  - `store_memory` - Save information
  - `recall_memory` - Retrieve information
  - `search_memory` - Semantic search
- **Use Case**: Cross-issue learning, remembering past fixes

### 9. Puppeteer/Browser MCP Server
- [ ] Install browser automation MCP
- [ ] Expose tools:
  - `navigate` - Go to URL
  - `screenshot` - Take screenshot
  - `click` - Click element
  - `type` - Type text
- **Use Case**: Testing deployed sites, visual verification

### 10. Slack/Discord Notification MCP
- [ ] Install notification MCP
- [ ] Expose tools:
  - `send_notification` - Alert on completion/failure
  - `send_summary` - Daily digest

---

## Agent Todo List Feature

### Add TodoList Tool for Agents
- [ ] Create `todo_tools.ts` with:
  - `todo_add` - Add task to list
  - `todo_complete` - Mark task done
  - `todo_list` - Show current tasks
  - `todo_update` - Update task status
- [ ] Store todos in agent context
- [ ] Pass todos between pipeline stages
- [ ] Display todos in GitHub comments

---

## Implementation Plan

### Phase 1: Core Search & Docs
1. Brave Search MCP (web search capability)
2. Context7 MCP (up-to-date documentation)
3. Agent TodoList tool

### Phase 2: External Services
4. GitHub MCP (full GitHub integration)
5. Supabase MCP (persistent memory)
6. Vercel MCP (deployment control)

### Phase 3: Advanced
7. Memory MCP (semantic knowledge)
8. Shell MCP (command execution)
9. Browser MCP (visual testing)

---

## Resources

- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers)
- [Supabase MCP Docs](https://supabase.com/docs/guides/getting-started/mcp)
- [Context7 by Upstash](https://github.com/upstash/context7)
- [Brave Search API](https://brave.com/search/api/)
- [MCP Server Directory (6800+)](https://www.pulsemcp.com/servers)

---

## Notes

- MCP servers run as separate processes and communicate via stdio/SSE
- Each server needs to be registered in the tool executor
- Consider rate limits (Brave: 1 query/sec free tier)
- Security: Some tools (shell, filesystem) need sandboxing
