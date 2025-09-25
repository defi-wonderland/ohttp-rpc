/**
 * Environment configuration for OHTTP Gateway
 */

import { z } from "zod";
import { COMMON_RPC_ENDPOINTS, STANDARD_RPC_HEADERS } from "@ohttp/shared";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Load environment variables from .env file if it exists
 */
function loadEnvFile(): void {
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    try {
      const envContent = readFileSync(envPath, 'utf8');
      const lines = envContent.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
            // Only set if not already set (environment takes precedence)
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      }
    } catch (error) {
      console.warn('Warning: Could not load .env file:', error);
    }
  }
}

/**
 * Validate HPKE seed format and security
 */
function validateHpkeSeed(seed: string): string {
  // Check minimum length
  if (seed.length < 32) {
    throw new Error("HPKE_SEED must be at least 32 characters");
  }
  
  // Check for common insecure values
  const insecurePatterns = [
    'dev-seed',
    'test-seed',
    'example-seed',
    'your-secure',
    'change-me',
    'default',
    '123456',
    'password'
  ];
  
  const lowerSeed = seed.toLowerCase();
  for (const pattern of insecurePatterns) {
    if (lowerSeed.includes(pattern)) {
      throw new Error(`HPKE_SEED contains insecure pattern "${pattern}". Generate a secure seed with: bun scripts/generate-keys.ts`);
    }
  }
  
  // Validate base64url format (rough check)
  if (!/^[A-Za-z0-9_-]+$/.test(seed)) {
    throw new Error("HPKE_SEED should be base64url encoded (A-Z, a-z, 0-9, -, _)");
  }
  
  return seed;
}

/**
 * Environment variable schema
 */
const envSchema = z.object({
  // Server configuration
  GATEWAY_PORT: z.coerce.number()
    .min(1, "Port must be positive")
    .max(65535, "Port must be valid")
    .default(8788),
  
  // HPKE configuration
  HPKE_SEED: z.string()
    .min(1, "HPKE_SEED is required")
    .transform(validateHpkeSeed),
  HPKE_SUITE: z.string().default("DHKEM_X25519_HKDF_SHA256+HKDF_SHA256+AES_128_GCM"),
  
  // Policy configuration
  ALLOWED_TARGETS: z.string().transform(val => {
    const targets = val.split(',').map(target => target.trim()).filter(Boolean);
    if (targets.length === 0) {
      throw new Error("At least one ALLOWED_TARGET must be specified");
    }
    // Validate URLs
    for (const target of targets) {
      try {
        new URL(target);
      } catch {
        throw new Error(`Invalid ALLOWED_TARGET URL: ${target}`);
      }
    }
    return targets;
  }).default(COMMON_RPC_ENDPOINTS.join(",")),
  
  ALLOWED_HEADERS: z.string().transform(val =>
    val.split(',').map(header => header.trim().toLowerCase()).filter(Boolean)
  ).default(STANDARD_RPC_HEADERS.join(",")),
  
  MAX_INNER_BYTES: z.coerce.number()
    .min(1024, "MAX_INNER_BYTES must be at least 1KB")
    .max(10 * 1024 * 1024, "MAX_INNER_BYTES must not exceed 10MB")
    .default(524288), // 512KB
  
  // Upstream configuration
  UPSTREAM_CONNECT_TIMEOUT_MS: z.coerce.number()
    .min(100, "Connect timeout must be at least 100ms")
    .max(60000, "Connect timeout must not exceed 60s")
    .default(3000),
  UPSTREAM_TOTAL_TIMEOUT_MS: z.coerce.number()
    .min(1000, "Total timeout must be at least 1s")
    .max(300000, "Total timeout must not exceed 5 minutes")
    .default(15000),
  
  // Security configuration
  REQUIRE_TLS_UPSTREAM: z.string().transform(val => val.toLowerCase() === 'true').default('true'),
  ALLOW_REDIRECTS: z.string().transform(val => val.toLowerCase() === 'true').default('false'),
  
  // Anti-replay protection (RFC 9458 Section 6.5.1)
  DATE_SKEW_TOLERANCE_MS: z.coerce.number()
    .min(0, "Date skew tolerance cannot be negative")
    .max(3600000, "Date skew tolerance should not exceed 1 hour")
    .default(300000), // 5 minutes
  ENABLE_REPLAY_PROTECTION: z.string().transform(val => val.toLowerCase() === 'true').default('true'),
  
  // Logging configuration
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_INNER_CONTENT: z.string().transform(val => val.toLowerCase() === 'true').default('false'), // NEVER enable in production
});

