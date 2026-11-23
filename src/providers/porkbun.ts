import { normalizeDomain } from './types.js';

// Optional second pass on finalists: asks a registrar what a specific name really costs.
// The keyless registry lookup cannot see premium pricing or registry-reserved names;
// Porkbun's check does, and a free account is enough to get an API key.

const ENDPOINT = 'https://api.porkbun.com/api/json/v3/domain/checkDomain';
const TIMEOUT_MS = 20000;
const DEFAULT_RATE_WAIT_S = 10;
const MAX_RATE_WAIT_S = 15;

export interface RegistrarQuote {
  domain: string;
  /** undefined when the registrar could not answer */
  available?: boolean;
  premium: boolean;
  /** What the first year costs today, USD */
  price?: number;
  /** The non-promotional first-year price, when the first year is discounted */
  regularPrice?: number;
  renewalPrice?: number;
  error?: string;
}

const toNumber = (value: unknown): number | undefined => {
  const n = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const isYes = (value: unknown) => value === true || String(value).toLowerCase() === 'yes';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class PorkbunQuotes {
  readonly name = 'Porkbun';

  private constructor(private apiKey: string, private secretKey: string) {}

  /** Undefined unless both keys are configured */
  static fromEnv(): PorkbunQuotes | undefined {
    const apiKey = process.env.PORKBUN_API_KEY;
    const secretKey = process.env.PORKBUN_SECRET_API_KEY;
    return apiKey && secretKey ? new PorkbunQuotes(apiKey, secretKey) : undefined;
  }

  /** One at a time: the API allows only a handful of checks per ten seconds */
  async quote(domains: string[]): Promise<RegistrarQuote[]> {
    const quotes: RegistrarQuote[] = [];
    for (const domain of [...new Set(domains.map(normalizeDomain).filter(Boolean))]) {
      quotes.push(await this.quoteOne(domain));
    }
    return quotes;
  }

  private async quoteOne(domain: string, retried = false): Promise<RegistrarQuote> {
    try {
      const res = await fetch(`${ENDPOINT}/${encodeURIComponent(domain)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: this.apiKey, secretapikey: this.secretKey }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      const body: any = await res.json().catch(() => ({}));

      if (body.status !== 'SUCCESS') {
        const rateLimited = res.status === 429 || /RATE_LIMIT/i.test(String(body.code ?? '')) || /within \d+ seconds/i.test(String(body.message ?? ''));
        if (rateLimited && !retried) {
          const wait = Math.min(toNumber(body.ttlRemaining) ?? DEFAULT_RATE_WAIT_S, MAX_RATE_WAIT_S);
          await sleep((wait + 1) * 1000);
          return this.quoteOne(domain, true);
        }
        return { domain, premium: false, error: body.message || `Porkbun returned HTTP ${res.status}` };
      }

      const answer = body.response ?? {};
      const renewal = answer.additional?.renewal ?? answer.renewal;
      const price = toNumber(answer.price);
      const regularPrice = toNumber(answer.regularPrice);
      return {
        domain,
        available: isYes(answer.avail),
        premium: isYes(answer.premium),
        price,
        regularPrice: regularPrice !== undefined && regularPrice !== price ? regularPrice : undefined,
        renewalPrice: toNumber(renewal?.regularPrice) ?? toNumber(renewal?.price)
      };
    } catch (error) {
      return { domain, premium: false, error: error instanceof Error ? error.message : 'Porkbun lookup failed' };
    }
  }
}
