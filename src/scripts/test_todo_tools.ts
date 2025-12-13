/**
 * Test script for Todo Tools
 *
 * Run with: npx ts-node src/scripts/test_todo_tools.ts
 */

import { ToolExecutor } from '../tools/ToolExecutor';

async function testTodoTools() {
  console.log('='.repeat(60));
  console.log('Testing Todo Tools');
  console.log('='.repeat(60));

  // Create a ToolExecutor with todo support
  const executor = new ToolExecutor(
    process.cwd(),
    'test-task-123',
    42, // issue number
    'Surgeon', // agent name
    4 // stage index
  );

  // Test 1: Add todos
  console.log('\n1. Adding todos...');

  const todo1 = await executor.execute('todo_add', {
    content: 'Analyze the bug in login.ts',
    priority: 'high'
  });
  console.log('  Added:', JSON.stringify(todo1, null, 2));

  const todo2 = await executor.execute('todo_add', {
    content: 'Write unit tests for the fix',
    priority: 'medium'
  });
  console.log('  Added:', JSON.stringify(todo2, null, 2));

  const todo3 = await executor.execute('todo_add', {
    content: 'Update documentation',
    priority: 'low'
  });
  console.log('  Added:', JSON.stringify(todo3, null, 2));

  // Test 2: List all todos
  console.log('\n2. Listing all todos...');
  const listResult = await executor.execute('todo_list', {});
  console.log('  List:', JSON.stringify(listResult, null, 2));

  // Test 3: Update todo status
  console.log('\n3. Updating todo status...');

  // Get the first todo ID from the list
  const todos = (listResult as any).todos;
  if (todos && todos.length > 0) {
    const firstTodoId = todos[0].id;

    // Mark as in progress
    const updateResult1 = await executor.execute('todo_update', {
      id: firstTodoId,
      status: 'in_progress'
    });
    console.log('  Updated to in_progress:', JSON.stringify(updateResult1, null, 2));

    // Mark as completed
    const updateResult2 = await executor.execute('todo_update', {
      id: firstTodoId,
      status: 'completed'
    });
    console.log('  Updated to completed:', JSON.stringify(updateResult2, null, 2));
  }

  // Test 4: List by filter
  console.log('\n4. Listing completed todos only...');
  const completedList = await executor.execute('todo_list', { filter: 'completed' });
  console.log('  Completed:', JSON.stringify(completedList, null, 2));

  // Test 5: Block a todo
  console.log('\n5. Blocking a todo...');
  if (todos && todos.length > 1) {
    const secondTodoId = todos[1].id;
    const blockResult = await executor.execute('todo_update', {
      id: secondTodoId,
      status: 'blocked',
      blockedReason: 'Missing test fixtures'
    });
    console.log('  Blocked:', JSON.stringify(blockResult, null, 2));
  }

  // Test 6: Get todo markdown (for GitHub comments)
  console.log('\n6. Getting markdown output...');
  const markdown = executor.getTodoMarkdown();
  console.log(markdown);

  // Test 7: Get todo prompt (for agent injection)
  console.log('\n7. Getting prompt output...');
  const prompt = executor.getTodoPrompt();
  console.log(prompt);

  // Test 8: Get state (for passing between stages)
  console.log('\n8. Getting state for next stage...');
  const state = executor.getTodoState();
  console.log('  State:', JSON.stringify(state, null, 2));

  // Test 9: Create new executor and load state
  console.log('\n9. Loading state into new executor...');
  const executor2 = new ToolExecutor(
    process.cwd(),
    'test-task-123',
    42,
    'Critic', // Different agent
    5 // Next stage
  );
  executor2.loadTodoState(state);
  const loadedList = await executor2.execute('todo_list', {});
  console.log('  Loaded todos:', JSON.stringify(loadedList, null, 2));

  // Test 10: Clear completed
  console.log('\n10. Clearing completed todos...');
  const clearResult = await executor2.execute('todo_clear_completed', {});
  console.log('  Cleared:', JSON.stringify(clearResult, null, 2));

  // Final list
  console.log('\n11. Final todo list...');
  const finalList = await executor2.execute('todo_list', {});
  console.log('  Final:', JSON.stringify(finalList, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('All tests completed!');
  console.log('='.repeat(60));
}

testTodoTools().catch(console.error);
