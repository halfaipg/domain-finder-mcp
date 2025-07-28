# Domain Finder MCP Server

Intelligent domain name suggestion MCP server with real-time availability checking. Works with Cursor, Claude Code, and other MCP tools.

## ✨ Key Features

- **🔍 Multi-Provider Domain Checking**: Switch between Namecheap and Domainr APIs
- **🤖 Local & Cloud LLMs**: Support for Ollama, OpenAI, Groq, Together AI, and more
- **🎯 1,441+ TLDs**: Comprehensive domain coverage with smart categorization
- **🧠 Advanced Generation**: Word slicing, portmanteau, LLM-powered creative strategies
- **⚡ Universal MCP**: Works with Cursor, Claude Code, and any MCP-compatible tool
- **📊 Intelligent Scoring**: Domain quality assessment with realistic scoring

## 🚀 Quick Setup

```bash
git clone https://github.com/yourusername/brandstorm.ai.git
cd brandstorm.ai
./setup.sh
```

Then edit `.env` with your API keys and restart your MCP tool.

## 🔧 Configuration

### Domain Providers
- **Namecheap**: High-volume checking, premium pricing
- **Domainr**: Broader TLD support, RapidAPI integration

### LLM Providers
- **Local**: Ollama with llama2, mistral, codellama
- **Cloud**: OpenAI, Groq, Together AI, Anthropic
- **Custom**: Any OpenAI-compatible endpoint

## 🛠️ Available Tools

- **`suggest-domains`** - Advanced suggestions with scoring
- **`quick-suggest`** - Fast domain brainstorming  
- **`check-domain`** - Check specific domain availability

## 📖 Documentation

- [MCP Setup Guide](MCP_SETUP.md) - Universal configuration
- [API Provider Setup](README.md#api-provider-setup) - Detailed setup instructions

## License

MIT License
