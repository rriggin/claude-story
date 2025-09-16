import fs from 'fs';
import path from 'path';
import os from 'os';

export class ClaudeStoryConfig {
  constructor() {
    this.configDir = path.join(os.homedir(), '.claude-story');
    this.configFile = path.join(this.configDir, 'config.json');
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      // If config is corrupted, start fresh
    }

    // Default config
    return {
      autoStart: false,
      version: '1.2.0'
    };
  }

  saveConfig() {
    try {
      // Ensure config directory exists
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }

      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error.message);
    }
  }

  get(key) {
    return this.config[key];
  }

  set(key, value) {
    this.config[key] = value;
    this.saveConfig();
  }

  isAutoStartEnabled() {
    return this.get('autoStart') === true;
  }

  enableAutoStart() {
    this.set('autoStart', true);
  }

  disableAutoStart() {
    this.set('autoStart', false);
  }
}