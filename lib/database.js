import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export class ClaudeStoryDB {
  constructor(projectPath) {
    this.dbPath = path.join(projectPath, '.claude-story', 'conversations.db');
    this.historyPath = path.join(projectPath, '.claude-story', 'history');
    
    // Ensure directories exist
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.mkdirSync(this.historyPath, { recursive: true });
    
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) reject(err);
        else {
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Conversations table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT 1,
            export_path TEXT,
            session_id TEXT UNIQUE
          )
        `);

        // Messages table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            uuid TEXT UNIQUE,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id)
          )
        `);

        // No metadata table needed - everything is in conversations/messages
        resolve();
      });
    });
  }

  async startConversation(title, sessionId = null) {
    const id = uuidv4();
    
    // End any active conversations
    await this.endActiveConversations();
    
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO conversations (id, title, session_id) VALUES (?, ?, ?)',
        [id, title, sessionId],
        function(err) {
          if (err) reject(err);
          else resolve(id);
        }
      );
    });
  }

  async endActiveConversations() {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE conversations SET is_active = 0 WHERE is_active = 1',
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async addMessage(conversationId, role, content) {
    const db = this.db;
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
        [conversationId, role, content],
        function(err) {
          if (err) reject(err);
          else {
            // Update conversation timestamp
            db.run(
              'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [conversationId],
              () => resolve(this.lastID)
            );
          }
        }
      );
    });
  }

  async checkAndEndStaleConversations(timeoutMinutes = 30) {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const cutoffTime = new Date(Date.now() - timeoutMs).toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE conversations SET is_active = 0 WHERE is_active = 1 AND updated_at < ?',
        [cutoffTime],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async autoStartConversationIfNeeded(defaultTitle = 'Untitled Conversation') {
    // Check for and end stale conversations
    await this.checkAndEndStaleConversations();
    
    // Check if we have an active conversation
    const active = await this.getActiveConversation();
    
    if (!active) {
      // Auto-start a new conversation
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const title = `${defaultTitle} (${timestamp})`;
      return await this.startConversation(title);
    }
    
    return active.id;
  }

  async getActiveConversation() {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM conversations WHERE is_active = 1',
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async getConversation(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM conversations WHERE id = ?',
        [id],
        (err, conversation) => {
          if (err) reject(err);
          else if (!conversation) resolve(null);
          else {
            // Get messages
            this.db.all(
              'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at',
              [id],
              (err, messages) => {
                if (err) reject(err);
                else resolve({ ...conversation, messages });
              }
            );
          }
        }
      );
    });
  }

  async exportToMarkdown(conversationId) {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) return null;

    const timestamp = new Date(conversation.created_at).toISOString()
      .replace(/:/g, '-').slice(0, 19) + 'Z';
    const slug = conversation.title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    const filename = `${timestamp}-${slug}.md`;
    const filepath = path.join(this.historyPath, filename);

    let content = `<!-- Generated by Claude Story -->

# ${conversation.title} (${new Date(conversation.created_at).toISOString().slice(0, 10)} ${new Date(conversation.created_at).toTimeString().slice(0, 5)})

`;

    for (const msg of conversation.messages) {
      content += `_**${msg.role === 'user' ? 'User' : 'Assistant'}**_

${msg.content}

---

`;
    }

    fs.writeFileSync(filepath, content);
    
    // Update export path
    await new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE conversations SET export_path = ? WHERE id = ?',
        [filepath, conversationId],
        (err) => err ? reject(err) : resolve()
      );
    });

    return filename;
  }

  async listConversations() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM conversations ORDER BY updated_at DESC',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async getConversationBySessionId(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM conversations WHERE session_id = ?',
        [sessionId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async messageExists(uuid) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT 1 FROM messages WHERE uuid = ?',
        [uuid],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });
  }

  async addMessageWithUuid(conversationId, role, content, timestamp, uuid) {
    const db = this.db;
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO messages (conversation_id, role, content, created_at, uuid) VALUES (?, ?, ?, ?, ?)',
        [conversationId, role, content, timestamp, uuid],
        function(err) {
          if (err) reject(err);
          else {
            // Update conversation timestamp
            db.run(
              'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [conversationId],
              () => resolve(this.lastID)
            );
          }
        }
      );
    });
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}