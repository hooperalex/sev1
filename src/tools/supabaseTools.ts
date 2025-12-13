/**
 * Supabase Tools for Claude Agents
 *
 * Provides agents with database capabilities:
 * - Execute SQL queries
 * - Store and recall memories
 * - Remember project facts
 * - Track issue history
 * - Search similar past issues
 */

/**
 * Tool definitions for Claude API
 */
export const SUPABASE_TOOLS: any[] = [
  {
    name: 'db_execute_sql',
    description: 'Execute a SQL query on the database. Use for creating tables, inserting data, or running custom queries. Returns the query results.',
    input_schema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'The SQL query to execute. Supports SELECT, INSERT, UPDATE, CREATE TABLE, etc. Be careful with destructive operations.'
        }
      },
      required: ['sql']
    }
  },
  {
    name: 'db_list_tables',
    description: 'List all tables in the database. Use to explore the database schema.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'memory_store',
    description: 'Store a memory for later recall. Use to remember important information, successful patterns, or lessons learned.',
    input_schema: {
      type: 'object',
      properties: {
        memory_type: {
          type: 'string',
          enum: ['success', 'failure', 'learning', 'pattern'],
          description: 'Type of memory: "success" for things that worked, "failure" for things that failed, "learning" for insights, "pattern" for reusable patterns'
        },
        content: {
          type: 'string',
          description: 'The content of the memory to store'
        },
        context: {
          type: 'object',
          description: 'Optional additional context (e.g., file names, error messages)'
        }
      },
      required: ['memory_type', 'content']
    }
  },
  {
    name: 'memory_recall',
    description: 'Recall stored memories. Use to retrieve past learnings before starting a task.',
    input_schema: {
      type: 'object',
      properties: {
        memory_type: {
          type: 'string',
          enum: ['success', 'failure', 'learning', 'pattern', 'all'],
          description: 'Filter by memory type, or "all" for all types'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of memories to return (default: 10)'
        }
      }
    }
  },
  {
    name: 'project_remember',
    description: 'Remember a project fact. Use to store important project-specific information that all agents should know.',
    input_schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'A unique key for this fact (e.g., "auth_method", "styling_framework")'
        },
        value: {
          type: 'string',
          description: 'The fact to remember (e.g., "Uses Supabase Auth", "Tailwind CSS")'
        },
        category: {
          type: 'string',
          description: 'Optional category (e.g., "architecture", "tooling", "conventions")'
        }
      },
      required: ['key', 'value']
    }
  },
  {
    name: 'project_recall',
    description: 'Recall all project facts. Use at the start of a task to understand project conventions.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional category filter'
        }
      }
    }
  },
  {
    name: 'issue_history_search',
    description: 'Search for similar past issues. Use to learn from how previous issues were resolved.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 5)'
        }
      }
    }
  }
];

/**
 * Input types for Supabase tools
 */

export interface DBExecuteSQLInput {
  sql: string;
}

export interface MemoryStoreInput {
  memory_type: 'success' | 'failure' | 'learning' | 'pattern';
  content: string;
  context?: Record<string, any>;
}

export interface MemoryRecallInput {
  memory_type?: 'success' | 'failure' | 'learning' | 'pattern' | 'all';
  limit?: number;
}

export interface ProjectRememberInput {
  key: string;
  value: string;
  category?: string;
}

export interface ProjectRecallInput {
  category?: string;
}

export interface IssueHistorySearchInput {
  limit?: number;
}

/**
 * Result type for Supabase operations
 */
export interface SupabaseToolResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: any;
  tables?: string[];
  memories?: any[];
  facts?: Record<string, string>;
  issues?: any[];
}
