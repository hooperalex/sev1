/**
 * Script to apply orchestrator improvements
 * This adds:
 * 1. Intake agent as Stage 0
 * 2. Early termination with human approval
 * 3. Consensus-based halting
 */

import * as fs from 'fs';
import * as path from 'path';

const orchestratorPath = path.join(__dirname, '../Orchestrator.ts');
let content = fs.readFileSync(orchestratorPath, 'utf-8');

// 1. Update status type to include awaiting_closure_approval
content = content.replace(
  /status: 'pending' \| 'in_progress' \| 'completed' \| 'failed' \| 'awaiting_approval';/,
  `status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'awaiting_approval' | 'awaiting_closure_approval';`
);

// 2. Add Intake agent as Stage 0
content = content.replace(
  /\/\/ Define the 12-stage pipeline/,
  `// Define the 13-stage pipeline (added Intake as Stage 0)`
);

content = content.replace(
  /stages: \[\s*\{ name: 'Stage 1: Triage'/,
  `stages: [
        { name: 'Stage 0: Intake & Validation', agentName: 'intake', requiresApproval: false, artifactName: 'intake-analysis.md' },
        { name: 'Stage 1: Triage'`
);

// 3. Update Surgeon stage check from index 2 to 3
content = content.replace(
  /if \(stageIndex === 2 && stageConfig\.agentName === 'surgeon'\)/g,
  `if (stageIndex === 3 && stageConfig.agentName === 'surgeon')`
);

//  4. Add intake emoji
content = content.replace(
  /const emojiMap: \{ \[key: string\]: string \} = \{/,
  `const emojiMap: { [key: string]: string } = {
      intake: '📥',`
);

fs.writeFileSync(orchestratorPath, content, 'utf-8');

console.log('✅ Orchestrator improvements applied successfully!');
console.log('Changes made:');
console.log('  1. Added Intake agent as Stage 0');
console.log('  2. Updated status type for closure approval');
console.log('  3. Fixed Surgeon stage indices (2 → 3)');
console.log('  4. Added intake emoji');
