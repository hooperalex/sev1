import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils/logger';
import { WikiClient } from './integrations/WikiClient';
import { MemoryClient } from './integrations/MemoryClient';
import { ALL_AGENT_TOOLS } from './tools/fileTools';
import { ToolExecutor } from './tools/ToolExecutor';
import type { TodoState } from './tools/todoTools';

export interface AgentContext {
  issueUrl?: string;
  issueNumber?: number;
  issueTitle?: string;
  issueBody?: string;
  previousOutput?: string;
  taskId?: string;
  wikiSummary?: string;
  wikiSearchResults?: string;
  memoryContext?: string;     // Relevant knowledge from previous issues
  todoState?: TodoState;      // Todo state from previous stage
  stageIndex?: number;        // Current stage index
  [key: string]: any;
}

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
  tokensUsed?: number;
  durationMs?: number;
  todoState?: TodoState;      // Todo state to pass to next stage
  todoMarkdown?: string;      // Todo list as markdown for GitHub comments
}

export class AgentRunner {
  private client: Anthropic;
  private agentsDir: string;
  private wikiClient: WikiClient | null;
  private memoryClient: MemoryClient | null;

  constructor(
    apiKey: string,
    agentsDir: string = './.claude/agents',
    wikiClient: WikiClient | null = null,
    memoryClient: MemoryClient | null = null
  ) {
    this.client = new Anthropic({ apiKey });
    this.agentsDir = agentsDir;
    this.wikiClient = wikiClient;
    this.memoryClient = memoryClient;
  }

  /**
   * Run a specific agent with given context
   */
  async runAgent(
    agentName: string,
    context: AgentContext,
    options?: { toolsEnabled?: boolean }
  ): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      logger.info(`Running agent: ${agentName}`, { context });

      // Enrich context with wiki summary if available
      if (this.wikiClient && !context.wikiSummary) {
        try {
          context.wikiSummary = await this.wikiClient.getWikiSummary();
          logger.info(`Injected wiki summary for ${agentName}`, {
            summaryLength: context.wikiSummary.length
          });
        } catch (error: any) {
          logger.warn(`Failed to get wiki summary for ${agentName}`, {
            error: error.message
          });
        }
      }

      // Enrich context with memory from previous issues
      if (this.memoryClient && !context.memoryContext && context.issueTitle) {
        try {
          context.memoryContext = await this.memoryClient.buildContextForAgent(
            context.issueTitle,
            context.issueBody || ''
          );
          if (context.memoryContext) {
            logger.info(`Injected memory context for ${agentName}`, {
              contextLength: context.memoryContext.length
            });
          }
        } catch (error: any) {
          logger.warn(`Failed to get memory context for ${agentName}`, {
            error: error.message
          });
        }
      }

      // Load agent configuration
      const agentConfig = this.loadAgentConfig(agentName);

      // Build prompt from config and context
      const prompt = this.buildPrompt(agentConfig, context);

