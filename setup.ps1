# Domain Finder MCP Server setup: installs, builds, and prints the config to paste into your MCP tool.
# Nothing outside this folder is modified.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is not installed. Install Node 18 or newer from https://nodejs.org/ and run this again." -ForegroundColor Red
    exit 1
}

$nodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 18) {
    Write-Host "Node $(node --version) is too old. Install Node 18 or newer from https://nodejs.org/ and run this again." -ForegroundColor Red
    exit 1
}

Write-Host "Installing dependencies and building..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$server = Join-Path (Get-Location) "dist\server.js"
# JSON needs backslashes doubled
$serverJson = $server.Replace("\", "\\")

Write-Host ""
Write-Host "Setup complete. No API keys are needed." -ForegroundColor Green
Write-Host ""
Write-Host "Claude Code:" -ForegroundColor Cyan
Write-Host "  claude mcp add domain-finder -- node `"$server`""
Write-Host ""
Write-Host "Cursor, Claude Desktop and other MCP tools - add this to the tool's MCP config" -ForegroundColor Cyan
Write-Host "(Cursor: $env:USERPROFILE\.cursor\mcp.json):"
Write-Host @"

  {
    "mcpServers": {
      "domain-finder": {
        "command": "node",
        "args": ["$serverJson"]
      }
    }
  }

"@
Write-Host "Then restart the tool and ask: 'Find me an available domain for a coffee roasting business'"
Write-Host ""
Write-Host "Optional: registrar premium pricing via Namecheap is described in .env.example."
