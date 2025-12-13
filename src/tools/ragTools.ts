/**
 * RAG Tools for Claude Agents
 *
 * Provides agents with semantic code search capabilities:
 * - Search codebase by meaning (not just keywords)
 * - Find similar code patterns
 * - Understand code relationships
 */

export const RAG_TOOLS: any[] = [
  {
    name: 'semantic_search',
    description: 'Search the codebase using semantic similarity. Find code related to a concept, feature, or problem - even if the exact keywords aren\'t present. Use this when you need to understand how something is implemented or find relevant code.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of what you\'re looking for (e.g., "error handling in API routes", "user authentication flow", "database connection setup")'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)'
        },
        file_pattern: {
          type: 'string',
          description: 'Optional file path pattern to filter results (e.g., "src/api", ".tsx")'
        },
        threshold: {
          type: 'number',
          description: 'Minimum similarity score 0-1 (default: 0.5). Higher = more relevant but fewer results'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'find_similar_code',
    description: 'Find code similar to a given code snippet. Useful for finding patterns, duplicates, or related implementations.',
    input_schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The code snippet to find similar code for'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 5)'
        }
      },
      required: ['code']
    }
  },
  {
    name: 'index_codebase',
    description: 'Index or re-index the codebase for semantic search. Run this after significant code changes or to initialize search.',
    input_schema: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description: 'Force re-index all files even if unchanged (default: false)'
        }
      }
    }
  },
  {
    name: 'get_index_stats',
    description: 'Get statistics about the code index - how many files/chunks are indexed and when it was last updated.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * Input types for RAG tools
 */

export interface SemanticSearchInput {
  query: string;
  limit?: number;
  file_pattern?: string;
  threshold?: number;
}

export interface FindSimilarCodeInput {
  code: string;
  limit?: number;
}

export interface IndexCodebaseInput {
  force?: boolean;
}

/**
 * Result types for RAG operations
 */

export interface RAGToolResult {
  success: boolean;
  message?: string;
  error?: string;
  results?: Array<{
    filePath: string;
    content: string;
    similarity: number;
  }>;
  stats?: {
    totalFiles: number;
    totalChunks: number;
    lastIndexed: string | null;
  };
  indexStats?: {
    filesProcessed: number;
    chunksCreated: number;
    embeddingsGenerated: number;
    errors: number;
  };
}
