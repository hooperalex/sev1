/**
 * Todo Tools for Claude Agents
 *
 * Provides agents with the ability to track tasks, manage progress,
 * and pass todo lists between pipeline stages.
 */

/**
 * Todo item interface
 */
export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  blockedReason?: string;
  agentName?: string;
  stageIndex?: number;
}

/**
 * Todo list state
 */
export interface TodoState {
  taskId: string;
  issueNumber?: number;
  todos: TodoItem[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Tool definitions for Claude API
 */
export const TODO_TOOLS: any[] = [
  {
    name: 'todo_add',
    description: 'Add a new task to your todo list. Use this to break down complex work into trackable steps. Returns the created todo item with its ID.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Description of the task to add (e.g., "Fix the authentication bug in login.ts")'
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Task priority. Use "high" for critical/blocking issues, "medium" for normal work, "low" for nice-to-haves.'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'todo_update',
    description: 'Update the status of an existing todo item. Use this to mark progress as you work through tasks.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The ID of the todo item to update'
        },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'blocked'],
          description: 'New status: "pending" (not started), "in_progress" (working on it), "completed" (done), "blocked" (cannot proceed)'
        },
        blockedReason: {
          type: 'string',
          description: 'If status is "blocked", explain why (e.g., "Missing API credentials")'
        }
      },
      required: ['id', 'status']
    }
  },
  {
    name: 'todo_list',
    description: 'List all current todo items with their status. Use this to review your task list and plan next steps.',
    input_schema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['all', 'pending', 'in_progress', 'completed', 'blocked'],
          description: 'Filter todos by status. Default is "all".'
        }
      }
    }
  },
  {
    name: 'todo_remove',
    description: 'Remove a todo item from the list. Use sparingly - prefer marking as completed instead.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The ID of the todo item to remove'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'todo_clear_completed',
    description: 'Remove all completed todo items from the list. Use to clean up after finishing a set of tasks.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * Input types for todo tools
 */

export interface TodoAddInput {
  content: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface TodoUpdateInput {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  blockedReason?: string;
}

export interface TodoListInput {
  filter?: 'all' | 'pending' | 'in_progress' | 'completed' | 'blocked';
}

export interface TodoRemoveInput {
  id: string;
}

/**
 * Result type for todo operations
 */
export interface TodoResult {
  success: boolean;
  message?: string;
  error?: string;
  todo?: TodoItem;
  todos?: TodoItem[];
  summary?: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    blocked: number;
  };
}
