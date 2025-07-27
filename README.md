# Claude Story

> Automatic conversation history manager for Claude Code. Auto-saves all Claude conversations to markdown files with SQLite database tracking, just like SpecStory for Cursor.

## 🚀 Quick Start

```bash
# Install globally
npm install -g claude-story

# Start monitoring (run once)
claude-story start

# Check status
claude-story status
```

That's it! Claude Story will now automatically save all your Claude Code conversations.

## ✨ Features

- **🤖 Automatic Monitoring** - Detects all Claude Code conversations without manual setup
- **📁 Project Auto-Detection** - Creates `.claude-story/` directories in each project automatically  
- **💾 SQLite Database** - Stores conversation metadata with unique IDs and timestamps
- **📄 Markdown Export** - Auto-exports conversations to readable markdown files
- **🔍 Cross-Project Search** - Compatible with MCP servers for enhanced search capabilities
- **⚡ Real-time Sync** - Conversations saved as you chat with Claude
- **🙈 Git Integration** - Automatically adds `.claude-story/` to .gitignore when created

## 🎯 How It Works

Claude Story monitors the `~/.claude/projects/` directory where Claude Code stores conversation data. When you use Claude Code in any project, it automatically:

1. **Detects** the conversation in real-time
2. **Creates** a `.claude-story/` directory in your project
3. **Saves** the conversation to a SQLite database
4. **Exports** to markdown files in `history/` folder

## 📂 File Structure

After installation, your projects will have:

```
your-project/
├── .claude-story/
│   ├── conversations.db     # SQLite database
│   ├── history/             # Markdown exports
│   │   ├── 2025-01-15T10-30-45Z-building-new-feature.md
│   │   └── 2025-01-15T14-22-10Z-debugging-issue.md
│   └── .what-is-this.md     # Documentation
```

## 🛠 Commands

```bash
# Start monitoring (runs continuously)
claude-story start

# Check detection status  
claude-story status

# Stop monitoring
claude-story stop

# Show help
claude-story help
```

## 🔧 Requirements

- **Node.js** >= 16.0.0
- **Claude Code** installed and used at least once
- **macOS/Linux** (Windows support coming soon)

## 🆚 Claude Story vs SpecStory

| Feature | SpecStory (Cursor) | Claude Story (Claude Code) |
|---------|-------------------|---------------------------|
| Auto-detection | ✅ | ✅ |
| SQLite database | ✅ | ✅ |
| Markdown export | ✅ | ✅ |
| Project directories | `.specstory/` | `.claude-story/` |
| Setup required | None | `claude-story start` |

## 🔍 MCP Server Integration

Claude Story outputs standard markdown files that can be indexed by any MCP (Model Context Protocol) server for enhanced search and retrieval across projects. The organized file structure makes it easy to integrate with existing workflow tools.

## 🚨 Security & Privacy

- **Local only** - All data stays on your machine
- **No network requests** - Works completely offline
- **User path security** - Uses `~/` instead of hardcoded paths
- **Excludes sensitive data** - Filters out potential secrets and credentials

## 📝 License

MIT © Claude Story Team

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🐛 Issues

Found a bug? [Report it here](https://github.com/your-username/claude-story/issues)

---

**Made with ❤️ for the Claude Code community**