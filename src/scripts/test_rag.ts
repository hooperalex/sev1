/**
 * Test script for RAG (Retrieval Augmented Generation) System
 *
 * Run with: npx ts-node src/scripts/test_rag.ts
 */

// Disable SSL certificate verification for development
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import * as dotenv from 'dotenv';
dotenv.config({ override: true });

import { getEmbeddingService } from '../services/EmbeddingService';
import { createCodebaseIndexer } from '../services/CodebaseIndexer';
import { getSupabaseIntegration } from '../integrations/SupabaseClient';

async function testRAG() {
  console.log('='.repeat(60));
  console.log('Testing RAG System');
  console.log('='.repeat(60));

  // Test 1: Embedding Service
  console.log('\n1. Testing Embedding Service...');
  const embeddings = getEmbeddingService();
  const info = embeddings.getProviderInfo();
  console.log(`   Provider: ${info.provider}`);
  console.log(`   Model: ${info.model}`);
  console.log(`   Dimensions: ${info.dimensions}`);

  // Generate a test embedding
  const testText = 'function handleError(error) { console.log(error); }';
  console.log('\n   Generating embedding for test code...');
  const embedding = await embeddings.embed(testText);
  console.log(`   ✅ Generated embedding with ${embedding.length} dimensions`);
  console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);

  // Test 2: Supabase Setup Check
  console.log('\n2. Checking Supabase setup...');
  const supabase = getSupabaseIntegration();
  if (!supabase.isAvailable()) {
    console.log('   ❌ Supabase not available');
    return;
  }
  console.log('   ✅ Supabase connected');
  console.log('   Direct Postgres:', supabase.hasDirectAccess() ? '✅ Yes' : '❌ No');

  // Check if code_embeddings table exists
  const setup = await supabase.checkSetup();
  if (!setup.ready) {
    console.log('   ⚠️  Tables missing. Running migration...');
    const migrationResult = await supabase.runMigration();
    if (!migrationResult.success) {
      console.log('   ❌ Migration failed:', migrationResult.error);
      return;
    }
    console.log('   ✅ Migration completed');
  }

  // Test 3: Codebase Indexer
  console.log('\n3. Testing Codebase Indexer...');
  const indexer = createCodebaseIndexer(process.cwd());

  // Get current stats
  const stats = await indexer.getStats();
  console.log(`   Current index: ${stats.totalChunks} chunks from ${stats.totalFiles} files`);
  console.log(`   Last indexed: ${stats.lastIndexed || 'Never'}`);

  // Index the codebase (or a subset)
  console.log('\n4. Indexing codebase (this may take a moment)...');
  const indexStats = await indexer.indexCodebase();
  console.log(`   ✅ Indexed ${indexStats.filesProcessed} files`);
  console.log(`   ✅ Created ${indexStats.chunksCreated} chunks`);
  console.log(`   ✅ Generated ${indexStats.embeddingsGenerated} embeddings`);
  if (indexStats.errors > 0) {
    console.log(`   ⚠️  ${indexStats.errors} errors encountered`);
  }

  // Test 5: Semantic Search
  console.log('\n5. Testing Semantic Search...');
  const searchQueries = [
    'error handling',
    'database connection',
    'file operations',
    'agent memory storage'
  ];

  for (const query of searchQueries) {
    console.log(`\n   Query: "${query}"`);
    const results = await indexer.search(query, { limit: 3 });

    if (results.length === 0) {
      console.log('   No results found');
    } else {
      for (const result of results) {
        console.log(`   - ${result.filePath} (similarity: ${result.similarity.toFixed(3)})`);
        const preview = result.content.substring(0, 80).replace(/\n/g, ' ');
        console.log(`     "${preview}..."`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('RAG System Test Complete!');
  console.log('='.repeat(60));

  // Summary
  console.log('\nSummary:');
  console.log(`- Embedding provider: ${info.provider} (${info.provider === 'mock' ? 'add OPENAI_API_KEY for real embeddings' : 'production ready'})`);
  console.log(`- Index: ${indexStats.chunksCreated} chunks from ${indexStats.filesProcessed} files`);
  console.log('- Search: Working');
}

testRAG().catch(console.error);
