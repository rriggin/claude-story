import fs from 'fs';
import path from 'path';
import os from 'os';
import { ClaudeStoryDB } from './database.js';

export class ClaudeStoryDaemon {
  constructor() {
    this.claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');
    this.watchedProjects = new Map(); // projectPath -> watcher
    this.conversationFiles = new Map(); // filePath -> lastProcessedSize
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
        
        // Create .what-is-this.md
        const whatIsThis = `# Claude Story Artifacts Directory

This directory is automatically created and maintained by Claude Story to preserve your AI chat history.

## What's Here?

- \`.claude-story/conversations.db\`: SQLite database storing all conversations
- \`.claude-story/history/\`: Markdown exports of conversations
- Each conversation has a unique ID and is auto-saved

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

  stop() {
    console.log('👋 Claude Story daemon stopping...');
  }
}