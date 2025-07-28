# MCP Server Setup Quick Reference

## Universal MCP Configuration

For any MCP-compatible tool (Cursor, Claude Code, etc.), use these settings:

```json
{
  "name": "domain-finder",
  "command": "node",
  "arguments": ["dist/server.js", "--stdio"],
  "workingDirectory": "/path/to/your/cloned/brandstorm.ai"
}
```

## Tool-Specific Setup

### Cursor
1. **Automatic**: 
   - **macOS/Linux**: Run `./setup.sh` (installs config automatically)
   - **Windows**: Run `.\setup.ps1` (installs config automatically)
2. **Manual**: Copy `.cursor/mcp.json` to `~/.cursor/mcp.json` (macOS/Linux) or `%USERPROFILE%\.cursor\mcp.json` (Windows)
3. **UI**: Settings → Extensions → MCP Servers → Add New

### Claude Code
1. Open Claude Code settings
2. Go to **MCP Servers** section
3. Add new server with the universal configuration above

### Other MCP Tools
Use the universal configuration in your tool's MCP settings.

## Available Tools

- **`suggest-domains`** - Advanced domain suggestions with scoring
- **`quick-suggest`** - Fast domain brainstorming
- **`check-domain`** - Check specific domain availability

## Test Command
"Suggest domain names for a coffee roasting business"

## Troubleshooting

- **Node not found**: Install Node.js or use full path
- **API errors**: Check `.env` configuration
- **Tool not recognized**: Restart your MCP application
- **Path issues**: Use absolute path in working directory
- **PowerShell execution policy**: If `.\setup.ps1` fails, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
- **Windows path separators**: Use backslashes (`\`) in Windows paths, forward slashes (`/`) in Unix paths 