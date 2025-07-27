import fs from 'fs';
import path from 'path';
import { ClaudeStoryDB } from './database.js';

export class ClaudeConversationWatcher {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.db = new ClaudeStoryDB(projectPath);
    this.watchedFiles = new Map(); // file -> last position
    this.claudeProjectsPath = path.join(process.env.HOME, '.claude', 'projects');
  }

  async init() {
    await this.db.init();
    await this.scanExistingFiles();
    this.startWatching();
  }

  async scanExistingFiles() {
    try {
      const projectDirs = fs.readdirSync(this.claudeProjectsPath);
      
      for (const projectDir of projectDirs) {
        const fullPath = path.join(this.claudeProjectsPath, projectDir);
        const jsonlFiles = fs.readdirSync(fullPath).filter(f => f.endsWith('.jsonl'));
        
        for (const file of jsonlFiles) {
          const filePath = path.join(fullPath, file);
          await this.processJsonlFile(filePath);
        }
      }
    } catch (error) {
      console.log('Claude projects directory not found or empty');
    }
  }

  async processJsonlFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      if (lines.length === 0) return;

      // Get session info from first line
      const firstLine = JSON.parse(lines[0]);
      let conversationTitle = 'Claude Conversation';
      let sessionId = firstLine.sessionId || path.basename(filePath, '.jsonl');
      
      if (firstLine.type === 'summary' && firstLine.summary) {
        conversationTitle = firstLine.summary;
      }

      // Check if we already have this conversation
      let conversation = await this.db.getConversationBySessionId(sessionId);
      
      if (!conversation) {
        // Create new conversation
        const conversationId = await this.db.startConversation(conversationTitle, sessionId);
        conversation = await this.db.getConversation(conversationId);
      }

      // Process messages
      const messageLines = lines.filter(line => {
        const data = JSON.parse(line);
        return data.type === 'user' || data.type === 'assistant';
      });

      for (const line of messageLines) {
        const data = JSON.parse(line);
        
        if (data.type === 'user') {
          await this.addMessageIfNew(conversation.id, 'user', data.message.content, data.timestamp, data.uuid);
        } else if (data.type === 'assistant') {
          const content = this.extractAssistantContent(data.message);
          await this.addMessageIfNew(conversation.id, 'assistant', content, data.timestamp, data.uuid);
        }
      }

      // Auto-export
      await this.db.exportToMarkdown(conversation.id);
      
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

  async addMessageIfNew(conversationId, role, content, timestamp, uuid) {
    // Check if message already exists
    const exists = await this.db.messageExists(uuid);
    if (!exists) {
      await this.db.addMessageWithUuid(conversationId, role, content, timestamp, uuid);
    }
  }

  startWatching() {
    console.log('🔍 Watching for Claude conversations...');
    
    // Watch the Claude projects directory
    if (fs.existsSync(this.claudeProjectsPath)) {
      fs.watch(this.claudeProjectsPath, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl')) {
          const filePath = path.join(this.claudeProjectsPath, filename);
          if (fs.existsSync(filePath)) {
            setTimeout(() => this.processJsonlFile(filePath), 100); // Small delay for file write completion
          }
        }
      });
    }
  }

  close() {
    this.db.close();
  }
}