/**
 * Tool Executor: Safely executes file operation tools for Claude agents
 *
 * Responsibilities:
 * - Route tool calls to appropriate handlers
 * - Validate paths and enforce security constraints
 * - Apply file size limits
 * - Log all operations for audit trail
 * - Return structured results to Claude
 * - Manage agent todo lists
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import type {
  ReadFileInput,
  WriteFileInput,
  ListDirectoryInput,
  FileExistsInput,
  ToolResult
} from './fileTools';
import { TodoManager } from './TodoManager';
import type {
  TodoAddInput,
  TodoUpdateInput,
  TodoListInput,
  TodoRemoveInput,
  TodoResult,
  TodoState
} from './todoTools';
import { getSupabaseIntegration, SupabaseIntegration } from '../integrations/SupabaseClient';
import type {
  DBExecuteSQLInput,
  MemoryStoreInput,
  MemoryRecallInput,
  ProjectRememberInput,
  ProjectRecallInput,
  IssueHistorySearchInput,
  SupabaseToolResult
} from './supabaseTools';
import { CodebaseIndexer, createCodebaseIndexer } from '../services/CodebaseIndexer';
import type {
  SemanticSearchInput,
  FindSimilarCodeInput,
  IndexCodebaseInput,
  RAGToolResult
} from './ragTools';

/**
 * Maximum file size for read operations (10MB)
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export class ToolExecutor {
  private baseDir: string;
  private operationCount: number = 0;
  private todoManager: TodoManager;
  private supabase: SupabaseIntegration;
  private codebaseIndexer: CodebaseIndexer;
  private agentName?: string;
  private stageIndex?: number;
  private issueNumber?: number;

  constructor(
    baseDir: string,
    taskId: string = 'default',
    issueNumber?: number,
    agentName?: string,
    stageIndex?: number
  ) {
    this.baseDir = path.resolve(baseDir);
    this.todoManager = new TodoManager(taskId, issueNumber);
    this.supabase = getSupabaseIntegration();
    this.codebaseIndexer = createCodebaseIndexer(baseDir);
    this.agentName = agentName;
    this.stageIndex = stageIndex;
    this.issueNumber = issueNumber;
    logger.info('ToolExecutor initialized', {
      baseDir: this.baseDir,
      taskId,
      agentName,
      supabaseAvailable: this.supabase.isAvailable()
    });
  }

  /**
   * Load todo state from a previous stage
   */
  loadTodoState(state: TodoState): void {
    this.todoManager.loadState(state);
  }

  /**
   * Get current todo state (for passing to next stage)
   */
  getTodoState(): TodoState {
    return this.todoManager.getState();
  }

  /**
   * Get todo list as markdown (for GitHub comments)
   */
  getTodoMarkdown(): string {
    return this.todoManager.toMarkdown();
  }

  /**
   * Get todo list for prompt injection
   */
  getTodoPrompt(): string {
    return this.todoManager.toPrompt();
  }

  /**
   * Execute a tool call from Claude
   */
  async execute(toolName: string, input: any): Promise<ToolResult> {
    this.operationCount++;

    logger.info('Executing tool', {
      tool: toolName,
      input,
      operationNumber: this.operationCount
    });

    // Validate path if present
    if (input.path) {
      const validation = this.validatePath(input.path);
      if (!validation.valid) {
        logger.warn('Path validation failed', {
          tool: toolName,
          path: input.path,
          error: validation.error
        });
        return { success: false, error: validation.error };
      }
    }

    try {
      // Route to appropriate handler
      switch (toolName) {
        // File operation tools
        case 'read_file':
          return await this.handleReadFile(input as ReadFileInput);
        case 'write_file':
          return await this.handleWriteFile(input as WriteFileInput);
        case 'list_directory':
          return await this.handleListDirectory(input as ListDirectoryInput);
        case 'file_exists':
          return await this.handleFileExists(input as FileExistsInput);

        // Todo tools
        case 'todo_add':
          return this.handleTodoAdd(input as TodoAddInput);
        case 'todo_update':
          return this.handleTodoUpdate(input as TodoUpdateInput);
        case 'todo_list':
          return this.handleTodoList(input as TodoListInput);
        case 'todo_remove':
          return this.handleTodoRemove(input as TodoRemoveInput);
        case 'todo_clear_completed':
          return this.handleTodoClearCompleted();

        // Supabase/Database tools
        case 'db_execute_sql':
          return await this.handleDBExecuteSQL(input as DBExecuteSQLInput);
        case 'db_list_tables':
          return await this.handleDBListTables();
        case 'memory_store':
          return await this.handleMemoryStore(input as MemoryStoreInput);
        case 'memory_recall':
          return await this.handleMemoryRecall(input as MemoryRecallInput);
        case 'project_remember':
          return await this.handleProjectRemember(input as ProjectRememberInput);
        case 'project_recall':
          return await this.handleProjectRecall(input as ProjectRecallInput);
        case 'issue_history_search':
          return await this.handleIssueHistorySearch(input as IssueHistorySearchInput);

        // RAG/Semantic search tools
        case 'semantic_search':
          return await this.handleSemanticSearch(input as SemanticSearchInput);
        case 'find_similar_code':
          return await this.handleFindSimilarCode(input as FindSimilarCodeInput);
        case 'index_codebase':
          return await this.handleIndexCodebase(input as IndexCodebaseInput);
        case 'get_index_stats':
          return await this.handleGetIndexStats();

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`
          };
      }
    } catch (error: any) {
      logger.error('Tool execution failed', {
        tool: toolName,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: `Tool execution failed: ${error.message}`
      };
    }
  }

  /**
   * Validate path for security
   */
  private validatePath(filePath: string): { valid: boolean; error?: string } {
    // Reject absolute paths
    if (path.isAbsolute(filePath)) {
      return {
        valid: false,
        error: 'Absolute paths are not allowed. Use relative paths from project root (e.g., "src/file.ts")'
      };
    }

    // Reject path traversal attempts
    if (filePath.includes('..')) {
      return {
        valid: false,
        error: 'Path traversal (..) is not allowed for security reasons'
      };
    }

    // Resolve and check confinement to base directory
    const resolved = path.resolve(this.baseDir, filePath);
    if (!resolved.startsWith(this.baseDir)) {
      return {
        valid: false,
        error: 'Path must be within the project directory'
      };
    }

    return { valid: true };
  }

  /**
   * Handle read_file tool
   */
  private async handleReadFile(input: ReadFileInput): Promise<ToolResult> {
    const filePath = path.resolve(this.baseDir, input.path);

    try {
      // Check if file exists
      const stats = await fs.stat(filePath);

      // Check if it's a file (not a directory)
      if (!stats.isFile()) {
        this.logOperation('read_file', input.path, false, 'Path is a directory');
        return {
          success: false,
          error: `Path is a directory, not a file: ${input.path}`
        };
      }

      // Check file size
      if (stats.size > MAX_FILE_SIZE) {
        this.logOperation('read_file', input.path, false, 'File too large');
        return {
          success: false,
          error: `File too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`
        };
      }

      // Read file contents
      const content = await fs.readFile(filePath, 'utf-8');

      this.logOperation('read_file', input.path, true);

      return {
        success: true,
        content,
        message: `Read ${content.length} characters from ${input.path}`
      };

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logOperation('read_file', input.path, false, 'File not found');
        return {
          success: false,
          error: `File not found: ${input.path}`
        };
      }

      this.logOperation('read_file', input.path, false, error.message);
      return {
        success: false,
        error: `Failed to read file: ${error.message}`
      };
    }
  }

  /**
   * Handle write_file tool
   */
  private async handleWriteFile(input: WriteFileInput): Promise<ToolResult> {
    const filePath = path.resolve(this.baseDir, input.path);

    try {
      // Create parent directories if needed
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });

      // Write file
      await fs.writeFile(filePath, input.content, 'utf-8');

      this.logOperation('write_file', input.path, true);

      return {
        success: true,
        message: `Successfully wrote ${input.content.length} characters to ${input.path}`
      };

    } catch (error: any) {
      this.logOperation('write_file', input.path, false, error.message);
      return {
        success: false,
        error: `Failed to write file: ${error.message}`
      };
    }
  }

  /**
   * Handle list_directory tool
   */
  private async handleListDirectory(input: ListDirectoryInput): Promise<ToolResult> {
    const dirPath = path.resolve(this.baseDir, input.path);

    try {
      // Check if directory exists
      const stats = await fs.stat(dirPath);

      if (!stats.isDirectory()) {
        this.logOperation('list_directory', input.path, false, 'Path is not a directory');
        return {
          success: false,
          error: `Path is not a directory: ${input.path}`
        };
      }

      // Read directory contents
      const items = await fs.readdir(dirPath);

      this.logOperation('list_directory', input.path, true);

      return {
        success: true,
        items,
        message: `Found ${items.length} items in ${input.path}`
      };

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logOperation('list_directory', input.path, false, 'Directory not found');
        return {
          success: false,
          error: `Directory not found: ${input.path}`
        };
      }

      this.logOperation('list_directory', input.path, false, error.message);
      return {
        success: false,
        error: `Failed to list directory: ${error.message}`
      };
    }
  }

  /**
   * Handle file_exists tool
   */
  private async handleFileExists(input: FileExistsInput): Promise<ToolResult> {
    const filePath = path.resolve(this.baseDir, input.path);

    try {
      await fs.access(filePath);
      this.logOperation('file_exists', input.path, true);

      return {
        success: true,
        exists: true,
        message: `File exists: ${input.path}`
      };

    } catch (error: any) {
      this.logOperation('file_exists', input.path, true);

      return {
        success: true,
        exists: false,
        message: `File does not exist: ${input.path}`
      };
    }
  }

  /**
   * Log operation for audit trail
   */
  private logOperation(
    operation: string,
    path: string,
    success: boolean,
    errorMessage?: string
  ): void {
    if (success) {
      logger.info('Tool operation completed', {
        operation,
        path,
        operationNumber: this.operationCount
      });
    } else {
      logger.warn('Tool operation failed', {
        operation,
        path,
        error: errorMessage,
        operationNumber: this.operationCount
      });
    }
  }

  /**
   * Get total operation count for debugging
   */
  getOperationCount(): number {
    return this.operationCount;
  }

  // ==================== TODO HANDLERS ====================

  /**
   * Handle todo_add tool
   */
  private handleTodoAdd(input: TodoAddInput): TodoResult {
    logger.info('Adding todo', { content: input.content, priority: input.priority });
    return this.todoManager.add(input, this.agentName, this.stageIndex);
  }

  /**
   * Handle todo_update tool
   */
  private handleTodoUpdate(input: TodoUpdateInput): TodoResult {
    logger.info('Updating todo', { id: input.id, status: input.status });
    return this.todoManager.update(input);
  }

  /**
   * Handle todo_list tool
   */
  private handleTodoList(input?: TodoListInput): TodoResult {
    logger.info('Listing todos', { filter: input?.filter });
    return this.todoManager.list(input);
  }

  /**
   * Handle todo_remove tool
   */
  private handleTodoRemove(input: TodoRemoveInput): TodoResult {
    logger.info('Removing todo', { id: input.id });
    return this.todoManager.remove(input);
  }

  /**
   * Handle todo_clear_completed tool
   */
  private handleTodoClearCompleted(): TodoResult {
    logger.info('Clearing completed todos');
    return this.todoManager.clearCompleted();
  }

  // ==================== SUPABASE HANDLERS ====================

  /**
   * Handle db_execute_sql tool
   */
  private async handleDBExecuteSQL(input: DBExecuteSQLInput): Promise<SupabaseToolResult> {
    logger.info('Executing SQL', { sqlPreview: input.sql.substring(0, 50) });
    // Use direct Postgres connection for full SQL capability (DDL + DML)
    if (this.supabase.hasDirectAccess()) {
      const result = await this.supabase.executeDirect(input.sql);
      return {
        success: result.success,
        data: result.rows,
        error: result.error,
        message: result.success ? `Query executed, ${result.rows?.length || 0} rows returned` : undefined
      };
    }
    // Fallback to RPC if no direct access
    return await this.supabase.executeSQL(input.sql);
  }

  /**
   * Handle db_list_tables tool
   */
  private async handleDBListTables(): Promise<SupabaseToolResult> {
    logger.info('Listing database tables');
    return await this.supabase.listTables();
  }

  /**
   * Handle memory_store tool
   */
  private async handleMemoryStore(input: MemoryStoreInput): Promise<SupabaseToolResult> {
    logger.info('Storing memory', { type: input.memory_type });
    return await this.supabase.storeMemory({
      agent_name: this.agentName || 'unknown',
      issue_number: this.issueNumber,
      memory_type: input.memory_type,
      content: input.content,
      context: input.context
    });
  }

  /**
   * Handle memory_recall tool
   */
  private async handleMemoryRecall(input: MemoryRecallInput): Promise<SupabaseToolResult> {
    logger.info('Recalling memories', { type: input.memory_type });
    const result = await this.supabase.recallMemories(this.agentName || 'unknown', {
      memoryType: input.memory_type === 'all' ? undefined : input.memory_type,
      limit: input.limit
    });
    return {
      success: result.success,
      memories: result.memories,
      error: result.error,
      message: result.success ? `Retrieved ${result.memories?.length || 0} memories` : undefined
    };
  }

  /**
   * Handle project_remember tool
   */
  private async handleProjectRemember(input: ProjectRememberInput): Promise<SupabaseToolResult> {
    logger.info('Remembering project fact', { key: input.key });
    const result = await this.supabase.rememberFact(input.key, input.value, input.category);
    return {
      success: result.success,
      error: result.error,
      message: result.success ? `Remembered: ${input.key} = ${input.value}` : undefined
    };
  }

  /**
   * Handle project_recall tool
   */
  private async handleProjectRecall(input: ProjectRecallInput): Promise<SupabaseToolResult> {
    logger.info('Recalling project facts', { category: input.category });
    const result = await this.supabase.recallFacts(input.category);
    return {
      success: result.success,
      facts: result.facts,
      error: result.error,
      message: result.success ? `Retrieved ${Object.keys(result.facts || {}).length} facts` : undefined
    };
  }

  /**
   * Handle issue_history_search tool
   */
  private async handleIssueHistorySearch(input: IssueHistorySearchInput): Promise<SupabaseToolResult> {
    logger.info('Searching issue history');
    const result = await this.supabase.findSimilarIssues(
      this.issueNumber || 0,
      input.limit
    );
    return {
      success: result.success,
      issues: result.issues,
      error: result.error,
      message: result.success ? `Found ${result.issues?.length || 0} similar issues` : undefined
    };
  }

  // ==================== RAG HANDLERS ====================

  /**
   * Handle semantic_search tool
   */
  private async handleSemanticSearch(input: SemanticSearchInput): Promise<RAGToolResult> {
    logger.info('Semantic search', { query: input.query.substring(0, 50) });
    try {
      const results = await this.codebaseIndexer.search(input.query, {
        limit: input.limit,
        threshold: input.threshold,
        filePattern: input.file_pattern
      });

      return {
        success: true,
        results,
        message: `Found ${results.length} relevant code sections`
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle find_similar_code tool
   */
  private async handleFindSimilarCode(input: FindSimilarCodeInput): Promise<RAGToolResult> {
    logger.info('Finding similar code');
    try {
      const results = await this.codebaseIndexer.search(input.code, {
        limit: input.limit || 5
      });

      return {
        success: true,
        results,
        message: `Found ${results.length} similar code sections`
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle index_codebase tool
   */
  private async handleIndexCodebase(input: IndexCodebaseInput): Promise<RAGToolResult> {
    logger.info('Indexing codebase', { force: input.force });
    try {
      const stats = await this.codebaseIndexer.indexCodebase({
        forceReindex: input.force
      });

      return {
        success: true,
        indexStats: stats,
        message: `Indexed ${stats.filesProcessed} files, created ${stats.chunksCreated} chunks`
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle get_index_stats tool
   */
  private async handleGetIndexStats(): Promise<RAGToolResult> {
    logger.info('Getting index stats');
    try {
      const stats = await this.codebaseIndexer.getStats();

      return {
        success: true,
        stats: {
          totalFiles: stats.totalFiles,
          totalChunks: stats.totalChunks,
          lastIndexed: stats.lastIndexed?.toISOString() || null
        },
        message: `Index contains ${stats.totalChunks} chunks from ${stats.totalFiles} files`
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
