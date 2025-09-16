import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { ClaudeStoryDB } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ClaudeStoryDaemon {
  constructor() {
    this.claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');
    this.watchedProjects = new Map(); // projectPath -> watcher
    this.conversationFiles = new Map(); // filePath -> lastProcessedSize
    this.pidFile = path.join(os.homedir(), '.claude-story-daemon.pid');
    this.logFile = path.join(os.homedir(), '.claude-story-daemon.log');
  }

  async start() {
    console.log('🤖 Claude Story daemon starting...');
    
    if (!fs.existsSync(this.claudeProjectsPath)) {
      console.log('❌ Claude projects directory not found. Make sure Claude Code is installed.');
      return;
    }

    // Scan existing conversations
    await this.scanExistingConversations();
    
    // Watch for new conversations
    this.startWatching();
    
    console.log('✅ Claude Story is now monitoring all conversations automatically');
    console.log('📁 Watching:', this.claudeProjectsPath);
    console.log('💾 Conversations will be saved to .claude-story/ in each project');
  }

  async scanExistingConversations() {
    try {
      const projectDirs = fs.readdirSync(this.claudeProjectsPath);
      
      for (const projectDir of projectDirs) {
        const projectPath = path.join(this.claudeProjectsPath, projectDir);
        if (!fs.statSync(projectPath).isDirectory()) continue;
        
        const jsonlFiles = fs.readdirSync(projectPath).filter(f => f.endsWith('.jsonl'));
        
        for (const file of jsonlFiles) {
          const filePath = path.join(projectPath, file);
          await this.processConversationFile(filePath);
        }
      }
    } catch (error) {
      console.error('Error scanning conversations:', error.message);
    }
  }

  async processConversationFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      if (lines.length === 0) return;

      // Get working directory from first message
      const firstMessage = lines.find(line => {
        const data = JSON.parse(line);
        return data.cwd;
      });
      
      if (!firstMessage) return;
      
      const messageData = JSON.parse(firstMessage);
      const workingDir = messageData.cwd;
      
      // Skip if not a real project directory
      if (!workingDir || workingDir === os.homedir()) return;
      
      // Ensure .claude-story exists in the project
      const claudeStoryDir = path.join(workingDir, '.claude-story');
      if (!fs.existsSync(claudeStoryDir)) {
        fs.mkdirSync(claudeStoryDir, { recursive: true });
        
        // Create autostart.sh
        const autostartScript = `#!/bin/bash
# Claude Story Auto-Start Script
# This script can be customized to run commands when Claude Code opens this project

# Example: Start claude-story daemon if not already running
# if ! pgrep -f "claude-story.*--daemon" > /dev/null; then
#   claude-story start
# fi

# Example: Start development servers
# npm run dev

# Example: Run custom setup commands
# echo "Claude Code opened in $(pwd)"

# Add your custom startup commands below:
`;

        fs.writeFileSync(path.join(claudeStoryDir, 'autostart.sh'), autostartScript);
        fs.chmodSync(path.join(claudeStoryDir, 'autostart.sh'), 0o755);

        // Create .what-is-this.md
        const whatIsThis = `# Claude Story Artifacts Directory

This directory is automatically created and maintained by Claude Story to preserve your AI chat history.

## What's Here?

- \`.claude-story/conversations.db\`: SQLite database storing all conversations
- \`.claude-story/history/\`: Markdown exports of conversations
- \`.claude-story/autostart.sh\`: Customizable script for project auto-start
- Each conversation has a unique ID and is auto-saved

## Auto-Start Script

Edit \`autostart.sh\` to run commands when Claude Code opens this project:
- Start development servers
- Run setup commands
- Automatically start claude-story daemon

## Usage

Claude Story runs automatically in the background. Your conversations are saved here automatically.

## Integration

Any MCP server can index the markdown files in history/ for cross-project search.
`;
        
        fs.writeFileSync(path.join(claudeStoryDir, '.what-is-this.md'), whatIsThis);
        
        // Auto-add to .gitignore
        this.addToGitignore(workingDir);
      }

      // Initialize database for this project
      const db = new ClaudeStoryDB(workingDir);
      await db.init();

      // Get session info
      const firstLine = JSON.parse(lines[0]);
      let conversationTitle = 'Claude Conversation';
      let sessionId = firstLine.sessionId || path.basename(filePath, '.jsonl');
      
      if (firstLine.type === 'summary' && firstLine.summary) {
        conversationTitle = firstLine.summary;
      }

      // Check if we already have this conversation
      let conversation = await db.getConversationBySessionId(sessionId);
      
      if (!conversation) {
        const conversationId = await db.startConversation(conversationTitle, sessionId);
        conversation = await db.getConversation(conversationId);
      }

      // Process messages
      const messageLines = lines.filter(line => {
        const data = JSON.parse(line);
        return data.type === 'user' || data.type === 'assistant';
      });

      let hasNewMessages = false;
      for (const line of messageLines) {
        const data = JSON.parse(line);
        
        if (data.type === 'user') {
          const exists = await db.messageExists(data.uuid);
          if (!exists) {
            await db.addMessageWithUuid(conversation.id, 'user', data.message.content, data.timestamp, data.uuid);
            hasNewMessages = true;
          }
        } else if (data.type === 'assistant') {
          const exists = await db.messageExists(data.uuid);
          if (!exists) {
            const content = this.extractAssistantContent(data.message);
            await db.addMessageWithUuid(conversation.id, 'assistant', content, data.timestamp, data.uuid);
            hasNewMessages = true;
          }
        }
      }

      // Export if we added new messages
      if (hasNewMessages) {
        await db.exportToMarkdown(conversation.id);
        console.log(`📄 Updated conversation: ${conversationTitle}`);
      }
      
      db.close();
      
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error.message);
    }
  }

  extractAssistantContent(message) {
    if (typeof message.content === 'string') {
      return message.content;
    }
    
    if (Array.isArray(message.content)) {
      return message.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n\n');
    }
    
    return JSON.stringify(message.content);
  }

  startWatching() {
    // Watch the Claude projects directory for changes
    fs.watch(this.claudeProjectsPath, { recursive: true }, (eventType, filename) => {
      if (filename && filename.endsWith('.jsonl')) {
        const filePath = path.join(this.claudeProjectsPath, filename);
        if (fs.existsSync(filePath)) {
          // Small delay to ensure file write is complete
          setTimeout(() => this.processConversationFile(filePath), 200);
        }
      }
    });
  }

  addToGitignore(projectPath) {
    try {
      const gitignorePath = path.join(projectPath, '.gitignore');
      
      // Check if .gitignore exists
      let gitignoreContent = '';
      if (fs.existsSync(gitignorePath)) {
        gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      }
      
      // Check if .claude-story is already in .gitignore
      if (gitignoreContent.includes('.claude-story')) {
        return; // Already added
      }
      
      // Add .claude-story to .gitignore
      const newEntry = gitignoreContent.endsWith('\n') || gitignoreContent === '' 
        ? '.claude-story/\n' 
        : '\n.claude-story/\n';
        
      fs.writeFileSync(gitignorePath, gitignoreContent + newEntry);
      console.log(`📝 Added .claude-story/ to .gitignore in ${projectPath}`);
      
    } catch (error) {
      console.warn(`Warning: Could not update .gitignore in ${projectPath}:`, error.message);
    }
  }

  static startDaemon() {
    const daemon = new ClaudeStoryDaemon();
    
    // Check if already running
    if (daemon.isRunning()) {
      console.log('✅ Claude Story daemon is already running');
      return;
    }

    console.log('🤖 Starting Claude Story daemon...');
    
    // Spawn detached process
    const scriptPath = path.join(path.dirname(path.dirname(__filename)), 'bin/claude-story.js');
    console.log(`🔍 Spawning daemon: ${process.execPath} ${scriptPath} --daemon`);
    
    const child = spawn(process.execPath, [
      scriptPath,
      '--daemon'
    ], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']  // Capture stderr for debugging
    });
    
    // Debug child process
    child.stderr.on('data', (data) => {
      console.error(`Daemon stderr: ${data}`);
    });
    
    child.on('error', (error) => {
      console.error('Daemon spawn error:', error);
    });
    
    child.on('exit', (code, signal) => {
      console.log(`Daemon exited with code ${code}, signal ${signal}`);
    });
    
    // Save PID
    fs.writeFileSync(daemon.pidFile, child.pid.toString());
    
    console.log('✅ Claude Story daemon started in background');
    console.log('📁 Monitoring all Claude Code conversations');
    console.log('🛑 Stop with: claude-story stop');
    
    // Give it a moment to start, then exit parent
    setTimeout(() => {
      // Detach from parent
      child.unref();
      process.exit(0);
    }, 1000);
  }

  static stopDaemon() {
    const daemon = new ClaudeStoryDaemon();
    
    if (!daemon.isRunning()) {
      console.log('❌ Claude Story daemon is not running');
      return;
    }
    
    try {
      const pid = parseInt(fs.readFileSync(daemon.pidFile, 'utf-8'));
      process.kill(pid, 'SIGTERM');
      fs.unlinkSync(daemon.pidFile);
      console.log('✅ Claude Story daemon stopped');
    } catch (error) {
      console.error('❌ Error stopping daemon:', error.message);
      // Clean up stale PID file
      if (fs.existsSync(daemon.pidFile)) {
        fs.unlinkSync(daemon.pidFile);
      }
    }
  }

  static statusDaemon() {
    const daemon = new ClaudeStoryDaemon();
    
    if (daemon.isRunning()) {
      console.log('✅ Claude Story daemon is running');
      const pid = fs.readFileSync(daemon.pidFile, 'utf-8');
      console.log(`📊 PID: ${pid}`);
    } else {
      console.log('❌ Claude Story daemon is not running');
      console.log('🚀 Start with: claude-story start');
    }
  }

  isRunning() {
    if (!fs.existsSync(this.pidFile)) return false;
    
    try {
      const pid = parseInt(fs.readFileSync(this.pidFile, 'utf-8'));
      process.kill(pid, 0); // Test if process exists
      return true;
    } catch (error) {
      // Process doesn't exist, clean up stale PID file
      fs.unlinkSync(this.pidFile);
      return false;
    }
  }

  async startMonitoring() {
    // Write PID for daemon mode
    fs.writeFileSync(this.pidFile, process.pid.toString());
    
    // Setup logging
    const logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    
    process.stdout.write = logStream.write.bind(logStream);
    process.stderr.write = logStream.write.bind(logStream);
    
    console.log(`${new Date().toISOString()} - Claude Story daemon starting...`);
    
    if (!fs.existsSync(this.claudeProjectsPath)) {
      console.log('❌ Claude projects directory not found. Make sure Claude Code is installed.');
      return;
    }

    // Scan existing conversations
    await this.scanExistingConversations();
    
    // Watch for new conversations
    this.startWatching();
    
    console.log(`${new Date().toISOString()} - Claude Story is now monitoring all conversations automatically`);
    
    // Keep process alive
    process.on('SIGTERM', () => {
      console.log(`${new Date().toISOString()} - Received SIGTERM, shutting down gracefully`);
      if (fs.existsSync(this.pidFile)) {
        fs.unlinkSync(this.pidFile);
      }
      process.exit(0);
    });

    // Keep the process running indefinitely
    setInterval(() => {
      // Do nothing, just keep the process alive
    }, 30000); // Check every 30 seconds
  }

  stop() {
    console.log('👋 Claude Story daemon stopping...');
    if (fs.existsSync(this.pidFile)) {
      fs.unlinkSync(this.pidFile);
    }
  }
}