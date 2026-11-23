export type Availability =
  | 'available' // the registry (or registrar) says it is unregistered
  | 'taken'
  | 'unknown' // the lookup failed; says nothing either way
  | 'invalid'; // not a registrable name (e.g. the TLD does not exist)

export interface CheckResult {
  domain: string;
  status: Availability;
  /** Where the answer came from. 'dns' answers are a strong hint, not a registry confirmation. */
  source: 'rdap' | 'dns' | 'namecheap' | 'domainr' | 'none';
  isPremium: boolean;
  premiumPrice?: number;
  note?: string;
}

export interface AvailabilityProvider {
  readonly name: string;
  /** Checks every domain; never rejects - failures come back as status 'unknown'. */
  check(domains: string[]): Promise<CheckResult[]>;
}

/** Lower-cases and strips anything that is not the hostname ("https://Foo.com/x" -> "foo.com"). */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '');
}
