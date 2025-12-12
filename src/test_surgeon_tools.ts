/**
 * Test Suite: Surgeon Agent Tool Use
 *
 * Validates that the Surgeon agent can:
 * 1. Use file operation tools correctly
 * 2. Read existing files
 * 3. Write new files
 * 4. Modify existing files
 * 5. Handle errors gracefully
 * 6. Respect security constraints
 *
 * Usage:
 *   ts-node src/test_surgeon_tools.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ToolExecutor } from './tools/ToolExecutor';
import { logger } from './utils/logger';

const TEST_DIR = path.join(process.cwd(), 'test_temp');

async function setupTestEnvironment() {
  // Create test directory
  await fs.mkdir(TEST_DIR, { recursive: true });

  // Create a test file
  await fs.writeFile(
    path.join(TEST_DIR, 'existing.ts'),
    'export const hello = () => console.log("Hello");',
    'utf-8'
  );

  logger.info('Test environment created', { testDir: TEST_DIR });
}

async function cleanupTestEnvironment() {
  // Remove test directory
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  logger.info('Test environment cleaned up');
}

async function testReadFile(executor: ToolExecutor) {
  console.log('\n[Test 1] Read existing file');

  const result = await executor.execute('read_file', {
    path: 'test_temp/existing.ts'
  });

  if (result.success && result.content?.includes('hello')) {
    console.log('✅ PASS: Successfully read existing file');
    return true;
  } else {
    console.log('❌ FAIL: Could not read existing file');
    console.log('Result:', result);
    return false;
  }
}

async function testWriteNewFile(executor: ToolExecutor) {
  console.log('\n[Test 2] Write new file');

  const content = 'export const goodbye = () => console.log("Goodbye");';
  const result = await executor.execute('write_file', {
    path: 'test_temp/new.ts',
    content
  });

  if (result.success) {
    // Verify file was actually written
    const fileContent = await fs.readFile(
      path.join(TEST_DIR, 'new.ts'),
      'utf-8'
    );

    if (fileContent === content) {
      console.log('✅ PASS: Successfully wrote new file');
      return true;
    } else {
      console.log('❌ FAIL: File content mismatch');
      return false;
    }
  } else {
    console.log('❌ FAIL: Could not write new file');
    console.log('Result:', result);
    return false;
  }
}

async function testModifyExistingFile(executor: ToolExecutor) {
  console.log('\n[Test 3] Modify existing file');

  const newContent = 'export const hello = () => console.log("Hello World!");';
  const result = await executor.execute('write_file', {
    path: 'test_temp/existing.ts',
    content: newContent
  });

  if (result.success) {
    // Verify file was actually modified
    const fileContent = await fs.readFile(
      path.join(TEST_DIR, 'existing.ts'),
      'utf-8'
    );

    if (fileContent === newContent) {
      console.log('✅ PASS: Successfully modified existing file');
      return true;
    } else {
      console.log('❌ FAIL: File modification failed');
      return false;
    }
  } else {
    console.log('❌ FAIL: Could not modify existing file');
    console.log('Result:', result);
    return false;
  }
}

async function testCreateNestedDirectories(executor: ToolExecutor) {
  console.log('\n[Test 4] Create file with nested directories');

  const result = await executor.execute('write_file', {
    path: 'test_temp/nested/deep/file.ts',
    content: 'export const deep = true;'
  });

  if (result.success) {
    // Verify file exists
    const filePath = path.join(TEST_DIR, 'nested/deep/file.ts');
    const exists = await fs.access(filePath).then(() => true).catch(() => false);

    if (exists) {
      console.log('✅ PASS: Successfully created nested directories and file');
      return true;
    } else {
      console.log('❌ FAIL: Nested file not created');
      return false;
    }
  } else {
    console.log('❌ FAIL: Could not create nested file');
    console.log('Result:', result);
    return false;
  }
}

async function testListDirectory(executor: ToolExecutor) {
  console.log('\n[Test 5] List directory contents');

  const result = await executor.execute('list_directory', {
    path: 'test_temp'
  });

  if (result.success && result.items && result.items.length > 0) {
    console.log('✅ PASS: Successfully listed directory');
    console.log('  Files found:', result.items.join(', '));
    return true;
  } else {
    console.log('❌ FAIL: Could not list directory');
    console.log('Result:', result);
    return false;
  }
}

async function testFileExists(executor: ToolExecutor) {
  console.log('\n[Test 6] Check file existence');

  const existsResult = await executor.execute('file_exists', {
    path: 'test_temp/existing.ts'
  });

  const notExistsResult = await executor.execute('file_exists', {
    path: 'test_temp/nonexistent.ts'
  });

  if (existsResult.success && existsResult.exists === true &&
      notExistsResult.success && notExistsResult.exists === false) {
    console.log('✅ PASS: File existence checks work correctly');
    return true;
  } else {
    console.log('❌ FAIL: File existence checks failed');
    console.log('Exists result:', existsResult);
    console.log('Not exists result:', notExistsResult);
    return false;
  }
}

async function testPathTraversalBlocked(executor: ToolExecutor) {
  console.log('\n[Test 7] Security: Block path traversal');

  const result = await executor.execute('read_file', {
    path: '../../../etc/passwd'
  });

  if (!result.success && result.error?.includes('Path traversal')) {
    console.log('✅ PASS: Path traversal blocked');
    return true;
  } else {
    console.log('❌ FAIL: Path traversal NOT blocked - SECURITY ISSUE!');
    console.log('Result:', result);
    return false;
  }
}

async function testAbsolutePathBlocked(executor: ToolExecutor) {
  console.log('\n[Test 8] Security: Block absolute paths');

  const result = await executor.execute('read_file', {
    path: '/etc/passwd'
  });

  if (!result.success && result.error?.includes('Absolute paths')) {
    console.log('✅ PASS: Absolute paths blocked');
    return true;
  } else {
    console.log('❌ FAIL: Absolute paths NOT blocked - SECURITY ISSUE!');
    console.log('Result:', result);
    return false;
  }
}

async function testReadNonexistentFile(executor: ToolExecutor) {
  console.log('\n[Test 9] Error handling: Read nonexistent file');

  const result = await executor.execute('read_file', {
    path: 'test_temp/nonexistent.ts'
  });

  if (!result.success && result.error?.includes('not found')) {
    console.log('✅ PASS: Nonexistent file error handled');
    return true;
  } else {
    console.log('❌ FAIL: Nonexistent file error not handled');
    console.log('Result:', result);
    return false;
  }
}

async function testReadDirectory(executor: ToolExecutor) {
  console.log('\n[Test 10] Error handling: Read directory as file');

  const result = await executor.execute('read_file', {
    path: 'test_temp'
  });

  if (!result.success && result.error?.includes('directory')) {
    console.log('✅ PASS: Directory read error handled');
    return true;
  } else {
    console.log('❌ FAIL: Directory read error not handled');
    console.log('Result:', result);
    return false;
  }
}

async function testUnknownTool(executor: ToolExecutor) {
  console.log('\n[Test 11] Error handling: Unknown tool');

  const result = await executor.execute('delete_file', {
    path: 'test_temp/existing.ts'
  });

  if (!result.success && result.error?.includes('Unknown tool')) {
    console.log('✅ PASS: Unknown tool error handled');
    return true;
  } else {
    console.log('❌ FAIL: Unknown tool error not handled');
    console.log('Result:', result);
    return false;
  }
}

async function main() {
  console.log('🧪 Surgeon Agent Tool Use Test Suite\n');
  console.log('Testing file operation tools with security and error handling\n');

  try {
    // Setup
    await setupTestEnvironment();

    // Create executor
    const executor = new ToolExecutor(process.cwd());

    // Run tests
    const results = [
      await testReadFile(executor),
      await testWriteNewFile(executor),
      await testModifyExistingFile(executor),
      await testCreateNestedDirectories(executor),
      await testListDirectory(executor),
      await testFileExists(executor),
      await testPathTraversalBlocked(executor),
      await testAbsolutePathBlocked(executor),
      await testReadNonexistentFile(executor),
      await testReadDirectory(executor),
      await testUnknownTool(executor)
    ];

    // Cleanup
    await cleanupTestEnvironment();

    // Summary
    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Passed: ${passed}/${total}`);
    console.log(`Failed: ${total - passed}/${total}`);

    if (passed === total) {
      console.log('\n✅ All tests passed! Tool use implementation is ready.');
      process.exit(0);
    } else {
      console.log('\n❌ Some tests failed. Review implementation.');
      process.exit(1);
    }

  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);

    // Cleanup on error
    try {
      await cleanupTestEnvironment();
    } catch (cleanupError) {
      console.error('Failed to cleanup:', cleanupError);
    }

    process.exit(1);
  }
}

main();
