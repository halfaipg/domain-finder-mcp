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
    name: 'brandstorm-domains',
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

const QuickSuggestSchema = z.object({
  businessDescription: z.string().min(1, "Business description is required")
});

const CheckDomainSchema = z.object({
  domain: z.string().min(1, "Domain is required")
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
        name: "quick-suggest",
        description: "Fast domain suggestions with basic availability checking",
        inputSchema: {
          type: "object",
          properties: {
            businessDescription: {
              type: "string",
              description: "Brief description of the business/project"
            }
          },
          required: ["businessDescription"]
        }
      },
      {
        name: "check-domain",
        description: "Check if a specific domain is available for registration",
        inputSchema: {
          type: "object",
          properties: {
            domain: {
              type: "string",
              description: "Domain name to check (e.g., example.com)"
            }
          },
          required: ["domain"]
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

    case "quick-suggest": {
      try {
        const validated = QuickSuggestSchema.parse(args);
        const results = await domainService.suggestDomains(
          validated.businessDescription,
          'standard',
          8
        );

        let output = "QUICK DOMAIN SUGGESTIONS\n";
        output += "=".repeat(25) + "\n\n";

        if (results.available.length > 0) {
          output += "AVAILABLE:\n";
          results.available.forEach(result => {
            output += `✓ ${result.domain}\n`;
          });
          output += "\n";
        }

        if (results.taken.length > 0) {
          output += "TAKEN:\n";
          results.taken.forEach(result => {
            output += `✗ ${result.domain}\n`;
          });
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
            text: `Error generating quick suggestions: ${error instanceof Error ? error.message : "Unknown error"}`
          }],
          isError: true
        };
      }
    }

    case "check-domain": {
      try {
        const validated = CheckDomainSchema.parse(args);
        // Use public method instead of accessing private property
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
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error checking domain: ${error instanceof Error ? error.message : "Unknown error"}`
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