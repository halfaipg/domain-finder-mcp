<div align="center">

<img src="https://raw.githubusercontent.com/halfaipg/domain-finder-mcp/main/assets/social.png" alt="Domain Finder MCP - AI-powered domain discovery" width="720">

# Domain Finder MCP

**Your AI assistant brainstorms the names. This checks which ones you can actually buy.**

[![GitHub stars](https://img.shields.io/github/stars/halfaipg/domain-finder-mcp?color=3ddc97)](https://github.com/halfaipg/domain-finder-mcp/stargazers)
[![License](https://img.shields.io/github/license/halfaipg/domain-finder-mcp?color=3ddc97)](LICENSE)
[![Node 18+](https://img.shields.io/badge/node-18%2B-3ddc97)](https://nodejs.org/)
[![MCP server](https://img.shields.io/badge/MCP-server-3ddc97)](https://modelcontextprotocol.io/)
[![No API keys](https://img.shields.io/badge/API%20keys-none%20needed-3ddc97)](#install)

[Install](#install) · [Tools](#tools) · [Data sources](#where-the-data-comes-from) · [Configuration](#optional-configuration)

</div>

Gives your AI assistant the ability to find domain names that are actually available. It checks availability live, knows every TLD you can register and what each typically costs, and works with Claude Code, Claude Desktop, Cursor, and any other MCP client.

**No accounts or API keys needed.** Availability comes straight from the domain registries.

## Install

Requires [Node.js](https://nodejs.org/) 18 or newer.

### Claude Code

```bash
claude mcp add domain-finder -- npx -y github:halfaipg/domain-finder-mcp
```

### Cursor, Claude Desktop, and other MCP tools

Add this to the tool's MCP config (Cursor: `~/.cursor/mcp.json`, Claude Desktop: Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "domain-finder": {
      "command": "npx",
      "args": ["-y", "github:halfaipg/domain-finder-mcp"]
    }
  }
}
```

Restart the tool, then ask something like:

> Find me an available domain for a coffee roasting business. Keep it under $20 a year.

### From a clone

```bash
git clone https://github.com/halfaipg/domain-finder-mcp
cd domain-finder-mcp
./setup.sh        # Windows: .\setup.ps1
```

The script installs, builds, and prints the exact config to paste in. It does not touch any files outside the folder.

## Tools

| Tool | What it does |
| --- | --- |
| `suggest-domains` | Takes the names your assistant brainstormed and checks each across suitable TLDs, returning what is open with prices. Called without names, it returns a brief: TLDs that match the business and domain hacks to build on. |
| `check-domain` | Checks one full domain or up to 100 at once. |
| `confirm-domain` | Optional, appears when [Porkbun keys](#exact-prices-for-your-finalists-optional) are set. Gets the registrar's real price for final picks and flags premium names. |
| `list-tlds` | Lists the TLDs open to public registration with prices, so the assistant can choose ones that fit the business and budget. Filter by text (`query: "shop"`), type (`generic` / `country`), or `maxPrice`. |
| `deep-tld` | Matches a list of related words against every registrable TLD to find domain hacks (`delicio.us`, `espres.so`) and word/TLD phrases (`roasted.coffee`), then checks them. |

### How it works

Your own assistant is the creative half. It already knows your business and taste from the conversation, so it brainstorms the names and picks the TLDs. The server is the factual half: live availability, real prices, and exhaustive matching against the TLD list, which language models cannot do from memory. There is no second LLM to configure and nothing is sent to any AI service by the server.

### Reading the results

```
AVAILABLE
✓ brineandjar.com - $11.81/yr

LIKELY AVAILABLE (no registry lookup for this TLD - not in DNS, confirm at a registrar)
~ jarpost.io - $20.91 first yr, $51.80/yr after

TAKEN
✗ pickle.net
```

- **Available** means the registry itself reports the name as unregistered.
- **Likely available** is used for TLDs whose registry has no public lookup (`.io`, `.co`, `.de`, `.me`, `.us` and others). The name is absent from DNS, which is a strong signal but not a guarantee.
- **Prices** are typical retail list prices for the TLD, not a quote. Registries price some individual names as premium, and the keyless lookup cannot see that. Confirm at your registrar before getting attached.

## Where the data comes from

| Data | Source |
| --- | --- |
| Availability | [RDAP](https://www.icann.org/rdap), the registries' own lookup protocol and the successor to WHOIS. DNS is used for TLDs without an RDAP server. |
| Which TLDs exist | [IANA root zone list](https://data.iana.org/TLD/tlds-alpha-by-domain.txt) |
| Which registry to ask | [IANA RDAP bootstrap](https://data.iana.org/rdap/dns.json) |
| Which TLDs you can buy, and prices | [Porkbun's public price list](https://porkbun.com/products/domains) |

The root zone has about 1,400 TLDs, but most of the rest are closed brand TLDs such as `.abbott` that nobody can register. The server works from the roughly 560 that are on general sale, and labels anything else as restricted.

The TLD data is bundled in `data/tlds.json`. Refresh it with:

```bash
npm run update-tlds
```

## Optional configuration

Everything works without configuration. Settings go in environment variables: either a `.env` file in the folder you start the server from, or the `env` block of your MCP config. See [.env.example](.env.example) for the full list.

### Exact prices for your finalists (optional)

The keyless lookup cannot see when a registry prices a name as premium, or holds it back as reserved. Short dictionary-word names like `roast.ing` are the usual case: they look open at list price and are not.

Add [Porkbun API keys](https://porkbun.com/account/api) (free with any Porkbun account) and the server gains a `confirm-domain` tool. Your assistant runs its final picks through it and gets the registrar's real first-year and renewal price, with premium names flagged.

```json
"env": {
  "PORKBUN_API_KEY": "pk1_...",
  "PORKBUN_SECRET_API_KEY": "sk1_..."
}
```

### Checking through Namecheap (optional)

Set `DOMAIN_PROVIDER=namecheap` with `NAMECHEAP_API_USER`, `NAMECHEAP_API_KEY`, and `NAMECHEAP_CLIENT_IP` to check through Namecheap instead. This adds premium-name detection and premium prices. Namecheap only grants API access to accounts with 20+ domains or $50+ in balance or recent spend, and your IP must be whitelisted.

`DOMAIN_PROVIDER=domainr` still works for existing RapidAPI keys, but Domainr has deprecated that API in favour of Fastly's Domain Research API.

If the chosen provider is missing credentials, the server falls back to the keyless lookup instead of failing.

## Troubleshooting

- **The tool does not show up**: restart your MCP client after changing its config.
- **`npx` is slow the first time**: it downloads and builds the server once, then caches it.
- **"COULD NOT CHECK"**: the registry did not answer (usually rate limiting). Run the check again.
- **Using a clone**: point the config at the absolute path, `"command": "node", "args": ["/path/to/domain-finder-mcp/dist/server.js"]`.

## Development

```bash
npm install          # also builds
npm run dev          # run from source with reload
npm run update-tlds  # refresh tlds.txt and data/tlds.json
```

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=halfaipg/domain-finder-mcp&type=Date)](https://www.star-history.com/#halfaipg/domain-finder-mcp&Date)

## License

[Apache-2.0](LICENSE)
