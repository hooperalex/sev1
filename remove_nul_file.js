#!/usr/bin/env node

/**
 * Emergency script to remove the problematic 'nul' file
 * This file is a Windows reserved device name that Git cannot index
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Emergency cleanup: Removing problematic "nul" file...');

const problematicFiles = ['nul', 'nul_backup'];

for (const fileName of problematicFiles) {
  const filePath = path.join(process.cwd(), fileName);
  
  try {
    if (fs.existsSync(filePath)) {
      console.log(`Found problematic file: ${fileName}`);
      
      // Check if it's a file or directory
      const stats = fs.lstatSync(filePath);
      
      if (stats.isFile()) {
        fs.unlinkSync(filePath);
        console.log(`✅ Removed file: ${fileName}`);
      } else if (stats.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
        console.log(`✅ Removed directory: ${fileName}`);
      }
    } else {
      console.log(`File not found: ${fileName} (already cleaned up)`);
    }
  } catch (error) {
    console.error(`❌ Failed to remove ${fileName}:`, error.message);
    
    // Try alternative method for Windows reserved names
    if (process.platform === 'win32') {
      try {
        const { execSync } = require('child_process');
        execSync(`del /f /q "${filePath}"`, { stdio: 'inherit' });
        console.log(`✅ Removed using Windows del command: ${fileName}`);
      } catch (delError) {
        console.error(`❌ Windows del command also failed for ${fileName}:`, delError.message);
      }
    }
  }
}

// Also clean up any other cleanup scripts that might be problematic
const cleanupFiles = [
  'cleanup_nul_files.js',
  'fix_nul_file.js', 
  'emergency_cleanup.js',
  'run_cleanup.js',
  'master_cleanup.js',
  'cleanup.bat',
  'git_fix.bat',
  'git_fix.js'
];

console.log('\n🧹 Cleaning up temporary cleanup scripts...');

for (const fileName of cleanupFiles) {
  const filePath = path.join(process.cwd(), fileName);
  
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Removed cleanup script: ${fileName}`);
    }
  } catch (error) {
    console.log(`⚠️ Could not remove ${fileName}: ${error.message}`);
  }
}

console.log('\n✅ Emergency cleanup completed!');
console.log('You can now retry the Git operations.');