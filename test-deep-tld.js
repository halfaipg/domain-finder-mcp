#!/usr/bin/env node

// Quick test script for deep-tld functionality
import { DomainService } from './dist/services/domain-service.js';

async function testDeepTld() {
  console.log('🚀 Testing Deep TLD Exploration...\n');
  
  const domainService = new DomainService();
  
  // Test with minimal parameters
  try {
    console.log('Testing deep-tld with brand generator...');
    
    const result = await domainService.deepTldExploration(
      'AI-powered brand name generator',
      ['brand', 'generator', 'ai', 'naming'],
      10, // Small batch size
      1,  // Just 1 batch
      'moderate'
    );
    
    console.log('\n✅ Deep TLD Test Results:');
    console.log('========================');
    
    if (result.standouts.length > 0) {
      console.log('\n🌟 Standout Domains:');
      result.standouts.forEach(s => {
        console.log(`   ${s.domain} (${s.score}/10) - ${s.reason}`);
      });
    }
    
    if (result.available.length > 0) {
      console.log('\n✓ Available Domains:');
      result.available.slice(0, 10).forEach(d => {
        console.log(`   ${d.domain} (${d.score}/10)`);
      });
    }
    
    console.log('\n📊 Stats:');
    result.stats.forEach(stat => console.log(`   ${stat}`));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testDeepTld().then(() => {
  console.log('\n✅ Test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
}); 