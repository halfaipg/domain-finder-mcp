import axios from 'axios';
import { config } from 'dotenv';
import { XMLParser } from 'fast-xml-parser';

config();

interface NamecheapDomainResult {
  domain: string;
  available: boolean;
  isPremium: boolean;
  premiumPrice?: number;
  status: string;
  summary: string;
}

interface NamecheapConfig {
  apiUser: string;
  apiKey: string;
  clientIp: string;
  baseUrl: string;
}

export class NamecheapProvider {
  private config: NamecheapConfig;
  private xmlParser: XMLParser;

  constructor() {
    this.config = {
      apiUser: process.env.NAMECHEAP_API_USER || '',
      apiKey: process.env.NAMECHEAP_API_KEY || '',
      clientIp: process.env.NAMECHEAP_CLIENT_IP || '',
      baseUrl: 'https://api.namecheap.com/xml.response'
    };

    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });

    if (!this.config.apiUser || !this.config.apiKey || !this.config.clientIp) {
      throw new Error('Namecheap API credentials not configured. Please set NAMECHEAP_API_USER, NAMECHEAP_API_KEY, and NAMECHEAP_CLIENT_IP');
    }
  }

  async checkDomainStatus(domains: string | string[]): Promise<NamecheapDomainResult[]> {
    const domainList = Array.isArray(domains) ? domains.join(',') : domains;
    
    try {
      const params = new URLSearchParams({
        ApiUser: this.config.apiUser,
        ApiKey: this.config.apiKey,
        UserName: this.config.apiUser,
        Command: 'namecheap.domains.check',
        ClientIp: this.config.clientIp,
        DomainList: domainList
      });

      const response = await axios.get(`${this.config.baseUrl}?${params.toString()}`, {
        timeout: 30000,
        headers: {
          'User-Agent': 'BrandstormAI/1.0'
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Namecheap API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  private parseResponse(xmlData: string): NamecheapDomainResult[] {
    try {
      const parsed = this.xmlParser.parse(xmlData);
      const apiResponse = parsed?.ApiResponse;

      // Check for API errors
      if (apiResponse?.['@_Status'] !== 'OK') {
        const errors = apiResponse?.Errors?.Error;
        const errorMsg = Array.isArray(errors) ? errors[0]?.['#text'] : errors?.['#text'];
        throw new Error(`Namecheap API error: ${errorMsg || 'Unknown error'}`);
      }

      const commandResponse = apiResponse?.CommandResponse;
      const domainResults = commandResponse?.DomainCheckResult;

      if (!domainResults) {
        return [];
      }

      // Handle single domain result vs array
      const results = Array.isArray(domainResults) ? domainResults : [domainResults];

      return results.map((result: any) => {
        const domain = result?.['@_Domain'] || '';
        const available = result?.['@_Available'] === 'true';
        const isPremium = result?.['@_IsPremium'] === 'true';
        const premiumPrice = result?.['@_PremiumRegistrationPrice'] 
          ? parseFloat(result['@_PremiumRegistrationPrice']) 
          : undefined;

        // Convert to Domainr-like status format for compatibility
        let status = 'unknown';
        let summary = 'unknown';
        
        if (available && isPremium) {
          status = 'premium available';
          summary = 'inactive';
        } else if (available) {
          status = 'available';
          summary = 'inactive';
        } else {
          status = 'taken';
          summary = 'active';
        }

        return {
          domain,
          available,
          isPremium,
          premiumPrice,
          status,
          summary
        };
      });
    } catch (error) {
      throw new Error(`Failed to parse Namecheap response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Batch check domains with rate limiting (Namecheap allows up to 20 domains per request)
  async checkDomainsInBatches(domains: string[], batchSize: number = 20): Promise<NamecheapDomainResult[]> {
    const results: NamecheapDomainResult[] = [];
    
    for (let i = 0; i < domains.length; i += batchSize) {
      const batch = domains.slice(i, i + batchSize);
      
      try {
        const batchResults = await this.checkDomainStatus(batch);
        results.push(...batchResults);
        
        if (i + batchSize < domains.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        batch.forEach(domain => {
          results.push({
            domain,
            available: false,
            isPremium: false,
            status: 'error',
            summary: 'error'
          });
        });
      }
    }
    
    return results;
  }

  // Test API connectivity
  async testConnection(): Promise<boolean> {
    try {
      const testResult = await this.checkDomainStatus('test-domain-that-definitely-does-not-exist-12345.com');
      return testResult.length > 0;
    } catch (error) {
      return false;
    }
  }

  // Get API usage info
  getProviderInfo(): { name: string; features: string[]; limits: Record<string, any> } {
    return {
      name: 'Namecheap',
      features: [
        'Domain availability checking',
        'Premium domain detection',
        'Premium pricing information',
        'Batch processing (up to 20 domains)',
        'Real-time API access'
      ],
      limits: {
        domainsPerRequest: 20,
        requestsPerMinute: 60,
        rateLimitDelay: 1000
      }
    };
  }
} 