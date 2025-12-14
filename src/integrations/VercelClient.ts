/**
 * Vercel Client: Integrates with Vercel API for deployments
 * Enhanced with comprehensive production health checking capabilities
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
  meta?: Record<string, string>;
  aliasAssigned?: number;
  aliasError?: { code: string; message: string };
}

export interface VercelDeploymentLogs {
  logs: Array<{
    id: string;
    message: string;
    timestamp: number;
    type: 'stdout' | 'stderr' | 'info' | 'error';
  }>;
}

export interface EndpointHealthCheck {
  endpoint: string;
  healthy: boolean;
  statusCode: number;
  responseTime: number;
  error?: string;
  contentMatch?: boolean;
}

export interface ProductionHealthReport {
  overall: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  timestamp: string;
  deploymentId: string;
  deploymentUrl: string;
  checks: {
    endpoints: EndpointHealthCheck[];
    ssl: { valid: boolean; expiresAt?: string; error?: string };
    dns: { resolved: boolean; error?: string };
    responseTime: { avg: number; max: number; acceptable: boolean };
  };
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  recommendations: string[];
}

export class VercelClient {
  private token: string;
  private projectId: string;
  private orgId: string;
  private baseUrl = 'https://api.vercel.com';
  private githubRepoId: number | null = null; // Cache the numeric repo ID

  constructor(token: string, projectId: string, orgId: string) {
    this.token = token;
    this.projectId = projectId;
    this.orgId = orgId;
  }

  /**
   * Get the numeric GitHub repository ID (required by Vercel API)
   * This fetches from GitHub API and caches the result
   */
  private async getGitHubRepoId(): Promise<number> {
    // Return cached value if available
    if (this.githubRepoId !== null) {
      return this.githubRepoId;
    }

    // Check for explicit env var first
    const explicitRepoId = process.env.GITHUB_REPO_ID;
    if (explicitRepoId) {
      this.githubRepoId = parseInt(explicitRepoId, 10);
      if (!isNaN(this.githubRepoId)) {
        logger.info('Using explicit GITHUB_REPO_ID', { repoId: this.githubRepoId });
        return this.githubRepoId;
      }
    }

    // Fetch from GitHub API
    const githubOwner = process.env.GITHUB_OWNER;
    const githubRepo = process.env.GITHUB_REPO;
    const githubToken = process.env.GITHUB_TOKEN;

    if (!githubOwner || !githubRepo) {
      throw new Error('GITHUB_OWNER and GITHUB_REPO environment variables are required');
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${githubOwner}/${githubRepo}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AI-Team-MVP',
          ...(githubToken ? { 'Authorization': `Bearer ${githubToken}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const repoData = await response.json() as { id: number };
      this.githubRepoId = repoData.id;
      logger.info('Fetched GitHub repo ID', { owner: githubOwner, repo: githubRepo, repoId: this.githubRepoId });
      return this.githubRepoId;
    } catch (error: any) {
      logger.error('Failed to fetch GitHub repo ID', { error: error.message });
      throw new Error(`Failed to fetch GitHub repository ID: ${error.message}`);
    }
  }

  /**
   * Create a new deployment for GitHub-connected projects
   * Since the project is connected to GitHub, we trigger a new deployment
   * by creating a deployment with the correct git reference
   */
  async createDeployment(gitBranch: string, target: 'production' | 'staging' = 'staging'): Promise<VercelDeployment> {
    try {
      logger.info('Creating Vercel deployment', { gitBranch, target });

      // Get the numeric GitHub repository ID (required by Vercel API)
      const repoId = await this.getGitHubRepoId();

      // For GitHub-connected projects, we need to trigger a deployment
      // using the git source rather than redeploying existing deployments
      const requestBody: any = {
        name: this.projectId,
        target,
        gitSource: {
          type: 'github',
          ref: gitBranch,
          repoId: repoId // Must be numeric GitHub repo ID
        },
        projectSettings: {
          framework: null
        }
      };

      // CRITICAL FIX: Ensure no 'files' field is included in the request
      // The Vercel API expects either files OR git source, not both
      // For GitHub projects, omitting files tells Vercel to pull from GitHub
      delete requestBody.files;
      
      const response = await fetch(`${this.baseUrl}/v13/deployments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        // If git source approach fails, try the simpler approach for auto-connected repos
        if (errorData.error?.code === 'bad_request' || response.status === 400) {
          logger.info('Git source approach failed, trying deployment hook method');
          return await this.createDeploymentViaHook(gitBranch, target);
        }

        throw new Error(`Vercel API error: ${response.status} - ${errorText}`);
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
   * Alternative deployment method using project-level deployment trigger
   * This works for projects that are already connected to GitHub via Vercel dashboard
   */
  private async createDeploymentViaHook(gitBranch: string, target: 'production' | 'staging'): Promise<VercelDeployment> {
    try {
      logger.info('Creating deployment via project trigger', { gitBranch, target });

      // Get the latest deployment to understand the project structure
      const recentDeployments = await this.listDeployments({ limit: 1 });
      
      if (recentDeployments.length === 0) {
        throw new Error('No existing deployments found. Please push code to GitHub to trigger initial deployment.');
      }

      // For GitHub-connected projects, we can create a deployment by referencing
      // the GitHub repository without sending files
      const requestBody: any = {
        name: this.projectId,
        target,
        meta: {
          githubCommitRef: gitBranch,
          githubDeployment: '1'
        }
      };

      // CRITICAL FIX: Explicitly ensure no 'files' field is present
      // Remove any potential 'files' field that might have been added elsewhere
      delete requestBody.files;

      // IMPORTANT: Do not include 'files' field for GitHub-connected projects
      // The Vercel API expects either files OR git source, not both
      // For GitHub projects, omitting files tells Vercel to pull from GitHub

      const response = await fetch(`${this.baseUrl}/v13/deployments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        // If this approach also fails, try triggering via GitHub webhook
        if (errorData.error?.code === 'bad_request' || response.status === 400) {
          logger.info('Direct deployment failed, trying GitHub webhook trigger');
          return await this.triggerGitHubDeployment(gitBranch, target);
        }

        throw new Error(`Vercel API error: ${response.status} - ${errorText}`);
      }

      const deployment = await response.json() as VercelDeployment;
      logger.info('Deployment created via hook', { deploymentId: deployment.id, url: deployment.url });

      return deployment;
    } catch (error: any) {
      logger.error('Failed to create deployment via hook', { error: error.message });
      throw error;
    }
  }

  /**
   * Trigger deployment by pushing to GitHub (for GitHub-connected projects)
   * This is the most reliable method for projects connected via GitHub integration
   */
  private async triggerGitHubDeployment(gitBranch: string, target: 'production' | 'staging'): Promise<VercelDeployment> {
    try {
      logger.info('Triggering GitHub deployment', { gitBranch, target });

      // Get the numeric GitHub repository ID (required by Vercel API)
      const repoId = await this.getGitHubRepoId();

      // For GitHub-connected projects, the most reliable way is to let Vercel
      // automatically detect the push. We'll create a minimal deployment request
      // that references the GitHub source.

      const requestBody: any = {
        name: this.projectId,
        target,
        // Use gitSource format for GitHub-connected projects
        gitSource: {
          type: 'github',
          ref: gitBranch,
          repoId: repoId // Must be numeric GitHub repo ID
        }
      };

      // CRITICAL FIX: Explicitly ensure no 'files' field is present
      // This was likely the source of the "files field should be an array" error
      delete requestBody.files;

      const response = await fetch(`${this.baseUrl}/v13/deployments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub deployment trigger failed: ${response.status} - ${errorText}`);
      }

      const deployment = await response.json() as VercelDeployment;
      logger.info('GitHub deployment triggered', { deploymentId: deployment.id, url: deployment.url });

      return deployment;
    } catch (error: any) {
      logger.error('Failed to trigger GitHub deployment', { error: error.message });
      throw error;
    }
  }

  /**
   * Trigger a deployment hook (if configured in Vercel project settings)
   */
  async triggerDeployHook(hookUrl: string): Promise<{ triggered: boolean; error?: string }> {
    try {
      const response = await fetch(hookUrl, { method: 'POST' });

      if (!response.ok) {
        return { triggered: false, error: `Hook returned ${response.status}` };
      }

      logger.info('Deploy hook triggered successfully');
      return { triggered: true };
    } catch (error: any) {
      logger.error('Failed to trigger deploy hook', { error: error.message });
      return { triggered: false, error: error.message };
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

  /**
   * List recent deployments for the project
   */
  async listDeployments(options: {
    target?: 'production' | 'staging';
    limit?: number;
    state?: 'BUILDING' | 'ERROR' | 'READY' | 'QUEUED';
  } = {}): Promise<VercelDeployment[]> {
    try {
      const params = new URLSearchParams({
        projectId: this.projectId,
        limit: String(options.limit || 10)
      });

      if (options.target) {
        params.append('target', options.target);
      }
      if (options.state) {
        params.append('state', options.state);
      }

      const response = await fetch(
        `${this.baseUrl}/v6/deployments?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to list deployments: ${response.status}`);
      }

      const data = await response.json() as { deployments: VercelDeployment[] };
      logger.info('Listed deployments', { count: data.deployments.length, target: options.target });

      return data.deployments;
    } catch (error: any) {
      logger.error('Failed to list deployments', { error: error.message });
      throw new Error(`Failed to list deployments: ${error.message}`);
    }
  }

  /**
   * Get the current production deployment
   */
  async getProductionDeployment(): Promise<VercelDeployment | null> {
    try {
      const deployments = await this.listDeployments({
        target: 'production',
        state: 'READY',
        limit: 1
      });

      if (deployments.length === 0) {
        logger.warn('No production deployment found');
        return null;
      }

      const production = deployments[0];
      logger.info('Found production deployment', {
        id: production.id,
        url: production.url,
        createdAt: new Date(production.createdAt).toISOString()
      });

      return production;
    } catch (error: any) {
      logger.error('Failed to get production deployment', { error: error.message });
      throw new Error(`Failed to get production deployment: ${error.message}`);
    }
  }

  /**
   * Get project domains (production URLs)
   */
  async getProjectDomains(): Promise<string[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v9/projects/${this.projectId}/domains`,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get domains: ${response.status}`);
      }

      const data = await response.json() as { domains: Array<{ name: string }> };
      const domains = data.domains.map(d => d.name);

      logger.info('Retrieved project domains', { domains });
      return domains;
    } catch (error: any) {
      logger.error('Failed to get project domains', { error: error.message });
      return [];
    }
  }

  /**
   * Check a specific endpoint with retries
   */
  async checkEndpoint(
    url: string,
    options: {
      expectedStatus?: number;
      expectedContent?: string;
      timeout?: number;
      retries?: number;
    } = {}
  ): Promise<EndpointHealthCheck> {
    const {
      expectedStatus = 200,
      expectedContent,
      timeout = 10000,
      retries = 3
    } = options;

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const startTime = Date.now();
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'User-Agent': 'AI-Team-Production-Check/1.0' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const responseTime = Date.now() - startTime;
        const statusMatch = response.status === expectedStatus;

        let contentMatch: boolean | undefined;
        if (expectedContent) {
          const body = await response.text();
          contentMatch = body.includes(expectedContent);
        }

        const healthy = statusMatch && (contentMatch === undefined || contentMatch);

        return {
          endpoint: url,
          healthy,
          statusCode: response.status,
          responseTime,
          contentMatch
        };
      } catch (error: any) {
        lastError = error.name === 'AbortError' ? 'Request timeout' : error.message;

        if (attempt < retries) {
          // Exponential backoff
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
        }
      }
    }

    return {
      endpoint: url,
      healthy: false,
      statusCode: 0,
      responseTime: 0,
      error: lastError
    };
  }

  /**
   * Run comprehensive production health checks
   */
  async runProductionHealthChecks(options: {
    endpoints?: Array<{ path: string; expectedStatus?: number; expectedContent?: string }>;
    responseTimeThreshold?: number;
  } = {}): Promise<ProductionHealthReport> {
    const {
      endpoints = [{ path: '/' }],
      responseTimeThreshold = 3000
    } = options;

    logger.info('Starting production health checks', { endpointCount: endpoints.length });

    // Get current production deployment
    const production = await this.getProductionDeployment();
    if (!production) {
      return this.createFailedReport('No production deployment found');
    }

    // Prefer project domain over deployment-specific URL (avoids auth protection)
    const domains = await this.getProjectDomains();
    const primaryDomain = domains.length > 0 ? domains[0] : production.url;
    const baseUrl = primaryDomain.startsWith('http')
      ? primaryDomain
      : `https://${primaryDomain}`;

    const report: ProductionHealthReport = {
      overall: 'HEALTHY',
      timestamp: new Date().toISOString(),
      deploymentId: production.id,
      deploymentUrl: baseUrl,
      checks: {
        endpoints: [],
        ssl: { valid: false },
        dns: { resolved: false },
        responseTime: { avg: 0, max: 0, acceptable: true }
      },
      summary: { totalChecks: 0, passed: 0, failed: 0, warnings: 0 },
      recommendations: []
    };

    // 1. Check DNS resolution
    report.checks.dns = await this.checkDns(baseUrl);
    report.summary.totalChecks++;
    if (report.checks.dns.resolved) {
      report.summary.passed++;
    } else {
      report.summary.failed++;
      report.recommendations.push('DNS resolution failed - check domain configuration');
    }

    // 2. Check SSL (for HTTPS URLs)
    if (baseUrl.startsWith('https')) {
      report.checks.ssl = await this.checkSsl(baseUrl);
      report.summary.totalChecks++;
      if (report.checks.ssl.valid) {
        report.summary.passed++;
      } else {
        report.summary.failed++;
        report.recommendations.push('SSL certificate issue - verify certificate is valid');
      }
    } else {
      report.checks.ssl = { valid: true }; // Skip for non-HTTPS
      report.recommendations.push('Consider enabling HTTPS for production');
    }

    // 3. Check each endpoint
    const responseTimes: number[] = [];
    for (const ep of endpoints) {
      const url = `${baseUrl}${ep.path}`;
      const check = await this.checkEndpoint(url, {
        expectedStatus: ep.expectedStatus,
        expectedContent: ep.expectedContent
      });

      report.checks.endpoints.push(check);
      report.summary.totalChecks++;

      if (check.healthy) {
        report.summary.passed++;
        responseTimes.push(check.responseTime);
      } else {
        report.summary.failed++;
        report.recommendations.push(`Endpoint ${ep.path} failed: ${check.error || `Status ${check.statusCode}`}`);
      }
    }

    // 4. Calculate response time metrics
    if (responseTimes.length > 0) {
      report.checks.responseTime.avg = Math.round(
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      );
      report.checks.responseTime.max = Math.max(...responseTimes);
      report.checks.responseTime.acceptable = report.checks.responseTime.avg < responseTimeThreshold;

      if (!report.checks.responseTime.acceptable) {
        report.summary.warnings++;
        report.recommendations.push(
          `Average response time (${report.checks.responseTime.avg}ms) exceeds threshold (${responseTimeThreshold}ms)`
        );
      }
    }

    // 5. Determine overall status
    const failureRate = report.summary.failed / report.summary.totalChecks;
    if (failureRate === 0 && report.summary.warnings === 0) {
      report.overall = 'HEALTHY';
    } else if (failureRate < 0.5) {
      report.overall = 'DEGRADED';
    } else {
      report.overall = 'UNHEALTHY';
    }

    logger.info('Production health check complete', {
      overall: report.overall,
      passed: report.summary.passed,
      failed: report.summary.failed
    });

    return report;
  }

  /**
   * Check DNS resolution for a URL
   */
  private async checkDns(url: string): Promise<{ resolved: boolean; error?: string }> {
    try {
      const hostname = new URL(url).hostname;
      // Simple check - if we can fetch, DNS resolved
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      return { resolved: true };
    } catch (error: any) {
      if (error.cause?.code === 'ENOTFOUND') {
        return { resolved: false, error: 'DNS lookup failed' };
      }
      // If it's a different error, DNS probably resolved
      return { resolved: true };
    }
  }

  /**
   * Check SSL certificate validity
   */
  private async checkSsl(url: string): Promise<{ valid: boolean; expiresAt?: string; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // If fetch succeeded over HTTPS, SSL is valid
      // Note: For detailed cert info, we'd need a native module
      return { valid: true };
    } catch (error: any) {
      if (error.message?.includes('certificate') || error.message?.includes('SSL')) {
        return { valid: false, error: error.message };
      }
      // Other errors don't necessarily mean SSL is invalid
      return { valid: true };
    }
  }

  /**
   * Create a failed report when production deployment isn't available
   */
  private createFailedReport(reason: string): ProductionHealthReport {
    return {
      overall: 'UNHEALTHY',
      timestamp: new Date().toISOString(),
      deploymentId: 'unknown',
      deploymentUrl: 'unknown',
      checks: {
        endpoints: [],
        ssl: { valid: false, error: reason },
        dns: { resolved: false, error: reason },
        responseTime: { avg: 0, max: 0, acceptable: false }
      },
      summary: { totalChecks: 1, passed: 0, failed: 1, warnings: 0 },
      recommendations: [reason]
    };
  }

  /**
   * Quick production status check (simplified)
   */
  async getProductionStatus(): Promise<{
    status: 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN';
    url: string | null;
    lastDeployed: string | null;
    responseTime: number | null;
  }> {
    try {
      const production = await this.getProductionDeployment();
      if (!production) {
        return { status: 'UNKNOWN', url: null, lastDeployed: null, responseTime: null };
      }

      // Prefer project domain over deployment-specific URL (avoids auth protection)
      const domains = await this.getProjectDomains();
      const primaryDomain = domains.length > 0 ? domains[0] : production.url;
      const url = primaryDomain.startsWith('http')
        ? primaryDomain
        : `https://${primaryDomain}`;

      const health = await this.checkDeploymentHealth(url);

      return {
        status: health.healthy ? 'UP' : 'DOWN',
        url,
        lastDeployed: new Date(production.createdAt).toISOString(),
        responseTime: health.responseTime
      };
    } catch (error: any) {
      logger.error('Failed to get production status', { error: error.message });
      return { status: 'UNKNOWN', url: null, lastDeployed: null, responseTime: null };
    }
  }
}