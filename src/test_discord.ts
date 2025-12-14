/**
 * Test script: Simple Discord notification test
 *
 * Usage:
 *   npm run test:discord
 *
 * Tests basic Discord notification functionality by sending a test message
 * to verify the Discord integration is working properly.
 */

import * as dotenv from 'dotenv';
import { DiscordClient } from './integrations/DiscordClient';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🔔 AI Team MVP - Discord Notification Test\n');

  // Check required environment variables
  const requiredEnvVars = ['DISCORD_BOT_TOKEN', 'DISCORD_CHANNEL_ID'];
  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

  if (missingEnvVars.length > 0) {
    console.error(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
    console.error('   Add these to your .env file:');
    console.error('   DISCORD_BOT_TOKEN=your_discord_bot_token');
    console.error('   DISCORD_CHANNEL_ID=your_discord_channel_id');
    process.exit(1);
  }

  try {
    // Initialize Discord client
    console.log('📡 Initializing Discord client...');
    const discordClient = new DiscordClient(
      process.env.DISCORD_BOT_TOKEN!,
      process.env.DISCORD_CHANNEL_ID!
    );

    console.log('✓ Discord client initialized');

    // Test 1: Simple message
    console.log('\n🧪 Test 1: Sending simple test message...');
    const simpleResult = await discordClient.sendMessage({
      content: '🤖 Discord integration test - Simple message'
    });

    if (simpleResult) {
      console.log('✅ Simple message sent successfully');
    } else {
      console.log('❌ Failed to send simple message');
    }

    // Test 2: Rich embed message
    console.log('\n🧪 Test 2: Sending rich embed message...');
    const embedResult = await discordClient.sendMessage({
      embeds: [{
        title: '🧪 Discord Integration Test',
        description: 'Testing rich embed functionality',
        color: 0x3498db, // Blue
        fields: [
          { name: 'Status', value: 'Testing', inline: true },
          { name: 'Component', value: 'DiscordClient', inline: true },
          { name: 'Test Type', value: 'Rich Embed', inline: false }
        ],
        footer: { text: 'AI Team MVP' },
        timestamp: new Date().toISOString()
      }]
    });

    if (embedResult) {
      console.log('✅ Rich embed message sent successfully');
    } else {
      console.log('❌ Failed to send rich embed message');
    }

    // Test 3: Pipeline notification simulation
    console.log('\n🧪 Test 3: Simulating pipeline notifications...');
    
    // Simulate pipeline start
    const startResult = await discordClient.notifyPipelineStart(
      999,
      'Test: Simple Discord notification test',
      'test-discord-notifications'
    );

    if (startResult) {
      console.log('✅ Pipeline start notification sent');
    } else {
      console.log('❌ Failed to send pipeline start notification');
    }

    // Wait a moment between notifications
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulate stage completion
    const stageResult = await discordClient.notifyStageComplete(
      999,
      'Detective',
      0,
      12,
      'Issue triaged successfully - Discord test'
    );

    if (stageResult) {
      console.log('✅ Stage completion notification sent');
    } else {
      console.log('❌ Failed to send stage completion notification');
    }

    // Wait a moment between notifications
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulate pipeline completion
    const completeResult = await discordClient.notifyPipelineComplete(
      999,
      'Test: Simple Discord notification test',
      'https://github.com/example/repo/pull/28',
      'https://example.vercel.app'
    );

    if (completeResult) {
      console.log('✅ Pipeline completion notification sent');
    } else {
      console.log('❌ Failed to send pipeline completion notification');
    }

    // Summary
    const allTests = [simpleResult, embedResult, startResult, stageResult, completeResult];
    const passedTests = allTests.filter(result => result).length;
    const totalTests = allTests.length;

    console.log(`\n${'='.repeat(60)}`);
    console.log('TEST SUMMARY:');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All Discord notification tests passed!');
      console.log('\nDiscord integration is working correctly.');
      console.log('The AI team can now send notifications to Discord during pipeline execution.');
    } else {
      console.log(`❌ ${totalTests - passedTests} test(s) failed`);
      console.log('\nPlease check:');
      console.log('1. Discord bot token is valid');
      console.log('2. Bot has permission to send messages to the channel');
      console.log('3. Channel ID is correct');
      console.log('4. Network connectivity to Discord API');
    }

    console.log('='.repeat(60));

  } catch (error: any) {
    console.error(`\n❌ Error during Discord test: ${error.message}`);
    logger.error('Discord test failed', { error });
    
    console.log('\nTroubleshooting:');
    console.log('1. Verify DISCORD_BOT_TOKEN is a valid bot token');
    console.log('2. Verify DISCORD_CHANNEL_ID is correct');
    console.log('3. Ensure bot has "Send Messages" permission in the channel');
    console.log('4. Check if the bot is added to the Discord server');
    
    process.exit(1);
  }
}

// Run test
main();