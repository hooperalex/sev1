# MCP Server Implementation Todo List

> Priority-ordered list of MCP servers to integrate into the AI Agent Pipeline

---

## NEW: Memory & Intelligence Architecture

### Three Layers of Memory

```
┌─────────────────────────────────────────────────────────────┐
│                    MEMORY ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │  PROJECT VECTOR  │  │  PROMPT MEMORY   │                 │
│  │      STORE       │  │  (Key Facts)     │                 │
│  │                  │  │                  │                 │
│  │ • Full codebase  │  │ • "Uses Tailwind"│                 │
│  │ • Semantic search│  │ • "Auth=Supabase"│                 │
│  │ • Find similar   │  │ • "No jQuery"    │                 │
│  │   code patterns  │  │ • Project rules  │                 │
│  └────────┬─────────┘  └────────┬─────────┘                 │
│           │                     │                            │
│           ▼                     ▼                            │
│  ┌──────────────────────────────────────────┐               │
│  │         AGENT-SPECIFIC RAG               │               │
│  │                                          │               │
│  │  Surgeon: past code changes, patterns    │               │
│  │  Debugger: past errors, solutions        │               │
│  │  Detective: past investigations          │               │
│  │  Critic: past review feedback            │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1. Project Vector Store (Codebase RAG)
- [ ] Set up vector database (Supabase pgvector or Pinecone)
- [ ] Create embedding pipeline for all source files
- [ ] Auto-update embeddings on file changes
- [ ] Expose tools:
  - `vector_search_code` - "Find code similar to X"
  - `vector_search_issues` - "Find similar past issues"
  - `vector_find_usages` - "Where is this pattern used?"
  - `vector_find_related` - "What files relate to X?"
- **Use Case**: Semantic code search, finding similar bugs

### 2. Prompt-Based Memory (Project Facts)
- [ ] Create `project_memory.json` for key facts
- [ ] Auto-inject into all agent prompts
- [ ] Expose tools:
  - `memory_remember` - Store a project fact
  - `memory_forget` - Remove outdated fact
  - `memory_list` - Show all remembered facts
- **Examples**:
  ```json
  {
    "styling": "Uses Tailwind CSS, not CSS modules",
    "auth": "Supabase Auth, not custom JWT",
    "testing": "Vitest for unit tests, Playwright for E2E",
    "forbidden": ["jQuery", "moment.js", "var keyword"],
    "patterns": ["React Server Components preferred", "Zod for validation"]
  }
  ```

### 3. Agent-Specific RAG
- [ ] Each agent gets its own vector namespace
- [ ] Store agent outputs for learning
- [ ] Expose tools:
  - `agent_learn` - Store successful outcome
  - `agent_recall` - Find similar past work
  - `agent_forget` - Remove bad examples
- **Per-Agent Knowledge**:
  - **Surgeon**: Successful code patterns, refactoring examples
  - **Debugger**: Error→Solution mappings, common fixes
  - **Detective**: Investigation paths, root cause patterns
  - **Critic**: Review feedback, quality standards

---

## NEW: Phone-a-Friend (AI Consultant Network)

### The Concept

```
┌─────────────────────────────────────────────────────────────┐
│                  AI CONSULTANT NETWORK                       │
│                  "Phone-a-Friend" System                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   CLAUDE    │    │   GPT-4o    │    │   GEMINI    │     │
│  │  (Surgeon)  │    │ (Reviewer)  │    │ (Analyzer)  │     │
│  │             │    │             │    │             │     │
│  │  CAN WRITE  │    │  READ-ONLY  │    │  READ-ONLY  │     │
│  │    CODE     │    │  CONSULTANT │    │  CONSULTANT │     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
│         │                  │                  │             │
│         │    "Does this    │   "What files    │             │
│         │     fix look     │    will this     │             │
│         │     correct?"    │     break?"      │             │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              SHARED CONTEXT (Read-Only)              │   │
│  │  • Current issue details                             │   │
│  │  • Proposed code changes (diff)                      │   │
│  │  • Relevant file contents                            │   │
│  │  • Project memory/facts                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4. OpenAI Consultant (GPT-4o)
- [ ] Add OpenAI API integration
- [ ] **READ-ONLY** - Cannot modify files
- [ ] Expose tools:
  - `ask_gpt_review` - "Review this code change"
  - `ask_gpt_security` - "Check for security issues"
  - `ask_gpt_architecture` - "Is this the right approach?"
  - `ask_gpt_edge_cases` - "What edge cases am I missing?"
- **Best For**:
  - Code review before commit
  - Validating fix correctness
  - Security vulnerability scan
  - Architecture decisions
- **Key Constraint**: Receives code as context, returns analysis only

### 5. Gemini Consultant (Gemini 1.5 Pro)
- [ ] Add Google AI API integration
- [ ] **READ-ONLY** - Cannot modify files
- [ ] Leverage 1M+ token context window
- [ ] Expose tools:
  - `ask_gemini_impact` - "What will this change break?"
  - `ask_gemini_codebase` - "Analyze entire codebase for X"
  - `ask_gemini_dependencies` - "Trace all usages of this function"
  - `ask_gemini_patterns` - "Find similar patterns across codebase"
- **Best For**:
  - Cross-file impact analysis (can see WHOLE codebase)
  - Finding all places a change affects
  - Dependency tracing
  - Large-scale pattern matching
