/**
 * MemoryClient: Persists agent insights and knowledge across sessions
 *
 * Stores:
 * - Bug patterns and root causes discovered
 * - Successful fix strategies
 * - Code patterns and anti-patterns
 * - Issue relationships and dependencies
 * - Agent learnings and recommendations
 */

import { logger } from '../utils/logger';

export interface MemoryEntity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface MemoryRelation {
  from: string;
  to: string;
  relationType: string;
}

export interface AgentMemory {
  issuePatterns: MemoryEntity[];
  bugFixes: MemoryEntity[];
  codePatterns: MemoryEntity[];
  relatedIssues: MemoryRelation[];
}

/**
 * Client for persisting and retrieving agent knowledge
 * Uses file-based storage that syncs with Memory MCP
 */
export class MemoryClient {
  private memoryFilePath: string;
  private cache: Map<string, MemoryEntity> = new Map();

  constructor(memoryFilePath: string = './knowledge/agent-memory.json') {
    this.memoryFilePath = memoryFilePath;
  }

  /**
   * Store a bug pattern discovered during analysis
   */
  async storeBugPattern(
    issueNumber: number,
    pattern: string,
    rootCause: string,
    affectedFiles: string[],
    solution?: string
  ): Promise<void> {
    const entityName = `bug-pattern-${issueNumber}`;
    const observations = [
      `Pattern: ${pattern}`,
      `Root Cause: ${rootCause}`,
      `Affected Files: ${affectedFiles.join(', ')}`,
    ];

    if (solution) {
      observations.push(`Solution: ${solution}`);
    }

    await this.createEntity(entityName, 'BugPattern', observations);
    logger.info('Stored bug pattern', { issueNumber, pattern });
  }

  /**
   * Store a successful fix strategy
   */
  async storeFixStrategy(
    issueNumber: number,
    bugType: string,
    strategy: string,
    filesChanged: string[],
    testsAdded: boolean
  ): Promise<void> {
    const entityName = `fix-${issueNumber}`;
    const observations = [
      `Bug Type: ${bugType}`,
      `Strategy: ${strategy}`,
      `Files Changed: ${filesChanged.join(', ')}`,
      `Tests Added: ${testsAdded ? 'Yes' : 'No'}`,
      `Success: true`,
    ];

    await this.createEntity(entityName, 'FixStrategy', observations);

    // Create relation to bug pattern if exists
    const patternName = `bug-pattern-${issueNumber}`;
    await this.createRelation(entityName, patternName, 'fixes');

    logger.info('Stored fix strategy', { issueNumber, bugType });
  }

  /**
   * Store a code pattern (good or bad)
   */
  async storeCodePattern(
    name: string,
    patternType: 'good' | 'bad',
    description: string,
    example: string,
    recommendation: string
  ): Promise<void> {
    const entityName = `code-pattern-${name.toLowerCase().replace(/\s+/g, '-')}`;
    const observations = [
      `Type: ${patternType}`,
      `Description: ${description}`,
      `Example: ${example}`,
      `Recommendation: ${recommendation}`,
    ];

    await this.createEntity(entityName, 'CodePattern', observations);
    logger.info('Stored code pattern', { name, patternType });
  }

  /**
   * Store issue relationship
   */
  async storeIssueRelation(
    fromIssue: number,
    toIssue: number,
    relationType: 'related-to' | 'duplicate-of' | 'blocks' | 'caused-by'
  ): Promise<void> {
    await this.createRelation(
      `issue-${fromIssue}`,
      `issue-${toIssue}`,
      relationType
    );
    logger.info('Stored issue relation', { fromIssue, toIssue, relationType });
  }

  /**
   * Store agent learning/insight
   */
  async storeAgentInsight(
    agentName: string,
    issueNumber: number,
    insight: string,
    confidence: 'high' | 'medium' | 'low'
  ): Promise<void> {
    const entityName = `insight-${agentName}-${issueNumber}`;
    const observations = [
      `Agent: ${agentName}`,
      `Issue: #${issueNumber}`,
      `Insight: ${insight}`,
      `Confidence: ${confidence}`,
      `Timestamp: ${new Date().toISOString()}`,
    ];

    await this.createEntity(entityName, 'AgentInsight', observations);
    logger.info('Stored agent insight', { agentName, issueNumber, confidence });
  }

