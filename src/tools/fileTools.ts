/**
 * File Operation Tools for Claude Agents
 *
 * Defines the tool schemas that Claude can use to perform file operations.
 * These tools enable agents (especially Surgeon) to read and write code files.
 */

import { TODO_TOOLS } from './todoTools';

/**
 * Tool definitions for Claude API
 */
export const FILE_OPERATION_TOOLS: any[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file. Use this to examine existing code before making changes. Returns the complete file content as a string.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path relative to project root (e.g., "src/components/Button.tsx"). Do not use absolute paths or path traversal (..).'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file. Creates parent directories automatically if needed. Overwrites existing files completely. Use this to create new files or update existing ones.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to project root (e.g., "src/utils/helper.ts"). Do not use absolute paths or path traversal (..).'
        },
        content: {
          type: 'string',
          description: 'Complete file content to write. Must include all necessary code - this replaces the entire file.'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: 'List the contents of a directory. Returns an array of file and directory names. Useful for exploring project structure before making changes.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to project root (e.g., "src/components"). Use "." for project root. Do not use absolute paths or path traversal (..).'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'file_exists',
    description: 'Check if a file or directory exists at the given path. Returns true if it exists, false otherwise. Use this to check before reading or to determine if you need to create a new file.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path relative to project root (e.g., "src/config.ts"). Do not use absolute paths or path traversal (..).'
        }
      },
      required: ['path']
    }
  }
];

/**
 * Type definitions for tool inputs
 */

export interface ReadFileInput {
  path: string;
}

export interface WriteFileInput {
  path: string;
  content: string;
}

export interface ListDirectoryInput {
  path: string;
}

export interface FileExistsInput {
  path: string;
}

/**
 * Type definition for tool results
 */

export interface ToolResult {
  success: boolean;
  content?: string;
  items?: string[];
  exists?: boolean;
  message?: string;
  error?: string;
}

/**
 * All available tools (file operations + todo tools)
 */
export const ALL_AGENT_TOOLS: any[] = [
  ...FILE_OPERATION_TOOLS,
  ...TODO_TOOLS
];
