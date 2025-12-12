/**
 * Tool Executor: Safely executes file operation tools for Claude agents
 *
 * Responsibilities:
 * - Route tool calls to appropriate handlers
 * - Validate paths and enforce security constraints
 * - Apply file size limits
 * - Log all operations for audit trail
 * - Return structured results to Claude
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

/**
 * Maximum file size for read operations (10MB)
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export class ToolExecutor {
  private baseDir: string;
  private operationCount: number = 0;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
    logger.info('ToolExecutor initialized', { baseDir: this.baseDir });
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
        case 'read_file':
          return await this.handleReadFile(input as ReadFileInput);
        case 'write_file':
          return await this.handleWriteFile(input as WriteFileInput);
        case 'list_directory':
          return await this.handleListDirectory(input as ListDirectoryInput);
        case 'file_exists':
          return await this.handleFileExists(input as FileExistsInput);
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
}
