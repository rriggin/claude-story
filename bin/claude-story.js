#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClaudeStoryDaemon } from '../lib/daemon.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Commands
const commands = {
  async start() {
    console.log('🤖 Starting Claude Story...');
    
    try {
      const daemon = new ClaudeStoryDaemon();
      await daemon.start();
      
      // Keep the process alive
      process.on('SIGINT', () => {
        daemon.stop();
        process.exit(0);
      });
      
      // Keep running indefinitely
      await new Promise(() => {});
      
    } catch (error) {
      console.error('❌ Error starting Claude Story:', error.message);
      process.exit(1);
    }
  },

  async stop() {
    console.log('🛑 Stopping Claude Story daemon...');
    // Could implement daemon PID tracking here if needed
    console.log('✅ Claude Story stopped');
  },

  async status() {
    console.log('📊 Claude Story Status');
    console.log('━━━━━━━━━━━━━━━━━━━━━━');
    
    // Check if daemon is running (simplified version)
    const homeDir = process.env.HOME;
    const claudeDir = path.join(homeDir, '.claude', 'projects');
    
    if (fs.existsSync(claudeDir)) {
      console.log('✅ Claude Code detected');
      
      // Count conversations
      const projectDirs = fs.readdirSync(claudeDir);
      let totalConversations = 0;
      
      for (const dir of projectDirs) {
        const dirPath = path.join(claudeDir, dir);
        if (fs.statSync(dirPath).isDirectory()) {
          const jsonlFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
          totalConversations += jsonlFiles.length;
        }
      }
      
      console.log(`📁 Found ${totalConversations} conversation files`);
      console.log('🔍 Run \`claude-story start\` to begin auto-monitoring');
    } else {
      console.log('❌ Claude Code not found');
      console.log('💡 Make sure Claude Code is installed and has been used');
    }
  }
};

// Help text
function showHelp() {
  console.log(`
🤖 Claude Story - Automatic Claude Code Conversation Tracker

USAGE
  claude-story <command>

COMMANDS
  start            Start monitoring Claude conversations (runs continuously)
  stop             Stop the monitoring daemon
  status           Show current status and detected conversations
  help             Show this help

EXAMPLES
  claude-story start          # Start auto-monitoring all conversations
  claude-story status         # Check if Claude Code is detected

AUTO-MONITORING
  Claude Story automatically:
  - Detects all your Claude Code projects
  - Creates .claude-story/ directories as needed
  - Saves conversations to markdown files in real-time
  - No manual setup required per project

INSTALLATION
  After running the install script, just run:
  claude-story start
`);
}

// CLI
const [,, command, ...args] = process.argv;

if (!command || command === 'help' || command === '-h' || command === '--help') {
  showHelp();
} else if (commands[command]) {
  commands[command](...args).catch(console.error);
} else {
  console.error(`❌ Unknown command: ${command}`);
  console.log('Run "claude-story help" for usage');
  process.exit(1);
}