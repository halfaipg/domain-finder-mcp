import "dotenv/config";
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { DomainService } from './services/domain-service.js';

const domainService = new DomainService();

// Create server instance
const server = new Server(
  {
    name: 'domain-finder',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Schema definitions
const SuggestDomainsSchema = z.object({
  businessDescription: z.string().min(1, "Business description is required"),
  searchMode: z.enum(['standard', 'competitive', 'premium', 'budget', 'international']).optional(),
  industry: z.string().optional(),
  maxSuggestions: z.number().min(1).max(50).optional()
});



const CheckDomainSchema = z.object({
  domain: z.string().optional(),
  domains: z.array(z.string()).optional()
}).refine(data => data.domain || (data.domains && data.domains.length > 0), {
  message: "Either 'domain' or 'domains' must be provided"
}).refine(data => !(data.domain && data.domains), {
  message: "Provide either 'domain' (single) or 'domains' (array), not both"
}).refine(data => !data.domains || data.domains.length <= 20, {
  message: "Maximum 20 domains per batch"
});

const DeepTldSchema = z.object({
  businessDescription: z.string().min(1, "Business description is required"),
  keywords: z.array(z.string()).optional(),
  batchSize: z.number().min(10).max(500).optional(),
  maxBatches: z.number().min(1).max(20).optional(),
  creativityLevel: z.enum(['conservative', 'moderate', 'wild']).optional(),
  checkAvailability: z.boolean().optional()
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "suggest-domains",
        description: "Advanced AI-powered domain suggestions with smart retry logic, enhanced scoring, and categorized results",
        inputSchema: {
          type: "object",
          properties: {
            businessDescription: {
              type: "string",
              description: "Detailed description of the business/project"
            },
            searchMode: {
              type: "string",
              enum: ["standard", "competitive", "budget", "premium", "international"],
              description: "Search strategy: standard (balanced), competitive (creative), budget (affordable), premium (top TLDs), international (global)"
            },
            industry: {
              type: "string",
              description: "Business industry for smart TLD selection (optional)"
            },
            maxSuggestions: {
              type: "number",
              description: "Maximum suggestions per attempt (1-50, default: 15)"
            }
          },
          required: ["businessDescription"]
        }
      },
      {
        name: "check-domain",
        description: "Check if a specific domain is available for registration (supports single domain or array of domains)",
        inputSchema: {
          type: "object",
          properties: {
            domain: {
              type: "string",
              description: "Single domain name to check (e.g., example.com)"
            },
            domains: {
              type: "array",
              items: { type: "string" },
              description: "Array of domain names to check (e.g., ['example.com', 'test.io']) - use this instead of 'domain' for multiple domains",
              maxItems: 20
            }
          }
        }
      },
      {
        name: "deep-tld",
        description: "Deep TLD exploration - cycles through all 1,441+ TLDs in batches to find standout domain combinations using AI analysis",
        inputSchema: {
          type: "object",
          properties: {
            businessDescription: {
              type: "string",
              description: "Detailed description of the business/project"
            },
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "Optional specific keywords to focus on"
            },
            batchSize: {
              type: "number",
              description: "Number of TLDs to process per batch (10-100, default: 50)"
            },
            maxBatches: {
              type: "number", 
              description: "Maximum number of batches to process (1-20, default: 5)"
            },
            creativityLevel: {
              type: "string",
              enum: ["conservative", "moderate", "wild"],
              description: "How creative to be with domain combinations (default: moderate)"
            },
            checkAvailability: {
              type: "boolean",
              description: "Whether to check domain availability for top results (default: false for faster results)"
            }
          },
          required: ["businessDescription"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { params } = request;
  const { name, arguments: args } = params;

  switch (name) {
    case "suggest-domains": {
      try {
        const validated = SuggestDomainsSchema.parse(args);
        const results = await domainService.suggestDomains(
          validated.businessDescription,
          validated.searchMode,
          validated.maxSuggestions
        );

        // Format results
        let output = "DOMAIN SUGGESTIONS\n";
        output += "=".repeat(25) + "\n\n";

        if (results.available.length > 0) {
          output += "AVAILABLE DOMAINS\n";
          output += "-".repeat(15) + "\n";
          results.available.forEach(result => {
            output += `✓ ${result.domain} (Score: ${result.score}/10)\n`;
          });
          output += "\n";
        }

        if (results.premium.length > 0) {
          output += "PREMIUM DOMAINS\n";
          output += "-".repeat(15) + "\n";
          results.premium.forEach(result => {
            output += `★ ${result.domain}`;
            if (result.premiumPrice) {
              output += ` ($${result.premiumPrice.toLocaleString()})`;
            }
            output += "\n";
          });
          output += "\n";
        }

        if (results.taken.length > 0) {
          output += "TAKEN DOMAINS\n";
          output += "-".repeat(15) + "\n";
          results.taken.forEach(result => {
            output += `✗ ${result.domain}\n`;
          });
          output += "\n";
        }

        if (results.insights.length > 0) {
          output += "INSIGHTS\n";
          output += "-".repeat(15) + "\n";
          results.insights.forEach(insight => {
            output += `• ${insight}\n`;
          });
          output += "\n";
        }

        return {
          content: [{
            type: "text",
            text: output
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error generating domain suggestions: ${error instanceof Error ? error.message : "Unknown error"}`
          }],
          isError: true
        };
      }
    }



    case "check-domain": {
      try {
        const validated = CheckDomainSchema.parse(args);
        
        if (validated.domain) {
          // Single domain check
          const status = await domainService.checkDomain(validated.domain);
          
          const available = status[0]?.summary === 'inactive';
          const isPremium = status[0]?.status?.includes('premium');
          
          let result = available ? "✓ AVAILABLE" : "✗ TAKEN";
          if (isPremium) {
            result = available ? "✓ PREMIUM" : "✗ PREMIUM (TAKEN)";
          }
          
          return {
            content: [{
              type: "text",
              text: `${validated.domain} is ${result}`
            }]
          };
        } else if (validated.domains) {
          // Multiple domains check
          const results = await domainService.checkMultipleDomains(validated.domains);

          let output = "BATCH DOMAIN CHECK\n";
          output += "=".repeat(20) + "\n\n";

          const available = results.filter(r => r.available && !r.isPremium);
          const premium = results.filter(r => r.available && r.isPremium);
          const taken = results.filter(r => !r.available);
          
          if (available.length > 0) {
            output += "✅ AVAILABLE:\n";
            available.forEach(result => {
            output += `✓ ${result.domain}\n`;
          });
          output += "\n";
        }

          if (premium.length > 0) {
            output += "💎 PREMIUM AVAILABLE:\n";
            premium.forEach(result => {
              output += `★ ${result.domain}`;
              if (result.premiumPrice) {
                output += ` ($${result.premiumPrice.toLocaleString()})`;
              }
              output += "\n";
            });
            output += "\n";
          }
          
          if (taken.length > 0) {
            output += "❌ TAKEN:\n";
            taken.forEach(result => {
            output += `✗ ${result.domain}\n`;
          });
            output += "\n";
          }
          
          output += `SUMMARY: ${available.length} available, ${premium.length} premium, ${taken.length} taken`;
          
          return {
            content: [{
              type: "text",
              text: output
            }]
          };
        }

        return {
          content: [{
            type: "text",
            text: "Error: No domain or domains provided"
          }],
          isError: true
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error checking domain(s): ${error instanceof Error ? error.message : "Unknown error"}`
          }],
          isError: true
        };
      }
    }



    case "deep-tld": {
      try {
        const validated = DeepTldSchema.parse(args);
        const results = await domainService.deepTldExploration(
          validated.businessDescription,
          validated.keywords || [],
          validated.batchSize || 200,
          validated.maxBatches || 10,
          validated.creativityLevel || 'moderate',
          validated.checkAvailability || false
        );

        let output = "DEEP TLD EXPLORATION\n";
        output += "=".repeat(25) + "\n\n";

        if (results.standouts.length > 0) {
          output += "🌟 STANDOUT DOMAINS\n";
          output += "-".repeat(20) + "\n";
          results.standouts.forEach(result => {
            output += `🌟 ${result.domain} (Score: ${result.score}/10)\n`;
            output += `   Reason: ${result.reason}\n\n`;
          });
        }

        if (results.available.length > 0) {
          output += "AVAILABLE DOMAINS\n";
          output += "-".repeat(15) + "\n";
          results.available.forEach(result => {
            output += `✓ ${result.domain} (Score: ${result.score}/10)\n`;
          });
          output += "\n";
        }

        if (results.stats.length > 0) {
          output += "EXPLORATION STATS\n";
          output += "-".repeat(15) + "\n";
          results.stats.forEach(stat => {
            output += `• ${stat}\n`;
          });
          output += "\n";
        }
        
        return {
          content: [{
            type: "text",
            text: output
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error in deep TLD exploration: ${error instanceof Error ? error.message : "Unknown error"}`
          }],
          isError: true
        };
      }
    }

    default:
      return {
        content: [{
          type: "text",
          text: `Unknown tool: ${name}`
        }],
        isError: true
      };
  }
});

// Start server
async function main() {
  const args = process.argv.slice(2);
  const useStdio = args.includes('--stdio');

  if (useStdio) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    process.exit(1);
  }
}

main().catch(() => process.exit(1)); 