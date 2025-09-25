#!/usr/bin/env bun
/**
 * HPKE Key Generation Utility
 * 
 * Generates cryptographically secure HPKE seeds for the gateway server.
 * Run this script to create a new seed for production deployment.
 */

import { webcrypto } from "node:crypto";

/**
 * Generate a cryptographically secure HPKE seed
 */
function generateHpkeSeed(): string {
  // Generate 32 cryptographically secure random bytes
  const seedBytes = new Uint8Array(32);
  webcrypto.getRandomValues(seedBytes);
  
  // Convert to base64url encoding (URL-safe base64)
  const base64 = btoa(String.fromCharCode(...seedBytes));
  const base64url = base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
    
  return base64url;
}

/**
 * Validate an existing HPKE seed
 */
function validateHpkeSeed(seed: string): boolean {
  try {
    // Add padding if needed for base64url
    let padded = seed;
    while (padded.length % 4) {
      padded += '=';
    }
    
    // Convert base64url to base64
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    
    // Decode to bytes
    const decoded = atob(base64);
    
    // Check length (should be 32 bytes)
    return decoded.length === 32;
  } catch {
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    const command = args[0];
    
    switch (command) {
      case 'generate':
        const seed = generateHpkeSeed();
        console.log('Generated HPKE seed:');
        console.log(seed);
        console.log('');
        console.log('Add this to your .env file:');
        console.log(`HPKE_SEED=${seed}`);
        console.log('');
        console.log('  SECURITY WARNING:');
        console.log('- Keep this seed secret and secure');
        console.log('- Rotate periodically for security');
        console.log('- Never commit this to version control');
        break;
        
      case 'validate':
        if (args.length < 2) {
          console.error('Usage: bun scripts/generate-keys.ts validate <seed>');
          process.exit(1);
        }
        
        const seedToValidate = args[1];
        const isValid = validateHpkeSeed(seedToValidate);
        
        if (isValid) {
          console.log(' Valid HPKE seed');
        } else {
          console.log(' Invalid HPKE seed');
          console.log('Expected: 32-byte base64url encoded string');
          process.exit(1);
        }
        break;
        
      default:
        console.log('Usage:');
        console.log('  bun scripts/generate-keys.ts generate  - Generate new HPKE seed');
        console.log('  bun scripts/generate-keys.ts validate <seed> - Validate existing seed');
        process.exit(1);
    }
  } else {
    // Default: generate new seed
    const seed = generateHpkeSeed();
    console.log('🔐 New HPKE Seed Generated');
    console.log('');
    console.log('Seed:', seed);
    console.log('');
    console.log('Environment variable:');
    console.log(`HPKE_SEED=${seed}`);
    console.log('');
    console.log(' Security Notes:');
    console.log('- This seed is used to generate your gateway\'s private keys');
    console.log('- Keep it secret and secure (never commit to git)');
    console.log('- Rotate periodically for enhanced security');
    console.log('- Backup securely before rotating');
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
