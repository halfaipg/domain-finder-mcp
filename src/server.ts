#!/usr/bin/env node
import "dotenv/config";
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { DomainResult, DomainService } from './services/domain-service.js';
import { PorkbunQuotes } from './providers/porkbun.js';
import { TldInfo, formatPrice, isKnownTld, listTlds, tldDataDate, tldType } from './tld-data.js';

const domainService = new DomainService();
// Present only when registrar API keys are configured; adds the confirm-domain tool
const registrar = PorkbunQuotes.fromEnv();
const MAX_CONFIRM = 8;
const MAX_CHECK_BATCH = 100;
const MAX_NAMES = 40;
const MAX_TLDS_PER_SEARCH = 15;
const MAX_MATRIX = 150;
const MAX_HACK_CHECKS = 100;
const PURCHASABLE_COUNT = listTlds('purchasable').length;

// The division of labour, told to the calling assistant up front
const INSTRUCTIONS = `This server helps you find domain names that are actually available. You do the creative work; the server verifies.

Workflow:
1. Brainstorm candidate names yourself, using everything you know about the user's business and taste.
2. Call suggest-domains with those names. It checks each one across suitable TLDs and returns availability with typical prices. Called without names it returns a short brief (matching TLDs, domain hacks) to start from.
3. To choose TLDs deliberately, call list-tlds: it shows every TLD open to registration with prices. Pick ones that fit the business, audience and budget, and pass them as tlds.
4. Call deep-tld with a generous list of related words to find domain hacks (delicio.us) and word/TLD phrases (roasting.coffee).
5. Use check-domain for specific full domain names.

Never tell the user a domain is available without checking it here first. Prices are typical list prices, not quotes; "likely available" results need confirming at a registrar.${registrar ? `

Before presenting final picks, run them through confirm-domain: it asks the registrar for the real price and catches premium or reserved names that looked available.` : ''}`;

// Create server instance
const server = new Server(
  {
    name: 'domain-finder',
    version: '1.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
    instructions: INSTRUCTIONS,
  }
);

// Assistants sometimes send a list as one string ("a, b, c" or a JSON array in quotes); accept both
const stringList = () => z.preprocess(value => {
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON: fall through to splitting
  }
  return value.split(/[,\n]+/).map(item => item.trim()).filter(Boolean);
}, z.array(z.string()));

// Schema definitions
const SuggestDomainsSchema = z.object({
  businessDescription: z.string().min(1, "Business description is required"),
  names: stringList().optional(),
  tlds: stringList().optional(),
  searchMode: z.enum(['standard', 'competitive', 'premium', 'budget', 'international']).optional(),
  maxPrice: z.number().positive().optional()
});

const CheckDomainSchema = z.object({
  domain: z.string().optional(),
  domains: stringList().optional()
}).refine(data => data.domain || (data.domains && data.domains.length > 0), {
  message: "Either 'domain' or 'domains' must be provided"
}).refine(data => !(data.domain && data.domains), {
  message: "Provide either 'domain' (single) or 'domains' (array), not both"
}).refine(data => !data.domains || data.domains.length <= MAX_CHECK_BATCH, {
  message: `Maximum ${MAX_CHECK_BATCH} domains per batch`
});

const DeepTldSchema = z.object({
  keywords: stringList().optional(),
  businessDescription: z.string().optional(),
  checkAvailability: z.boolean().optional(),
  tldScope: z.enum(['purchasable', 'all']).optional()
}).refine(data => (data.keywords && data.keywords.length > 0) || data.businessDescription, {
  message: "Provide 'keywords' (preferred) or 'businessDescription'"
});

const ListTldsSchema = z.object({
  query: z.string().optional(),
  type: z.enum(['generic', 'country', 'all']).optional(),
  maxPrice: z.number().positive().optional(),
  scope: z.enum(['purchasable', 'all']).optional(),
  limit: z.number().min(1).max(2000).optional()
});

const ConfirmDomainSchema = z.object({
  domains: stringList().refine(list => list.length > 0, { message: "Provide at least one domain" })
});

const PRICE_NOTE =`Prices are typical retail list prices per TLD (as of ${tldDataDate}); registrars vary, and a registry may price an individual name as premium.`;

