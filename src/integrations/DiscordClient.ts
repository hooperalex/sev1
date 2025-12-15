/**
 * DiscordClient: Send pipeline notifications to Discord channel
 *
 * Uses Discord REST API to send rich embed messages for:
 * - Pipeline start notifications
 * - Stage completion updates
 * - Pipeline completion/failure notifications
 * - Approval requests
 */

import { logger } from '../utils/logger';

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
  timestamp?: string;
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

export class DiscordClient {
  private token: string;
  private channelId: string;
  private baseUrl = 'https://discord.com/api/v10';

  // Color constants for embeds
  private static readonly COLORS = {
    INFO: 0x3498db,      // Blue
    SUCCESS: 0x2ecc71,   // Green
    WARNING: 0xf39c12,   // Orange
    ERROR: 0xe74c3c,     // Red
    PROGRESS: 0x9b59b6,  // Purple
  };

  constructor(token: string, channelId: string) {
    this.token = token;
    this.channelId = channelId;
    logger.info('DiscordClient initialized for pipeline notifications');
  }

  /**
   * Send a message to the configured Discord channel
   */
  async sendMessage(message: DiscordMessage): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/channels/${this.channelId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Failed to send Discord message', { status: response.status, error });
        return false;
      }

      logger.info('Discord message sent successfully');
      return true;
    } catch (error: any) {
      logger.error('Discord API error', { error: error.message });
      return false;
    }
  }

  /**
   * Notify when a pipeline starts processing an issue
   */
  async notifyPipelineStart(issueNumber: number, issueTitle: string, branchName: string): Promise<boolean> {
    return this.sendMessage({
      embeds: [{
        title: `Pipeline Started for Issue #${issueNumber}`,
        description: issueTitle,
        color: DiscordClient.COLORS.INFO,
        fields: [
          { name: 'Branch', value: `\`${branchName}\``, inline: true },
          { name: 'Status', value: 'In Progress', inline: true },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  }

  /**
   * Notify when a pipeline stage completes
   */
  async notifyStageComplete(
    issueNumber: number,
    stageName: string,
    stageIndex: number,
    totalStages: number,
    summary?: string
  ): Promise<boolean> {
    const progress = `${stageIndex + 1}/${totalStages}`;
    return this.sendMessage({
      embeds: [{
        title: `Stage Complete: ${stageName}`,
        description: summary || `Issue #${issueNumber} - Stage ${progress}`,
        color: DiscordClient.COLORS.PROGRESS,
        fields: [
          { name: 'Issue', value: `#${issueNumber}`, inline: true },
          { name: 'Progress', value: progress, inline: true },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  }

  /**
   * Notify when a pipeline completes successfully
   */
  async notifyPipelineComplete(
    issueNumber: number,
    issueTitle: string,
    prUrl?: string,
    deploymentUrl?: string
  ): Promise<boolean> {
    const fields: DiscordEmbed['fields'] = [
      { name: 'Issue', value: `#${issueNumber}`, inline: true },
    ];

    if (prUrl) {
      fields.push({ name: 'Pull Request', value: prUrl, inline: true });
    }

    if (deploymentUrl) {
      fields.push({ name: 'Deployment', value: deploymentUrl, inline: false });
    }

    return this.sendMessage({
      embeds: [{
        title: `Pipeline Completed Successfully`,
        description: issueTitle,
        color: DiscordClient.COLORS.SUCCESS,
        fields,
        footer: { text: 'Ready for review' },
        timestamp: new Date().toISOString(),
      }],
    });
  }

  /**
   * Notify when a pipeline fails
   */
  async notifyPipelineFailed(
    issueNumber: number,
    issueTitle: string,
    stageName: string,
    error: string
  ): Promise<boolean> {
    return this.sendMessage({
      embeds: [{
        title: `Pipeline Failed at ${stageName}`,
        description: issueTitle,
        color: DiscordClient.COLORS.ERROR,
        fields: [
          { name: 'Issue', value: `#${issueNumber}`, inline: true },
          { name: 'Error', value: error.substring(0, 1024), inline: false },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  }

  /**
   * Notify when pipeline is awaiting approval
   */
  async notifyAwaitingApproval(
    issueNumber: number,
    issueTitle: string,
    prUrl: string,
    approvalType: 'merge' | 'closure' | 'feature'
  ): Promise<boolean> {
    const titleMap = {
      merge: 'PR Ready for Review',
      closure: 'Ready for Closure',
      feature: 'Feature Approval Required'
    };
    const actionMap = {
      merge: 'review and merge',
      closure: 'approve closure',
      feature: 'approve or decline this feature request'
    };

    return this.sendMessage({
      embeds: [{
        title: titleMap[approvalType],
        description: issueTitle,
        color: DiscordClient.COLORS.WARNING,
        fields: [
          { name: 'Issue', value: `#${issueNumber}`, inline: true },
          { name: approvalType === 'feature' ? 'Issue' : 'Pull Request', value: prUrl, inline: true },
          { name: 'Action Required', value: `Please ${actionMap[approvalType]}`, inline: false },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  }

  /**
   * Notify when self-healing is triggered
   */
  async notifySelfHealing(
    issueNumber: number,
    stageName: string,
    attempt: number,
    maxAttempts: number,
    reason: string
  ): Promise<boolean> {
    return this.sendMessage({
      embeds: [{
        title: `Self-Healing Triggered`,
        description: `Issue #${issueNumber} - ${stageName}`,
        color: DiscordClient.COLORS.WARNING,
        fields: [
          { name: 'Attempt', value: `${attempt}/${maxAttempts}`, inline: true },
          { name: 'Reason', value: reason.substring(0, 1024), inline: false },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  }
}
