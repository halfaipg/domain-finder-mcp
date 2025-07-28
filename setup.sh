#!/bin/bash

# Domain Finder MCP Server Setup Script
echo "🚀 Setting up Domain Finder MCP Server..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first:"
    echo "   https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building the project..."
npm run build

# Check if .env exists, if not copy from example
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env with your API keys before using the server"
else
    echo "✅ .env file already exists"
fi

# Check if Cursor config directory exists
CURSOR_CONFIG_DIR="$HOME/.cursor"
if [ ! -d "$CURSOR_CONFIG_DIR" ]; then
    echo "📁 Creating Cursor config directory..."
    mkdir -p "$CURSOR_CONFIG_DIR"
fi

# Copy MCP config to Cursor (if Cursor is available)
if [ -d "$CURSOR_CONFIG_DIR" ]; then
    echo "⚙️  Installing MCP configuration for Cursor..."
    cp .cursor/mcp.json "$CURSOR_CONFIG_DIR/mcp.json"
    CURSOR_CONFIG_INSTALLED=true
else
    echo "ℹ️  Cursor config directory not found, skipping Cursor setup"
    CURSOR_CONFIG_INSTALLED=false
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env with your API keys"
echo "2. Configure your MCP tool (Cursor, Claude Code, etc.)"
echo "3. Test with: 'Suggest domain names for my business'"
echo ""
echo "🔧 Configuration files:"
echo "   - Environment: .env"
if [ "$CURSOR_CONFIG_INSTALLED" = true ]; then
    echo "   - Cursor MCP: $CURSOR_CONFIG_DIR/mcp.json"
fi
echo ""
echo "🛠️  MCP Server Settings:"
echo "   - Command: node"
echo "   - Arguments: [\"dist/server.js\", \"--stdio\"]"
echo "   - Working Directory: $(pwd)"
echo ""
echo "📚 For detailed setup instructions, see README.md" 