/**
 * DiscordClient: Send notifications to Discord channels
 *
 * Used by the Orchestrator to notify users about pipeline progress,
 * completions, and failures.
 */

import { logger } from '../utils/logger';

export interface DiscordMessage {
  content: string;
  embeds?: DiscordEmbed[];
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

export class DiscordClient {
  private botToken: string;
  private channelId: string;
  private baseUrl = 'https://discord.com/api/v10';

  constructor(botToken: string, channelId: string) {
    this.botToken = botToken;
    this.channelId = channelId;
    logger.info('DiscordClient initialized', { channelId });
  }

  /**
   * Send a message to the configured Discord channel
   */
  async sendMessage(content: string, embed?: DiscordEmbed): Promise<boolean> {
    try {
      const body: DiscordMessage = { content };
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
        logger.error('Failed to send Discord message', { error, status: response.status });
        return false;
      }

      logger.info('Discord message sent successfully');
      return true;
    } catch (error: any) {
      logger.error('Discord send error', { error: error.message });
      return false;
    }
  }

  /**
   * Notify that pipeline has started for an issue
   */
  async notifyPipelineStart(issueNumber: number, issueTitle: string, issueUrl: string): Promise<void> {
    const embed: DiscordEmbed = {
      title: `🚀 Pipeline Started: #${issueNumber}`,
      description: issueTitle,
      color: 0x3498db, // Blue
      fields: [
        { name: 'Issue', value: `[View on GitHub](${issueUrl})`, inline: true },
        { name: 'Status', value: 'Processing...', inline: true },
      ],
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage('', embed);
  }

  /**
   * Notify that a stage has completed
   */
  async notifyStageComplete(
    issueNumber: number,
    stageName: string,
    stageIndex: number,
    totalStages: number
  ): Promise<void> {
    const progress = `${stageIndex + 1}/${totalStages}`;
    const progressBar = this.createProgressBar(stageIndex + 1, totalStages);

    const embed: DiscordEmbed = {
      title: `✅ Stage Complete: ${stageName}`,
      description: `Issue #${issueNumber}`,
      color: 0x2ecc71, // Green
      fields: [
        { name: 'Progress', value: `${progress} ${progressBar}`, inline: false },
      ],
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage('', embed);
  }

  /**
   * Notify that pipeline completed successfully
   */
  async notifyPipelineComplete(
    issueNumber: number,
    issueTitle: string,
    prUrl?: string,
    stats?: { tokens: number; duration: number; cost: number }
  ): Promise<void> {
    const fields: { name: string; value: string; inline?: boolean }[] = [
      { name: 'Issue', value: `#${issueNumber}`, inline: true },
    ];

    if (prUrl) {
      fields.push({ name: 'Pull Request', value: `[View PR](${prUrl})`, inline: true });
    }

    if (stats) {
      fields.push({ name: 'Tokens Used', value: stats.tokens.toLocaleString(), inline: true });
      fields.push({ name: 'Duration', value: `${(stats.duration / 1000).toFixed(1)}s`, inline: true });
      fields.push({ name: 'Est. Cost', value: `$${stats.cost.toFixed(4)}`, inline: true });
    }

    const embed: DiscordEmbed = {
      title: `🎉 Pipeline Complete!`,
      description: issueTitle,
      color: 0x27ae60, // Dark Green
      fields,
      footer: { text: 'AI Team MVP' },
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage('', embed);
  }

  /**
   * Notify that pipeline failed
   */
  async notifyPipelineFailed(
    issueNumber: number,
    issueTitle: string,
    stageName: string,
    error: string
  ): Promise<void> {
    const embed: DiscordEmbed = {
      title: `❌ Pipeline Failed: #${issueNumber}`,
      description: issueTitle,
      color: 0xe74c3c, // Red
      fields: [
        { name: 'Failed Stage', value: stageName, inline: true },
        { name: 'Error', value: error.substring(0, 200) + (error.length > 200 ? '...' : ''), inline: false },
      ],
      footer: { text: 'Check GitHub issue for details' },
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage('', embed);
  }

  /**
   * Notify that human approval is needed
   */
  async notifyAwaitingApproval(
    issueNumber: number,
    issueTitle: string,
    stageName: string,
    issueUrl: string
  ): Promise<void> {
    const embed: DiscordEmbed = {
      title: `⏸️ Awaiting Approval: #${issueNumber}`,
      description: issueTitle,
      color: 0xf39c12, // Orange
      fields: [
        { name: 'Stage', value: stageName, inline: true },
        { name: 'Action Required', value: `[Review on GitHub](${issueUrl})`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage('@here Human review required!', embed);
  }

  /**
   * Create a visual progress bar
   */
  private createProgressBar(current: number, total: number): string {
    const filled = Math.round((current / total) * 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}