- **Key Constraint**: Receives entire codebase, returns analysis only

### When to Phone-a-Friend

| Situation | Consultant | Why |
|-----------|------------|-----|
| Before committing code | GPT-4o | Second opinion on fix |
| Security-sensitive change | GPT-4o | Security expertise |
| Change affects many files | Gemini | 1M context sees all |
| Unsure about architecture | Both | Different perspectives |
| Complex refactoring | Gemini | Trace all dependencies |
| Edge case validation | GPT-4o | Strong reasoning |

### Consultant Integration Points

```typescript
// In Surgeon agent, before finalizing:
const proposedChanges = await surgeon.generateFix();

// Phone-a-friend for review
const gptReview = await askGPT({
  role: "code_reviewer",
  context: proposedChanges,
  question: "Is this fix correct? Any issues?"
});

// Phone Gemini for impact analysis
const geminiImpact = await askGemini({
  role: "impact_analyzer",
  context: entireCodebase,
  question: "What other files will this change affect?"
});

// Only proceed if consultants approve
if (gptReview.approved && geminiImpact.safeToMerge) {
  await surgeon.applyChanges();
}
```

---

## High Priority (Core Functionality)

### 6. GitHub MCP Server
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

### 7. Brave Search MCP Server
- [ ] Get Brave Search API key (2,000 free queries/month)
- [ ] Install `@modelcontextprotocol/server-brave-search`
- [ ] Expose tools to agents:
  - `brave_web_search` - Search the web
  - `brave_local_search` - Local business search
  - `brave_news_search` - News search
- **Source**: [Brave Search MCP](https://brave.com/search/api/)

### 8. Context7 MCP Server (Up-to-date Docs)
- [ ] Install `@upstash/context7-mcp`
- [ ] No API key needed
- [ ] Expose tools to agents:
  - `resolve-library-id` - Find library in Context7
  - `get-library-docs` - Get current docs for any library
- **Source**: [upstash/context7](https://github.com/upstash/context7)

---

## Medium Priority (Enhanced Capabilities)

### 9. Supabase MCP Server
- [ ] Install `@supabase/mcp-server-supabase`
- [ ] Configure with Supabase project URL and anon key
- [ ] Use for:
  - Vector store (pgvector)
  - Agent memory tables
  - Issue history
  - Learning database
- **Source**: [supabase-community/supabase-mcp](https://github.com/supabase-community/supabase-mcp)

### 10. Vercel MCP Server
- [ ] Install Vercel MCP server (community)
- [ ] Configure with VERCEL_TOKEN
- [ ] Expose tools:
  - `vercel_deploy` - Trigger deployment
  - `vercel_get_status` - Check deployment status
  - `vercel_get_logs` - Get deployment logs
  - `vercel_rollback` - Rollback to previous
- **Source**: [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)

---

## Agent Todo List Feature

### 11. Add TodoList Tool for Agents
- [ ] Create `todo_tools.ts` with:
  - `todo_add` - Add task to list
  - `todo_complete` - Mark task done
  - `todo_list` - Show current tasks
  - `todo_update` - Update task status
- [ ] Store todos in agent context
- [ ] Pass todos between pipeline stages
- [ ] Display todos in GitHub comments

---

## Implementation Phases

### Phase 1: Memory Foundation
1. Prompt-based memory (project facts JSON)
2. Agent TodoList tool
3. Basic vector store setup (Supabase pgvector)

### Phase 2: Search & Docs
4. Brave Search MCP
5. Context7 MCP
6. Codebase vector embeddings

### Phase 3: Phone-a-Friend
7. OpenAI consultant integration (GPT-4o)
8. Gemini consultant integration (1.5 Pro)
9. Consultant workflow (review before commit)

### Phase 4: External Services
10. GitHub MCP
11. Vercel MCP
12. Agent-specific RAG namespaces

### Phase 5: Advanced
13. Cross-issue learning
14. Automatic pattern extraction
15. Self-improving prompts

---

## Database Schema (Supabase)

```sql
-- Project memory/facts
CREATE TABLE project_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent-specific learning
CREATE TABLE agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  issue_number INTEGER,
  input_summary TEXT,
  output_summary TEXT,
  success BOOLEAN,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Codebase embeddings
CREATE TABLE code_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  chunk_index INTEGER,
  content TEXT,
  embedding VECTOR(1536),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issue history for learning
CREATE TABLE issue_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number INTEGER NOT NULL,
  issue_title TEXT,
  root_cause TEXT,
  solution TEXT,
  files_changed TEXT[],
  success BOOLEAN,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Security Notes

### Read-Only Consultants (GPT/Gemini)
- **NEVER** give write access to external models
- Pass code as context string only
- No tool access, no file paths
- Receive analysis, not actions
- Log all consultant queries for audit

### Rate Limits
- Brave Search: 1 query/sec (free tier)
- OpenAI: Monitor token usage
- Gemini: 1M context but rate limited
- Implement caching for repeated queries

---

## Resources

- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers)
- [Supabase pgvector](https://supabase.com/docs/guides/ai)
- [OpenAI API](https://platform.openai.com/docs)
- [Google AI (Gemini)](https://ai.google.dev/)
- [Context7 by Upstash](https://github.com/upstash/context7)
