# Installing Claude Story

## Quick Install (Recommended)

```bash
# Install globally from the claude-story directory
cd ~/Code/claude-story
npm install -g .
```

## Development Install (For Contributors)

```bash
# Link for development (changes take effect immediately)  
cd ~/Code/claude-story
npm link
```

## Verify Installation

```bash
# Should show help text
claude-story help

# Check version
claude-story --version
```

## First Time Setup

```bash
# In any project where you want to save conversations
cd your-project
claude-story init
```

## Uninstall

```bash
npm uninstall -g claude-story
```

## Troubleshooting

If `claude-story` command not found:
1. Check npm global bin directory: `npm bin -g`
2. Ensure it's in your PATH
3. Try reopening terminal

On macOS with homebrew node:
```bash
echo 'export PATH="$(npm bin -g):$PATH"' >> ~/.zshrc
source ~/.zshrc
```