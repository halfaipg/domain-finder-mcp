import { config } from 'dotenv';
import { DomainrProvider } from '../providers/domainr.js';
import { NamecheapProvider } from '../providers/namecheap.js';
import { RdapProvider } from '../providers/rdap.js';
import { Availability, AvailabilityProvider, CheckResult, normalizeDomain } from '../providers/types.js';
import { TldInfo, TldScope, formatPrice, getTldInfo, isPurchasable, listTlds } from '../tld-data.js';

config();

// The assistant calling this server does the creative work (names, taste, TLD choice).
// This service does what an LLM cannot: live availability, prices, and exhaustive
// matching of words against every registrable TLD.

export interface DomainResult {
  domain: string;
  tld: string;
  available: boolean;
  status: Availability;
  source: CheckResult['source'];
  note?: string;
  /** The TLD is not on general sale (closed brand TLD, or a registry with eligibility rules) */
  restrictedTld: boolean;
  /** Typical retail price for the TLD, when known */
  price?: string;
  isPremium: boolean;
  premiumPrice?: number;
}

export type SearchMode = 'standard' | 'competitive' | 'premium' | 'budget' | 'international';

export interface DomainHack {
  domain: string;
  /** 'slice': the word itself split at the dot (delicio.us). 'pair': two of the words (roasting.coffee). */
  kind: 'slice' | 'pair';
  reads: string;
}

// 'rdap' asks the registries directly and needs no account or API key
const DOMAIN_PROVIDER = (process.env.DOMAIN_PROVIDER || 'rdap').toLowerCase();

function createProvider(): AvailabilityProvider {
  try {
    if (DOMAIN_PROVIDER === 'namecheap') return new NamecheapProvider();
    if (DOMAIN_PROVIDER === 'domainr') return new DomainrProvider();
  } catch (error) {
    // A half-configured paid provider should not stop the server from starting
    console.error(`[domain-finder] ${DOMAIN_PROVIDER} provider unavailable (${error instanceof Error ? error.message : error}); using keyless RDAP lookups instead`);
  }
  return new RdapProvider();
}

// Starting points per mode, used when the assistant does not pick TLDs itself
const MODE_TLDS: Record<Exclude<SearchMode, 'budget'>, string[]> = {
  standard: ['com', 'io', 'co', 'ai', 'app', 'dev', 'net', 'org', 'xyz', 'me'],
  competitive: ['com', 'xyz', 'studio', 'works', 'club', 'space', 'world', 'life', 'today', 'fun', 'lol', 'ninja'],
  premium: ['com', 'io', 'ai', 'co', 'net', 'org'],
  international: ['com', 'net', 'org', 'global', 'world', 'eu', 'uk', 'de', 'us', 'ca', 'in', 'asia']
};

// Reputable TLDs to draw the cheapest from in budget mode (the very cheapest overall are spam magnets)
const BUDGET_CANDIDATES = ['com', 'net', 'org', 'xyz', 'dev', 'app', 'page', 'me', 'cc', 'de', 'uk', 'us', 'eu', 'in', 'ca', 'nl', 'site', 'online', 'store', 'shop', 'info', 'biz', 'pro', 'one', 'link', 'click', 'fun', 'lol', 'blog', 'live'];
const BUDGET_MAX_RENEWAL = 16;

const STOP_WORDS = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'had', 'have', 'what', 'were', 'with', 'that', 'this', 'from', 'your', 'their', 'they', 'will', 'into', 'who', 'its', 'new', 'about', 'which', 'business', 'company', 'service', 'services', 'based', 'small', 'online']);

const MAX_PAIRS_PER_TLD = 6;

const yearlyCost =(tld: TldInfo) => tld.renew ?? tld.reg;

export class DomainService {
  private provider = createProvider();

  get providerName(): string {
    return this.provider.name;
  }

