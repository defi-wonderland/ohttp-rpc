#!/usr/bin/env bun
/**
 * Configuration Validation Script
 * 
 * Validates the relay configuration without starting the server
 */

import { loadConfig, getDevConfig, type RelayConfig } from "../src/env.js";

/**
 * Test gateway connectivity
 */
async function testGatewayConnectivity(gatewayUrl: string): Promise<boolean> {
  try {
    // Try to connect to gateway health endpoint
    const healthUrl = gatewayUrl.replace('/gateway', '/health');
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Validate configuration and display results
 */
async function validateAndDisplay(config: RelayConfig, source: string): Promise<void> {
  console.log(`📋 ${source} Configuration:`);
  console.log('==============================');
  console.log('');
  
  // Server settings
  console.log('  Server:');
  console.log(`   Port: ${config.RELAY_PORT}`);
  console.log('');
  
  // Gateway settings
  console.log('🛡 Gateway:');
  console.log(`   URL: ${config.GATEWAY_URL}`);
  console.log(`   Protocol: ${config.GATEWAY_URL.startsWith('https://') ? ' HTTPS' : ' HTTP'}`);
  
  // Test connectivity
  console.log('   Connectivity: Testing...');
  const isConnectable = await testGatewayConnectivity(config.GATEWAY_URL);
  console.log(`   Connectivity: ${isConnectable ? ' Reachable' : ' Unreachable'}`);
  console.log('');
  
  // CORS settings
  console.log(' CORS:');
  console.log(`   Allowed Origins (${config.ALLOWED_ORIGINS.length}):`);
  for (const origin of config.ALLOWED_ORIGINS) {
    const isWildcard = origin === '*';
    const isSecure = origin.startsWith('https://');
    const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');
    
    let status = '';
    if (isWildcard) status = '';
    else if (!isSecure && !isLocal) status = '';
    else if (isLocal) status = '🏠';
    
    console.log(`     ${status} ${origin}${isLocal ? ' (local)' : ''}${isWildcard ? ' (all origins)' : ''}`);
  }
  console.log('');
  
  // Security settings
  console.log(' Security:');
  console.log(`   Max Body Size: ${(config.MAX_BODY_BYTES / 1024).toFixed(0)}KB`);
  console.log(`   Rate Limit: ${config.RATE_LIMIT_RPM} req/min per IP`);
  console.log('');
  
  // Timeout settings
  console.log('  Timeouts:');
  console.log(`   Connect: ${config.CONNECT_TIMEOUT_MS}ms`);
  console.log(`   Total: ${config.TOTAL_TIMEOUT_MS}ms`);
  console.log('');
  
  // Logging settings
  console.log(' Logging:');
  console.log(`   Level: ${config.LOG_LEVEL}`);
  console.log('');
  
  // Security analysis
  console.log(' Security Analysis:');
  const issues: string[] = [];
  const warnings: string[] = [];
  
  // Check CORS security
  if (config.ALLOWED_ORIGINS.includes('*')) {
    warnings.push('Wildcard CORS origin allows all domains');
  }
  
  // Check gateway URL security
  if (!config.GATEWAY_URL.startsWith('https://')) {
    if (config.GATEWAY_URL.includes('localhost')) {
      warnings.push('Gateway URL uses HTTP (localhost development)');
    } else {
      issues.push('Gateway URL should use HTTPS in production');
    }
  }
  
  // Check rate limiting
  if (config.RATE_LIMIT_RPM > 1000) {
    warnings.push('High rate limit may enable abuse');
  } else if (config.RATE_LIMIT_RPM < 10) {
    warnings.push('Very low rate limit may impact legitimate users');
  }
  
  // Check timeouts
  if (config.TOTAL_TIMEOUT_MS < config.CONNECT_TIMEOUT_MS) {
    issues.push('Total timeout is less than connect timeout');
  }
  
  // Check logging
  if (config.LOG_LEVEL === 'debug') {
    warnings.push('Debug logging may impact performance');
  }
  
  // Check gateway connectivity
  if (!isConnectable) {
    warnings.push('Gateway is not reachable (may be normal if not running)');
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
  
  console.log(' OHTTP Relay Configuration Validator');
  console.log('======================================');
  console.log('');
  
  try {
    if (validateDev) {
      console.log('Validating development configuration...');
      const devConfig = getDevConfig();
      await validateAndDisplay(devConfig, 'Development');
    }
    
    if (validateProd) {
      console.log('Validating production configuration...');
      const prodConfig = loadConfig();
      await validateAndDisplay(prodConfig, 'Production');
      
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
