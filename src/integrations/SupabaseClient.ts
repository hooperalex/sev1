/**
 * Supabase Client: Database, Vector Store, and Memory for AI Agents
 *
 * Provides agents with:
 * - Todo persistence across pipeline runs
 * - Agent memory storage and retrieval
 * - Vector embeddings for semantic search
 * - Issue history tracking for learning
 * - Direct SQL execution for full database control
 */

import { createClient, SupabaseClient as SupabaseClientType } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

export interface TodoRecord {
  id?: string;
  task_id: string;
  issue_number?: number;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high';
  agent_name?: string;
  stage_index?: number;
  blocked_reason?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
}

export interface AgentMemory {
  id?: string;
  agent_name: string;
  issue_number?: number;
  memory_type: 'success' | 'failure' | 'learning' | 'pattern';
  content: string;
  context?: Record<string, any>;
  embedding?: number[];
  created_at?: string;
}

export interface IssueHistory {
  id?: string;
  issue_number: number;
  issue_title: string;
  root_cause?: string;
  solution?: string;
  files_changed?: string[];
  success: boolean;
  duration_ms?: number;
  tokens_used?: number;
  embedding?: number[];
  created_at?: string;
}

export interface CodeEmbedding {
  id?: string;
  file_path: string;
  chunk_index: number;
  content: string;
  embedding: number[];
  updated_at?: string;
}

export class SupabaseIntegration {
  private client: SupabaseClientType;
  private pgPool: Pool | null = null;
  private initialized: boolean = false;

