#!/usr/bin/env node

// Quick TLD Explorer - Find interesting combinations without API calls
import { readFileSync } from 'fs';
import { join } from 'path';

function loadAllTlds() {
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
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateCombinations(keywords, tlds, count = 50) {
  const combinations = [];
  
  // Direct keyword + TLD
  for (const keyword of keywords.slice(0, 3)) {
    for (const tld of tlds.slice(0, Math.floor(count / 3))) {
      combinations.push(`${keyword}${tld}`);
    }
  }
  
  // Creative words + TLD
  const creativeWords = ['spark', 'flow', 'sync', 'pulse', 'wave', 'shift', 'leap', 'rise', 'beam', 'dash', 'zoom', 'glow', 'buzz', 'snap', 'flux', 'vibe', 'edge', 'peak', 'core', 'nova', 'zen', 'ace', 'pro', 'max', 'ultra', 'meta', 'next', 'smart', 'swift', 'bold'];
  
  for (const word of creativeWords.slice(0, 5)) {
    for (const tld of tlds.slice(0, Math.floor(count / 5))) {
      combinations.push(`${word}${tld}`);
    }
  }
  
  return combinations.slice(0, count);
}

function findInterestingTlds(allTlds) {
  const interesting = [];
  
  // Fun/creative TLDs
  const funTlds = ['.fun', '.party', '.club', '.bar', '.pub', '.love', '.sexy', '.hot', '.cool', '.lol', '.wtf', '.porn', '.xxx', '.adult', '.gay', '.dating', '.pizza', '.coffee', '.beer', '.wine', '.vodka', '.tattoo', '.hair', '.yoga'];
  
  // Tech TLDs
  const techTlds = ['.ai', '.tech', '.io', '.app', '.dev', '.software', '.digital', '.cloud', '.data', '.computer', '.network', '.systems', '.science'];
  
  // Brand TLDs
  const brandTlds = ['.amazon', '.google', '.apple', '.microsoft', '.nike', '.bmw', '.samsung', '.sony', '.canon'];
  
  // Unusual TLDs
  const unusualTlds = allTlds.filter(tld => 
    tld.includes('pizza') || 
    tld.includes('coffee') || 
    tld.includes('beer') || 
    tld.includes('love') || 
    tld.includes('sexy') || 
    tld.includes('hot') || 
    tld.includes('cool') || 
    tld.includes('fun') || 
    tld.includes('party') || 
    tld.includes('club') || 
    tld.includes('bar') || 
    tld.includes('pub') || 
    tld.includes('lol') || 
    tld.includes('wtf') || 
    tld.includes('porn') || 
    tld.includes('xxx') || 
    tld.includes('adult') || 
    tld.includes('gay') || 
    tld.includes('dating') || 
    tld.includes('tattoo') || 
    tld.includes('hair') || 
    tld.includes('yoga') ||
    tld.includes('mint') ||
    tld.includes('vegas') ||
    tld.includes('aarp')
  );
  
  return [...new Set([...funTlds, ...techTlds, ...brandTlds, ...unusualTlds])];
}

async function exploreTlds(businessDescription, keywords = []) {
  console.log('🔍 Quick TLD Explorer for:', businessDescription);
  console.log('Keywords:', keywords.join(', '));
  console.log('='.repeat(50));
  
  const allTlds = loadAllTlds();
  const interestingTlds = findInterestingTlds(allTlds);
  const shuffledTlds = shuffleArray(allTlds);
  
  console.log(`📊 Total TLDs available: ${allTlds.length}`);
  console.log(`🎯 Interesting TLDs found: ${interestingTlds.length}`);
  console.log('');
  
  // Generate combinations with interesting TLDs
  const interestingCombinations = generateCombinations(keywords, interestingTlds, 30);
  
  console.log('🌟 Interesting Combinations:');
  console.log('-'.repeat(30));
  interestingCombinations.forEach((domain, i) => {
    console.log(`${i + 1}. ${domain}`);
  });
  
  console.log('');
  
  // Generate combinations with random TLDs
  const randomCombinations = generateCombinations(keywords, shuffledTlds.slice(0, 100), 20);
  
  console.log('🎲 Random TLD Combinations:');
  console.log('-'.repeat(30));
  randomCombinations.forEach((domain, i) => {
    console.log(`${i + 1}. ${domain}`);
  });
  
  console.log('');
  console.log('💡 Top Recommendations:');
  console.log('-'.repeat(30));
  
  // Pick the most promising ones
  const recommendations = [
    ...interestingCombinations.slice(0, 5),
    ...randomCombinations.slice(0, 5)
  ];
  
  recommendations.forEach((domain, i) => {
    console.log(`${i + 1}. ${domain}`);
  });
  
  console.log('');
  console.log('✅ Exploration complete! Check availability for your favorites.');
}

// Run the explorer
const businessDescription = 'AI-powered brand name generator';
const keywords = ['brand', 'generator', 'ai', 'naming', 'identity', 'creative', 'business', 'startup'];

exploreTlds(businessDescription, keywords).catch(console.error); 