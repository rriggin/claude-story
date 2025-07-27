#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🤖 Installing Claude Story...');

try {
  // Install dependencies
  console.log('📦 Installing dependencies...');
  execSync('npm install', { 
    cwd: __dirname, 
    stdio: 'inherit' 
  });

  // Make executable
  const binPath = path.join(__dirname, 'bin', 'claude-story.js');
  execSync(`chmod +x "${binPath}"`);

  // Create alias helper
  const aliasCommand = `alias cs='node ${binPath}'`;
  
  console.log('✅ Claude Story installed successfully!');
  console.log('');
  console.log('🚀 To start monitoring all Claude conversations:');
  console.log(`   Add alias: echo '${aliasCommand}' >> ~/.zshrc && source ~/.zshrc`);
  console.log('   Or use directly: node ' + binPath);
  console.log('');
  console.log('📋 Usage:');
  console.log('   cs start              # Start auto-monitoring (run once)');
  console.log('   cs status             # Check detection status');
  console.log('');
  console.log('🤖 Claude Story will automatically:');
  console.log('   • Detect all your Claude Code projects');
  console.log('   • Create .claude-story/ folders as needed');
  console.log('   • Save conversations to markdown files');
  console.log('   • No manual setup required!');

} catch (error) {
  console.error('❌ Installation failed:', error.message);
  process.exit(1);
}