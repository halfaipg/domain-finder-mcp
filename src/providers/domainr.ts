import axios from 'axios';
import { config } from 'dotenv';

config();

interface DomainrSearchResult {
  domain: string;
  host: string;
  subdomain: string;
  zone: string;
  path: string;
  registerURL: string;
}

interface DomainrStatusResult {
  domain: string;
  zone: string;
  status: string;
  summary: string;
}

interface SearchOptions {
  keywords?: string[];
  defaults?: string[];
  registrar?: string;
  location?: string;
}

export class DomainrProvider {
  private rapidApiKey: string;
  private rapidApiHost: string;
  private baseUrl = 'https://domainr.p.rapidapi.com/v2';

  constructor(apiKey?: string, apiHost?: string) {
    this.rapidApiKey = apiKey || process.env.DOMAINR_RAPIDAPI_KEY || '';
    this.rapidApiHost = apiHost || process.env.DOMAINR_RAPIDAPI_HOST || 'domainr.p.rapidapi.com';

    if (!this.rapidApiKey) {
      throw new Error('DOMAINR_RAPIDAPI_KEY environment variable is required');
    }
  }

  private async makeRequest<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    try {
      const response = await axios.get(`${this.baseUrl}/${endpoint}`, {
        params,
        headers: {
          'x-rapidapi-host': this.rapidApiHost,
          'x-rapidapi-key': this.rapidApiKey
        }
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Domainr API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  async searchDomains(query: string, options: SearchOptions = {}): Promise<DomainrSearchResult[]> {
    const params: Record<string, string> = {
      query: query
    };

    if (options.keywords?.length) {
      params.keywords = options.keywords.join(',');
    }

    if (options.defaults?.length) {
      params.defaults = options.defaults.join(',');
    }

    if (options.registrar) {
      params.registrar = options.registrar;
    }

    if (options.location) {
      params.location = options.location;
    }

    const response = await this.makeRequest<{ results: DomainrSearchResult[] }>('search', params);
    return response.results;
  }

  async checkDomainStatus(domains: string | string[]): Promise<DomainrStatusResult[]> {
    const domainList = Array.isArray(domains) ? domains.join(',') : domains;
    const response = await this.makeRequest<{ status: DomainrStatusResult[] }>('status', {
      domain: domainList
    });
    return response.status;
  }

  async searchAndCheck(query: string, options: SearchOptions = {}): Promise<{
    domain: string;
    available: boolean;
    zone: string;
    registerURL?: string;
  }[]> {
    // Get domain suggestions
    const suggestions = await this.searchDomains(query, options);

    // Check availability in batches of 10
    const results = [];
    for (let i = 0; i < suggestions.length; i += 10) {
      const batch = suggestions.slice(i, i + 10);
      const domains = batch.map(s => s.domain);
      const statuses = await this.checkDomainStatus(domains);

      for (let j = 0; j < batch.length; j++) {
        const suggestion = batch[j];
        const status = statuses.find(s => s.domain === suggestion.domain);
        if (status) {
          results.push({
            domain: suggestion.domain,
            available: status.summary === 'inactive',
            zone: status.zone,
            registerURL: suggestion.registerURL
          });
        }
      }

      // Rate limit compliance
      if (i + 10 < suggestions.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  // Helper method to get relevant keywords based on query
  getRelevantKeywords(query: string): string[] {
    const keywords = new Set<string>();
    
    // Add industry/category keywords
    if (query.includes('ai') || query.includes('artificial')) {
      keywords.add('technology');
      keywords.add('artificial-intelligence');
      keywords.add('computing');
    }
    
    if (query.includes('brand') || query.includes('logo')) {
      keywords.add('branding');
      keywords.add('marketing');
      keywords.add('design');
    }

    if (query.includes('tech') || query.includes('software')) {
      keywords.add('technology');
      keywords.add('software');
      keywords.add('computing');
    }

    // Add more keyword mappings as needed
    
    return Array.from(keywords);
  }

  // Helper method to get preferred TLDs based on query
  getPreferredTlds(query: string): string[] {
    const tlds = new Set<string>();
    
    // Add modern tech TLDs
    if (query.includes('ai') || query.includes('artificial')) {
      tlds.add('ai');
      tlds.add('app');
      tlds.add('tech');
    }
    
    if (query.includes('brand') || query.includes('marketing')) {
      tlds.add('co');
      tlds.add('io');
      tlds.add('com');
    }

    // Always include these popular TLDs
    tlds.add('com');
    tlds.add('io');
    
    return Array.from(tlds);
  }
} 