  constructor() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      logger.warn('Supabase credentials not found - database features disabled');
      this.client = null as any;
      return;
    }

    this.client = createClient(url, key);

    // Initialize direct Postgres connection for DDL operations
    const pgUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
    if (pgUrl) {
      // Parse connection string and rebuild with proper SSL
      this.pgPool = new Pool({
        connectionString: pgUrl,
        ssl: process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: true }
          : { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30000
      });
      logger.info('Direct Postgres connection initialized');
    }

    logger.info('SupabaseIntegration initialized', { url, hasDirectPg: !!this.pgPool });
  }

  /**
   * Check if direct Postgres access is available
   */
  hasDirectAccess(): boolean {
    return this.pgPool !== null;
  }

  /**
   * Check if Supabase is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Initialize database schema (run migrations)
   */
  async initializeSchema(): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      // Check if tables exist by querying them
      const { error: todosError } = await this.client
        .from('agent_todos')
        .select('id')
        .limit(1);

      if (todosError && todosError.code === '42P01') {
        // Table doesn't exist - need to run migration
        logger.info('Tables not found - running schema migration');
        return await this.runMigration();
      }

      this.initialized = true;
      logger.info('Supabase schema already initialized');
      return { success: true };

    } catch (error: any) {
      logger.error('Schema initialization failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Run database migration to create tables using direct Postgres connection
   */
  async runMigration(): Promise<{ success: boolean; error?: string }> {
    if (!this.pgPool) {
      return { success: false, error: 'Direct Postgres connection not available. Add POSTGRES_URL to .env' };
    }

    const migrations = [
      // Enable pgvector extension
      `CREATE EXTENSION IF NOT EXISTS vector;`,

      // Agent Todos Table
      `CREATE TABLE IF NOT EXISTS agent_todos (
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
      );`,

      // Agent Memories Table
      `CREATE TABLE IF NOT EXISTS agent_memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_name TEXT NOT NULL,
        issue_number INTEGER,
        memory_type TEXT NOT NULL CHECK (memory_type IN ('success', 'failure', 'learning', 'pattern')),
        content TEXT NOT NULL,
        context JSONB,
        embedding VECTOR(1536),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`,

      // Issue History Table
      `CREATE TABLE IF NOT EXISTS issue_history (
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
      );`,

      // Code Embeddings Table
      `CREATE TABLE IF NOT EXISTS code_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_path TEXT NOT NULL,
        chunk_index INTEGER DEFAULT 0,
        content TEXT NOT NULL,
        embedding VECTOR(1536),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(file_path, chunk_index)
      );`,

      // Project Memory (Key Facts)
      `CREATE TABLE IF NOT EXISTS project_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        category TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`,

      // Indexes
      `CREATE INDEX IF NOT EXISTS idx_todos_task_id ON agent_todos(task_id);`,
      `CREATE INDEX IF NOT EXISTS idx_todos_issue_number ON agent_todos(issue_number);`,
      `CREATE INDEX IF NOT EXISTS idx_todos_status ON agent_todos(status);`,
      `CREATE INDEX IF NOT EXISTS idx_memories_agent ON agent_memories(agent_name);`,
      `CREATE INDEX IF NOT EXISTS idx_memories_type ON agent_memories(memory_type);`,
      `CREATE INDEX IF NOT EXISTS idx_history_issue ON issue_history(issue_number);`,
      `CREATE INDEX IF NOT EXISTS idx_history_success ON issue_history(success);`,
      `CREATE INDEX IF NOT EXISTS idx_code_file ON code_embeddings(file_path);`,
      `CREATE INDEX IF NOT EXISTS idx_project_category ON project_memory(category);`
    ];

    const client = await this.pgPool.connect();
    try {
      for (const sql of migrations) {
        await client.query(sql);
      }
      this.initialized = true;
      logger.info('Database migration completed successfully');
      return { success: true };
    } catch (error: any) {
      logger.error('Migration failed', { error: error.message });
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  }

  /**
   * Execute raw SQL directly on Postgres (for DDL and complex queries)
   */
  async executeDirect(sql: string): Promise<{ success: boolean; rows?: any[]; error?: string }> {
    if (!this.pgPool) {
      return { success: false, error: 'Direct Postgres connection not available' };
    }

    // Security: Block dangerous operations
    const dangerousPatterns = [
      /drop\s+database/i,
      /drop\s+schema\s+public/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        logger.warn('Blocked dangerous SQL', { sql: sql.substring(0, 100) });
        return { success: false, error: 'This SQL operation is not allowed for safety reasons' };
      }
    }

    const client = await this.pgPool.connect();
    try {
      const result = await client.query(sql);
      logger.info('Direct SQL executed', { rowCount: result.rowCount });
      return { success: true, rows: result.rows };
    } catch (error: any) {
      logger.error('Direct SQL failed', { error: error.message });
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  }

  // ==================== TODO OPERATIONS ====================

  /**
   * Save todos to database
   */
  async saveTodos(todos: TodoRecord[]): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const { error } = await this.client
        .from('agent_todos')
        .upsert(todos.map(t => ({
          ...t,
          updated_at: new Date().toISOString()
        })), { onConflict: 'id' });

      if (error) throw error;

      logger.info('Todos saved to database', { count: todos.length });
      return { success: true };

    } catch (error: any) {
      logger.error('Failed to save todos', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Load todos for a task
   */
  async loadTodos(taskId: string): Promise<{ success: boolean; todos?: TodoRecord[]; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const { data, error } = await this.client
        .from('agent_todos')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      logger.info('Todos loaded from database', { taskId, count: data?.length || 0 });
      return { success: true, todos: data as TodoRecord[] };

    } catch (error: any) {
      logger.error('Failed to load todos', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  // ==================== MEMORY OPERATIONS ====================

  /**
   * Store an agent memory
   */
  async storeMemory(memory: AgentMemory): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const { error } = await this.client
        .from('agent_memories')
        .insert(memory);

      if (error) throw error;

      logger.info('Memory stored', { agent: memory.agent_name, type: memory.memory_type });
      return { success: true };

    } catch (error: any) {
      logger.error('Failed to store memory', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Recall memories for an agent
   */
  async recallMemories(
    agentName: string,
    options?: { memoryType?: string; limit?: number }
  ): Promise<{ success: boolean; memories?: AgentMemory[]; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      let query = this.client
        .from('agent_memories')
        .select('*')
        .eq('agent_name', agentName)
        .order('created_at', { ascending: false })
        .limit(options?.limit || 10);

      if (options?.memoryType) {
        query = query.eq('memory_type', options.memoryType);
      }

      const { data, error } = await query;

      if (error) throw error;

      logger.info('Memories recalled', { agent: agentName, count: data?.length || 0 });
      return { success: true, memories: data as AgentMemory[] };

    } catch (error: any) {
      logger.error('Failed to recall memories', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  // ==================== ISSUE HISTORY ====================

  /**
   * Record issue resolution
   */
  async recordIssueHistory(history: IssueHistory): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const { error } = await this.client
        .from('issue_history')
        .insert(history);

      if (error) throw error;

      logger.info('Issue history recorded', { issue: history.issue_number, success: history.success });
      return { success: true };

    } catch (error: any) {
      logger.error('Failed to record issue history', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Find similar past issues
   */
  async findSimilarIssues(
    issueNumber: number,
    limit: number = 5
  ): Promise<{ success: boolean; issues?: IssueHistory[]; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      // For now, just get recent successful issues
      // TODO: Add vector similarity search when embeddings are set up
      const { data, error } = await this.client
        .from('issue_history')
        .select('*')
        .eq('success', true)
        .neq('issue_number', issueNumber)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return { success: true, issues: data as IssueHistory[] };

    } catch (error: any) {
      logger.error('Failed to find similar issues', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  // ==================== PROJECT MEMORY ====================

  /**
   * Remember a project fact
   */
  async rememberFact(key: string, value: string, category?: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const { error } = await this.client
        .from('project_memory')
        .upsert({
          key,
          value,
          category,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

      if (error) throw error;

      logger.info('Project fact remembered', { key, category });
      return { success: true };

    } catch (error: any) {
      logger.error('Failed to remember fact', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Recall all project facts
   */
  async recallFacts(category?: string): Promise<{ success: boolean; facts?: Record<string, string>; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      let query = this.client.from('project_memory').select('*');

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) throw error;

      const facts: Record<string, string> = {};
      (data || []).forEach((row: any) => {
        facts[row.key] = row.value;
      });

      logger.info('Project facts recalled', { count: Object.keys(facts).length });
      return { success: true, facts };

    } catch (error: any) {
      logger.error('Failed to recall facts', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  // ==================== RAW SQL (for agents) ====================

  /**
   * Execute raw SQL query (for agent use)
   */
  async executeSQL(sql: string): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Supabase not configured' };
    }

    // Security: Block dangerous operations
    const dangerousPatterns = [
      /drop\s+database/i,
      /drop\s+schema/i,
      /truncate/i,
      /delete\s+from\s+(?!agent_)/i, // Only allow delete from agent_ tables
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        logger.warn('Blocked dangerous SQL', { sql: sql.substring(0, 100) });
        return { success: false, error: 'This SQL operation is not allowed for safety reasons' };
      }
    }

    try {
      const { data, error } = await this.client.rpc('exec_sql', { sql });

      if (error) throw error;

      logger.info('SQL executed', { sqlPreview: sql.substring(0, 50) });
      return { success: true, data };

    } catch (error: any) {
      logger.error('SQL execution failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * List all tables in the database
   */
  async listTables(): Promise<{ success: boolean; tables?: string[]; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      // Try to detect our tables by querying them directly
      const ourTables = ['agent_todos', 'agent_memories', 'issue_history', 'code_embeddings', 'project_memory'];
      const existingTables: string[] = [];

      for (const table of ourTables) {
        const { error } = await this.client.from(table).select('id').limit(1);
        if (!error || error.code !== '42P01') {
          existingTables.push(table);
        }
      }

      if (existingTables.length > 0) {
        return { success: true, tables: existingTables };
      }

      // Fallback: try RPC if no tables found
      const { data, error } = await this.client.rpc('exec_sql', {
        sql: "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
      });

      if (error) throw error;
      return { success: true, tables: (data || []).map((r: any) => r.tablename) };

    } catch (error: any) {
      logger.error('Failed to list tables', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if database is set up correctly
   */
  async checkSetup(): Promise<{ ready: boolean; missingTables: string[]; schemaRefreshNeeded?: boolean }> {
    if (!this.isAvailable()) {
      return { ready: false, missingTables: ['Supabase not configured'] };
    }

    const requiredTables = ['agent_todos', 'agent_memories', 'issue_history', 'code_embeddings', 'project_memory'];
    const missingTables: string[] = [];
    let schemaRefreshNeeded = false;

    for (const table of requiredTables) {
      const { error } = await this.client.from(table).select('id').limit(1);
      if (error) {
        // Table doesn't exist (42P01) or not in schema cache
        if (error.message?.includes('schema cache')) {
          schemaRefreshNeeded = true;
          missingTables.push(table);
        } else if (error.code === '42P01' || error.code === 'PGRST204') {
          missingTables.push(table);
        }
        // Other errors (like empty table) are fine
      }
    }

    return { ready: missingTables.length === 0, missingTables, schemaRefreshNeeded };
  }

  /**
   * Get raw Supabase client for advanced operations
   */
  getClient(): SupabaseClientType {
    return this.client;
  }
}

// Singleton instance
let supabaseInstance: SupabaseIntegration | null = null;

export function getSupabaseIntegration(): SupabaseIntegration {
  if (!supabaseInstance) {
    supabaseInstance = new SupabaseIntegration();
  }
  return supabaseInstance;
}
