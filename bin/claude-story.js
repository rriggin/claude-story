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
    ClaudeStoryDaemon.startDaemon();
  },

  async stop() {
    ClaudeStoryDaemon.stopDaemon();
  },

  async status() {
    ClaudeStoryDaemon.statusDaemon();
    
    console.log('\n📊 Claude Code Detection');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
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
  start            Start monitoring daemon in background
  stop             Stop the monitoring daemon
  status           Show daemon status and detected conversations
  help             Show this help

EXAMPLES
  claude-story start          # Start daemon (runs in background)
  claude-story status         # Check daemon status
  claude-story stop           # Stop daemon

DAEMON MODE
  Claude Story runs as a background daemon:
  - Starts with 'claude-story start' (returns control immediately)
  - Runs continuously in background
  - Automatically detects all Claude Code projects
  - Creates .claude-story/ directories as needed
  - Saves conversations to markdown files in real-time
  - Stop with 'claude-story stop'

LOGS
  Daemon logs are saved to: ~/.claude-story-daemon.log
`);
}

// CLI
const [,, command, ...args] = process.argv;

// Check for daemon mode first
if (process.argv.includes('--daemon')) {
  const daemon = new ClaudeStoryDaemon();
  daemon.startMonitoring().catch(console.error);
} else if (!command || command === 'help' || command === '-h' || command === '--help') {
  showHelp();
} else if (commands[command]) {
  commands[command](...args).catch(console.error);
} else {
  console.error(`❌ Unknown command: ${command}`);
  console.log('Run "claude-story help" for usage');
  process.exit(1);
}