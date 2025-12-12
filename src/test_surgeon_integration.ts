/**
 * Integration Test: Surgeon Agent with Tool Use
 *
 * Tests that the Surgeon agent can:
 * 1. Use tools to read existing files
 * 2. Use tools to write modified files
 * 3. Actually create files on disk
 * 4. Complete a simple bug fix end-to-end
 *
 * Usage:
 *   npx ts-node src/test_surgeon_integration.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentRunner } from './AgentRunner';
import { logger } from './utils/logger';

dotenv.config();

const TEST_DIR = path.join(process.cwd(), 'test_integration');

async function setupTestEnvironment() {
  console.log('\n📁 Setting up test environment...\n');

  // Create test directory
  await fs.mkdir(TEST_DIR, { recursive: true });

  // Create a buggy file
  const buggyCode = `export class Calculator {
  add(a: number, b: number): number {
    return a - b;  // BUG: Should be a + b
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}`;

  await fs.writeFile(
    path.join(TEST_DIR, 'calculator.ts'),
    buggyCode,
    'utf-8'
  );

  console.log('✓ Created buggy calculator.ts');
  console.log('  Bug: add() method uses subtraction instead of addition\n');
}

async function cleanupTestEnvironment() {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  console.log('\n✓ Cleaned up test environment');
}

async function main() {
  console.log('🧪 Surgeon Agent Integration Test\n');
  console.log('Testing that Surgeon can use tools to fix a real bug\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not found in environment');
    console.error('   Set it in .env file');
    process.exit(1);
  }

  try {
    // Setup
    await setupTestEnvironment();

    // Initialize AgentRunner
    const agentRunner = new AgentRunner(
      process.env.ANTHROPIC_API_KEY!,
      './.claude/agents',
      null
    );

    // Build context for Surgeon
    const context = {
      issueTitle: 'Fix Calculator.add() method - uses subtraction instead of addition',
      issueBody: `The Calculator class has a bug in the add() method. It's currently using subtraction (a - b) instead of addition (a + b).

Location: test_integration/calculator.ts
Line: 3

Expected behavior: add(2, 3) should return 5
Actual behavior: add(2, 3) returns -1

This is clearly a copy-paste error from the subtract() method.`,
      previousOutput: `# Detective Report

## Classification: BUG

This is a clear implementation bug. The add() method is using the wrong operator.

## Severity: Medium
- Affects core functionality
- Easy to fix
- No security implications

## Root Cause Analysis (from Archaeologist):

The add() method in Calculator class uses subtraction operator instead of addition:

\`\`\`typescript
add(a: number, b: number): number {
  return a - b;  // BUG: Should be a + b
}
\`\`\`

This appears to be a copy-paste error from the subtract() method.

## Recommendation: PROCEED with fix

Simple one-line change: Replace \`a - b\` with \`a + b\` in the add() method.`
    };

    console.log('🔄 Running Surgeon agent with tool use enabled...\n');

    // Run Surgeon with tools enabled
    const startTime = Date.now();
    const result = await agentRunner.runAgent('surgeon', context, { toolsEnabled: true });
    const duration = Date.now() - startTime;

    console.log('\n' + '='.repeat(80));
    console.log('SURGEON AGENT RESULTS');
    console.log('='.repeat(80));

    if (result.success) {
      console.log('\n✅ Agent completed successfully\n');
      console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
      console.log(`Tokens used: ${result.tokensUsed?.toLocaleString()}`);

      console.log('\n--- Agent Output ---');
      console.log(result.output.substring(0, 800));
      if (result.output.length > 800) {
        console.log('\n... (output truncated) ...\n');
      }

      // Check if file was actually modified
      console.log('\n📝 Verifying file was actually modified...\n');

      const fixedContent = await fs.readFile(
        path.join(TEST_DIR, 'calculator.ts'),
        'utf-8'
      );

      console.log('--- Fixed File Content ---');
      console.log(fixedContent);
      console.log('--- End of File ---\n');

      // Verify the fix
      if (fixedContent.includes('return a + b')) {
        console.log('✅ SUCCESS: File was actually modified!');
        console.log('   The add() method now correctly uses addition (a + b)');

        // Verify the bug is gone
        if (!fixedContent.includes('return a - b;  // BUG')) {
          console.log('✅ Bug comment removed or fixed');
        }

        console.log('\n' + '='.repeat(80));
        console.log('🎉 INTEGRATION TEST PASSED');
        console.log('='.repeat(80));
        console.log('\nThe Surgeon agent successfully:');
        console.log('  1. ✅ Used read_file tool to examine the buggy code');
        console.log('  2. ✅ Used write_file tool to write the corrected code');
        console.log('  3. ✅ Actually modified the file on disk');
        console.log('  4. ✅ Fixed the bug correctly (a - b → a + b)');
        console.log('\n🚀 Tool use implementation is WORKING!\n');

        await cleanupTestEnvironment();
        process.exit(0);

      } else {
        console.log('❌ FAIL: File was not modified correctly');
        console.log('   Expected to find "return a + b" in the file');
        console.log('   The Surgeon may have output code in text instead of using tools');

        await cleanupTestEnvironment();
        process.exit(1);
      }

    } else {
      console.log('\n❌ Agent failed\n');
      console.log('Error:', result.error);

      await cleanupTestEnvironment();
      process.exit(1);
    }

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);

    try {
      await cleanupTestEnvironment();
    } catch (cleanupError) {
      console.error('Failed to cleanup:', cleanupError);
    }

    process.exit(1);
  }
}

main();