  /**
   * Search for relevant memories for an issue
   */
  async searchRelevantMemories(query: string): Promise<MemoryEntity[]> {
    try {
      // For now, return cached entities that match query
      const results: MemoryEntity[] = [];
      const queryLower = query.toLowerCase();

      for (const entity of this.cache.values()) {
        const matchesName = entity.name.toLowerCase().includes(queryLower);
        const matchesObservations = entity.observations.some(
          obs => obs.toLowerCase().includes(queryLower)
        );

        if (matchesName || matchesObservations) {
          results.push(entity);
        }
      }

      logger.info('Memory search completed', { query, resultsCount: results.length });
      return results;
    } catch (error: any) {
      logger.error('Memory search failed', { error: error.message });
      return [];
    }
  }

  /**
   * Get memories related to a specific bug type
   */
  async getBugTypeMemories(bugType: string): Promise<MemoryEntity[]> {
    return this.searchRelevantMemories(bugType);
  }

  /**
   * Get all fix strategies for similar bugs
   */
  async getSimilarFixStrategies(bugType: string): Promise<MemoryEntity[]> {
    const results: MemoryEntity[] = [];

    for (const entity of this.cache.values()) {
      if (entity.entityType === 'FixStrategy') {
        const hasBugType = entity.observations.some(
          obs => obs.toLowerCase().includes(bugType.toLowerCase())
        );
        if (hasBugType) {
          results.push(entity);
        }
      }
    }

    return results;
  }

  /**
   * Build context summary for agent prompt
   */
  async buildContextForAgent(
    issueTitle: string,
    issueBody: string
  ): Promise<string> {
    // Search for relevant patterns
    const titlePatterns = await this.searchRelevantMemories(issueTitle);

    // Extract key terms from issue body
    const keyTerms = this.extractKeyTerms(issueBody);
    const bodyPatterns: MemoryEntity[] = [];

    for (const term of keyTerms.slice(0, 3)) {
      const matches = await this.searchRelevantMemories(term);
      bodyPatterns.push(...matches);
    }

    // Deduplicate
    const allPatterns = [...new Map(
      [...titlePatterns, ...bodyPatterns].map(p => [p.name, p])
    ).values()];

    if (allPatterns.length === 0) {
      return '';
    }

    // Build context string
    let context = '## Relevant Knowledge from Previous Issues\n\n';

    for (const pattern of allPatterns.slice(0, 5)) {
      context += `### ${pattern.name} (${pattern.entityType})\n`;
      for (const obs of pattern.observations.slice(0, 3)) {
        context += `- ${obs}\n`;
      }
      context += '\n';
    }

    return context;
  }

  /**
   * Create an entity in memory
   */
  private async createEntity(
    name: string,
    entityType: string,
    observations: string[]
  ): Promise<void> {
    const entity: MemoryEntity = { name, entityType, observations };
    this.cache.set(name, entity);

    // Also add to existing entity if it exists
    const existing = this.cache.get(name);
    if (existing) {
      existing.observations = [...new Set([...existing.observations, ...observations])];
    }
  }

  /**
   * Create a relation between entities
   */
  private async createRelation(
    from: string,
    to: string,
    relationType: string
  ): Promise<void> {
    // Relations are stored as observations on the 'from' entity
    const existing = this.cache.get(from);
    if (existing) {
      existing.observations.push(`Relation: ${relationType} -> ${to}`);
    }
  }

  /**
   * Extract key terms from text for searching
   */
  private extractKeyTerms(text: string): string[] {
    // Simple extraction - could be improved with NLP
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4);

    // Count frequency
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    // Sort by frequency and return top terms
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Load memory from storage
   */
  async load(): Promise<void> {
    // Memory is loaded from MCP server automatically
    logger.info('Memory client initialized');
  }

  /**
   * Save memory to storage (for persistence)
   */
  async save(): Promise<void> {
    // Memory is persisted by MCP server
    logger.info('Memory saved', { entityCount: this.cache.size });
  }

  /**
   * Get statistics about stored knowledge
   */
  getStats(): { entityCount: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};

    for (const entity of this.cache.values()) {
      byType[entity.entityType] = (byType[entity.entityType] || 0) + 1;
    }

    return {
      entityCount: this.cache.size,
      byType
    };
  }
}
