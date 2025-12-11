/**
 * Vercel Client: Integrates with Vercel API for deployments
 */

import { logger } from '../utils/logger';

export interface VercelDeployment {
  id: string;
  url: string;
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  readyState: 'QUEUED' | 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'READY' | 'CANCELED';
  createdAt: number;
  buildingAt?: number;
  ready?: number;
  target: 'production' | 'staging';
}

export interface VercelDeploymentLogs {
  logs: Array<{
    id: string;
    message: string;
    timestamp: number;
    type: 'stdout' | 'stderr' | 'info' | 'error';
  }>;
}

export class VercelClient {
  private token: string;
  private projectId: string;
  private orgId: string;
  private baseUrl = 'https://api.vercel.com';

  constructor(token: string, projectId: string, orgId: string) {
    this.token = token;
    this.projectId = projectId;
    this.orgId = orgId;
  }

  /**
   * Create a new deployment
   */
  async createDeployment(gitBranch: string, target: 'production' | 'staging' = 'staging'): Promise<VercelDeployment> {
    try {
      logger.info('Creating Vercel deployment', { gitBranch, target });

      const response = await fetch(`${this.baseUrl}/v13/deployments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: this.projectId,
          gitSource: {
            type: 'github',
            ref: gitBranch
          },
          target,
          projectSettings: {
            framework: 'nextjs'
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Vercel API error: ${response.status} - ${error}`);
      }

      const deployment = await response.json() as VercelDeployment;
      logger.info('Deployment created', { deploymentId: deployment.id, url: deployment.url });

      return deployment;
    } catch (error: any) {
      logger.error('Failed to create deployment', { error: error.message });
      throw new Error(`Failed to create Vercel deployment: ${error.message}`);
    }
  }

  /**
   * Get deployment status
   */
  async getDeployment(deploymentId: string): Promise<VercelDeployment> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v13/deployments/${deploymentId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get deployment: ${response.status}`);
      }

      return await response.json() as VercelDeployment;
    } catch (error: any) {
      logger.error('Failed to get deployment', { deploymentId, error: error.message });
      throw new Error(`Failed to get deployment: ${error.message}`);
    }
  }

  /**
   * Get deployment logs
   */
  async getDeploymentLogs(deploymentId: string): Promise<VercelDeploymentLogs> {
    try {
      logger.info('Fetching deployment logs', { deploymentId });

      const response = await fetch(
        `${this.baseUrl}/v2/deployments/${deploymentId}/events`,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get logs: ${response.status}`);
      }

      const data = await response.json() as any[];
      return {
        logs: data.map((item: any) => ({
          id: item.id || '',
          message: item.text || item.message || '',
          timestamp: item.created || item.timestamp || Date.now(),
          type: item.type || 'info'
        }))
      };
    } catch (error: any) {
      logger.error('Failed to get deployment logs', { deploymentId, error: error.message });
      throw new Error(`Failed to get logs: ${error.message}`);
    }
  }

  /**
   * Wait for deployment to complete
   */
  async waitForDeployment(deploymentId: string, timeoutMs: number = 600000): Promise<VercelDeployment> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const deployment = await this.getDeployment(deploymentId);

      if (deployment.readyState === 'READY') {
        logger.info('Deployment ready', { deploymentId, url: deployment.url });
        return deployment;
      }

      if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
        throw new Error(`Deployment failed with state: ${deployment.readyState}`);
      }

      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error(`Deployment timed out after ${timeoutMs}ms`);
  }

  /**
   * Check deployment health
   */
  async checkDeploymentHealth(deploymentUrl: string): Promise<{ healthy: boolean; statusCode: number; responseTime: number }> {
    try {
      const startTime = Date.now();
      const response = await fetch(deploymentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'AI-Team-Health-Check'
        }
      });
      const responseTime = Date.now() - startTime;

      const healthy = response.ok;
      logger.info('Deployment health check', { url: deploymentUrl, healthy, statusCode: response.status, responseTime });

      return {
        healthy,
        statusCode: response.status,
        responseTime
      };
    } catch (error: any) {
      logger.error('Health check failed', { url: deploymentUrl, error: error.message });
      return {
        healthy: false,
        statusCode: 0,
        responseTime: 0
      };
    }
  }
}