/**
 * Parsed and validated environment configuration
 */
export type GatewayConfig = z.infer<typeof envSchema>;

/**
 * Load and validate environment configuration
 */
export function loadConfig(): GatewayConfig {
  try {
    // Load .env file first
    loadEnvFile();
    
    const config = envSchema.parse(process.env);
    
    // Security validation in production
    if (process.env.NODE_ENV === "production") {
      validateProductionConfig(config);
    }
    
    return config;
  } catch (error) {
    console.error("❌ Invalid environment configuration:");
    if (error instanceof z.ZodError) {
      for (const issue of error.issues) {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`);
      }
    } else {
      console.error(`  ${error}`);
    }
    console.error("");
    console.error("💡 Tips:");
    console.error("  - Copy env.example to .env and update values");
    console.error("  - Generate secure HPKE seed: bun scripts/generate-keys.ts");
    console.error("  - Check configuration documentation in README");
    process.exit(1);
  }
}

/**
 * Validate production-specific security requirements
 */
function validateProductionConfig(config: GatewayConfig): void {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Check for development values in production
  if (config.HPKE_SEED.includes('dev') || config.HPKE_SEED.length < 40) {
    errors.push("HPKE_SEED appears to be a development value");
  }
  
  if (config.LOG_INNER_CONTENT) {
    errors.push("LOG_INNER_CONTENT must be false in production");
  }
  
  if (config.LOG_LEVEL === "debug") {
    warnings.push("LOG_LEVEL=debug may impact performance in production");
  }
  
  if (!config.REQUIRE_TLS_UPSTREAM) {
    warnings.push("REQUIRE_TLS_UPSTREAM=false reduces security");
  }
  
  if (config.ALLOW_REDIRECTS) {
    warnings.push("ALLOW_REDIRECTS=true may enable tracking");
  }
  
  // Check for localhost in allowed targets
  const localhostTargets = config.ALLOWED_TARGETS.filter(target => 
    target.includes('localhost') || target.includes('127.0.0.1')
  );
  if (localhostTargets.length > 0) {
    warnings.push(`Localhost targets in production: ${localhostTargets.join(', ')}`);
  }
  
  // Display warnings
  if (warnings.length > 0) {
    console.warn("⚠️  Production Configuration Warnings:");
    for (const warning of warnings) {
      console.warn(`  ${warning}`);
    }
    console.warn("");
  }
  
  // Fail on errors
  if (errors.length > 0) {
    console.error("❌ Production Configuration Errors:");
    for (const error of errors) {
      console.error(`  ${error}`);
    }
    throw new Error("Production configuration validation failed");
  }
}

/**
 * Get configuration with defaults for development
 */
export function getDevConfig(): GatewayConfig {
  return {
    GATEWAY_PORT: 8788,
    HPKE_SEED: "dev-seed-32-bytes-base64url-encoded-here", // This should be properly generated
    HPKE_SUITE: "DHKEM_X25519_HKDF_SHA256+HKDF_SHA256+AES_128_GCM",
    ALLOWED_TARGETS: [
      "https://mainnet.infura.io",
      "https://eth.llamarpc.com", 
      "https://rpc.ankr.com/eth",
      "http://localhost:3001", // For testing
    ],
    ALLOWED_HEADERS: ["content-type", "accept", "authorization"],
    MAX_INNER_BYTES: 524288,
    UPSTREAM_CONNECT_TIMEOUT_MS: 3000,
    UPSTREAM_TOTAL_TIMEOUT_MS: 15000,
    REQUIRE_TLS_UPSTREAM: false, // Allow HTTP for local testing
    ALLOW_REDIRECTS: false,
    DATE_SKEW_TOLERANCE_MS: 300000, // 5 minutes
    ENABLE_REPLAY_PROTECTION: true,
    LOG_LEVEL: "debug",
    LOG_INNER_CONTENT: false, // Keep false even in dev for privacy
  };
}

/**
 * Validate HPKE seed format
 */
export function validateHpkeSeed(seed: string): Uint8Array {
  try {
    // For development, create a deterministic seed from the string
    const encoder = new TextEncoder();
    const seedBytes = encoder.encode(seed);
    
    // Pad or truncate to 32 bytes
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = seedBytes[i % seedBytes.length] || 0;
    }
    
    return result;
  } catch (error) {
    throw new Error(`Invalid HPKE seed format: ${error}`);
  }
}
