/**
 * Codebase Indexer: Index code files for semantic search
 *
 * Features:
 * - Scans codebase for relevant files
 * - Chunks files into meaningful pieces
 * - Generates embeddings for each chunk
 * - Stores in Supabase for vector search
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { getEmbeddingService, EmbeddingService } from './EmbeddingService';
import { getSupabaseIntegration, SupabaseIntegration } from '../integrations/SupabaseClient';

export interface CodeChunk {
  filePath: string;
  chunkIndex: number;
  content: string;
  startLine: number;
  endLine: number;
}

export interface IndexStats {
  filesProcessed: number;
  chunksCreated: number;
  embeddingsGenerated: number;
  errors: number;
}

// File extensions to index
const INDEXABLE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx',  // JavaScript/TypeScript
  '.py',                         // Python
  '.java',                       // Java
  '.go',                         // Go
  '.rs',                         // Rust
  '.c', '.cpp', '.h', '.hpp',    // C/C++
  '.cs',                         // C#
  '.rb',                         // Ruby
  '.php',                        // PHP
  '.swift',                      // Swift
  '.kt',                         // Kotlin
  '.scala',                      // Scala
  '.vue', '.svelte',             // Frontend frameworks
  '.sql',                        // SQL
  '.md',                         // Markdown (documentation)
  '.json',                       // Config files
  '.yaml', '.yml'                // YAML configs
];

// Directories to skip
const SKIP_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '__pycache__', '.pytest_cache', 'venv', '.venv',
  '.next', '.nuxt', '.output', 'target', 'bin', 'obj'
];

// Max chunk size in characters (roughly 500 tokens)
const MAX_CHUNK_SIZE = 2000;
// Overlap between chunks to maintain context
const CHUNK_OVERLAP = 200;

export class CodebaseIndexer {
  private baseDir: string;
  private embeddings: EmbeddingService;
  private supabase: SupabaseIntegration;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
    this.embeddings = getEmbeddingService();
    this.supabase = getSupabaseIntegration();
  }

  /**
   * Index the entire codebase
   */
  async indexCodebase(options?: {
    forceReindex?: boolean;
    includePatterns?: string[];
    excludePatterns?: string[];
  }): Promise<IndexStats> {
    const stats: IndexStats = {
      filesProcessed: 0,
      chunksCreated: 0,
      embeddingsGenerated: 0,
      errors: 0
    };

    logger.info('Starting codebase indexing', { baseDir: this.baseDir });

    try {
      // Find all indexable files
      const files = await this.findFiles(this.baseDir, options?.excludePatterns);
      logger.info(`Found ${files.length} files to index`);

      // Process files in batches
      const batchSize = 10;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        await Promise.all(batch.map(async (file) => {
          try {
            const fileStats = await this.indexFile(file, options?.forceReindex);
            stats.filesProcessed++;
            stats.chunksCreated += fileStats.chunks;
            stats.embeddingsGenerated += fileStats.embeddings;
          } catch (error: any) {
            logger.error('Failed to index file', { file, error: error.message });
            stats.errors++;
          }
        }));

        // Progress update
        logger.info(`Indexing progress: ${Math.min(i + batchSize, files.length)}/${files.length} files`);
      }

      logger.info('Codebase indexing complete', stats);
      return stats;

    } catch (error: any) {
      logger.error('Codebase indexing failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Find all indexable files in directory
   */
  private async findFiles(dir: string, excludePatterns?: string[]): Promise<string[]> {
    const files: string[] = [];

    const scan = async (currentDir: string) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(this.baseDir, fullPath);

        // Skip excluded directories
        if (entry.isDirectory()) {
          if (SKIP_DIRS.includes(entry.name)) continue;
          if (excludePatterns?.some(p => relativePath.includes(p))) continue;
          await scan(fullPath);
          continue;
        }

        // Check if file is indexable
        const ext = path.extname(entry.name).toLowerCase();
        if (!INDEXABLE_EXTENSIONS.includes(ext)) continue;
        if (excludePatterns?.some(p => relativePath.includes(p))) continue;

        files.push(fullPath);
      }
    };

    await scan(dir);
    return files;
  }

  /**
   * Index a single file
   */
  private async indexFile(filePath: string, forceReindex?: boolean): Promise<{ chunks: number; embeddings: number }> {
    const relativePath = path.relative(this.baseDir, filePath);

    // Check if file needs reindexing
    if (!forceReindex) {
      const existing = await this.getExistingChunks(relativePath);
      const fileStat = await fs.stat(filePath);

      // Skip if already indexed and not modified
      if (existing.length > 0) {
        const lastIndexed = new Date(existing[0].updated_at || 0);
        if (fileStat.mtime <= lastIndexed) {
          return { chunks: 0, embeddings: 0 };
        }
      }
    }

    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');

    // Skip empty or very small files
    if (content.trim().length < 50) {
      return { chunks: 0, embeddings: 0 };
    }

    // Chunk the file
    const chunks = this.chunkFile(content, relativePath);

    // Generate embeddings
    const embeddings = await this.embeddings.embedBatch(
      chunks.map(c => this.formatChunkForEmbedding(c))
    );

    // Store in Supabase
    await this.storeChunks(relativePath, chunks, embeddings);

    return { chunks: chunks.length, embeddings: embeddings.length };
  }

  /**
   * Chunk a file into smaller pieces
   */
  private chunkFile(content: string, filePath: string): CodeChunk[] {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];

    let currentChunk = '';
    let startLine = 1;
    let currentLine = 1;

    for (const line of lines) {
      const newContent = currentChunk + (currentChunk ? '\n' : '') + line;

      // Check if adding this line exceeds max size
      if (newContent.length > MAX_CHUNK_SIZE && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          filePath,
          chunkIndex: chunks.length,
          content: currentChunk,
          startLine,
          endLine: currentLine - 1
        });

        // Start new chunk with overlap
        const overlapLines = this.getOverlapLines(currentChunk, CHUNK_OVERLAP);
        currentChunk = overlapLines + line;
        startLine = currentLine - overlapLines.split('\n').length + 1;
      } else {
        currentChunk = newContent;
      }

      currentLine++;
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        filePath,
        chunkIndex: chunks.length,
        content: currentChunk,
        startLine,
        endLine: currentLine - 1
      });
    }

    return chunks;
  }

  /**
   * Get overlap lines from end of content
   */
  private getOverlapLines(content: string, maxChars: number): string {
    const lines = content.split('\n');
    let overlap = '';

    for (let i = lines.length - 1; i >= 0; i--) {
      const newOverlap = lines[i] + (overlap ? '\n' + overlap : '');
      if (newOverlap.length > maxChars) break;
      overlap = newOverlap;
    }

    return overlap;
  }

  /**
   * Format chunk for embedding (add context)
   */
  private formatChunkForEmbedding(chunk: CodeChunk): string {
    return `File: ${chunk.filePath}\nLines ${chunk.startLine}-${chunk.endLine}:\n${chunk.content}`;
  }

  /**
   * Get existing chunks for a file from database
   */
  private async getExistingChunks(filePath: string): Promise<any[]> {
    if (!this.supabase.isAvailable()) return [];

    try {
      const result = await this.supabase.executeDirect(
        `SELECT * FROM code_embeddings WHERE file_path = '${filePath.replace(/'/g, "''")}' ORDER BY chunk_index`
      );
      return result.rows || [];
    } catch {
      return [];
    }
  }

  /**
   * Store chunks with embeddings in Supabase
   */
  private async storeChunks(filePath: string, chunks: CodeChunk[], embeddings: number[][]): Promise<void> {
    if (!this.supabase.isAvailable()) {
      logger.warn('Supabase not available - chunks not stored');
      return;
    }

    // Delete existing chunks for this file
    await this.supabase.executeDirect(
      `DELETE FROM code_embeddings WHERE file_path = '${filePath.replace(/'/g, "''")}'`
    );

    // Insert new chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const embeddingStr = `[${embedding.join(',')}]`;

      await this.supabase.executeDirect(`
        INSERT INTO code_embeddings (file_path, chunk_index, content, embedding, updated_at)
        VALUES (
          '${chunk.filePath.replace(/'/g, "''")}',
          ${chunk.chunkIndex},
          '${chunk.content.replace(/'/g, "''")}',
          '${embeddingStr}'::vector,
          NOW()
        )
      `);
    }
  }

  /**
   * Search for similar code chunks
   */
  async search(query: string, options?: {
    limit?: number;
    threshold?: number;
    filePattern?: string;
  }): Promise<Array<{
    filePath: string;
    content: string;
    similarity: number;
    startLine?: number;
    endLine?: number;
  }>> {
    const limit = options?.limit || 10;
    const threshold = options?.threshold || 0.5;

    // Generate embedding for query
    const queryEmbedding = await this.embeddings.embed(query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Search using vector similarity
    let sql = `
      SELECT
        file_path,
        content,
        1 - (embedding <=> '${embeddingStr}'::vector) as similarity
      FROM code_embeddings
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> '${embeddingStr}'::vector) > ${threshold}
    `;

    if (options?.filePattern) {
      sql += ` AND file_path LIKE '%${options.filePattern}%'`;
    }

    sql += ` ORDER BY embedding <=> '${embeddingStr}'::vector LIMIT ${limit}`;

    const result = await this.supabase.executeDirect(sql);

    return (result.rows || []).map((row: any) => ({
      filePath: row.file_path,
      content: row.content,
      similarity: parseFloat(row.similarity)
    }));
  }

  /**
   * Get indexing stats
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalChunks: number;
    lastIndexed: Date | null;
  }> {
    const result = await this.supabase.executeDirect(`
      SELECT
        COUNT(DISTINCT file_path) as total_files,
        COUNT(*) as total_chunks,
        MAX(updated_at) as last_indexed
      FROM code_embeddings
    `);

    const row = result.rows?.[0] || {};
    return {
      totalFiles: parseInt(row.total_files) || 0,
      totalChunks: parseInt(row.total_chunks) || 0,
      lastIndexed: row.last_indexed ? new Date(row.last_indexed) : null
    };
  }
}

// Factory function
export function createCodebaseIndexer(baseDir: string): CodebaseIndexer {
  return new CodebaseIndexer(baseDir);
}
