#!/usr/bin/env node
// Refreshes the bundled TLD data from authoritative public sources (no API keys):
//
//   tlds.txt        <- IANA root zone list (every TLD that exists)
//   data/tlds.json  <- the same list, annotated per TLD with
//                        rdap:  registry RDAP base URL (IANA RDAP bootstrap)
//                        reg/renew: retail list price in USD (Porkbun public pricing)
//
// A TLD with a price is one the public can actually buy, which is how the server
// tells real options (.coffee) apart from closed brand TLDs (.abbott).
//
// Usage: npm run update-tlds

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = {
  iana: 'https://data.iana.org/TLD/tlds-alpha-by-domain.txt',
  rdap: 'https://data.iana.org/rdap/dns.json',
  pricing: 'https://api.porkbun.com/api/json/v3/pricing/get',
};

async function get(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res;
}

const ianaText = await (await get(SOURCES.iana)).text();
const ianaVersion = ianaText.match(/^#\s*(.+)$/m)?.[1] ?? 'unknown';
const tlds = ianaText
  .split('\n')
  .map((l) => l.trim().toLowerCase())
  .filter((l) => l && !l.startsWith('#'));
if (tlds.length < 1000) throw new Error(`IANA list looks truncated (${tlds.length} TLDs)`);

const bootstrap = await (await get(SOURCES.rdap)).json();
const rdap = new Map();
for (const [names, urls] of bootstrap.services) {
  // Prefer https when a registry publishes both
  const url = urls.find((u) => u.startsWith('https://')) ?? urls[0];
  if (!url) continue;
  for (const name of names) rdap.set(name.toLowerCase(), url.endsWith('/') ? url : `${url}/`);
}

// Pricing is optional: keep going without it rather than failing the refresh
let pricing = {};
let pricingOk = false;
try {
  const body = await (await get(SOURCES.pricing, { method: 'POST' })).json();
  if (body.status !== 'SUCCESS') throw new Error(`status ${body.status}`);
  pricing = body.pricing;
  pricingOk = true;
} catch (err) {
  console.warn(`! Pricing unavailable (${err.message}); writing TLD data without prices`);
}

const priceOf = (key) => {
  // Prices arrive as strings with thousands separators ("2,884.10")
  const usd = (value) => Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  const reg = usd(pricing[key]?.registration);
  const renew = usd(pricing[key]?.renewal);
  if (!Number.isFinite(reg) || reg <= 0) return null;
  return Number.isFinite(renew) ? { reg, renew } : { reg };
};

const out = {};
let priced = 0;
let withRdap = 0;
for (const tld of tlds) {
  const entry = {};
  if (rdap.has(tld)) {
    entry.rdap = rdap.get(tld);
    withRdap++;
  }
  // Porkbun also lists non-ICANN (Handshake) names; only IANA TLDs are looked up here
  const price = priceOf(tld);
  if (price) {
    Object.assign(entry, price);
    priced++;
  }
  out[tld] = entry;
}

// Second-level suffixes (co.uk, com.au) are priced separately from their TLD
const suffixes = {};
for (const key of Object.keys(pricing).sort()) {
  const price = key.includes('.') && key.split('.').pop() in out ? priceOf(key) : null;
  if (price) suffixes[key] = price;
}

const header = [
  `# ${ianaVersion}`,
  `# Source: ${SOURCES.iana} - regenerate with: npm run update-tlds`,
];
// tlds.txt is the human-readable list and leaves out internationalised (punycode) TLDs;
// data/tlds.json keeps them so names on those TLDs can still be checked
const readable = tlds.filter((t) => !t.startsWith('xn--'));
writeFileSync(join(ROOT, 'tlds.txt'), `${header.join('\n')}\n${readable.map((t) => t.toUpperCase()).join('\n')}\n`);

mkdirSync(join(ROOT, 'data'), { recursive: true });
const data = {
  generated: new Date().toISOString(),
  ianaVersion,
  rdapPublication: bootstrap.publication,
  pricingSource: pricingOk ? 'Porkbun public list prices (USD, first year / renewal)' : null,
  sources: SOURCES,
  suffixes,
  tlds: out,
};
// One TLD per line keeps diffs readable
const body = Object.entries(out)
  .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
  .join(',\n');
const { tlds: _omit, ...meta } = data;
const metaJson = JSON.stringify(meta, null, 2).replace(/\n}$/, '');
writeFileSync(join(ROOT, 'data', 'tlds.json'), `${metaJson},\n  "tlds": {\n${body}\n  }\n}\n`);

console.log(`TLDs: ${tlds.length} (${ianaVersion})`);
console.log(`  with RDAP:   ${withRdap}`);
console.log(`  with prices: ${priced}`);
