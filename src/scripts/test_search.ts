/**
 * Test semantic search
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import * as dotenv from 'dotenv';
dotenv.config({ override: true });

import { createCodebaseIndexer } from '../services/CodebaseIndexer';

async function testSearch() {
  console.log('Testing semantic search with real OpenAI embeddings...\n');

  const indexer = createCodebaseIndexer(process.cwd());

  const queries = [
    'error handling',
    'database connection',
    'agent memory storage',
    'file read write operations'
  ];

  for (const query of queries) {
    console.log(`\nQuery: "${query}"`);
    const results = await indexer.search(query, { limit: 3, threshold: 0.3 });

    if (results.length === 0) {
      console.log('  No results found');
    } else {
      for (const result of results) {
        console.log(`  - ${result.filePath} (similarity: ${result.similarity.toFixed(3)})`);
        const preview = result.content.substring(0, 60).replace(/\n/g, ' ');
        console.log(`    "${preview}..."`);
      }
    }
  }
}

testSearch().catch(console.error);
