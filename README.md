# Domain Finder MCP Server

Intelligent domain name suggestion MCP server with real-time availability checking. Works with Cursor, Claude Code, and other MCP tools.

## Key Features

- **Intelligent LLM Brainstorming**: Advanced AI-powered domain generation using creative strategies
- **Deep TLD Exploration**: Cycle through all 1,441+ TLDs to find standout combinations
- **Multi-Provider Domain Checking**: Switch between Namecheap and Domainr APIs
- **Local & Cloud LLMs**: Support for Ollama, OpenAI, Groq, Together AI, and more
- **Smart Categorization**: Tech, brand, country, and fun TLD categories
- **Batch Operations**: Check multiple domains at once for efficiency
- **Business-Focused**: Tailored suggestions based on industry and business description
- **Universal MCP**: Works with Cursor, Claude Code, and any MCP-compatible tool

## Quick Setup

### macOS/Linux
```bash
git clone https://github.com/halfaipg/domain-finder-mcp
cd domain-finder-mcp
./setup.sh
```

### Windows
```powershell
git clone https://github.com/halfaipg/domain-finder-mcp
cd domain-finder-mcp
.\setup.ps1
```

### Manual Setup (All Platforms)
```bash
git clone https://github.com/halfaipg/domain-finder-mcp
cd domain-finder-mcp
npm install
npm run build
cp .env.example .env  # or create .env manually
```

Then edit `.env` with your API keys and restart your MCP tool.

## Configuration

### Domain Providers
- **Namecheap**: Requires $50 spent on account or some other prerequisite
- **Domainr**: RapidAPI integration, free tier

### LLM Providers
- **Local**: Ollama with any local model
- **Cloud**: OpenAI, Groq, Together AI, Anthropic etc
- **Custom**: Any OpenAI-compatible endpoint

## Available Tools

### **suggest-domains**
Advanced AI-powered domain suggestions with intelligent LLM brainstorming, smart retry logic, and enhanced scoring. Uses the same creative strategies as deep-TLD exploration.

**Parameters:**
- `businessDescription` (required) - Detailed description of your business/project
- `searchMode` (optional) - `standard`, `competitive`, `budget`, `premium`, or `international`
- `industry` (optional) - Business industry for smart TLD selection
- `maxSuggestions` (optional) - Number of suggestions (1-50, default: 15)

### **check-domain**
Check domain availability for single domains or batch check multiple domains at once.

**Parameters:**
- `domain` (optional) - Single domain to check (e.g., "example.com")
- `domains` (optional) - Array of domains to check (e.g., ["example.com", "test.io"])

**Note:** Provide either `domain` OR `domains`, not both. Up to 20 domains per batch.

### **deep-tld**
Deep TLD exploration that cycles through all 1,441+ TLDs in batches to find standout domain combinations using AI analysis. Perfect for discovering creative, unexpected domain names.

**Parameters:**
- `businessDescription` (required) - Detailed description of your business/project
- `keywords` (optional) - Specific keywords to focus on
- `batchSize` (optional) - TLDs per batch (10-500, default: 200)
- `maxBatches` (optional) - Number of batches (1-20, default: 10)
- `creativityLevel` (optional) - `conservative`, `moderate`, or `wild`
- `checkAvailability` (optional) - Whether to check availability for top results

## Quick Examples

### Get Creative Domain Suggestions
```
suggest-domains for "artisanal pickle factory" with competitive mode
```
**Result:** `gourkled.ai`, `picklepulse.ai`, `factorydash.ai`

### Check Domain Availability
```
check-domain for "example.com"
```
**Result:** `example.com is ✗ TAKEN`

### Deep TLD Exploration
```
deep-tld for "coffee shop" with wild creativity
```
**Result:** Discovers creative combinations across all 1,441+ TLDs

## Documentation

- [MCP Setup Guide](MCP_SETUP.md) - Universal configuration
- [API Provider Setup](README.md#api-provider-setup) - Detailed setup instructions

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=halfaipg/domain-finder-mcp&type=Date)](https://www.star-history.com/#halfaipg/domain-finder-mcp&Date)

## License

MIT License
