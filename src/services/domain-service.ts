import axios from 'axios';
import { z } from 'zod';
import { DomainrProvider } from '../providers/domainr.js';
import { NamecheapProvider } from '../providers/namecheap.js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

config();

// Types
interface DomainResult {
  domain: string;
  available: boolean;
  isPremium: boolean;
  premiumPrice?: number;
  tld: string;
  score: number;
  strategy: string;
}

interface SearchResult {
  available: DomainResult[];
  taken: DomainResult[];
  premium: DomainResult[];
  insights: string[];
  searchMode: string;
  totalGenerated: number;
  creativityScore: number;
  provider: string;
}

// Configuration
const OPENAI_API = {
  url: process.env.OPENAI_API_URL || '',
  key: process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || ''
};

const OLLAMA_API = process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434/api/generate';
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'ollama';
const DOMAIN_PROVIDER = process.env.DOMAIN_PROVIDER || 'domainr';

// Load ALL TLDs from file
const loadAllTlds = (): string[] => {
  try {
    const tldPath = join(process.cwd(), 'tlds.txt');
    const content = readFileSync(tldPath, 'utf-8');
    return content.split('\n')
      .map(line => line.trim().toLowerCase())
      .filter(line => line && !line.startsWith('#'))
      .map(tld => tld.startsWith('.') ? tld : `.${tld}`);
  } catch (error) {
    return ['.com', '.net', '.org', '.io', '.ai', '.app', '.co', '.dev'];
  }
};

// Domain Service Class
export class DomainService {
  private domainProvider: DomainrProvider | NamecheapProvider;
  private providerName: string;
  private allTlds: string[];
  private techTlds: string[];
  private funTlds: string[];
  private countryTlds: string[];
  private brandTlds: string[];
  private creativeWords: string[];

  constructor() {
    this.providerName = DOMAIN_PROVIDER.toLowerCase();
    
    if (this.providerName === 'namecheap') {
      this.domainProvider = new NamecheapProvider();
    } else {
      this.domainProvider = new DomainrProvider();
      this.providerName = 'domainr';
    }

    this.allTlds = loadAllTlds();
    
    this.techTlds = this.allTlds.filter(tld => 
      ['.ai', '.tech', '.io', '.app', '.dev', '.software', '.digital', '.cloud', '.data', '.computer', '.network', '.systems', '.science'].includes(tld)
    );
    
    this.funTlds = this.allTlds.filter(tld => 
      ['.fun', '.party', '.club', '.bar', '.pub', '.love', '.sexy', '.hot', '.cool', '.lol', '.wtf', '.porn', '.xxx', '.adult', '.gay', '.dating', '.pizza', '.coffee', '.beer', '.wine', '.vodka', '.tattoo', '.hair', '.yoga'].includes(tld)
    );
    
    this.countryTlds = this.allTlds.filter(tld => 
      tld.length === 3 && !this.techTlds.includes(tld) && !['.com', '.net', '.org', '.edu', '.gov', '.mil'].includes(tld)
    );
    
    this.brandTlds = this.allTlds.filter(tld => 
      ['.amazon', '.google', '.apple', '.microsoft', '.nike', '.bmw', '.samsung', '.sony', '.canon'].includes(tld)
    );

    this.creativeWords = [
      'spark', 'flow', 'sync', 'pulse', 'wave', 'shift', 'leap', 'rise', 'beam', 'dash',
      'zoom', 'glow', 'buzz', 'snap', 'flux', 'vibe', 'edge', 'peak', 'core', 'nova',
      'zen', 'ace', 'pro', 'max', 'ultra', 'meta', 'next', 'smart', 'swift', 'bold'
    ];
  }

