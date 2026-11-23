# MCP Setup Quick Reference

No API keys are required. Node.js 18 or newer is.

## Without cloning

**Claude Code**

```bash
claude mcp add domain-finder -- npx -y domain-finder-mcp
```

**Cursor, Claude Desktop, other MCP tools** - add to the tool's MCP config:

```json
{
  "mcpServers": {
    "domain-finder": {
      "command": "npx",
      "args": ["-y", "domain-finder-mcp"]
    }
  }
}
```

Config file locations:

- Cursor: `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`)
- Claude Desktop: Settings → Developer → Edit Config

## From a clone

Run `./setup.sh` (macOS/Linux) or `.\setup.ps1` (Windows). It builds the server and prints a config that points at your clone:

```json
{
  "mcpServers": {
    "domain-finder": {
      "command": "node",
      "args": ["/absolute/path/to/domain-finder-mcp/dist/server.js"]
    }
  }
}
```

## Available Tools

- **`suggest-domains`** - checks the names your assistant brainstorms across suitable TLDs
- **`check-domain`** - check one full domain or up to 100 at once
- **`list-tlds`** - registrable TLDs with typical prices, for choosing TLDs
- **`deep-tld`** - domain hacks and word/TLD phrases across every registrable TLD

## Test Prompt

"Find me an available domain for a coffee roasting business"

## Troubleshooting

- **Tool not recognized**: restart your MCP application after editing its config
- **Node not found**: install Node.js 18+, or use the full path to `node` as the command
- **Path issues with a clone**: use an absolute path to `dist/server.js`
- **Optional settings** (Namecheap premium pricing): put them in the config's `env` block; see `.env.example`
- **PowerShell execution policy**: if `.\setup.ps1` is blocked, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