  /** Checks availability and attaches the typical price. Order follows the input, duplicates removed. */
  async checkDomains(domains: string[]): Promise<DomainResult[]> {
    const unique = [...new Set(domains.map(normalizeDomain).filter(Boolean))];
    const checks = await this.provider.check(unique);

    return checks.map(check => {
      const tld = check.domain.split('.').pop() || '';
      return {
        domain: check.domain,
        tld,
        available: check.status === 'available',
        status: check.status,
        source: check.source,
        note: check.note,
        restrictedTld: !isPurchasable(tld),
        price: formatPrice(check.domain),
        isPremium: check.isPremium,
        premiumPrice: check.premiumPrice
      };
    });
  }

  /** Meaningful lower-case words from free text */
  extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word));
    return [...new Set(words)];
  }

  /** Turns "Brine Box!" into the label "brinebox"; undefined if nothing usable is left */
  toLabel(name: string): string | undefined {
    const label = name.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
    return label.length >= 1 && label.length <= 63 ? label : undefined;
  }

  /** Default TLDs (no dot) for a mode, optionally capped by yearly renewal price */
  defaultTlds(mode: SearchMode = 'standard', maxPrice?: number): string[] {
    let tlds: string[];
    if (mode === 'budget') {
      tlds = BUDGET_CANDIDATES
        .map(tld => getTldInfo(tld))
        .filter((tld): tld is TldInfo => tld !== undefined && yearlyCost(tld) !== undefined && yearlyCost(tld)! <= BUDGET_MAX_RENEWAL)
        .sort((a, b) => yearlyCost(a)! - yearlyCost(b)!)
        .slice(0, 10)
        .map(tld => tld.tld);
      if (!tlds.includes('com')) tlds.unshift('com');
    } else {
      tlds = MODE_TLDS[mode].filter(tld => isPurchasable(tld));
    }
    if (maxPrice !== undefined) {
      tlds = tlds.filter(tld => {
        const cost = getTldInfo(tld) && yearlyCost(getTldInfo(tld)!);
        return cost !== undefined && cost <= maxPrice;
      });
    }
    return tlds;
  }

  /**
   * TLDs that literally match the words: the word itself (.coffee), or a TLD the word starts
   * with or extends (photography -> .photo, .photos). Subtler fits are left to the assistant,
   * which can read the whole list from list-tlds.
   */
  matchingTlds(words: string[]): TldInfo[] {
    const stems = [...new Set(words.map(word => word.toLowerCase()))].filter(word => word.length >= 3);
    return listTlds('purchasable').filter(({ tld }) =>
      stems.some(word =>
        word === tld ||
        (tld.length >= 4 && word.startsWith(tld)) ||
        (word.length >= 4 && tld.startsWith(word))
      )
    );
  }

  /**
   * Every way the words combine with a real TLD to read as a word or phrase.
   * Plain string matching over the whole TLD list, so nothing is missed.
   */
  findDomainHacks(words: string[], scope: TldScope = 'purchasable'): DomainHack[] {
    const unique = [...new Set(words.map(word => this.toLabel(word)).filter((word): word is string => !!word))];
    const tlds = listTlds(scope).map(tld => tld.tld);
    const slices: DomainHack[] = [];
    const pairs: DomainHack[] = [];

    for (const word of unique) {
      for (const tld of tlds) {
        if (word === tld) {
          // Earlier words matter most to the caller; a few per TLD keeps the phrases from swamping the hacks
          const partners = unique.filter(other => other !== word && other.length >= 3).slice(0, MAX_PAIRS_PER_TLD);
          for (const other of partners) {
            pairs.push({ domain: `${other}.${tld}`, kind: 'pair', reads: `${other} ${tld}` });
          }
        } else if (word.endsWith(tld) && word.length - tld.length >= 2) {
          const stem = word.slice(0, -tld.length);
          if (!stem.endsWith('-')) {
            slices.push({ domain: `${stem}.${tld}`, kind: 'slice', reads: word });
          }
        }
      }
    }

    // Longer TLDs make cleaner breaks (roast.ing before roasti.ng)
    slices.sort((a, b) => b.domain.split('.')[1].length - a.domain.split('.')[1].length);
    const seen = new Set<string>();
    return [...slices, ...pairs].filter(hack => !seen.has(hack.domain) && seen.add(hack.domain));
  }
}
