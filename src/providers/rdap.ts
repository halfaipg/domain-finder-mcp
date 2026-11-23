import { Resolver } from 'dns/promises';
import { domainToASCII } from 'url';
import { getTldInfo, isKnownTld } from '../tld-data.js';
import { AvailabilityProvider, CheckResult, normalizeDomain } from './types.js';

// Keyless availability checking straight from the registries.
//
// RDAP is the ICANN-mandated successor to WHOIS: every gTLD registry runs a server,
// and a 404 for a domain means it is not registered. Registries that have no RDAP
// server (.io, .co, .de, .me ...) are answered from DNS instead: a delegated name is
// taken, a name the TLD says does not exist is very likely free.

const USER_AGENT = 'domain-finder-mcp';
const RDAP_TIMEOUT_MS = 8000;
const DNS_TIMEOUT_MS = 4000;
const CONCURRENCY = 8;
const RETRY_DELAYS_MS = [1200, 3000];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type RdapAnswer = 'available' | 'taken' | 'failed';

export class RdapProvider implements AvailabilityProvider {
  readonly name = 'rdap';
  // Public resolvers first: some ISP resolvers rewrite NXDOMAIN, which would make every name look taken
  private resolvers = [['1.1.1.1'], ['8.8.8.8'], null].map(servers => {
    const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
    if (servers) resolver.setServers(servers);
    return resolver;
  });

  async check(domains: string[]): Promise<CheckResult[]> {
    const results: CheckResult[] = new Array(domains.length);
    let next = 0;
    const worker = async () => {
      while (next < domains.length) {
        const index = next++;
        results[index] = await this.checkOne(domains[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, domains.length) }, worker));
    return results;
  }

  private async checkOne(input: string): Promise<CheckResult> {
    const domain = normalizeDomain(input);
    const base = { domain, isPremium: false };
    const ascii = domainToASCII(domain);
    const labels = ascii.split('.');
    const validLabel = (label: string) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label);

    if (!ascii || labels.length < 2 || !labels.every(validLabel)) {
      return { ...base, status: 'invalid', source: 'none', note: 'not a valid domain name' };
    }
    const tld = labels[labels.length - 1];
    if (!isKnownTld(tld)) {
      return { ...base, status: 'invalid', source: 'none', note: `.${tld} is not a real TLD` };
    }

    try {
      const rdapBase = getTldInfo(tld)?.rdap;
      if (rdapBase) {
        const answer = await this.queryRdap(rdapBase, ascii);
        if (answer !== 'failed') return { ...base, status: answer, source: 'rdap' };
      }

      const viaDns = await this.queryDns(ascii);
      if (viaDns === 'taken') return { ...base, status: 'taken', source: 'dns' };
      if (viaDns === 'available') {
        const note = rdapBase
          ? 'registry lookup failed; DNS shows no such domain - confirm at a registrar'
          : `.${tld} has no public registry lookup; DNS shows no such domain - confirm at a registrar`;
        return { ...base, status: 'available', source: 'dns', note };
      }
      return { ...base, status: 'unknown', source: 'none', note: 'lookup failed - try again' };
    } catch (error) {
      return { ...base, status: 'unknown', source: 'none', note: error instanceof Error ? error.message : 'lookup failed' };
    }
  }

  private async queryRdap(rdapBase: string, domain: string): Promise<RdapAnswer> {
    const url = `${rdapBase}domain/${encodeURIComponent(domain)}`;
    for (let attempt = 0; ; attempt++) {
      let retryable = true;
      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/rdap+json', 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(RDAP_TIMEOUT_MS)
        });
        // Free the socket; only the status code matters
        await res.body?.cancel().catch(() => undefined);
        if (res.status === 200) return 'taken';
        if (res.status === 404) return 'available';
        // Rate limiting and server errors are worth another go; anything else will not change
        retryable = res.status === 429 || res.status >= 500;
      } catch {
        // network error or timeout
      }
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) return 'failed';
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  private async queryDns(domain: string): Promise<RdapAnswer> {
    let servfails = 0;
    for (const resolver of this.resolvers) {
      try {
        await resolver.resolveNs(domain);
        return 'taken';
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOTFOUND') return 'available'; // NXDOMAIN
        if (code === 'ENODATA') return 'taken'; // the name exists, it just has no NS records
        // A name the TLD has never heard of gets NXDOMAIN. SERVFAIL from independent resolvers
        // means the TLD delegates it to nameservers that do not answer: registered, but broken.
        if (code === 'ESERVFAIL' && ++servfails >= 2) return 'taken';
        // timeout / refused: try the next resolver
      }
    }
    return 'failed';
  }
}
