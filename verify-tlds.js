#!/usr/bin/env node

// Verify TLD usage in deep-tld exploration
import { DomainService } from './dist/services/domain-service.js';

async function verifyTldUsage() {
  console.log('🔍 Verifying TLD Usage in Deep-TLD Exploration...\n');
  
  const domainService = new DomainService();
  
  // Test with different parameters
  const testCases = [
    { batchSize: 50, maxBatches: 5, expected: 250 },
    { batchSize: 100, maxBatches: 3, expected: 300 },
    { batchSize: 200, maxBatches: 2, expected: 400 },
    { batchSize: 500, maxBatches: 1, expected: 500 }
  ];
  
  for (const testCase of testCases) {
    console.log(`Testing: batchSize=${testCase.batchSize}, maxBatches=${testCase.maxBatches}`);
    
    const result = await domainService.deepTldExploration(
      'test business',
      ['test'],
      testCase.batchSize,
      testCase.maxBatches,
      'moderate'
    );
    
    // Extract the actual number from stats
    const tldStat = result.stats.find(stat => stat.includes('Explored TLDs'));
    const match = tldStat.match(/Explored TLDs: (\d+) out of (\d+) total TLDs/);
    
    if (match) {
      const explored = parseInt(match[1]);
      const total = parseInt(match[2]);
      const expected = testCase.expected;
      
      console.log(`  Expected: ${expected} TLDs`);
      console.log(`  Actual: ${explored} TLDs`);
      console.log(`  Total available: ${total} TLDs`);
      console.log(`  ✅ Correct: ${explored === expected ? 'YES' : 'NO'}`);
      console.log(`  📊 Coverage: ${((explored / total) * 100).toFixed(1)}% of all TLDs`);
    }
    
    console.log('');
  }
  
  // Test with maximum exploration
  console.log('Testing maximum exploration...');
  const maxResult = await domainService.deepTldExploration(
    'test business',
    ['test'],
    1000, // Large batch size
    10,   // Many batches
    'wild'
  );
  
  const maxTldStat = maxResult.stats.find(stat => stat.includes('Explored TLDs'));
  const maxMatch = maxTldStat.match(/Explored TLDs: (\d+) out of (\d+) total TLDs/);
  
  if (maxMatch) {
    const maxExplored = parseInt(maxMatch[1]);
    const maxTotal = parseInt(maxMatch[2]);
    
    console.log(`  Maximum explored: ${maxExplored} TLDs`);
    console.log(`  Total available: ${maxTotal} TLDs`);
    console.log(`  📊 Maximum coverage: ${((maxExplored / maxTotal) * 100).toFixed(1)}% of all TLDs`);
  }
  
  console.log('\n✅ Verification complete!');
}

verifyTldUsage().catch(console.error); 