      // Check if agent wants to search wiki (WIKI_SEARCH: "query")
      if (this.wikiClient) {
        const searchMatch = prompt.match(/WIKI_SEARCH:\s*"([^"]+)"/i);
        if (searchMatch) {
          const query = searchMatch[1];
          logger.info(`Agent ${agentName} searching wiki`, { query });

          try {
            const results = await this.wikiClient.searchWiki(query);
            context.wikiSearchResults = this.formatSearchResults(results);
            logger.info(`Wiki search results injected`, {
              resultsCount: results.length
            });
          } catch (error: any) {
            logger.warn(`Failed to search wiki for ${agentName}`, {
              error: error.message
            });
          }
        }
      }

      // Determine if tools should be enabled (Surgeon and Debugger get tools by default)
      const enableTools = options?.toolsEnabled ?? (agentName === 'surgeon' || agentName === 'debugger');
      const tools = enableTools ? ALL_AGENT_TOOLS : undefined;

      // Initialize tool executor if tools enabled
      const toolExecutor = enableTools ? new ToolExecutor(
        process.cwd(),
        context.taskId || 'default',
        context.issueNumber,
        agentName,
        context.stageIndex
      ) : null;

      // Load todo state from previous stage if available
      if (toolExecutor && context.todoState) {
        toolExecutor.loadTodoState(context.todoState);
        logger.info('Loaded todo state from previous stage', {
          todoCount: context.todoState.todos.length
        });
      }

      // Initialize message history
      const messages: Anthropic.MessageParam[] = [
        { role: 'user', content: prompt }
      ];

      // Agentic loop
      let iteration = 0;
      const MAX_ITERATIONS = 10;
      let totalTokens = 0;
      let finalOutput = '';

      logger.info(`Calling Claude API for ${agentName}...`, {
        toolsEnabled: enableTools,
        maxIterations: MAX_ITERATIONS
      });

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        logger.info(`Agent ${agentName} iteration ${iteration}/${MAX_ITERATIONS}`);

        // Call Claude API
        const response = await this.client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          temperature: 0.3,
          tools: tools,
          messages: messages
        } as any);

        totalTokens += response.usage.input_tokens + response.usage.output_tokens;

        // Handle stop reason
        if (response.stop_reason === 'end_turn') {
          // Agent is done
          finalOutput = this.extractTextOutput(response.content);
          logger.info(`Agent ${agentName} completed naturally`, { iteration });
          break;
        }

        if (response.stop_reason === 'tool_use') {
          // Process tool use
          if (!toolExecutor) {
            throw new Error('Tool use requested but tool executor not initialized');
          }

          const toolResults = await this.processToolUse(response.content, toolExecutor);

          // Add assistant message to history
          messages.push({
            role: 'assistant',
            content: response.content
          });

          // Add tool results to history
          messages.push({
            role: 'user',
            content: toolResults
          });

          // Continue loop
          continue;
        }

        if (response.stop_reason === 'max_tokens') {
          // Hit token limit, extract what we have
          finalOutput = this.extractTextOutput(response.content);
          logger.warn(`Agent ${agentName} hit max_tokens`, { iteration });
          break;
        }

        // Unexpected stop reason
        throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
      }

      if (iteration >= MAX_ITERATIONS) {
        logger.warn(`Agent ${agentName} hit max iterations`, { iterations: MAX_ITERATIONS });

        // If we hit max iterations with no meaningful output, fail the agent
        if (!finalOutput.trim()) {
          throw new Error(`Agent ${agentName} reached maximum iterations (${MAX_ITERATIONS}) without producing output. ${totalTokens.toLocaleString()} tokens consumed.`);
        }

        finalOutput += '\n\n[Note: Reached maximum tool use iterations]';
      }

      const durationMs = Date.now() - startTime;

      // Get todo state and markdown for output
      const todoState = toolExecutor?.getTodoState();
      const todoMarkdown = toolExecutor?.getTodoMarkdown();

      logger.info(`Agent ${agentName} completed`, {
        tokensUsed: totalTokens,
        iterations: iteration,
        durationMs,
        todoCount: todoState?.todos.length || 0
      });

      return {
        success: true,
        output: finalOutput,
        tokensUsed: totalTokens,
        durationMs,
        todoState,
        todoMarkdown
      };

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      logger.error(`Agent ${agentName} failed`, { error: error.message });

      return {
        success: false,
        output: '',
        error: error.message,
        durationMs
      };
    }
  }

  /**
   * Extract text output from Claude response content
   */
  private extractTextOutput(content: Array<any>): string {
    const textBlocks = content.filter(block => block.type === 'text');
    return textBlocks.map(block => block.text).join('\n');
  }

  /**
   * Process tool use blocks and return tool results
   */
  private async processToolUse(
    content: Array<any>,
    toolExecutor: ToolExecutor
  ): Promise<Array<any>> {
    const toolResults = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        logger.info('Executing tool', {
          tool: block.name,
          input: block.input
        });

        try {
          const result = await toolExecutor.execute(block.name, block.input);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
            is_error: !result.success
          });

        } catch (error: any) {
          logger.error('Tool execution failed', {
            tool: block.name,
            error: error.message
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: error.message }),
            is_error: true
          });
        }
      }
    }

    return toolResults;
  }

  /**
   * Load agent configuration from markdown file
   */
  private loadAgentConfig(agentName: string): string {
    const configPath = path.join(this.agentsDir, `${agentName}.md`);

    if (!fs.existsSync(configPath)) {
      throw new Error(`Agent config not found: ${configPath}`);
    }

    return fs.readFileSync(configPath, 'utf-8');
  }

  /**
   * Build prompt by combining agent config and context
   */
  private buildPrompt(agentConfig: string, context: AgentContext): string {
    let prompt = agentConfig + '\n\n';
    prompt += '='.repeat(60) + '\n';
    prompt += 'CONTEXT FOR THIS TASK:\n';
    prompt += '='.repeat(60) + '\n\n';

    if (context.issueUrl) {
      prompt += `Issue URL: ${context.issueUrl}\n`;
    }
    if (context.issueNumber) {
      prompt += `Issue Number: #${context.issueNumber}\n`;
    }
    if (context.issueTitle) {
      prompt += `Issue Title: ${context.issueTitle}\n`;
    }
    if (context.issueLabels) {
      prompt += `Labels: ${context.issueLabels}\n`;
    }
    if (context.issueBody) {
      prompt += `\nIssue Description:\n${context.issueBody}\n`;
    }

    // Add issue comments (conversation history)
    if (context.issueComments && context.issueComments.length > 0) {
      prompt += `\n${'='.repeat(60)}\n`;
      prompt += `ISSUE COMMENTS (Conversation History):\n`;
      prompt += `${'='.repeat(60)}\n`;
      prompt += `${context.issueComments}\n`;
      prompt += `\nNOTE: Above are previous comments on this issue. Review them for:\n`;
      prompt += `- Human feedback or clarifications\n`;
      prompt += `- Previous agent analysis (don't repeat the same analysis)\n`;
      prompt += `- Any additional context provided\n`;
    }

    // Add wiki summary if available
    if (context.wikiSummary) {
      prompt += `\n${'='.repeat(60)}\n`;
      prompt += `WIKI KNOWLEDGE BASE:\n`;
      prompt += `${'='.repeat(60)}\n`;
      prompt += `${context.wikiSummary}\n`;
      prompt += `\nTo search wiki for specific information, include: WIKI_SEARCH: "your query"\n`;
    }

    // Add wiki search results if available
    if (context.wikiSearchResults) {
      prompt += `\n${'='.repeat(60)}\n`;
      prompt += `WIKI SEARCH RESULTS:\n`;
      prompt += `${'='.repeat(60)}\n`;
      prompt += `${context.wikiSearchResults}\n`;
    }

    // Add memory context from previous issues
    if (context.memoryContext) {
      prompt += `\n${'='.repeat(60)}\n`;
      prompt += `KNOWLEDGE FROM PREVIOUS ISSUES:\n`;
      prompt += `${'='.repeat(60)}\n`;
      prompt += `${context.memoryContext}\n`;
      prompt += `\nNOTE: Use this knowledge to inform your analysis, but verify it applies to the current issue.\n`;
    }

    if (context.previousOutput) {
      prompt += `\n${'='.repeat(60)}\n`;
      prompt += `OUTPUT FROM PREVIOUS STAGE:\n`;
      prompt += `${'='.repeat(60)}\n`;
      prompt += `${context.previousOutput}\n`;
    }

    // Add todo list if available
    if (context.todoState && context.todoState.todos.length > 0) {
      const todoManager = new (require('./tools/TodoManager').TodoManager)(
        context.taskId || 'default',
        context.issueNumber
      );
      todoManager.loadState(context.todoState);

      prompt += `\n${'='.repeat(60)}\n`;
      prompt += `YOUR TODO LIST:\n`;
      prompt += `${'='.repeat(60)}\n`;
      prompt += todoManager.toPrompt();
      prompt += `\n`;
    }

    // Add any other context fields
    const standardFields = [
      'issueUrl', 'issueNumber', 'issueTitle', 'issueBody',
      'issueComments', 'issueLabels',
      'previousOutput', 'taskId', 'wikiSummary', 'wikiSearchResults',
      'todoState', 'stageIndex'
    ];
    const customFields = Object.keys(context).filter(k => !standardFields.includes(k));

    if (customFields.length > 0) {
      prompt += `\n${'='.repeat(60)}\n`;
      prompt += `ADDITIONAL CONTEXT:\n`;
      prompt += `${'='.repeat(60)}\n`;
      customFields.forEach(field => {
        prompt += `${field}: ${JSON.stringify(context[field])}\n`;
      });
    }

    prompt += `\n${'='.repeat(60)}\n`;
    prompt += `NOW PROCEED WITH YOUR TASK:\n`;
    prompt += `${'='.repeat(60)}\n`;

    return prompt;
  }

  /**
   * Format wiki search results for injection into prompt
   */
  private formatSearchResults(results: any[]): string {
    if (results.length === 0) {
      return 'No results found.';
    }

    let formatted = `Found ${results.length} relevant wiki entries:\n\n`;

    results.forEach((result, index) => {
      formatted += `${index + 1}. **${result.file}** (line ${result.lineNumber})\n`;
      formatted += `   ${result.content}\n\n`;
    });

    return formatted;
  }

  /**
   * List available agents
   */
  listAgents(): string[] {
    if (!fs.existsSync(this.agentsDir)) {
      return [];
    }

    return fs.readdirSync(this.agentsDir)
      .filter(file => file.endsWith('.md'))
      .map(file => file.replace('.md', ''));
  }
}