  // Add batched domain checking with rate limiting
  private async checkDomainsInBatches(
    domainInfos: { domain: string; strategy: string }[],
    keywords: string[]
  ): Promise<DomainResult[]> {
    const results: DomainResult[] = [];
    
    const batchSize = this.providerName === 'namecheap' ? 20 : 5;
    const delayBetweenBatches = 1000;

    for (let i = 0; i < domainInfos.length; i += batchSize) {
      const batch = domainInfos.slice(i, i + batchSize);
      
      try {
        const batchResults = await Promise.allSettled(
          batch.map(async (domainInfo) => {
            try {
              const status = await this.domainProvider.checkDomainStatus(domainInfo.domain);
              const domainStatus = status[0];
              
              let available = false;
              let isPremium = false;
              let premiumPrice: number | undefined = undefined;

              if (this.providerName === 'namecheap') {
                const namecheapResult = domainStatus as any;
                available = namecheapResult?.available === true;
                isPremium = namecheapResult?.isPremium === true;
                premiumPrice = namecheapResult?.premiumPrice;
              } else {
                available = domainStatus?.summary === 'inactive';
                isPremium = domainStatus?.status?.includes('premium') || false;
              }
                
              return {
                domain: domainInfo.domain,
                available,
                isPremium,
                premiumPrice,
                tld: domainInfo.domain.split('.').pop() || '',
                score: this.calculateAdvancedScore(domainInfo.domain, domainInfo.strategy, keywords),
                strategy: domainInfo.strategy
              };
            } catch (error) {
              return {
                domain: domainInfo.domain,
                available: false,
                isPremium: false,
                premiumPrice: undefined,
                tld: domainInfo.domain.split('.').pop() || '',
                score: this.calculateAdvancedScore(domainInfo.domain, domainInfo.strategy, keywords),
                strategy: domainInfo.strategy
              };
            }
          })
        );

        batchResults.forEach(result => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          }
        });

        if (i + batchSize < domainInfos.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }

      } catch (error) {
        continue;
      }
    }

    return results;
  }

  // Public method for domain checking
  async checkDomain(domain: string) {
    return this.domainProvider.checkDomainStatus(domain);
  }

  // Get current provider information
  getProviderInfo(): { name: string; isConfigured: boolean } {
    return {
      name: this.providerName,
      isConfigured: true
    };
  }

  // Test current provider connectivity
  async testProvider(): Promise<boolean> {
    try {
      if ('testConnection' in this.domainProvider) {
        return await this.domainProvider.testConnection();
      } else {
        const result = await this.checkDomain('test-connectivity-check.com');
        return result.length > 0;
      }
    } catch (error) {
      return false;
    }
  }

  async suggestDomains(
    businessDescription: string,
    mode: 'standard' | 'competitive' | 'premium' | 'budget' | 'international' = 'standard',
    maxSuggestions: number = 15
  ): Promise<SearchResult> {
    // Extract keywords from business description
    const keywords = this.extractKeywords(businessDescription);
    
    // Get appropriate TLDs for this search mode
    const selectedTlds = this.selectTldsForMode(mode, keywords);
    
    // Generate domains using multiple creative strategies
    const generatedDomains = await this.generateCreativeDomains(
      businessDescription,
      keywords,
      selectedTlds,
      mode,
      maxSuggestions * 3 // Generate more to have better selection
    );

    // Check availability and details for all generated domains with batching
    const results = await this.checkDomainsInBatches(
      generatedDomains.slice(0, maxSuggestions * 2),
      keywords
    );

    // Sort by score and limit results
    results.sort((a: DomainResult, b: DomainResult) => b.score - a.score);
    const limitedResults = results.slice(0, maxSuggestions);

    // Group results
    const available = limitedResults.filter((r: DomainResult) => r.available);
    const taken = limitedResults.filter((r: DomainResult) => !r.available && !r.isPremium);
    const premium = limitedResults.filter((r: DomainResult) => r.isPremium);

    // Calculate creativity score
    const creativityScore = this.calculateCreativityScore(limitedResults);

    // Generate enhanced insights
    const insights = this.generateEnhancedInsights(
      available,
      taken,
      premium,
      selectedTlds,
      creativityScore,
      keywords
    );

    return {
      available,
      taken,
      premium,
      insights,
      searchMode: mode,
      totalGenerated: generatedDomains.length,
      creativityScore,
      provider: this.providerName
    };
  }

  private extractKeywords(description: string): string[] {
    const words = description.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2);
    
    // Remove common stop words
    const stopWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'had', 'have', 'what', 'were'];
    return words.filter(word => !stopWords.includes(word));
  }

  private selectTldsForMode(mode: string, keywords: string[]): string[] {
    let baseTlds: string[] = [];
    
    switch (mode) {
      case 'competitive':
        // Use creative and modern TLDs
        baseTlds = [
          ...this.techTlds,
          ...this.funTlds,
          '.co', '.xyz', '.space', '.site', '.online', '.world', '.today', '.life',
          '.works', '.studio', '.agency', '.solutions', '.digital', '.ninja'
        ];
        break;
        
      case 'premium':
        // Focus on established and premium TLDs
        baseTlds = [
          '.com', '.net', '.org', '.io', '.ai', '.app', '.co', '.biz',
          '.info', '.pro', '.name', '.me', '.tv', '.cc'
        ];
        break;
        
      case 'budget':
        // Cost-effective TLDs with good availability
        baseTlds = [
          '.xyz', '.site', '.online', '.website', '.space', '.fun', '.live',
          '.store', '.shop', '.blog', '.news', '.click', '.link', '.email'
        ];
        break;
        
      case 'international':
        // Global reach with country-specific options
        baseTlds = [
          '.com', '.net', '.org', '.global', '.world', '.international',
          ...this.countryTlds.slice(0, 20) // Sample of country TLDs
        ];
        break;
        
      default: // standard
        // Balanced mix focusing on versatility
        baseTlds = [
          '.com', '.net', '.org', '.io', '.co', '.app', '.dev', '.tech',
          '.ai', '.digital', '.online', '.site', '.space', '.world'
        ];
    }

    // Add industry-specific TLDs based on keywords
    baseTlds.push(...this.getIndustrySpecificTlds(keywords));
    
    // Remove duplicates and return
    return [...new Set(baseTlds)].slice(0, 50); // Limit to 50 TLDs for performance
  }

  private getIndustrySpecificTlds(keywords: string[]): string[] {
    const industryTlds: string[] = [];
    
    keywords.forEach(keyword => {
      if (['tech', 'software', 'ai', 'data', 'digital'].some(term => keyword.includes(term))) {
        industryTlds.push('.tech', '.ai', '.software', '.digital', '.data', '.systems');
      }
      if (['finance', 'bank', 'money', 'invest'].some(term => keyword.includes(term))) {
        industryTlds.push('.finance', '.bank', '.money', '.fund', '.capital');
      }
      if (['health', 'medical', 'doctor', 'care'].some(term => keyword.includes(term))) {
        industryTlds.push('.health', '.care', '.medical', '.doctor', '.clinic');
      }
      if (['food', 'restaurant', 'cafe', 'kitchen'].some(term => keyword.includes(term))) {
        industryTlds.push('.food', '.restaurant', '.cafe', '.kitchen', '.recipes');
      }
      if (['travel', 'vacation', 'hotel'].some(term => keyword.includes(term))) {
        industryTlds.push('.travel', '.vacation', '.hotel', '.flights', '.tours');
      }
      if (['education', 'school', 'learn', 'course'].some(term => keyword.includes(term))) {
        industryTlds.push('.education', '.school', '.university', '.academy');
      }
    });
    
    return [...new Set(industryTlds)];
  }

  private async generateCreativeDomains(
    description: string,
    keywords: string[],
    tlds: string[],
    mode: string,
    count: number
  ): Promise<{ domain: string; strategy: string }[]> {
    const domains: { domain: string; strategy: string }[] = [];
    
    // Strategy 1: Direct keyword combinations
    for (const keyword of keywords.slice(0, 3)) {
      for (const tld of tlds.slice(0, 10)) {
        domains.push({
          domain: `${keyword}${tld}`,
          strategy: 'direct-keyword'
        });
      }
    }

    // Strategy 2: Word slicing with TLD integration
    for (const keyword of keywords) {
      for (const tld of tlds) {
        const tldPart = tld.slice(1); // Remove the dot
        if (keyword.endsWith(tldPart)) {
          const sliced = keyword.slice(0, -tldPart.length);
          if (sliced.length >= 3) {
            domains.push({
              domain: `${sliced}${tld}`,
              strategy: 'word-slicing'
            });
          }
        }
      }
    }

    // Strategy 3: Portmanteau combinations
    for (let i = 0; i < keywords.length - 1; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        const word1 = keywords[i];
        const word2 = keywords[j];
        
        // Create portmanteau
        const mid1 = Math.ceil(word1.length / 2);
        const mid2 = Math.floor(word2.length / 2);
        const portmanteau = word1.slice(0, mid1) + word2.slice(mid2);
        
        for (const tld of tlds.slice(0, 5)) {
          domains.push({
            domain: `${portmanteau}${tld}`,
            strategy: 'portmanteau'
          });
        }
      }
    }

    // Strategy 4: Creative word additions
    for (const keyword of keywords.slice(0, 2)) {
      for (const creative of this.creativeWords.slice(0, 10)) {
        for (const tld of tlds.slice(0, 8)) {
          domains.push({
            domain: `${keyword}${creative}${tld}`,
            strategy: 'creative-combination'
          });
          domains.push({
            domain: `${creative}${keyword}${tld}`,
            strategy: 'creative-prefix'
          });
        }
      }
    }

    // Strategy 5: Vowel removal for short names
    for (const keyword of keywords) {
      const shortened = keyword.replace(/[aeiou]/g, '');
      if (shortened.length >= 3 && shortened.length <= 6) {
        for (const tld of tlds.slice(0, 10)) {
          domains.push({
            domain: `${shortened}${tld}`,
            strategy: 'vowel-removal'
          });
        }
      }
    }

    // Strategy 6: Number substitutions
    for (const keyword of keywords.slice(0, 2)) {
      const withNumbers = keyword
        .replace(/to/g, '2')
        .replace(/for/g, '4')
        .replace(/ate/g, '8');
      
      if (withNumbers !== keyword) {
        for (const tld of tlds.slice(0, 5)) {
          domains.push({
            domain: `${withNumbers}${tld}`,
            strategy: 'number-substitution'
          });
        }
      }
    }

    // Strategy 7: LLM-generated suggestions for more creative options
    if (mode === 'competitive') {
      try {
        const llmSuggestions = await this.getLLMSuggestions(
          this.generateAdvancedPrompt(description, keywords, tlds.slice(0, 20), mode)
        );
        
        llmSuggestions.forEach(domain => {
          domains.push({
            domain,
            strategy: 'llm-creative'
          });
        });
      } catch (error) {
      }
    }

    // Filter valid domains and remove duplicates
    const validDomains = domains
      .filter(d => this.isValidDomain(d.domain))
      .filter((d, index, arr) => arr.findIndex(x => x.domain === d.domain) === index);

    // Shuffle and return requested count
    return this.shuffleArray(validDomains).slice(0, count);
  }

  private generateAdvancedPrompt(
    description: string,
    keywords: string[],
    tlds: string[],
    mode: string
  ): string {
    return `Create ultra-creative domain names for: ${description}

Keywords to work with: ${keywords.join(', ')}
Available TLDs: ${tlds.join(', ')}

Creative techniques to use:
- Word slicing (e.g., "examp.le" using .le)
- Portmanteau words (blending 2 words)
- Creative spelling variations
- Industry-specific combinations
- Abstract brandable names
- Unexpected TLD usage

Mode: ${mode} - ${mode === 'competitive' ? 'Maximum creativity and uniqueness' : 'Professional but memorable'}

Generate 15 highly creative domain names. Be innovative with TLD usage.
Respond with ONLY domain names, one per line.`;
  }

  private async getLLMSuggestions(prompt: string): Promise<string[]> {
    try {
      if (LLM_PROVIDER === "openai") {
        const response = await axios.post(OPENAI_API.url, {
          model: OPENAI_API.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 800,
          temperature: 0.9
        }, {
          headers: {
            'Authorization': `Bearer ${OPENAI_API.key}`,
            'Content-Type': 'application/json'
          }
        });

        return this.parseLLMResponse(response.data.choices[0]?.message?.content || "");
      } else {
        const response = await axios.post(OLLAMA_API, {
          model: "llama3.2:latest",
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.9,
            top_p: 0.95,
            max_tokens: 800
          }
        });

        return this.parseLLMResponse(response.data.response || "");
      }
    } catch (error) {
      throw new Error(`LLM API Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private parseLLMResponse(content: string): string[] {
    return content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.includes(':') && !line.startsWith('-'))
      .map(line => line.replace(/^\d+\.\s*/, ''))
      .map(line => line.replace(/^[-•*]\s*/, ''))
      .filter(domain => this.isValidDomain(domain));
  }

  private calculateAdvancedScore(domain: string, strategy: string, keywords: string[]): number {
    const base = domain.split('.')[0];
    const tld = domain.split('.').slice(1).join('.');
    let score = 3; // Start at middle

    // Length scoring - reasonable standards
    if (base.length >= 4 && base.length <= 8) score += 2; // Good range
    else if (base.length >= 3 && base.length <= 12) score += 1; // Acceptable
    else score -= 1; // Too short/long

    // Strategy scoring - moderate rewards
    const strategyScores: Record<string, number> = {
      'word-slicing': 1.5,
      'portmanteau': 1,
      'llm-creative': 1,
      'creative-combination': 0.5,
      'vowel-removal': 0,
      'direct-keyword': 0.5,
      'creative-prefix': 0.5,
      'number-substitution': -1
    };
    score += strategyScores[strategy] || 0;

    // TLD scoring - reasonable bonuses
    if (['.com'].includes(`.${tld}`)) score += 2; // .com is great
    else if (['.io', '.ai'].includes(`.${tld}`)) score += 1.5; // Tech TLDs good
    else if (['.app', '.dev', '.co'].includes(`.${tld}`)) score += 1; // Decent TLDs
    else if (['.net', '.org'].includes(`.${tld}`)) score += 0.5; // Classic TLDs
    else score += 0; // Others neutral

    // Keyword relevance - balanced
    const exactMatch = keywords.some(keyword => 
      base.toLowerCase() === keyword.toLowerCase()
    );
    const partialMatch = keywords.some(keyword => 
      base.toLowerCase().includes(keyword.toLowerCase()) && base.toLowerCase() !== keyword.toLowerCase()
    );
    
    if (exactMatch) score += 1.5;
    else if (partialMatch) score += 0.5;
    else score -= 0.5; // Small penalty for no relevance

    // Pronounceable - reasonable standards
    if (this.isPronounceableAndBrandable(base)) {
      score += 1;
    } else {
      score -= 1;
    }

    // Penalties - moderate not brutal
    if (/[0-9]/.test(base)) score -= 1.5;
    if (/-/.test(base)) score -= 2;
    if (base.length <= 2) score -= 2;
    if (base.length >= 15) score -= 1;
    if (/(.)\1{3,}/.test(base)) score -= 1; // Only excessive repeats
    if (!/[aeiou]/i.test(base)) score -= 1.5;

    // Bonus for premium characteristics
    if (base.length >= 4 && base.length <= 7 && 
        this.isPronounceableAndBrandable(base) && 
        (exactMatch || partialMatch) && 
        ['.com', '.io', '.ai'].includes(`.${tld}`) &&
        !/[0-9-]/.test(base)) {
      score += 1; // Achievable bonus for good domains
    }

    // Keep reasonable distribution
    const finalScore = Math.max(1, Math.min(10, score));
    return Math.round(finalScore * 2) / 2;
  }

  private isPronounceableAndBrandable(word: string): boolean {
    // Check for good consonant/vowel distribution
    const vowels = (word.match(/[aeiou]/gi) || []).length;
    const consonants = word.length - vowels;
    const ratio = vowels / word.length;
    
    // Good ratio is between 0.2 and 0.6
    return ratio >= 0.2 && ratio <= 0.6 && consonants > 0;
  }

  private calculateCreativityScore(results: DomainResult[]): number {
    const strategies = [...new Set(results.map(r => r.strategy))];
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const tldDiversity = [...new Set(results.map(r => r.tld))].length;
    
    return Math.min(10, (strategies.length * 2) + (avgScore / 2) + (tldDiversity / 3));
  }

  private generateEnhancedInsights(
    available: DomainResult[],
    taken: DomainResult[],
    premium: DomainResult[],
    selectedTlds: string[],
    creativityScore: number,
    keywords: string[]
  ): string[] {
    const insights: string[] = [];

    insights.push(`Using ${this.providerName.charAt(0).toUpperCase() + this.providerName.slice(1)} API for domain checking`);

    if (available.length === 0) {
      insights.push("High competition detected - consider more abstract or invented brand names");
      insights.push("Try combining words creatively or using less common TLDs");
    } else if (available.length >= 5) {
      insights.push("Great availability in this space - multiple strong options found");
    }

    const strategies = [...new Set([...available, ...taken].map(r => r.strategy))];
    if (strategies.includes('word-slicing')) {
      insights.push("Word slicing strategy found creative TLD integrations");
    }
    if (strategies.includes('portmanteau')) {
      insights.push("Portmanteau combinations created unique brandable names");
    }

    const usedTlds = [...new Set([...available, ...taken].map(r => r.tld))];
    insights.push(`Explored ${usedTlds.length} different TLDs from ${selectedTlds.length} candidates`);
    
    if (premium.length > 0) {
      insights.push(`Found ${premium.length} premium domains - potential investment opportunities`);
    }

    if (creativityScore >= 8) {
      insights.push("High creativity score - generated diverse and innovative options");
    } else if (creativityScore >= 6) {
      insights.push("Good creativity balance - mix of safe and innovative options");
    } else {
      insights.push("Conservative approach - focused on tried-and-true naming patterns");
    }

    const totalChecked = available.length + taken.length + premium.length;
    insights.push(`Analyzed ${totalChecked} domains across ${strategies.length} creative strategies`);

    return insights;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private isValidDomain(domain: string): boolean {
    // More comprehensive domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z0-9]{2,}$/;
    const parts = domain.split('.');
    
    return domainRegex.test(domain) && 
           parts.length >= 2 && 
           parts[0].length >= 2 && 
           parts[0].length <= 63 &&
           !domain.includes('--') &&
           !domain.startsWith('-') &&
           !domain.endsWith('-');
  }
} 