const section = (title: string, rows: string[]) => rows.length ? `${title}\n${rows.join('\n')}\n\n` : '';
const isOpen = (r: DomainResult) => r.available && !r.isPremium && !r.restrictedTld;
const isRestricted = (r: DomainResult) => r.available && !r.isPremium && r.restrictedTld;
const premiumLabel = (r: DomainResult) =>
  `${r.premiumPrice ? ` ($${r.premiumPrice.toLocaleString()})` : ''}${r.available ? '' : ' (taken)'}`;

// Flat rendering of availability results, grouped by outcome
function formatChecked(results: DomainResult[]): string {
  const price = (r: DomainResult) => r.price ? ` - ${r.price}` : '';
  const confirmed = results.filter(r => isOpen(r) && r.source !== 'dns');
  const likely = results.filter(r => isOpen(r) && r.source === 'dns');

  let output = '';
  output += section('AVAILABLE', confirmed.map(r => `✓ ${r.domain}${price(r)}`));
  output += section(
    'LIKELY AVAILABLE (no registry lookup for this TLD - not in DNS, confirm at a registrar)',
    likely.map(r => `~ ${r.domain}${price(r)}`)
  );
  output += section(
    'UNREGISTERED, BUT THE TLD IS NOT ON GENERAL SALE (brand TLD, or one with eligibility rules)',
    results.filter(isRestricted).map(r => `~ ${r.domain}`)
  );
  output += section('PREMIUM', results.filter(r => r.isPremium).map(r => `★ ${r.domain}${premiumLabel(r)}`));
  output += section('TAKEN', results.filter(r => r.status === 'taken' && !r.isPremium).map(r => `✗ ${r.domain}`));
  output += section('COULD NOT CHECK', results.filter(r => r.status === 'unknown' && !r.isPremium).map(r => `? ${r.domain}${r.note ? ` - ${r.note}` : ''}`));
  output += section('INVALID', results.filter(r => r.status === 'invalid').map(r => `! ${r.domain}${r.note ? ` - ${r.note}` : ''}`));

  if (confirmed.some(r => r.price) || likely.some(r => r.price)) output += `${PRICE_NOTE}\n`;
  return output;
}

// Per-name rendering for a names x TLDs search: what is open for each name, on few lines
function formatByName(groups: { name: string; results: DomainResult[] }[]): string {
  let output = '';
  for (const { name, results } of groups) {
    const lines: string[] = [];
    for (const r of results) {
      const tld = `.${r.domain.split('.').slice(1).join('.')}`;
      if (r.isPremium) lines.push(`  ★ ${tld} premium${premiumLabel(r)}`);
      else if (isOpen(r)) lines.push(`  ${r.source === 'dns' ? '~' : '✓'} ${tld}${r.price ? ` ${r.price}` : ''}`);
    }
    const tldsWhere = (predicate: (r: DomainResult) => boolean) =>
      results.filter(r => !r.isPremium && predicate(r)).map(r => `.${r.domain.split('.').slice(1).join('.')}`).join(' ');
    const taken = tldsWhere(r => r.status === 'taken');
    const restricted = tldsWhere(isRestricted);
    const failed = tldsWhere(r => r.status === 'unknown' || r.status === 'invalid');
    if (taken) lines.push(`  ✗ taken: ${taken}`);
    if (restricted) lines.push(`  - unregistered but TLD not on general sale: ${restricted}`);
    if (failed) lines.push(`  ? could not check: ${failed}`);
    output += `${name}\n${lines.join('\n')}\n\n`;
  }
  return output;
}

const tldLine = (t: TldInfo) => `.${t.tld}${formatPrice(t.tld) ? ` ${formatPrice(t.tld)}` : ''}`;

// A long list is grouped by yearly cost so it stays cheap to read; a short one shows exact prices
function formatTldList(tlds: TldInfo[]): string {
  if (tlds.length <= 60) return tlds.map(tldLine).join('\n');

  const bands: [string, number][] = [['up to $15/yr', 15], ['$15-30/yr', 30], ['$30-60/yr', 60], ['$60-150/yr', 150], ['over $150/yr', Infinity]];
  const grouped = new Map<string, string[]>();
  for (const t of tlds) {
    const cost = t.renew ?? t.reg;
    const band = cost === undefined ? 'no list price' : bands.find(([, max]) => cost <= max)![0];
    grouped.set(band, [...(grouped.get(band) ?? []), `.${t.tld}`]);
  }
  return [...bands.map(([label]) => label), 'no list price']
    .filter(label => grouped.has(label))
    .map(label => `${label} (${grouped.get(label)!.length}):\n${grouped.get(label)!.join(' ')}`)
    .join('\n\n') + '\n\nGrouped by yearly renewal price. Narrow with query, type or maxPrice to see exact prices.';
}

