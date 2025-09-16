#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { ClaudeStoryDaemon } from '../lib/daemon.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-start management functions
const autostart = {
  getPlistPath() {
    const homeDir = process.env.HOME;
    return path.join(homeDir, 'Library', 'LaunchAgents', 'com.claudestory.daemon.plist');
  },

  createPlist() {
    const homeDir = process.env.HOME;
    const claudeStoryPath = execSync('which claude-story', { encoding: 'utf8' }).trim();

    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claudestory.daemon</string>

    <key>ProgramArguments</key>
    <array>
        <string>${claudeStoryPath}</string>
        <string>start</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/tmp/claude-story.out</string>

    <key>StandardErrorPath</key>
    <string>/tmp/claude-story.err</string>

    <key>WorkingDirectory</key>
    <string>${homeDir}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${homeDir}</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>`;

    return plistContent;
  },

  async enable() {
    try {
      const plistPath = this.getPlistPath();
      const launchAgentsDir = path.dirname(plistPath);

      // Ensure LaunchAgents directory exists
      if (!fs.existsSync(launchAgentsDir)) {
        fs.mkdirSync(launchAgentsDir, { recursive: true });
      }

      // Create plist file
      fs.writeFileSync(plistPath, this.createPlist());
      console.log('✅ Created launchd plist file');

      // Load the service
      execSync(`launchctl load "${plistPath}"`, { stdio: 'inherit' });
      console.log('✅ Loaded claude-story autostart service');

      // Start the service
      execSync('launchctl start com.claudestory.daemon', { stdio: 'inherit' });
      console.log('✅ Started claude-story daemon');

      console.log('\n🎉 Claude Story will now auto-start on login!');

    } catch (error) {
      console.error('❌ Failed to enable autostart:', error.message);
      process.exit(1);
    }
  },

  async disable() {
    try {
      const plistPath = this.getPlistPath();

      if (!fs.existsSync(plistPath)) {
        console.log('ℹ️ Autostart is not currently enabled');
        return;
      }

      // Stop the service
      try {
        execSync('launchctl stop com.claudestory.daemon', { stdio: 'inherit' });
        console.log('✅ Stopped claude-story daemon');
      } catch (error) {
        // Service might not be running, continue
      }

      // Unload the service
      execSync(`launchctl unload "${plistPath}"`, { stdio: 'inherit' });
      console.log('✅ Unloaded claude-story autostart service');

      // Remove plist file
      fs.unlinkSync(plistPath);
      console.log('✅ Removed launchd plist file');

      console.log('\n🎉 Claude Story autostart disabled');

    } catch (error) {
      console.error('❌ Failed to disable autostart:', error.message);
      process.exit(1);
    }
  },

  async status() {
    try {
      const plistPath = this.getPlistPath();
      const exists = fs.existsSync(plistPath);

      console.log('\n🚀 Autostart Status');
      console.log('━━━━━━━━━━━━━━━━━━━━');

      if (exists) {
        console.log('✅ Autostart is ENABLED');

        // Check if service is loaded
        try {
          const output = execSync('launchctl list | grep claudestory', { encoding: 'utf8' });
          if (output.trim()) {
            console.log('✅ Service is loaded in launchctl');
          }
        } catch (error) {
          console.log('⚠️ Service plist exists but not loaded');
        }
      } else {
        console.log('❌ Autostart is DISABLED');
        console.log('💡 Run "claude-story --autostart" to enable');
      }

    } catch (error) {
      console.error('❌ Failed to check autostart status:', error.message);
    }
  }
};

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

    // Show autostart status
    await autostart.status();
  },

  async autostart() {
    await autostart.enable();
  },

  async 'disable-autostart'() {
    await autostart.disable();
  }
};

// Help text
function showHelp() {
  console.log(`
🤖 Claude Story - Automatic Claude Code Conversation Tracker

USAGE
  claude-story <command>

COMMANDS
  start                Start monitoring daemon in background
  stop                 Stop the monitoring daemon
  status               Show daemon status and detected conversations
  --autostart          Enable auto-start on login (macOS)
  disable-autostart    Disable auto-start on login
  help                 Show this help

EXAMPLES
  claude-story start           # Start daemon (runs in background)
  claude-story status          # Check daemon status
  claude-story stop            # Stop daemon
  claude-story --autostart     # Enable auto-start on login
  claude-story disable-autostart  # Disable auto-start

DAEMON MODE
  Claude Story runs as a background daemon:
  - Starts with 'claude-story start' (returns control immediately)
  - Runs continuously in background
  - Automatically detects all Claude Code projects
  - Creates .claude-story/ directories as needed
  - Saves conversations to markdown files in real-time
  - Stop with 'claude-story stop'

AUTO-START
  Enable auto-start to automatically launch claude-story when you log in:
  - Uses macOS launchd for reliable background operation
  - Starts silently in the background
  - No need to remember to run 'claude-story start'

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
} else if (process.argv.includes('--autostart')) {
  commands.autostart().catch(console.error);
} else if (!command || command === 'help' || command === '-h' || command === '--help') {
  showHelp();
} else if (commands[command]) {
  commands[command](...args).catch(console.error);
} else {
  console.error(`❌ Unknown command: ${command}`);
  console.log('Run "claude-story help" for usage');
  process.exit(1);
}