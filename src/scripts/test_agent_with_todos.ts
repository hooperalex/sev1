/**
 * Integration test: Agent using todo tools
 *
 * Simulates a Surgeon agent using todo tools during an issue fix.
 * Run with: npx ts-node src/scripts/test_agent_with_todos.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { ToolExecutor } from '../tools/ToolExecutor';
import { ALL_AGENT_TOOLS } from '../tools/fileTools';

async function testAgentWithTodos() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log('⚠️  ANTHROPIC_API_KEY not set - running mock test only');
    await runMockTest();
    return;
  }

  console.log('='.repeat(60));
  console.log('Integration Test: Agent Using Todo Tools');
  console.log('='.repeat(60));

  const client = new Anthropic({ apiKey });

  // Create tool executor with todo support
  const toolExecutor = new ToolExecutor(
    process.cwd(),
    'test-integration-123',
    99, // mock issue number
    'surgeon',
    3 // stage index
  );

  // Simple prompt that asks agent to use todo tools
  const systemPrompt = `You are a code surgeon agent. You have access to todo tools to track your work.

Your task: You're fixing a bug in a login form. Use the todo tools to:
1. Add 3 tasks for your fix plan
2. Mark the first task as in_progress
3. Mark the first task as completed
4. List all todos

Use the tools provided. After completing these steps, summarize what you did.`;

  console.log('\n📋 Sending request to Claude with todo tools...\n');

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: systemPrompt }
  ];

  let iteration = 0;
  const MAX_ITERATIONS = 10;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n--- Iteration ${iteration} ---`);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: ALL_AGENT_TOOLS,
      messages
    });

    console.log(`Stop reason: ${response.stop_reason}`);

    if (response.stop_reason === 'end_turn') {
      // Extract final text
      const textBlocks = response.content.filter((b: any) => b.type === 'text');
      console.log('\n📝 Agent Final Response:');
      console.log(textBlocks.map((b: any) => b.text).join('\n'));
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log(`\n🔧 Tool: ${block.name}`);
          console.log(`   Input: ${JSON.stringify(block.input)}`);

          const result = await toolExecutor.execute(block.name, block.input);
          console.log(`   Result: ${result.success ? '✅' : '❌'} ${result.message || result.error || ''}`);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
            is_error: !result.success
          });
        }
      }

      // Add to conversation
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults as any });
    }
  }

  // Final state check
  console.log('\n' + '='.repeat(60));
  console.log('Final Todo State:');
  console.log('='.repeat(60));
  console.log(toolExecutor.getTodoMarkdown());

  console.log('\n✅ Integration test completed!');
}

async function runMockTest() {
  console.log('\n🧪 Running mock test (no API key)...\n');

  const toolExecutor = new ToolExecutor(
    process.cwd(),
    'mock-test-456',
    42,
    'surgeon',
    3
  );

  // Simulate what an agent would do
  console.log('Simulating agent tool calls...\n');

  // Add tasks
  const add1 = await toolExecutor.execute('todo_add', {
    content: 'Analyze login form validation bug',
    priority: 'high'
  });
  console.log('1. Added task:', add1.message);

  const add2 = await toolExecutor.execute('todo_add', {
    content: 'Fix the regex pattern in validateEmail()',
    priority: 'high'
  });
  console.log('2. Added task:', add2.message);

  const add3 = await toolExecutor.execute('todo_add', {
    content: 'Add unit tests for edge cases',
    priority: 'medium'
  });
  console.log('3. Added task:', add3.message);

  // Get list to find IDs
  const listResult = await toolExecutor.execute('todo_list', {});
  const todos = (listResult as any).todos;

  // Mark first as in_progress
  const update1 = await toolExecutor.execute('todo_update', {
    id: todos[0].id,
    status: 'in_progress'
  });
  console.log('4. Updated:', update1.message);

  // Mark first as completed
  const update2 = await toolExecutor.execute('todo_update', {
    id: todos[0].id,
    status: 'completed'
  });
  console.log('5. Updated:', update2.message);

  // Final list
  console.log('\n' + '='.repeat(60));
  console.log('Final Todo State:');
  console.log('='.repeat(60));
  console.log(toolExecutor.getTodoMarkdown());

  // Test state transfer
  console.log('\n' + '='.repeat(60));
  console.log('Testing state transfer to next agent...');
  console.log('='.repeat(60));

  const state = toolExecutor.getTodoState();

  const nextAgent = new ToolExecutor(
    process.cwd(),
    'mock-test-456',
    42,
    'critic', // Different agent
    4 // Next stage
  );
  nextAgent.loadTodoState(state);

  console.log('\nCritic agent sees:');
  console.log(nextAgent.getTodoPrompt());

  console.log('\n✅ Mock test completed!');
}

testAgentWithTodos().catch(console.error);