const errorResult = (prefix: string, error: unknown) => ({
  content: [{
    type: "text",
    text: `${prefix}: ${error instanceof z.ZodError
      ? error.issues.map(issue => issue.message).join('; ')
      : error instanceof Error ? error.message : "Unknown error"}`
  }],
  isError: true
});

const textResult = (text: string) => ({ content: [{ type: "text", text }] });

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "suggest-domains",
        description: `Find available domains for a business. You brainstorm the names; this checks them. Pass 'names' (10-${MAX_NAMES} candidates without a TLD, e.g. ["brinebox", "dillivered"]) and each is checked live across suitable TLDs, returning what is available with typical prices. Choose 'tlds' yourself (see list-tlds) or let searchMode pick. Call it without 'names' first to get a brief: TLDs matching the business and domain hacks to build on.`,
        inputSchema: {
          type: "object",
          properties: {
            businessDescription: {
              type: "string",
              description: "What the business or project is"
            },
            names: {
              type: "array",
              items: { type: "string" },
              maxItems: MAX_NAMES,
              description: "Candidate names you brainstormed, without TLD (e.g. 'brinebox'). A full domain ('brine.box') is checked as given"
            },
            tlds: {
              type: "array",
              items: { type: "string" },
              maxItems: MAX_TLDS_PER_SEARCH,
              description: "TLDs to try for every name (e.g. ['com', 'io', 'coffee']). Overrides searchMode"
            },
            searchMode: {
              type: "string",
              enum: ["standard", "competitive", "budget", "premium", "international"],
              description: "Default TLD set when 'tlds' is not given: standard (.com and popular tech TLDs), competitive (creative TLDs), budget (cheapest reputable), premium (most established), international (global and country TLDs)"
            },
            maxPrice: {
              type: "number",
              description: "Skip TLDs whose yearly renewal price is above this many USD"
            }
          },
          required: ["businessDescription"]
        }
      },
      {
        name: "check-domain",
        description: `Check whether specific full domain names are available to register. Takes one domain or up to ${MAX_CHECK_BATCH} at once and returns availability plus the typical yearly price for the TLD.`,
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
              maxItems: MAX_CHECK_BATCH
            }
          }
        }
      },
      ...(registrar ? [{
        name: "confirm-domain",
        description: `Get the real registrar price for your final picks (up to ${MAX_CONFIRM} full domains) from ${registrar.name}. Catches what the registry lookup cannot: names priced as premium, and names that are reserved rather than open. Slower than check-domain, so use it on finalists, not on every candidate.`,
        inputSchema: {
          type: "object",
          properties: {
            domains: {
              type: "array",
              items: { type: "string" },
              maxItems: MAX_CONFIRM,
              description: "Full domain names to price (e.g. ['brinebox.com', 'roast.ing'])"
            }
          },
          required: ["domains"]
        }
      }] : []),
      {
        name: "list-tlds",
        description: `List the ${PURCHASABLE_COUNT} top-level domains open to public registration, with typical prices, so you can choose TLDs that fit a business, audience and budget. Unfiltered, it returns them all grouped by yearly cost. Filter with query ("shop"), type, or maxPrice to see exact first-year and renewal prices.`,
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Only TLDs containing this text (e.g. 'tech', 'shop')"
            },
            type: {
              type: "string",
              enum: ["generic", "country", "all"],
              description: "generic (.app, .coffee), country (two-letter, e.g. .io, .co), or all (default)"
            },
            maxPrice: {
              type: "number",
              description: "Only TLDs whose yearly renewal price is at most this many USD, cheapest first"
            },
            scope: {
              type: "string",
              enum: ["purchasable", "all"],
              description: "purchasable (default): open to public registration. all: every TLD in the root zone, including closed brand TLDs"
            },
            limit: {
              type: "number",
              description: "Maximum TLDs to return (default: all matches)"
            }
          }
        }
      },
      {
        name: "deep-tld",
        description: `Find domain hacks across all ${PURCHASABLE_COUNT} registrable TLDs: words that split at the dot (delicio.us, roast.ing) and word/TLD phrases (roasting.coffee). Pass 'keywords': a generous list (20-60) of words related to the business - synonyms, product terms, verbs, brand ideas, including plurals and -ing/-er forms. Every word is matched against every TLD, then availability is checked.`,
        inputSchema: {
          type: "object",
          properties: {
            keywords: {
              type: "array",
              items: { type: "string" },
              maxItems: 80,
              description: "Words to match against every TLD. More words find more hacks"
            },
            businessDescription: {
              type: "string",
              description: "Used to extract keywords only when 'keywords' is not given"
            },
            checkAvailability: {
              type: "boolean",
              description: "Check availability of the hacks found (default: true)"
            },
            tldScope: {
              type: "string",
              enum: ["purchasable", "all"],
              description: "purchasable (default): TLDs open to public registration. all: every TLD in the root zone, including closed brand TLDs"
            }
          }
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
        const keywords = domainService.extractKeywords(validated.businessDescription);
        const matching = domainService.matchingTlds(keywords)
          .filter(t => validated.maxPrice === undefined || (t.renew ?? t.reg ?? Infinity) <= validated.maxPrice);

        const requested = (validated.tlds ?? []).slice(0, MAX_TLDS_PER_SEARCH).map(t => t.toLowerCase().replace(/^\./, '')).filter(Boolean);
        const unknownTlds = requested.filter(t => !isKnownTld(t.split('.').pop()!));
        // Without an explicit choice: the mode's defaults, led by TLDs that match the business
        let tlds = requested.length > 0
          ? [...new Set(requested.filter(t => !unknownTlds.includes(t)))]
          : [...new Set([...matching.slice(0, 3).map(t => t.tld), ...domainService.defaultTlds(validated.searchMode, validated.maxPrice)])];

        // No names yet: hand back what the server knows, and let the assistant brainstorm
        if (!validated.names || validated.names.length === 0) {
          const hacks = domainService.findDomainHacks(keywords).slice(0, 12);
          let output = "NAMING BRIEF\n";
          output += "=".repeat(25) + "\n\n";
          output += "No names were passed, so nothing has been checked yet. Brainstorm 15-30 candidate names yourself, then call suggest-domains again with them in 'names'.\n\n";
          output += "Good names are short (ideally under 12 characters), easy to say and to spell after hearing once, free of hyphens and digits, and not close to an existing brand. Mix styles: descriptive compounds, blended or invented words, metaphors, wordplay.\n\n";
          output += section('TLDS THAT MATCH THE DESCRIPTION', matching.map(tldLine));
          output += section(`DEFAULT TLDS FOR ${(validated.searchMode ?? 'standard').toUpperCase()} MODE (used unless you pass 'tlds')`, tlds.map(t => tldLine({ tld: t })));
          output += section('DOMAIN HACKS FROM THE DESCRIPTION (unchecked)', hacks.map(h => `${h.domain} - reads "${h.reads}"`));
          output += "For TLDs that fit in less literal ways, read list-tlds and choose. For more hacks, call deep-tld with a longer list of related words.\n";
          return textResult(output);
        }

        if (tlds.length === 0) {
          throw new Error(unknownTlds.length > 0
            ? `None of the requested TLDs exist: ${unknownTlds.map(t => `.${t}`).join(' ')}. See list-tlds`
            : "No TLDs left to try - raise maxPrice or pass 'tlds'");
        }

        // Too many combinations: keep every name and drop the TLDs listed last
        const names = validated.names.slice(0, MAX_NAMES);
        const droppedNames = validated.names.length - names.length;
        const tldBudget = Math.max(1, Math.floor(MAX_MATRIX / names.length));
        const droppedTlds = tlds.slice(tldBudget);
        tlds = tlds.slice(0, tldBudget);

        const groups: { name: string; domains: string[] }[] = [];
        const skipped: string[] = [];
        for (const raw of names) {
          const trimmed = raw.trim().toLowerCase();
          if (trimmed.includes('.')) {
            groups.push({ name: trimmed, domains: [trimmed] });
            continue;
          }
          const label = domainService.toLabel(trimmed);
          if (!label) skipped.push(raw);
          else if (!groups.some(g => g.name === label)) groups.push({ name: label, domains: tlds.map(t => `${label}.${t}`) });
        }

        const results = await domainService.checkDomains(groups.flatMap(g => g.domains));
        const byDomain = new Map(results.map(r => [r.domain, r]));
        const checkedGroups = groups.map(g => ({
          name: g.name,
          results: g.domains.map(d => byDomain.get(d)).filter((r): r is DomainResult => !!r)
        }));
        const open = results.filter(isOpen).length;

        let output = "DOMAIN SEARCH\n";
        output += "=".repeat(25) + "\n";
        output += "✓ available   ~ likely available (TLD has no registry lookup; not in DNS - confirm at a registrar)   ★ premium   ✗ taken\n\n";
        output += formatByName(checkedGroups);
        output += `${open} of ${results.length} checked are open, across ${tlds.map(t => `.${t}`).join(' ')}.\n`;
        if (unknownTlds.length > 0) output += `Ignored TLDs that do not exist: ${unknownTlds.map(t => `.${t}`).join(' ')}\n`;
        if (skipped.length > 0) output += `Skipped unusable names: ${skipped.join(', ')}\n`;
        if (droppedTlds.length > 0) output += `Not checked, to stay within ${MAX_MATRIX} lookups per call: ${droppedTlds.map(t => `.${t}`).join(' ')}. Call again with fewer names to try them.\n`;
        if (droppedNames > 0) output += `Only the first ${MAX_NAMES} names were checked; ${droppedNames} were left out.\n`;
        output += `${PRICE_NOTE}\n`;
        if (open === 0) output += "Nothing open: try more inventive names, or other TLDs from list-tlds.\n";

        return textResult(output);
      } catch (error) {
        return errorResult("Error generating domain suggestions", error);
      }
    }

    case "check-domain": {
      try {
        const validated = CheckDomainSchema.parse(args);
        const domains = validated.domain ? [validated.domain] : validated.domains!;
        const results = await domainService.checkDomains(domains);

        let output = formatChecked(results);
        if (results.length > 1) {
          const count = (predicate: (r: DomainResult) => boolean) => results.filter(predicate).length;
          const unchecked = count(r => r.status === 'unknown' || r.status === 'invalid');
          output += `\nSUMMARY: ${count(isOpen)} available, ${count(r => r.isPremium)} premium, ${count(r => r.status === 'taken' && !r.isPremium)} taken`;
          if (count(isRestricted) > 0) output += `, ${count(isRestricted)} on restricted TLDs`;
          if (unchecked > 0) output += `, ${unchecked} not checked`;
        }

        return textResult(output.trim());
      } catch (error) {
        return errorResult("Error checking domain(s)", error);
      }
    }

    case "confirm-domain": {
      try {
        if (!registrar) {
          throw new Error("confirm-domain needs registrar API keys: set PORKBUN_API_KEY and PORKBUN_SECRET_API_KEY (free at porkbun.com/account/api)");
        }
        const validated = ConfirmDomainSchema.parse(args);
        const domains = validated.domains.slice(0, MAX_CONFIRM);
        const quotes = await registrar.quote(domains);
        const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        let output = `REGISTRAR PRICES (${registrar.name}, live)\n\n`;
        for (const quote of quotes) {
          if (quote.error) {
            output += `? ${quote.domain} - could not check: ${quote.error}\n`;
          } else if (!quote.available) {
            output += `✗ ${quote.domain} - not available to register\n`;
          } else {
            const parts = [quote.price !== undefined ? `${usd(quote.price)} first year` : 'price not returned'];
            if (quote.regularPrice !== undefined) parts[0] += ` (promo; normally ${usd(quote.regularPrice)})`;
            if (quote.renewalPrice !== undefined) parts.push(`renews at ${usd(quote.renewalPrice)}/yr`);
            output += `${quote.premium ? '★' : '✓'} ${quote.domain} - ${quote.premium ? 'PREMIUM, ' : ''}${parts.join(', ')}\n`;
          }
        }
        if (validated.domains.length > domains.length) {
          output += `\nOnly the first ${MAX_CONFIRM} were priced; call again for the rest.\n`;
        }
        output += `\nThese are ${registrar.name}'s prices right now. Other registrars differ, though premium names are premium everywhere.\n`;
        return textResult(output);
      } catch (error) {
        return errorResult("Error confirming domain(s)", error);
      }
    }

    case "list-tlds": {
      try {
        const validated = ListTldsSchema.parse(args ?? {});
        const scope = validated.scope ?? 'purchasable';
        const type = validated.type ?? 'all';
        const query = validated.query?.toLowerCase().replace(/^\./, '');

        let tlds = listTlds(scope)
          .filter(t => type === 'all' || tldType(t.tld) === type)
          .filter(t => !query || t.tld.includes(query));
        if (validated.maxPrice !== undefined) {
          const maxPrice = validated.maxPrice;
          tlds = tlds
            .filter(t => t.reg !== undefined && (t.renew ?? t.reg) <= maxPrice)
            .sort((a, b) => (a.renew ?? a.reg!) - (b.renew ?? b.reg!));
        }
        const total = tlds.length;
        if (validated.limit) tlds = tlds.slice(0, validated.limit);

        let output = `${total} TLD${total === 1 ? '' : 's'}`;
        if (tlds.length < total) output += ` (showing ${tlds.length})`;
        output += scope === 'all'
          ? ' in the root zone. Those without a price are mostly closed brand or restricted TLDs.\n'
          : ' open to public registration.\n';
        output += `Typical retail list prices in USD, as of ${tldDataDate}.\n\n`;
        output += formatTldList(tlds);

        return textResult(output);
      } catch (error) {
        return errorResult("Error listing TLDs", error);
      }
    }

    case "deep-tld": {
      try {
        const validated = DeepTldSchema.parse(args);
        const words = validated.keywords && validated.keywords.length > 0
          ? validated.keywords.slice(0, 80)
          : domainService.extractKeywords(validated.businessDescription!);
        const scope = validated.tldScope ?? 'purchasable';
        const hacks = domainService.findDomainHacks(words, scope);

        let output = "DEEP TLD EXPLORATION\n";
        output += "=".repeat(25) + "\n\n";
        output += `Matched ${words.length} words against ${listTlds(scope).length} TLDs: ${hacks.length} combinations.\n\n`;

        if (hacks.length === 0) {
          output += "No word ends in a TLD or is one. Try more words: synonyms, plurals, -ing/-er/-ly forms, related verbs and product terms.\n";
          return textResult(output);
        }

        const shown = hacks.slice(0, MAX_HACK_CHECKS);
        const describe = (domain: string) => {
          const hack = shown.find(h => h.domain === domain)!;
          return hack.kind === 'slice' ? `spells "${hack.reads}"` : `reads "${hack.reads}"`;
        };

        if (validated.checkAvailability ?? true) {
          const results = await domainService.checkDomains(shown.map(h => h.domain));
          const price = (r: DomainResult) => r.price ? ` - ${r.price}` : '';
          const row = (mark: string) => (r: DomainResult) => `${mark} ${r.domain} (${describe(r.domain)})${price(r)}`;
          output += section('AVAILABLE', results.filter(r => isOpen(r) && r.source !== 'dns').map(row('✓')));
          output += section(
            'LIKELY AVAILABLE (no registry lookup for this TLD - not in DNS, confirm at a registrar)',
            results.filter(r => isOpen(r) && r.source === 'dns').map(row('~'))
          );
          output += section('PREMIUM', results.filter(r => r.isPremium).map(r => `★ ${r.domain}${premiumLabel(r)}`));
          output += section('UNREGISTERED, BUT THE TLD IS NOT ON GENERAL SALE', results.filter(isRestricted).map(r => `~ ${r.domain}`));
          const taken = results.filter(r => r.status === 'taken' && !r.isPremium).map(r => r.domain);
          if (taken.length > 0) output += `TAKEN\n${taken.join(' ')}\n\n`;
          const failed = results.filter(r => r.status === 'unknown' && !r.isPremium).map(r => r.domain);
          if (failed.length > 0) output += `COULD NOT CHECK (try check-domain)\n${failed.join(' ')}\n\n`;
          output += "Short dictionary-word hacks are often priced as premium by the registry even when unregistered - confirm the price at a registrar.\n";
          output += `${PRICE_NOTE}\n`;
        } else {
          output += section('COMBINATIONS (availability not checked)', shown.map(h => `${h.domain} (${describe(h.domain)})`));
        }
        if (hacks.length > shown.length) {
          output += `Showing the first ${shown.length} of ${hacks.length}; pass fewer keywords to see the rest.\n`;
        }
        const tldWords = [...new Set(hacks.filter(h => h.kind === 'pair').map(h => `.${h.domain.split('.')[1]}`))];
        if (tldWords.length > 0) {
          output += `These keywords are TLDs themselves: ${tldWords.join(' ')}. Only the first few keywords were paired with each; to try your own names on them, pass them as 'tlds' to suggest-domains.\n`;
        }

        return textResult(output);
      } catch (error) {
        return errorResult("Error in deep TLD exploration", error);
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

// Start server (stdio is the only transport; --stdio is accepted for backwards compatibility)
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(`[domain-finder] failed to start: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
