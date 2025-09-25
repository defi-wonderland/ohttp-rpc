/**
 * Environment configuration for OHTTP Relay
 */

import { z } from "zod";
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
 * Validate CORS origins configuration
 */
function validateCorsOrigins(origins: string): string[] {
  const originList = origins.split(',').map(origin => origin.trim()).filter(Boolean);
  
  if (originList.length === 0) {
    throw new Error("At least one ALLOWED_ORIGIN must be specified");
  }
  
  // Validate each origin
  for (const origin of originList) {
    if (origin === "*") {
      continue; // Wildcard is valid but not recommended for production
    }
    
    try {
      new URL(origin);
    } catch {
      throw new Error(`Invalid ALLOWED_ORIGIN URL: ${origin}`);
    }
  }
  
  return originList;
}

/**
 * Environment variable schema
 */
const envSchema = z.object({
  // Server configuration
  RELAY_PORT: z.coerce.number()
    .min(1, "Port must be positive")
    .max(65535, "Port must be valid")
    .default(8787),
  
  // Gateway configuration
  GATEWAY_URL: z.string()
    .url("GATEWAY_URL must be a valid URL")
    .refine(url => url.startsWith('https://') || url.startsWith('http://'), {
      message: "GATEWAY_URL must start with http:// or https://"
    }),
  
  // CORS configuration
  ALLOWED_ORIGINS: z.string()
    .transform(validateCorsOrigins)
    .default("*"),
  
  // Security limits
  MAX_BODY_BYTES: z.coerce.number()
    .min(1024, "MAX_BODY_BYTES must be at least 1KB")
    .max(100 * 1024 * 1024, "MAX_BODY_BYTES must not exceed 100MB")
    .default(1048576), // 1MB
  
  // Timeout configuration
  CONNECT_TIMEOUT_MS: z.coerce.number()
    .min(100, "Connect timeout must be at least 100ms")
    .max(60000, "Connect timeout must not exceed 60s")
    .default(3000),
  TOTAL_TIMEOUT_MS: z.coerce.number()
    .min(1000, "Total timeout must be at least 1s")
    .max(300000, "Total timeout must not exceed 5 minutes")
    .default(15000),
  
  // Rate limiting (requests per minute per IP)
  RATE_LIMIT_RPM: z.coerce.number()
    .min(1, "Rate limit must be at least 1 request per minute")
    .max(10000, "Rate limit must not exceed 10000 requests per minute")
    .default(60),
  
  // Logging level
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

/**
 * Parsed and validated environment configuration
 */
export type RelayConfig = z.infer<typeof envSchema>;

/**
 * Load and validate environment configuration
 */
export function loadConfig(): RelayConfig {
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
    console.error("  - Ensure GATEWAY_URL is set correctly");
    console.error("  - Check configuration documentation in README");
    process.exit(1);
  }
}

/**
 * Validate production-specific security requirements
 */
function validateProductionConfig(config: RelayConfig): void {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Check CORS configuration
  if (config.ALLOWED_ORIGINS.includes("*")) {
    warnings.push("Wildcard CORS origin (*) allows all domains");
  }
  
  // Check for localhost origins in production
  const localhostOrigins = config.ALLOWED_ORIGINS.filter(origin => 
    origin.includes('localhost') || origin.includes('127.0.0.1')
  );
  if (localhostOrigins.length > 0) {
    warnings.push(`Localhost origins in production: ${localhostOrigins.join(', ')}`);
  }
  
  // Check gateway URL security
  if (!config.GATEWAY_URL.startsWith('https://')) {
    if (config.GATEWAY_URL.includes('localhost') || config.GATEWAY_URL.includes('127.0.0.1')) {
      warnings.push("Gateway URL uses HTTP (localhost detected)");
    } else {
      errors.push("Gateway URL must use HTTPS in production");
    }
  }
  
  // Check rate limiting
  if (config.RATE_LIMIT_RPM > 1000) {
    warnings.push("High rate limit may enable abuse");
  }
  
  // Check logging level
  if (config.LOG_LEVEL === "debug") {
    warnings.push("LOG_LEVEL=debug may impact performance in production");
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
export function getDevConfig(): RelayConfig {
  return {
    RELAY_PORT: 8787,
    GATEWAY_URL: "http://localhost:8788/gateway",
    ALLOWED_ORIGINS: ["http://localhost:3000", "http://localhost:5173"],
    MAX_BODY_BYTES: 1048576,
    CONNECT_TIMEOUT_MS: 3000,
    TOTAL_TIMEOUT_MS: 15000,
    RATE_LIMIT_RPM: 60,
    LOG_LEVEL: "debug",
  };
}
