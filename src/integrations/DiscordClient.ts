/**
 * DiscordClient: Sends notifications to Discord channels
 *
 * Used by the Orchestrator to notify users about:
 * - Pipeline starts and completions
 * - Stage progress
 * - Errors and failures
 * - Requests for approval
 */

import { logger } from '../utils/logger';

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

export class DiscordClient {
  private botToken: string;
  private channelId: string;
  private baseUrl = 'https://discord.com/api/v10';

  constructor(botToken: string, channelId: string) {
    this.botToken = botToken;
    this.channelId = channelId;
  }

  /**
   * Send a message to the configured Discord channel
   */
  async sendMessage(content: string, embed?: DiscordEmbed): Promise<boolean> {
    try {
      const body: DiscordMessage = {};

      if (content) {
        body.content = content;
      }

      if (embed) {
        body.embeds = [embed];
      }

      const response = await fetch(`${this.baseUrl}/channels/${this.channelId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${this.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Discord API error', { status: response.status, error });
        return false;
      }

      logger.info('Discord message sent', { channelId: this.channelId });
      return true;
    } catch (error: any) {
      logger.error('Failed to send Discord message', { error: error.message });
      return false;
    }
  }

  /**
   * Notify when pipeline starts for an issue
   */
  async notifyPipelineStart(issueNumber: number, issueTitle: string, issueUrl: string): Promise<void> {
    const embed: DiscordEmbed = {
      title: `Pipeline Started - Issue #${issueNumber}`,
      description: issueTitle,
      color: 0x3498db, // Blue
      fields: [
        { name: 'Status', value: 'Starting 14-stage pipeline', inline: true },
        { name: 'Link', value: `[View Issue](${issueUrl})`, inline: true },
      ],
      footer: { text: 'AI Team MVP' },
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage('', embed);
  }

  /**
   * Notify when a stage completes
   */
  async notifyStageComplete(
    issueNumber: number,
    stageName: string,
    stageIndex: number,
    totalStages: number
  ): Promise<void> {
    const progress = Math.round(((stageIndex + 1) / totalStages) * 100);
    const progressBar = this.createProgressBar(progress);

    const embed: DiscordEmbed = {
      title: `Stage Complete - Issue #${issueNumber}`,
      description: `**${stageName}** completed successfully`,
      color: 0x2ecc71, // Green
      fields: [
        { name: 'Progress', value: `${progressBar} ${progress}%`, inline: false },
        { name: 'Stage', value: `${stageIndex + 1}/${totalStages}`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage('', embed);
  }

  /**
   * Notify when pipeline completes successfully
   */
  async notifyPipelineComplete(
    issueNumber: number,
    issueTitle: string,
    prUrl?: string,
    stats?: {
      totalDuration: number;
      totalTokens: number;
      estimatedCost: number;
    }
  ): Promise<void> {
    const fields: { name: string; value: string; inline?: boolean }[] = [
      { name: 'Status', value: 'All stages completed', inline: true },
    ];

    if (prUrl) {
      fields.push({ name: 'Pull Request', value: `[View PR](${prUrl})`, inline: true });
    }

    if (stats) {
      fields.push(
        { name: 'Duration', value: `${(stats.totalDuration / 60000).toFixed(1)} min`, inline: true },
        { name: 'Tokens', value: stats.totalTokens.toLocaleString(), inline: true },
        { name: 'Est. Cost', value: `$${stats.estimatedCost.toFixed(4)}`, inline: true }
      );
    }

    const embed: DiscordEmbed = {
      title: `Pipeline Completed - Issue #${issueNumber}`,
      description: issueTitle,
      color: 0x27ae60, // Dark green
      fields,
      footer: { text: 'AI Team MVP' },
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage('', embed);
  }

  /**
   * Notify when pipeline fails
   */
  async notifyPipelineFailed(
    issueNumber: number,
    issueTitle: string,
    stageName: string,
    error: string
  ): Promise<void> {
    const embed: DiscordEmbed = {
      title: `Pipeline Failed - Issue #${issueNumber}`,
      description: issueTitle,
      color: 0xe74c3c, // Red
      fields: [
        { name: 'Failed Stage', value: stageName, inline: true },
        { name: 'Error', value: error.substring(0, 200) + (error.length > 200 ? '...' : ''), inline: false },
      ],
      footer: { text: 'AI Team MVP - Human intervention may be required' },
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage('', embed);
  }

  /**
   * Notify when awaiting approval
   */
  async notifyAwaitingApproval(
    issueNumber: number,
    issueTitle: string,
    stageName: string,
    issueUrl: string
  ): Promise<void> {
    const embed: DiscordEmbed = {
      title: `Approval Required - Issue #${issueNumber}`,
      description: issueTitle,
      color: 0xf39c12, // Orange
      fields: [
        { name: 'Stage', value: stageName, inline: true },
        { name: 'Link', value: `[Review Issue](${issueUrl})`, inline: true },
        { name: 'Action', value: 'Please review and approve to continue', inline: false },
      ],
      footer: { text: 'AI Team MVP' },
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage('@here Approval needed for pipeline', embed);
  }

  /**
   * Notify about self-healing attempt
   */
  async notifySelfHealing(
    issueNumber: number,
    stageName: string,
    attempt: number,
    maxAttempts: number
  ): Promise<void> {
    const embed: DiscordEmbed = {
      title: `Self-Healing - Issue #${issueNumber}`,
      description: `Attempting automatic fix for ${stageName}`,
      color: 0x9b59b6, // Purple
      fields: [
        { name: 'Attempt', value: `${attempt}/${maxAttempts}`, inline: true },
        { name: 'Stage', value: stageName, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage('', embed);
  }

  /**
   * Create a progress bar string
   */
  private createProgressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return '[' + '='.repeat(filled) + '-'.repeat(empty) + ']';
  }

  /**
   * Check if Discord client is configured
   */
  isConfigured(): boolean {
    return Boolean(this.botToken && this.channelId);
  }
}
