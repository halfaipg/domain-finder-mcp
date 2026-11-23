#!/bin/bash
# Domain Finder MCP Server setup: installs, builds, and prints the config to paste into your MCP tool.
# Nothing outside this folder is modified.
set -e
cd "$(dirname "$0")"

if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Install Node 18 or newer from https://nodejs.org/ and run this again."
    exit 1
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "Node $(node --version) is too old. Install Node 18 or newer from https://nodejs.org/ and run this again."
    exit 1
fi

echo "Installing dependencies and building..."
npm install

SERVER="$(pwd)/dist/server.js"

cat <<EOF

Setup complete. No API keys are needed.

Claude Code:
  claude mcp add domain-finder -- node "$SERVER"

Cursor, Claude Desktop and other MCP tools - add this to the tool's MCP config
(Cursor: ~/.cursor/mcp.json):

  {
    "mcpServers": {
      "domain-finder": {
        "command": "node",
        "args": ["$SERVER"]
      }
    }
  }

Then restart the tool and ask: "Find me an available domain for a coffee roasting business"

Optional: registrar premium pricing via Namecheap is described in .env.example.
EOF
