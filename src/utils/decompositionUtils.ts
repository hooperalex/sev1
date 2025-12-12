/**
 * Utilities for parsing and validating decomposition agent output
 */

import { TaskState } from '../Orchestrator';
import { logger } from './logger';

export interface SubTask {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
}

export interface ParsedDecomposition {
  shouldDecompose: boolean;
  subTasks: SubTask[];
  reasoning: string;
}

/**
 * Parse decomposer agent output into structured format
 */
export function parseDecomposerOutput(output: string): ParsedDecomposition {
  const result: ParsedDecomposition = {
    shouldDecompose: false,
    subTasks: [],
    reasoning: ''
  };

  try {
    // Extract decision
    const decisionMatch = output.match(/##\s*Decision:\s*(DECOMPOSE|PROCEED)/i);
    if (decisionMatch) {
      result.shouldDecompose = decisionMatch[1].toUpperCase() === 'DECOMPOSE';
    }

    // Extract reasoning
    const reasoningMatch = output.match(/##\s*Reasoning\s*\n([\s\S]*?)(?=##|$)/i);
    if (reasoningMatch) {
      result.reasoning = reasoningMatch[1].trim();
    }

    // If not decomposing, return early
    if (!result.shouldDecompose) {
      return result;
    }

    // Extract sub-tasks
    const subTasksSection = output.match(/##\s*Sub-Tasks[\s\S]*$/i);
    if (!subTasksSection) {
      logger.warn('No sub-tasks section found in decomposer output');
      return result;
    }

    // Parse individual sub-tasks
    const subTaskMatches = subTasksSection[0].matchAll(/###\s*Sub-Task\s*\d+:\s*([^\n]+)\s*\n([\s\S]*?)(?=###\s*Sub-Task|\z)/gi);

    for (const match of subTaskMatches) {
      const title = match[1].trim();
      const body = match[2];

      // Extract description
      const descMatch = body.match(/\*\*Description:\*\*\s*([^\n]+)/i);
      const description = descMatch ? descMatch[1].trim() : '';

      // Extract acceptance criteria
      const criteriaSection = body.match(/\*\*Acceptance Criteria:\*\*\s*\n((?:- \[.?\] .+\n?)*)/i);
      const acceptanceCriteria: string[] = [];
      if (criteriaSection) {
        const criteriaMatches = criteriaSection[1].matchAll(/- \[.?\] (.+)/g);
        for (const cm of criteriaMatches) {
          acceptanceCriteria.push(cm[1].trim());
        }
      }

      // Extract complexity
      const complexityMatch = body.match(/\*\*Estimated Complexity:\*\*\s*(Low|Medium|High)/i);
      const estimatedComplexity = (complexityMatch ? complexityMatch[1].toLowerCase() : 'medium') as 'low' | 'medium' | 'high';

      if (title && description) {
        result.subTasks.push({
          title,
          description,
          acceptanceCriteria,
          estimatedComplexity
        });
      }
    }

    logger.info('Parsed decomposition', {
      shouldDecompose: result.shouldDecompose,
      subTaskCount: result.subTasks.length
    });

  } catch (error: any) {
    logger.error('Failed to parse decomposer output', { error: error.message });
  }

  return result;
}

/**
 * Format sub-issue body with parent context
 */
export function formatSubIssueBody(subTask: SubTask, parentContext: {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
}): string {
  const criteriaList = subTask.acceptanceCriteria
    .map(c => `- [ ] ${c}`)
    .join('\n');

  // Extract relevant excerpt from parent (first 500 chars)
  const parentExcerpt = parentContext.issueBody.length > 500
    ? parentContext.issueBody.substring(0, 500) + '...'
    : parentContext.issueBody;

  return `**Part of:** #${parentContext.issueNumber}

## Task Description
${subTask.description}

## Acceptance Criteria
${criteriaList || '- [ ] Complete implementation'}

## Context from Parent Issue
**Parent:** ${parentContext.issueTitle}

${parentExcerpt}

---
*This is a sub-task automatically created by the AI Team decomposition system.*
`;
}

/**
 * Validate decomposition output
 */
export function validateDecomposition(parsed: ParsedDecomposition): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (parsed.shouldDecompose) {
    // Check sub-tasks count
    if (parsed.subTasks.length === 0) {
      errors.push('Decision is DECOMPOSE but no sub-tasks found');
    }

    const maxSubIssues = parseInt(process.env.MAX_SUB_ISSUES || '5', 10);
    if (parsed.subTasks.length > maxSubIssues) {
      errors.push(`Too many sub-tasks: ${parsed.subTasks.length} (max: ${maxSubIssues})`);
    }

    // Validate each sub-task
    parsed.subTasks.forEach((subTask, index) => {
      if (!subTask.title || subTask.title.length < 3) {
        errors.push(`Sub-task ${index + 1}: Title too short or missing`);
      }
      if (!subTask.description || subTask.description.length < 10) {
        errors.push(`Sub-task ${index + 1}: Description too short or missing`);
      }
      if (subTask.acceptanceCriteria.length === 0) {
        errors.push(`Sub-task ${index + 1}: No acceptance criteria`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
