/**
 * Todo Manager: Manages todo state for agents
 *
 * Responsibilities:
 * - Create, update, and delete todo items
 * - Track todo state across agent pipeline stages
 * - Provide summary statistics
 * - Format todos for GitHub comments
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import type {
  TodoItem,
  TodoState,
  TodoAddInput,
  TodoUpdateInput,
  TodoListInput,
  TodoRemoveInput,
  TodoResult
} from './todoTools';

export class TodoManager {
  private state: TodoState;

  constructor(taskId: string, issueNumber?: number) {
    this.state = {
      taskId,
      issueNumber,
      todos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    logger.info('TodoManager initialized', { taskId, issueNumber });
  }

  /**
   * Add a new todo item
   */
  add(input: TodoAddInput, agentName?: string, stageIndex?: number): TodoResult {
    const now = new Date().toISOString();
    const todo: TodoItem = {
      id: uuidv4().slice(0, 8), // Short ID for easier reference
      content: input.content,
      status: 'pending',
      priority: input.priority || 'medium',
      createdAt: now,
      updatedAt: now,
      agentName,
      stageIndex
    };

    this.state.todos.push(todo);
    this.state.updatedAt = now;

    logger.info('Todo added', { id: todo.id, content: todo.content });

    return {
      success: true,
      message: `Added todo: "${todo.content}" (ID: ${todo.id})`,
      todo,
      summary: this.getSummary()
    };
  }

  /**
   * Update a todo item's status
   */
  update(input: TodoUpdateInput): TodoResult {
    const todo = this.state.todos.find(t => t.id === input.id);

    if (!todo) {
      return {
        success: false,
        error: `Todo not found with ID: ${input.id}`
      };
    }

    const now = new Date().toISOString();
    const oldStatus = todo.status;

    todo.status = input.status;
    todo.updatedAt = now;

    if (input.status === 'completed') {
      todo.completedAt = now;
    }

    if (input.status === 'blocked' && input.blockedReason) {
      todo.blockedReason = input.blockedReason;
    }

    this.state.updatedAt = now;

    logger.info('Todo updated', {
      id: todo.id,
      oldStatus,
      newStatus: todo.status
    });

    return {
      success: true,
      message: `Updated todo "${todo.content}": ${oldStatus} → ${todo.status}`,
      todo,
      summary: this.getSummary()
    };
  }

  /**
   * List todos with optional filter
   */
  list(input?: TodoListInput): TodoResult {
    const filter = input?.filter || 'all';
    let todos = [...this.state.todos];

    if (filter !== 'all') {
      const statusMap: Record<string, string> = {
        'in_progress': 'in_progress',
        'pending': 'pending',
        'completed': 'completed',
        'blocked': 'blocked'
      };
      todos = todos.filter(t => t.status === statusMap[filter]);
    }

    // Sort by priority (high first), then by creation date
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    todos.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return {
      success: true,
      message: `Found ${todos.length} todo(s)${filter !== 'all' ? ` with status "${filter}"` : ''}`,
      todos,
      summary: this.getSummary()
    };
  }

  /**
   * Remove a todo item
   */
  remove(input: TodoRemoveInput): TodoResult {
    const index = this.state.todos.findIndex(t => t.id === input.id);

    if (index === -1) {
      return {
        success: false,
        error: `Todo not found with ID: ${input.id}`
      };
    }

    const removed = this.state.todos.splice(index, 1)[0];
    this.state.updatedAt = new Date().toISOString();

    logger.info('Todo removed', { id: removed.id, content: removed.content });

    return {
      success: true,
      message: `Removed todo: "${removed.content}"`,
      todo: removed,
      summary: this.getSummary()
    };
  }

  /**
   * Clear all completed todos
   */
  clearCompleted(): TodoResult {
    const before = this.state.todos.length;
    this.state.todos = this.state.todos.filter(t => t.status !== 'completed');
    const removed = before - this.state.todos.length;

    this.state.updatedAt = new Date().toISOString();

    logger.info('Cleared completed todos', { removed });

    return {
      success: true,
      message: `Cleared ${removed} completed todo(s)`,
      summary: this.getSummary()
    };
  }

  /**
   * Get summary statistics
   */
  getSummary(): { total: number; pending: number; inProgress: number; completed: number; blocked: number } {
    const todos = this.state.todos;
    return {
      total: todos.length,
      pending: todos.filter(t => t.status === 'pending').length,
      inProgress: todos.filter(t => t.status === 'in_progress').length,
      completed: todos.filter(t => t.status === 'completed').length,
      blocked: todos.filter(t => t.status === 'blocked').length
    };
  }

  /**
   * Get the full state (for passing between stages)
   */
  getState(): TodoState {
    return { ...this.state };
  }

  /**
   * Load state from a previous stage
   */
  loadState(state: TodoState): void {
    this.state = { ...state };
    logger.info('TodoManager loaded state', {
      taskId: state.taskId,
      todoCount: state.todos.length
    });
  }

  /**
   * Format todos as markdown for GitHub comments
   */
  toMarkdown(): string {
    const summary = this.getSummary();

    if (summary.total === 0) {
      return '**No tasks tracked**';
    }

    let md = `## Task Progress\n\n`;
    md += `| Status | Count |\n|--------|-------|\n`;
    md += `| Completed | ${summary.completed}/${summary.total} |\n`;
    md += `| In Progress | ${summary.inProgress} |\n`;
    md += `| Pending | ${summary.pending} |\n`;
    md += `| Blocked | ${summary.blocked} |\n\n`;

    // Group by status
    const statusEmoji: Record<string, string> = {
      'completed': '✅',
      'in_progress': '🔄',
      'pending': '⏳',
      'blocked': '🚫'
    };

    const priorityEmoji: Record<string, string> = {
      'high': '🔴',
      'medium': '🟡',
      'low': '🟢'
    };

    // Sort: in_progress first, then pending, then blocked, then completed
    const statusOrder = { 'in_progress': 0, 'pending': 1, 'blocked': 2, 'completed': 3 };
    const sorted = [...this.state.todos].sort((a, b) => {
      return statusOrder[a.status] - statusOrder[b.status];
    });

    md += `### Tasks\n\n`;

    for (const todo of sorted) {
      const status = statusEmoji[todo.status] || '❓';
      const priority = priorityEmoji[todo.priority] || '';
      const blockedNote = todo.blockedReason ? ` _(Blocked: ${todo.blockedReason})_` : '';
      const agentNote = todo.agentName ? ` [${todo.agentName}]` : '';

      md += `- ${status} ${priority} ${todo.content}${blockedNote}${agentNote}\n`;
    }

    return md;
  }

  /**
   * Format todos for agent prompt injection
   */
  toPrompt(): string {
    const summary = this.getSummary();

    if (summary.total === 0) {
      return 'No existing tasks. Use todo_add to create tasks as you work.';
    }

    let prompt = `CURRENT TODO LIST:\n`;
    prompt += `Progress: ${summary.completed}/${summary.total} completed`;

    if (summary.inProgress > 0) {
      prompt += `, ${summary.inProgress} in progress`;
    }
    if (summary.blocked > 0) {
      prompt += `, ${summary.blocked} blocked`;
    }
    prompt += `\n\n`;

    const statusSymbol: Record<string, string> = {
      'completed': '[x]',
      'in_progress': '[>]',
      'pending': '[ ]',
      'blocked': '[!]'
    };

    for (const todo of this.state.todos) {
      const symbol = statusSymbol[todo.status] || '[ ]';
      const priority = todo.priority === 'high' ? ' (HIGH)' : todo.priority === 'low' ? ' (low)' : '';
      const blocked = todo.blockedReason ? ` - BLOCKED: ${todo.blockedReason}` : '';

      prompt += `${symbol} ${todo.id}: ${todo.content}${priority}${blocked}\n`;
    }

    prompt += `\nUse todo_update to mark tasks as you complete them.`;

    return prompt;
  }
}
