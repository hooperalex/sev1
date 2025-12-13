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

/**
 * Maximum file size for read operations (10MB)
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export class ToolExecutor {
  private baseDir: string;
  private operationCount: number = 0;
  private todoManager: TodoManager;
  private agentName?: string;
  private stageIndex?: number;

  constructor(
    baseDir: string,
    taskId: string = 'default',
    issueNumber?: number,
    agentName?: string,
    stageIndex?: number
  ) {
    this.baseDir = path.resolve(baseDir);
    this.todoManager = new TodoManager(taskId, issueNumber);
    this.agentName = agentName;
    this.stageIndex = stageIndex;
    logger.info('ToolExecutor initialized', {
      baseDir: this.baseDir,
      taskId,
      agentName
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
}
