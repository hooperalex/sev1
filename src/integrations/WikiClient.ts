/**
 * WikiClient: Manages GitHub Wiki repository for knowledge base
 */

import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

export interface SearchResult {
  file: string;
  lineNumber: number;
  content: string;
  relevance: number;
}

export interface WikiUpdate {
  page: string;
  action: 'append' | 'update' | 'create';
  content: string;
}

export class WikiClient {
  private repoUrl: string;
  private localPath: string;
  private git: SimpleGit;
  private initialized: boolean = false;

  constructor(repoUrl: string, localPath: string = './wiki') {
    this.repoUrl = repoUrl;
    this.localPath = localPath;
    this.git = simpleGit();
    logger.info('WikiClient initialized', { repoUrl, localPath });
  }

  /**
   * Initialize the wiki client - clone if needed, pull latest
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing wiki client');

      // Check if local path exists
      if (fs.existsSync(this.localPath)) {
        // Path exists, check if it's a git repo
        const gitPath = path.join(this.localPath, '.git');
        if (fs.existsSync(gitPath)) {
          // Already cloned, pull latest
          logger.info('Wiki already cloned, pulling latest');
          this.git = simpleGit(this.localPath);
          await this.pull();
        } else {
          // Path exists but not a git repo, remove and clone
          logger.warn('Wiki path exists but is not a git repo, removing');
          fs.rmSync(this.localPath, { recursive: true, force: true });
          await this.cloneRepo();
        }
      } else {
        // Doesn't exist, clone
        await this.cloneRepo();
      }

      this.initialized = true;
      logger.info('Wiki client initialized successfully');
    } catch (error: any) {
      logger.error('Failed to initialize wiki client', { error: error.message });
      throw new Error(`Failed to initialize wiki: ${error.message}`);
    }
  }

  /**
   * Clone the wiki repository
   */
  private async cloneRepo(): Promise<void> {
    try {
      logger.info('Cloning wiki repository', { repoUrl: this.repoUrl });
      await this.git.clone(this.repoUrl, this.localPath);
      this.git = simpleGit(this.localPath);
      logger.info('Wiki repository cloned successfully');
    } catch (error: any) {
      // If clone fails because wiki doesn't exist, that's okay
      // We'll create it with initial structure
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        logger.info('Wiki repository does not exist yet, will create with initial structure');
        // Create empty directory for now
        fs.mkdirSync(this.localPath, { recursive: true });
        this.git = simpleGit(this.localPath);
        await this.git.init();
        await this.git.addRemote('origin', this.repoUrl);
      } else {
        throw error;
      }
    }
  }

  /**
   * Ensure wiki exists and has initial structure
   */
  async ensureWikiExists(): Promise<void> {
    try {
      // Check if wiki has any files
      const files = fs.readdirSync(this.localPath).filter(f => f.endsWith('.md'));

      if (files.length === 0) {
        logger.info('Wiki is empty, generating initial structure');
        await this.generateInitialStructure();
      } else {
        logger.info('Wiki already has content', { fileCount: files.length });
      }
    } catch (error: any) {
      logger.error('Failed to ensure wiki exists', { error: error.message });
      throw new Error(`Failed to ensure wiki exists: ${error.message}`);
    }
  }

  /**
   * Generate initial wiki structure with templates
   */
  async generateInitialStructure(): Promise<void> {
    try {
      logger.info('Generating initial wiki structure');

      const timestamp = new Date().toISOString();

      const pages = {
        'Home.md': this.generateHomeTemplate(timestamp),
        'Issue-History.md': this.generateIssueHistoryTemplate(timestamp),
        'Common-Patterns.md': this.generateCommonPatternsTemplate(timestamp),
        'Bug-Categories.md': this.generateBugCategoriesTemplate(timestamp),
        'System-Architecture.md': this.generateArchitectureTemplate(timestamp),
        'Best-Practices.md': this.generateBestPracticesTemplate(timestamp),
        'Troubleshooting.md': this.generateTroubleshootingTemplate(timestamp),
        'FAQ.md': this.generateFAQTemplate(timestamp),
        '_Sidebar.md': this.generateSidebarTemplate()
      };

      // Write all initial pages
      for (const [filename, content] of Object.entries(pages)) {
        const filePath = path.join(this.localPath, filename);
        fs.writeFileSync(filePath, content, 'utf-8');
        logger.info('Created wiki page', { filename });
      }

      // Commit and push initial structure
      await this.git.add('.');
      await this.git.commit('Initialize wiki with template structure');

      try {
        await this.git.push('origin', 'master');
        logger.info('Pushed initial wiki structure');
      } catch (pushError: any) {
        // Try 'main' if 'master' fails
        if (pushError.message.includes('master')) {
          await this.git.push('origin', 'main');
          logger.info('Pushed initial wiki structure to main branch');
        } else {
          throw pushError;
        }
      }

      logger.info('Initial wiki structure generated successfully');
    } catch (error: any) {
      logger.error('Failed to generate initial structure', { error: error.message });
      throw new Error(`Failed to generate initial wiki structure: ${error.message}`);
    }
  }

  /**
   * Get a specific wiki page content
   */
  async getPage(pageName: string): Promise<string> {
    try {
      const filename = pageName.endsWith('.md') ? pageName : `${pageName}.md`;
      const filePath = path.join(this.localPath, filename);

      if (!fs.existsSync(filePath)) {
        logger.warn('Wiki page not found', { pageName });
        return '';
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      logger.info('Read wiki page', { pageName, size: content.length });
      return content;
    } catch (error: any) {
      logger.error('Failed to get wiki page', { pageName, error: error.message });
      throw new Error(`Failed to get wiki page: ${error.message}`);
    }
  }

  /**
   * Get all wiki page names
   */
  async getAllPages(): Promise<string[]> {
    try {
      const files = fs.readdirSync(this.localPath);
      const mdFiles = files
        .filter(f => f.endsWith('.md') && !f.startsWith('_'))
        .map(f => f.replace('.md', ''));

      logger.info('Retrieved all wiki pages', { count: mdFiles.length });
      return mdFiles;
    } catch (error: any) {
      logger.error('Failed to get all pages', { error: error.message });
      throw new Error(`Failed to get all wiki pages: ${error.message}`);
    }
  }

  /**
   * Search wiki for a query string (cross-platform, no grep dependency)
   */
  async searchWiki(query: string): Promise<SearchResult[]> {
    try {
      logger.info('Searching wiki', { query });

      // Cross-platform search using Node.js fs
      const results: SearchResult[] = [];
      const queryLower = query.toLowerCase();

      // Get all markdown files
      const files = fs.readdirSync(this.localPath)
        .filter(f => f.endsWith('.md') && !f.startsWith('_'));

      for (const file of files) {
        const filePath = path.join(this.localPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.toLowerCase().includes(queryLower)) {
            results.push({
              file: file.replace('.md', ''),
              lineNumber: i + 1,
              content: line.trim(),
              relevance: this.calculateRelevance(query, line)
            });
          }
        }
      }

      // Sort by relevance and return top 10
      results.sort((a, b) => b.relevance - a.relevance);
      const topResults = results.slice(0, 10);

      logger.info('Search completed', { query, resultsFound: results.length, topResults: topResults.length });
      return topResults;
    } catch (error: any) {
      logger.error('Failed to search wiki', { query, error: error.message });
      // Return empty array instead of throwing - graceful degradation
      return [];
    }
  }

  /**
   * Calculate relevance score for search result
   */
  private calculateRelevance(query: string, content: string): number {
    const lowerQuery = query.toLowerCase();
    const lowerContent = content.toLowerCase();

    let score = 0;

    // Exact match
    if (lowerContent.includes(lowerQuery)) {
      score += 10;
    }

    // Word matches
    const queryWords = lowerQuery.split(/\s+/);
    for (const word of queryWords) {
      if (lowerContent.includes(word)) {
        score += 2;
      }
    }

    // Proximity bonus (query words close together)
    const firstWordIndex = lowerContent.indexOf(queryWords[0]);
    if (firstWordIndex !== -1 && queryWords.length > 1) {
      const lastWordIndex = lowerContent.lastIndexOf(queryWords[queryWords.length - 1]);
      const proximity = lastWordIndex - firstWordIndex;
      if (proximity < 50) {
        score += 5;
      }
    }

    return score;
  }

  /**
   * Get a summary of the wiki for context injection
   */
  async getWikiSummary(): Promise<string> {
    try {
      logger.info('Generating wiki summary');

      const summary: string[] = [];
      summary.push('# Wiki Knowledge Base Summary\n');

      // Read key pages
      const keyPages = [
        'Home',
        'System-Architecture',
        'Common-Patterns',
        'Best-Practices',
        'Bug-Categories'
      ];

      for (const pageName of keyPages) {
        const content = await this.getPage(pageName);
        if (content) {
          // Extract first 200 chars or up to first section
          const firstSection = content.split('\n##')[0];
          const excerpt = firstSection.substring(0, 400);
          summary.push(`## ${pageName}\n${excerpt}...\n`);
        }
      }

      // Add recent issues count
      const issueHistory = await this.getPage('Issue-History');
      if (issueHistory) {
        const issueCount = (issueHistory.match(/^- \d{4}-\d{2}-\d{2}/gm) || []).length;
        summary.push(`\n**Recent Issues Processed:** ${issueCount}\n`);
      }

      const summaryText = summary.join('\n');
      logger.info('Wiki summary generated', { length: summaryText.length });
      return summaryText;
    } catch (error: any) {
      logger.error('Failed to generate wiki summary', { error: error.message });
      return '# Wiki Knowledge Base\n\n_Wiki summary unavailable_';
    }
  }

  /**
   * Update a wiki page with new content (replaces entire content)
   */
  async updatePage(pageName: string, content: string): Promise<void> {
    try {
      logger.info('Updating wiki page', { pageName });

      const filename = pageName.endsWith('.md') ? pageName : `${pageName}.md`;
      const filePath = path.join(this.localPath, filename);

      fs.writeFileSync(filePath, content, 'utf-8');
      logger.info('Wiki page updated', { pageName, size: content.length });
    } catch (error: any) {
      logger.error('Failed to update wiki page', { pageName, error: error.message });
      throw new Error(`Failed to update wiki page: ${error.message}`);
    }
  }

  /**
   * Append content to a wiki page
   */
  async appendToPage(pageName: string, content: string): Promise<void> {
    try {
      logger.info('Appending to wiki page', { pageName });

      const filename = pageName.endsWith('.md') ? pageName : `${pageName}.md`;
      const filePath = path.join(this.localPath, filename);

      let existingContent = '';
      if (fs.existsSync(filePath)) {
        existingContent = fs.readFileSync(filePath, 'utf-8');
      }

      const newContent = existingContent + '\n' + content;
      fs.writeFileSync(filePath, newContent, 'utf-8');

      logger.info('Content appended to wiki page', { pageName });
    } catch (error: any) {
      logger.error('Failed to append to wiki page', { pageName, error: error.message });
      throw new Error(`Failed to append to wiki page: ${error.message}`);
    }
  }

  /**
   * Create a new wiki page
   */
  async createPage(pageName: string, content: string): Promise<void> {
    try {
      logger.info('Creating wiki page', { pageName });

      const filename = pageName.endsWith('.md') ? pageName : `${pageName}.md`;
      const filePath = path.join(this.localPath, filename);

      if (fs.existsSync(filePath)) {
        logger.warn('Wiki page already exists, updating instead', { pageName });
        await this.updatePage(pageName, content);
        return;
      }

      fs.writeFileSync(filePath, content, 'utf-8');
      logger.info('Wiki page created', { pageName });
    } catch (error: any) {
      logger.error('Failed to create wiki page', { pageName, error: error.message });
      throw new Error(`Failed to create wiki page: ${error.message}`);
    }
  }

  /**
   * Pull latest changes from remote wiki
   */
  async pull(): Promise<void> {
    try {
      logger.info('Pulling latest wiki changes');
      await this.git.pull('origin', 'master').catch(async () => {
        // Try main if master fails
        await this.git.pull('origin', 'main');
      });
      logger.info('Wiki pulled successfully');
    } catch (error: any) {
      logger.error('Failed to pull wiki', { error: error.message });
      throw new Error(`Failed to pull wiki: ${error.message}`);
    }
  }

  /**
   * Commit changes to local wiki
   */
  async commit(message: string): Promise<void> {
    try {
      logger.info('Committing wiki changes', { message });

      // Check if there are changes to commit
      const status = await this.git.status();
      if (status.files.length === 0) {
        logger.info('No changes to commit');
        return;
      }

      await this.git.add('.');
      await this.git.commit(message);
      logger.info('Wiki changes committed');
    } catch (error: any) {
      logger.error('Failed to commit wiki changes', { error: error.message });
      throw new Error(`Failed to commit wiki changes: ${error.message}`);
    }
  }

  /**
   * Push changes to remote wiki
   */
  async push(): Promise<void> {
    try {
      logger.info('Pushing wiki changes');

      // Pull before push to avoid conflicts
      await this.pull();

      // Push to master or main
      try {
        await this.git.push('origin', 'master');
        logger.info('Wiki pushed successfully');
      } catch (pushError: any) {
        if (pushError.message.includes('master')) {
          await this.git.push('origin', 'main');
          logger.info('Wiki pushed successfully to main branch');
        } else {
          throw pushError;
        }
      }
    } catch (error: any) {
      logger.error('Failed to push wiki', { error: error.message });
      throw new Error(`Failed to push wiki: ${error.message}`);
    }
  }

  // Template generation methods

  private generateHomeTemplate(timestamp: string): string {
    return `# AI Team Wiki

_Last updated: ${timestamp}_

## Welcome

This wiki serves as the knowledge base for the AI Team MVP system. It accumulates insights, patterns, and documentation from every issue processed by the autonomous AI team.

## Contents

- [Issue History](Issue-History) - Chronological log of all processed issues
- [Common Patterns](Common-Patterns) - Recurring bug patterns and solutions
- [Bug Categories](Bug-Categories) - Issue classification taxonomy
- [System Architecture](System-Architecture) - Codebase structure and components
- [Best Practices](Best-Practices) - Code standards and implementation patterns
- [Troubleshooting](Troubleshooting) - Common problems and solutions
- [FAQ](FAQ) - Frequently asked questions

## How This Wiki Works

This wiki is automatically maintained by the **Archivist** agent (Stage 13 of the pipeline). After each issue is processed through the full 13-stage pipeline, the Archivist:

1. Extracts insights from all previous agent outputs
2. Identifies reusable patterns and lessons learned
3. Updates relevant wiki pages with new information
4. Maintains chronological history

## For Agents

All agents in the pipeline have read access to this wiki. Use the knowledge accumulated here to:
- Understand previous similar issues
- Reference documented patterns
- Leverage architecture insights
- Follow established best practices

To search the wiki, use: \`WIKI_SEARCH: "your query"\`

---

_Maintained by Archivist Agent_
`;
  }

  private generateIssueHistoryTemplate(timestamp: string): string {
    return `# Issue History

_Last updated: ${timestamp}_

## Overview

Chronological log of all issues processed by the AI Team MVP system.

## Issues Processed

_Issues will be added here automatically as they are processed._

---
_Maintained by Archivist Agent_
`;
  }

  private generateCommonPatternsTemplate(timestamp: string): string {
    return `# Common Patterns

_Last updated: ${timestamp}_

## Overview

This page documents recurring bug patterns discovered across multiple issues.

## Patterns

_Patterns will be documented here as they are identified._

---
_Maintained by Archivist Agent_
`;
  }

  private generateBugCategoriesTemplate(timestamp: string): string {
    return `# Bug Categories

_Last updated: ${timestamp}_

## Overview

Classification taxonomy for issues processed by the system.

## Categories

_Bug categories will be populated as issues are classified._

---
_Maintained by Archivist Agent_
`;
  }

  private generateArchitectureTemplate(timestamp: string): string {
    return `# System Architecture

_Last updated: ${timestamp}_

## Overview

Documentation of the codebase architecture, components, and relationships.

## Components

_Architecture insights will be added as the Archaeologist agent discovers them._

---
_Maintained by Archivist Agent_
`;
  }

  private generateBestPracticesTemplate(timestamp: string): string {
    return `# Best Practices

_Last updated: ${timestamp}_

## Overview

Code standards, patterns, and implementation approaches used in this codebase.

## Practices

_Best practices will be documented as successful patterns emerge._

---
_Maintained by Archivist Agent_
`;
  }

  private generateTroubleshootingTemplate(timestamp: string): string {
    return `# Troubleshooting

_Last updated: ${timestamp}_

## Overview

Common problems encountered and their solutions.

## Issues & Solutions

_Troubleshooting entries will be added as issues are resolved._

---
_Maintained by Archivist Agent_
`;
  }

  private generateFAQTemplate(timestamp: string): string {
    return `# Frequently Asked Questions

_Last updated: ${timestamp}_

## Overview

Answers to common questions about the system and codebase.

## Questions

_FAQ entries will be added based on recurring patterns._

---
_Maintained by Archivist Agent_
`;
  }

  private generateSidebarTemplate(): string {
    return `### Navigation

- [Home](Home)
- [Issue History](Issue-History)
- [Common Patterns](Common-Patterns)
- [Bug Categories](Bug-Categories)
- [System Architecture](System-Architecture)
- [Best Practices](Best-Practices)
- [Troubleshooting](Troubleshooting)
- [FAQ](FAQ)

---

**AI Team MVP Wiki**
_Auto-maintained knowledge base_
`;
  }
}
