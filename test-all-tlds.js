#!/usr/bin/env node

// Test script to verify ALL TLDs are used
import { DomainService } from './dist/services/domain-service.js';

async function testAllTlds() {
  console.log('🔍 Testing Deep-TLD with ALL TLDs...\n');
  
  const domainService = new DomainService();
  
  // Test with small parameters to see the behavior
  console.log('Testing with batchSize=10, maxBatches=2...');
  
  const result = await domainService.deepTldExploration(
    'AI-powered brand name generator',
    ['brand', 'generator', 'ai', 'naming'],
    10,  // Small batch size
    2,   // Only 2 batches
    'moderate'
  );
  
  console.log('\n✅ Results:');
  console.log('===========');
  
  // Check the stats
  const tldStat = result.stats.find(stat => stat.includes('Explored TLDs'));
  const batchStat = result.stats.find(stat => stat.includes('Batch size'));
  
  console.log(`TLD Coverage: ${tldStat}`);
  console.log(`Batch Info: ${batchStat}`);
  
  // Show some standouts
  if (result.standouts.length > 0) {
    console.log('\n🌟 Top Standouts:');
    result.standouts.slice(0, 5).forEach((standout, i) => {
      console.log(`${i + 1}. ${standout.domain} (${standout.score}/10)`);
    });
  }
  
  console.log('\n📊 All Stats:');
  result.stats.forEach(stat => console.log(`  ${stat}`));
  
  console.log('\n✅ Test completed!');
}

testAllTlds().catch(console.error); 