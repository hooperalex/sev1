# System Architecture Overview

## High-Level Flow

```
GitHub Issue → Pipeline → Analysis → Fix → PR → Review → Merge
     ↓            ↓          ↓        ↓     ↓
  Webhook    Orchestrator  Triage  Surgeon  GitHub
                              ↓
                        RAG Search
                              ↓
                        Knowledge Base
```

## Components

### 1. Pipeline Orchestrator
- **Location**: `src/pipeline/`
- **Purpose**: Coordinates 14-stage bug fixing flow
- **Key file**: `PipelineOrchestrator.ts`

### 2. Agents
- **Triage Agent**: Analyzes issues, determines severity
- **Surgeon Agent**: Implements code fixes
- **Location**: `.claude/agents/`

### 3. Tools
- **File Operations**: Read, write, list files
- **Todo Management**: Track task progress
- **RAG Search**: Semantic code search
- **Supabase**: Persistent storage
- **Location**: `src/tools/`

### 4. Integrations
- **GitHub**: Issue monitoring, PR creation
- **Supabase**: Database, vector storage
- **OpenAI**: Embeddings for RAG

## Data Flow

1. **Issue Created** → GitHub webhook triggers pipeline
2. **Triage** → Agent analyzes issue, searches similar bugs
3. **Planning** → Agent creates fix strategy
4. **Implementation** → Surgeon agent writes code
5. **Validation** → Tests run, code reviewed
6. **Deployment** → PR created, merged

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Supabase over Firebase | Better Postgres support, pgvector for embeddings |
| OpenAI embeddings | Best quality for code similarity |
| 14-stage pipeline | Granular control, better error recovery |

#architecture #overview
