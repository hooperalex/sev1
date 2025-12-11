import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils/logger';

export interface AgentContext {
  issueUrl?: string;
  issueNumber?: number;
  issueTitle?: string;
  issueBody?: string;
  previousOutput?: string;
  taskId?: string;
  [key: string]: any;
}

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
  tokensUsed?: number;
  durationMs?: number;
}

export class AgentRunner {
  private client: Anthropic;
  private agentsDir: string;

  constructor(apiKey: string, agentsDir: string = './.claude/agents') {
    this.client = new Anthropic({ apiKey });
    this.agentsDir = agentsDir;
  }

  /**
   * Run a specific agent with given context
   */
  async runAgent(
    agentName: string,
    context: AgentContext
  ): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      logger.info(`Running agent: ${agentName}`, { context });

      // Load agent configuration
      const agentConfig = this.loadAgentConfig(agentName);

      // Build prompt from config and context
      const prompt = this.buildPrompt(agentConfig, context);

      // Call Claude API
      logger.info(`Calling Claude API for ${agentName}...`);
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const output = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      const durationMs = Date.now() - startTime;

      logger.info(`Agent ${agentName} completed`, {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        durationMs
      });

      return {
        success: true,
        output,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        durationMs
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
    if (context.issueBody) {
      prompt += `\nIssue Description:\n${context.issueBody}\n`;
    }
    if (context.previousOutput) {
      prompt += `\n${'='.repeat(60)}\n`;
      prompt += `OUTPUT FROM PREVIOUS STAGE:\n`;
      prompt += `${'='.repeat(60)}\n`;
      prompt += `${context.previousOutput}\n`;
    }

    // Add any other context fields
    const standardFields = ['issueUrl', 'issueNumber', 'issueTitle', 'issueBody', 'previousOutput', 'taskId'];
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
