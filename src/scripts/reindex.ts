/**
 * Force re-index the codebase with real embeddings
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import * as dotenv from 'dotenv';
dotenv.config({ override: true });

import { createCodebaseIndexer } from '../services/CodebaseIndexer';

async function reindex() {
  console.log('Starting forced re-index with real OpenAI embeddings...');
  console.log('API Key starts with:', process.env.OPENAI_API_KEY?.substring(0, 15) + '...');

  const indexer = createCodebaseIndexer(process.cwd());
  const stats = await indexer.indexCodebase({ forceReindex: true });

  console.log('\nRe-indexing complete!');
  console.log(`- Files processed: ${stats.filesProcessed}`);
  console.log(`- Chunks created: ${stats.chunksCreated}`);
  console.log(`- Embeddings generated: ${stats.embeddingsGenerated}`);
  console.log(`- Errors: ${stats.errors}`);
}

reindex().catch(console.error);
