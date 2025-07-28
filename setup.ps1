# Domain Finder MCP Server Setup Script for Windows
Write-Host "🚀 Setting up Domain Finder MCP Server..." -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js first:" -ForegroundColor Red
    Write-Host "   https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
npm install

# Build the project
Write-Host "🔨 Building the project..." -ForegroundColor Cyan
npm run build

# Check if .env exists, if not copy from example
if (-not (Test-Path ".env")) {
    Write-Host "📝 Creating .env file from template..." -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "⚠️  Please edit .env with your API keys before using the server" -ForegroundColor Yellow
    } else {
        Write-Host "❌ .env.example not found. Creating basic .env file..." -ForegroundColor Red
        @"
# Domain Finder MCP Server Configuration

# Choose your provider: 'namecheap' or 'domainr'
DOMAIN_PROVIDER=domainr

# Namecheap API Configuration (if using namecheap)
NAMECHEAP_API_USER=your_username
NAMECHEAP_API_KEY=your_api_key
NAMECHEAP_CLIENT_IP=your_ip_address

# Domainr API Configuration (if using domainr)
DOMAINR_RAPIDAPI_KEY=your_rapidapi_key
DOMAINR_RAPIDAPI_HOST=domainr.p.rapidapi.com

# LLM Provider Configuration
LLM_PROVIDER=openai

# OpenAI/Compatible API Configuration
OPENAI_API_URL=https://api.openai.com/v1
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-4

# Ollama Configuration (if using ollama)
OLLAMA_API_URL=http://127.0.0.1:11434/api/generate
"@ | Out-File -FilePath ".env" -Encoding UTF8
    }
} else {
    Write-Host "✅ .env file already exists" -ForegroundColor Green
}

# Check if Cursor config directory exists
$cursorConfigDir = "$env:USERPROFILE\.cursor"
if (-not (Test-Path $cursorConfigDir)) {
    Write-Host "📁 Creating Cursor config directory..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $cursorConfigDir -Force | Out-Null
}

# Copy MCP config to Cursor (if Cursor is available)
if (Test-Path $cursorConfigDir) {
    Write-Host "⚙️  Installing MCP configuration for Cursor..." -ForegroundColor Cyan
    if (Test-Path ".cursor\mcp.json") {
        Copy-Item ".cursor\mcp.json" "$cursorConfigDir\mcp.json" -Force
        $cursorConfigInstalled = $true
    } else {
        Write-Host "⚠️  .cursor\mcp.json not found, creating basic config..." -ForegroundColor Yellow
        @"
{
  "mcpServers": {
    "domain-finder": {
      "command": "node",
      "args": ["dist/server.js", "--stdio"],
      "cwd": "$(Get-Location)"
    }
  }
}
"@ | Out-File -FilePath "$cursorConfigDir\mcp.json" -Encoding UTF8
        $cursorConfigInstalled = $true
    }
} else {
    Write-Host "ℹ️  Cursor config directory not found, skipping Cursor setup" -ForegroundColor Yellow
    $cursorConfigInstalled = $false
}

Write-Host ""
Write-Host "🎉 Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Edit .env with your API keys"
Write-Host "2. Configure your MCP tool (Cursor, Claude Code, etc.)"
Write-Host "3. Test with: 'Suggest domain names for my business'"
Write-Host ""
Write-Host "🔧 Configuration files:" -ForegroundColor Cyan
Write-Host "   - Environment: .env"
if ($cursorConfigInstalled) {
    Write-Host "   - Cursor MCP: $cursorConfigDir\mcp.json"
}
Write-Host ""
Write-Host "🛠️  MCP Server Settings:" -ForegroundColor Cyan
Write-Host "   - Command: node"
Write-Host "   - Arguments: [""dist/server.js"", ""--stdio""]"
Write-Host "   - Working Directory: $(Get-Location)"
Write-Host ""
Write-Host "📚 For detailed setup instructions, see README.md" -ForegroundColor Cyan 