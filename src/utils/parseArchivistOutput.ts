/**
 * Parse Archivist agent output to extract wiki updates
 */

import { logger } from './logger';

export interface ArchivistUpdate {
  page: string;
  action: 'append' | 'update' | 'create';
  section?: string;
  content: string;
}

export interface ParsedArchivistOutput {
  updates: ArchivistUpdate[];
  commitMessage: string;
  issueSummary?: {
    number: number;
    title: string;
    status: string;
    category: string;
  };
}

/**
 * Parse Archivist output to extract structured wiki updates
 */
export function parseArchivistOutput(output: string): ParsedArchivistOutput {
  try {
    logger.info('Parsing Archivist output');

    const updates: ArchivistUpdate[] = [];
    let commitMessage = 'Update wiki with issue documentation';

    // Extract issue summary if present
    const issueSummary = extractIssueSummary(output);

    // Extract commit message
    const commitMatch = output.match(/##\s*Commit Message\s*\n(.+)/i);
    if (commitMatch) {
      commitMessage = commitMatch[1].trim();
    }

    // Find all page update sections
    // Pattern: ### PageName.md
    const pagePattern = /###\s+([^\n]+\.md)\s*\n\*\*Action:\*\*\s+(APPEND|UPDATE|CREATE)\s*\n(?:\*\*Section:\*\*\s+([^\n]+)\s*\n)?\*\*Content:\*\*\s*\n```(?:markdown)?\s*\n([\s\S]*?)\n```/gi;

    let match;
    while ((match = pagePattern.exec(output)) !== null) {
      const [, pageName, action, section, content] = match;

      updates.push({
        page: pageName.trim(),
        action: action.toLowerCase() as 'append' | 'update' | 'create',
        section: section?.trim(),
        content: content.trim()
      });

      logger.info('Parsed wiki update', {
        page: pageName.trim(),
        action: action.toLowerCase(),
        hasSection: !!section,
        contentLength: content.trim().length
      });
    }

    if (updates.length === 0) {
      logger.warn('No wiki updates found in Archivist output');
    }

    logger.info('Archivist output parsed successfully', {
      updateCount: updates.length,
      commitMessage
    });

    return {
      updates,
      commitMessage,
      issueSummary
    };
  } catch (error: any) {
    logger.error('Failed to parse Archivist output', { error: error.message });
    // Return empty updates rather than failing
    return {
      updates: [],
      commitMessage: 'Update wiki (parsing failed)'
    };
  }
}

/**
 * Extract issue summary from Archivist output
 */
function extractIssueSummary(output: string): ParsedArchivistOutput['issueSummary'] {
  try {
    const issueMatch = output.match(/\*\*Issue:\*\*\s+#(\d+)\s+-\s+([^\n]+)/);
    const statusMatch = output.match(/\*\*Status:\*\*\s+([^\n]+)/);
    const categoryMatch = output.match(/\*\*Category:\*\*\s+([^\n]+)/);

    if (issueMatch) {
      return {
        number: parseInt(issueMatch[1], 10),
        title: issueMatch[2].trim(),
        status: statusMatch ? statusMatch[1].trim() : 'UNKNOWN',
        category: categoryMatch ? categoryMatch[1].trim() : 'UNKNOWN'
      };
    }

    return undefined;
  } catch (error: any) {
    logger.warn('Failed to extract issue summary', { error: error.message });
    return undefined;
  }
}

/**
 * Apply section-based update to existing page content
 * If section is specified, find and update/append to that section
 * Otherwise, append to end of page
 */
export function applySectionUpdate(
  existingContent: string,
  section: string | undefined,
  newContent: string,
  action: 'append' | 'update'
): string {
  if (!section || action === 'update') {
    // No section specified or full update - append to end
    return existingContent + '\n\n' + newContent;
  }

  // Section specified - try to find it
  const sectionRegex = new RegExp(`(##\\s+${escapeRegExp(section)}[\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const match = existingContent.match(sectionRegex);

  if (match) {
    // Section exists - append to it
    const sectionContent = match[1];
    const updatedSection = sectionContent + '\n\n' + newContent;
    return existingContent.replace(sectionRegex, updatedSection);
  } else {
    // Section doesn't exist - append as new section
    if (section.startsWith('Create New Section:')) {
      const sectionName = section.replace('Create New Section:', '').trim();
      return existingContent + `\n\n## ${sectionName}\n\n${newContent}`;
    } else {
      // Append to existing section or end
      return existingContent + `\n\n## ${section}\n\n${newContent}`;
    }
  }
}

/**
 * Escape special regex characters
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate parsed updates before applying
 */
export function validateArchivistUpdates(parsed: ParsedArchivistOutput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (parsed.updates.length === 0) {
    errors.push('No updates found in Archivist output');
  }

  for (const update of parsed.updates) {
    if (!update.page) {
      errors.push('Update missing page name');
    }

    if (!['append', 'update', 'create'].includes(update.action)) {
      errors.push(`Invalid action: ${update.action}`);
    }

    if (!update.content || update.content.trim().length === 0) {
      errors.push(`Update for ${update.page} has no content`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
