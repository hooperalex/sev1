-- Supabase Migration: AI Agent Pipeline Tables
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/luoraenouucmaysfolcg/sql

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create helper function for raw SQL execution (used by agents)
CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  EXECUTE sql;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Agent Todos Table (persistent task tracking)
CREATE TABLE IF NOT EXISTS agent_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  issue_number INTEGER,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  agent_name TEXT,
  stage_index INTEGER,
  blocked_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Agent Memories Table (learnings across issues)
CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  issue_number INTEGER,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('success', 'failure', 'learning', 'pattern')),
  content TEXT NOT NULL,
  context JSONB,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issue History Table (track past resolutions for learning)
CREATE TABLE IF NOT EXISTS issue_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number INTEGER NOT NULL,
  issue_title TEXT,
  root_cause TEXT,
  solution TEXT,
  files_changed TEXT[],
  success BOOLEAN DEFAULT false,
  duration_ms INTEGER,
  tokens_used INTEGER,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Code Embeddings Table (semantic code search)
CREATE TABLE IF NOT EXISTS code_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  chunk_index INTEGER DEFAULT 0,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(file_path, chunk_index)
);

-- Project Memory Table (key facts about the project)
CREATE TABLE IF NOT EXISTS project_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_todos_task_id ON agent_todos(task_id);
CREATE INDEX IF NOT EXISTS idx_todos_issue_number ON agent_todos(issue_number);
CREATE INDEX IF NOT EXISTS idx_todos_status ON agent_todos(status);
CREATE INDEX IF NOT EXISTS idx_memories_agent ON agent_memories(agent_name);
CREATE INDEX IF NOT EXISTS idx_memories_type ON agent_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_history_issue ON issue_history(issue_number);
CREATE INDEX IF NOT EXISTS idx_history_success ON issue_history(success);
CREATE INDEX IF NOT EXISTS idx_code_file ON code_embeddings(file_path);
CREATE INDEX IF NOT EXISTS idx_project_category ON project_memory(category);

-- Vector similarity search indexes (for RAG)
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON agent_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_history_embedding ON issue_history
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_code_embedding ON code_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Function to search similar memories by embedding
CREATE OR REPLACE FUNCTION search_similar_memories(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  agent_name TEXT,
  memory_type TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.agent_name,
    m.memory_type,
    m.content,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM agent_memories m
  WHERE m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to search similar code
CREATE OR REPLACE FUNCTION search_similar_code(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  file_path TEXT,
  chunk_index INTEGER,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.file_path,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM code_embeddings c
  WHERE c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant permissions (adjust as needed)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Done!
SELECT 'Migration completed successfully!' AS status;
