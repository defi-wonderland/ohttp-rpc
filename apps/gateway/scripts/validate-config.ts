#!/usr/bin/env bun
/**
 * Configuration Validation Script
 * 
 * Validates the gateway configuration without starting the server
 */

import { loadConfig, getDevConfig, type GatewayConfig } from "../src/env.js";

/**
 * Validate configuration and display results
 */
function validateAndDisplay(config: GatewayConfig, source: string): void {
  console.log(`📋 ${source} Configuration:`);
  console.log('================================');
  console.log('');
  
  // Server settings
  console.log('  Server:');
  console.log(`   Port: ${config.GATEWAY_PORT}`);
  console.log('');
  
  // Security settings
  console.log('🔐 Security:');
  console.log(`   HPKE Suite: ${config.HPKE_SUITE}`);
  console.log(`   HPKE Seed Length: ${String(config.HPKE_SEED).length} chars`);
  console.log(`   Require TLS: ${config.REQUIRE_TLS_UPSTREAM ? '' : ''}`);
  console.log(`   Allow Redirects: ${config.ALLOW_REDIRECTS ? '' : ''}`);
  console.log(`   Replay Protection: ${config.ENABLE_REPLAY_PROTECTION ? '' : ''}`);
  console.log('');
  
  // Policy settings
  console.log(' Policy:');
  console.log(`   Allowed Targets (${config.ALLOWED_TARGETS.length}):`);
  for (const target of config.ALLOWED_TARGETS) {
    const isSecure = target.startsWith('https://');
    const isLocal = target.includes('localhost') || target.includes('127.0.0.1');
    console.log(`     ${isSecure ? '' : ''} ${target}${isLocal ? ' (local)' : ''}`);
  }
  console.log('');
  console.log(`   Allowed Headers (${config.ALLOWED_HEADERS.length}):`);
  console.log(`     ${config.ALLOWED_HEADERS.join(', ')}`);
  console.log('');
  console.log(`   Max Request Size: ${(config.MAX_INNER_BYTES / 1024).toFixed(0)}KB`);
  console.log('');
  
  // Timeout settings
  console.log('  Timeouts:');
  console.log(`   Connect: ${config.UPSTREAM_CONNECT_TIMEOUT_MS}ms`);
  console.log(`   Total: ${config.UPSTREAM_TOTAL_TIMEOUT_MS}ms`);
  console.log(`   Date Skew Tolerance: ${config.DATE_SKEW_TOLERANCE_MS}ms`);
  console.log('');
  
  // Logging settings
  console.log(' Logging:');
  console.log(`   Level: ${config.LOG_LEVEL}`);
  console.log(`   Log Inner Content: ${config.LOG_INNER_CONTENT ? ' DANGEROUS' : ''}`);
  console.log('');
  
  // Security analysis
  console.log(' Security Analysis:');
  const issues: string[] = [];
  const warnings: string[] = [];
  
  // Check HPKE seed security
  const seedString = typeof config.HPKE_SEED === 'string' ? config.HPKE_SEED : String(config.HPKE_SEED);
  if (seedString.length < 40) {
    warnings.push('HPKE seed is shorter than recommended (40+ chars)');
  }
  
  if (seedString.toLowerCase().includes('dev') || 
      seedString.toLowerCase().includes('test') ||
      seedString.toLowerCase().includes('example')) {
    issues.push('HPKE seed appears to contain development/test values');
  }
  
  // Check TLS requirements
  if (!config.REQUIRE_TLS_UPSTREAM) {
    warnings.push('TLS not required for upstream connections');
  }
  
  // Check for insecure targets
  const httpTargets = config.ALLOWED_TARGETS.filter(target => target.startsWith('http://'));
  if (httpTargets.length > 0) {
    warnings.push(`${httpTargets.length} HTTP (non-TLS) targets configured`);
  }
  
  // Check logging security
  if (config.LOG_INNER_CONTENT === true) {
    issues.push('Inner content logging is enabled (privacy risk)');
  }
  
  if (config.LOG_LEVEL === 'debug') {
    warnings.push('Debug logging enabled (may impact performance)');
  }
  
  // Display results
  if (issues.length === 0 && warnings.length === 0) {
    console.log('    No security issues detected');
  } else {
    if (issues.length > 0) {
      console.log('    Issues:');
      for (const issue of issues) {
        console.log(`      ${issue}`);
      }
    }
    
    if (warnings.length > 0) {
      console.log('     Warnings:');
      for (const warning of warnings) {
        console.log(`      ${warning}`);
      }
    }
  }
  
  console.log('');
}

/**
 * Main validation function
 */
async function main() {
  const args = process.argv.slice(2);
  const validateDev = args.includes('--dev');
  const validateProd = args.includes('--prod') || args.length === 0;
  
  console.log(' OHTTP Gateway Configuration Validator');
  console.log('==========================================');
  console.log('');
  
  try {
    if (validateDev) {
      console.log('Validating development configuration...');
      const devConfig = getDevConfig();
      validateAndDisplay(devConfig, 'Development');
    }
    
    if (validateProd) {
      console.log('Validating production configuration...');
      const prodConfig = loadConfig();
      validateAndDisplay(prodConfig, 'Production');
      
      console.log(' Configuration is valid and ready for deployment!');
    }
    
  } catch (error) {
    console.error(' Configuration validation failed:');
    console.error(error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
