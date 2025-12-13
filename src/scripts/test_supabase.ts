/**
 * Test script for Supabase Integration
 *
 * Run with: npx ts-node src/scripts/test_supabase.ts
 */

// Disable SSL certificate verification for development
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import * as dotenv from 'dotenv';
dotenv.config();

import { getSupabaseIntegration } from '../integrations/SupabaseClient';
import { ToolExecutor } from '../tools/ToolExecutor';

async function testSupabase() {
  console.log('='.repeat(60));
  console.log('Testing Supabase Integration');
  console.log('='.repeat(60));

  const supabase = getSupabaseIntegration();

  if (!supabase.isAvailable()) {
    console.log('❌ Supabase not configured. Check your .env file for:');
    console.log('   - SUPABASE_URL');
    console.log('   - SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  console.log('✅ Supabase client initialized');
  console.log('   Direct Postgres access:', supabase.hasDirectAccess() ? '✅ Yes' : '❌ No');
  console.log();

  // Check setup first
  console.log('Checking database setup...');
  const setup = await supabase.checkSetup();

  if (!setup.ready) {
    console.log('❌ Tables missing:', setup.missingTables.join(', '));

    if (supabase.hasDirectAccess()) {
      console.log('\n🔧 Running migrations automatically...');
      const migrationResult = await supabase.runMigration();

      if (migrationResult.success) {
        console.log('✅ Migration completed successfully!\n');
      } else {
        console.log('❌ Migration failed:', migrationResult.error);
        return;
      }
    } else {
      console.log('\n❌ No direct Postgres access. Add POSTGRES_URL to .env');
      return;
    }
  } else {
    console.log('✅ All required tables exist!\n');
  }

  // Test 1: List tables
  console.log('1. Testing list tables...');
  const tablesResult = await supabase.listTables();
  if (tablesResult.success) {
    console.log('   Tables found:', tablesResult.tables?.join(', ') || 'none');
  } else {
    console.log('   ⚠️  Could not list tables:', tablesResult.error);
  }

  // Test 2: Project memory
  console.log('\n2. Testing project memory...');
  const rememberResult = await supabase.rememberFact(
    'test_key',
    'This is a test value',
    'testing'
  );
  console.log('   Remember result:', rememberResult.success ? '✅ Success' : `❌ ${rememberResult.error}`);

  const recallResult = await supabase.recallFacts();
  if (recallResult.success) {
    console.log('   Facts recalled:', JSON.stringify(recallResult.facts, null, 2));
  } else {
    console.log('   ⚠️  Could not recall facts:', recallResult.error);
  }

  // Test 3: Agent memory
  console.log('\n3. Testing agent memory...');
  const storeMemResult = await supabase.storeMemory({
    agent_name: 'test_agent',
    issue_number: 999,
    memory_type: 'learning',
    content: 'This is a test memory from the integration test',
    context: { test: true, timestamp: new Date().toISOString() }
  });
  console.log('   Store memory result:', storeMemResult.success ? '✅ Success' : `❌ ${storeMemResult.error}`);

  const recallMemResult = await supabase.recallMemories('test_agent', { limit: 5 });
  if (recallMemResult.success) {
    console.log('   Memories recalled:', recallMemResult.memories?.length || 0);
    if (recallMemResult.memories && recallMemResult.memories.length > 0) {
      console.log('   Latest:', recallMemResult.memories[0].content);
    }
  } else {
    console.log('   ⚠️  Could not recall memories:', recallMemResult.error);
  }

  // Test 4: ToolExecutor with Supabase
  console.log('\n4. Testing ToolExecutor with Supabase tools...');
  const executor = new ToolExecutor(
    process.cwd(),
    'test-task-supabase',
    999,
    'test_agent',
    0
  );

  // Test project_remember via ToolExecutor
  const rememberToolResult = await executor.execute('project_remember', {
    key: 'styling_framework',
    value: 'Tailwind CSS',
    category: 'tooling'
  });
  console.log('   project_remember:', rememberToolResult.success ? '✅ Success' : `❌ ${(rememberToolResult as any).error}`);

  // Test project_recall via ToolExecutor
  const recallToolResult = await executor.execute('project_recall', {});
  console.log('   project_recall:', recallToolResult.success ? '✅ Success' : `❌ ${(recallToolResult as any).error}`);
  if (recallToolResult.success && (recallToolResult as any).facts) {
    console.log('   Facts:', JSON.stringify((recallToolResult as any).facts, null, 2));
  }

  // Test memory_store via ToolExecutor
  const memStoreResult = await executor.execute('memory_store', {
    memory_type: 'success',
    content: 'Successfully tested the Supabase integration',
    context: { test_run: true }
  });
  console.log('   memory_store:', memStoreResult.success ? '✅ Success' : `❌ ${(memStoreResult as any).error}`);

  // Test memory_recall via ToolExecutor
  const memRecallResult = await executor.execute('memory_recall', {
    memory_type: 'all',
    limit: 5
  });
  console.log('   memory_recall:', memRecallResult.success ? '✅ Success' : `❌ ${(memRecallResult as any).error}`);

  console.log('\n' + '='.repeat(60));
  console.log('Supabase integration test completed!');
  console.log('='.repeat(60));

  // Summary
  console.log('\nSummary:');
  console.log('- If tables were not found, run the migration SQL in Supabase dashboard');
  console.log('- File: src/scripts/supabase_migration.sql');
  console.log('- Dashboard: https://supabase.com/dashboard/project/luoraenouucmaysfolcg/sql');
}

testSupabase().catch(console.error);
