/**
 * Embedding Service: Generate vector embeddings for semantic search
 *
 * Supports multiple providers:
 * - OpenAI text-embedding-3-small (1536 dimensions)
 * - Voyage AI (Anthropic's recommended partner)
 * - Falls back to simple hashing for testing without API keys
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger';

export type EmbeddingProvider = 'openai' | 'voyage' | 'mock';

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model?: string;
  dimensions?: number;
}

export class EmbeddingService {
  private openai: OpenAI | null = null;
  private provider: EmbeddingProvider;
  private model: string;
  private dimensions: number;

  constructor(config?: Partial<EmbeddingConfig>) {
    // Determine provider based on available API keys
    const openaiKey = process.env.OPENAI_API_KEY;
    const voyageKey = process.env.VOYAGE_API_KEY;

    if (config?.provider) {
      this.provider = config.provider;
    } else if (openaiKey) {
      this.provider = 'openai';
    } else if (voyageKey) {
      this.provider = 'voyage';
    } else {
      this.provider = 'mock';
      logger.warn('No embedding API key found - using mock embeddings. Set OPENAI_API_KEY for real embeddings.');
    }

    // Set model and dimensions based on provider
    switch (this.provider) {
      case 'openai':
        this.model = config?.model || 'text-embedding-3-small';
        this.dimensions = config?.dimensions || 1536;
        this.openai = new OpenAI({ apiKey: openaiKey });
        break;
      case 'voyage':
        this.model = config?.model || 'voyage-code-2';
        this.dimensions = config?.dimensions || 1536;
        // Voyage uses OpenAI-compatible API
        this.openai = new OpenAI({
          apiKey: voyageKey,
          baseURL: 'https://api.voyageai.com/v1'
        });
        break;
      case 'mock':
      default:
        this.model = 'mock';
        this.dimensions = 1536;
        break;
    }

    logger.info('EmbeddingService initialized', {
      provider: this.provider,
      model: this.model,
      dimensions: this.dimensions
    });
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    if (this.provider === 'mock') {
      return this.mockEmbed(text);
    }

    try {
      const response = await this.openai!.embeddings.create({
        model: this.model,
        input: text,
        dimensions: this.dimensions
      });

      return response.data[0].embedding;
    } catch (error: any) {
      logger.error('Embedding generation failed', { error: error.message });
      // Fall back to mock if API fails
      return this.mockEmbed(text);
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (this.provider === 'mock') {
      return texts.map(t => this.mockEmbed(t));
    }

    try {
      // OpenAI supports batch embedding
      const response = await this.openai!.embeddings.create({
        model: this.model,
        input: texts,
        dimensions: this.dimensions
      });

      return response.data.map(d => d.embedding);
    } catch (error: any) {
      logger.error('Batch embedding failed', { error: error.message });
      return texts.map(t => this.mockEmbed(t));
    }
  }

  /**
   * Mock embedding using deterministic hash
   * Useful for testing without API keys
   */
  private mockEmbed(text: string): number[] {
    const embedding = new Array(this.dimensions).fill(0);

    // Simple hash-based mock embedding
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const idx = (charCode * (i + 1)) % this.dimensions;
      embedding[idx] = (embedding[idx] + charCode / 255) % 1;
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Get the current provider info
   */
  getProviderInfo(): { provider: EmbeddingProvider; model: string; dimensions: number } {
    return {
      provider: this.provider,
      model: this.model,
      dimensions: this.dimensions
    };
  }
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}
