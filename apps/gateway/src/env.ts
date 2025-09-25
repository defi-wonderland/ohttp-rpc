/**
 * Environment configuration for OHTTP Gateway
 */

import { z } from "zod";
import { COMMON_RPC_ENDPOINTS, STANDARD_RPC_HEADERS } from "@ohttp/shared";

/**
 * Environment variable schema
 */
const envSchema = z.object({
  // Server configuration
  GATEWAY_PORT: z.coerce.number().default(8788),
  
  // HPKE configuration
  HPKE_SEED: z.string().min(1, "HPKE_SEED is required"),
  HPKE_SUITE: z.string().default("DHKEM_X25519_HKDF_SHA256+HKDF_SHA256+AES_128_GCM"),
  
  // Policy configuration
  ALLOWED_TARGETS: z.string().transform(val => 
    val.split(',').map(target => target.trim())
  ).default(COMMON_RPC_ENDPOINTS.join(",")),
  
  ALLOWED_HEADERS: z.string().transform(val =>
    val.split(',').map(header => header.trim().toLowerCase())
  ).default(STANDARD_RPC_HEADERS.join(",")),
  
  MAX_INNER_BYTES: z.coerce.number().default(524288), // 512KB
  
  // Upstream configuration
  UPSTREAM_CONNECT_TIMEOUT_MS: z.coerce.number().default(3000),
  UPSTREAM_TOTAL_TIMEOUT_MS: z.coerce.number().default(15000),
  
  // Security configuration
  REQUIRE_TLS_UPSTREAM: z.coerce.boolean().default(true),
  ALLOW_REDIRECTS: z.coerce.boolean().default(false),
  
  // Anti-replay protection (RFC 9458 Section 6.5.1)
  DATE_SKEW_TOLERANCE_MS: z.coerce.number().default(300000), // 5 minutes
  ENABLE_REPLAY_PROTECTION: z.coerce.boolean().default(true),
  
  // Logging configuration
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_INNER_CONTENT: z.coerce.boolean().default(false), // NEVER enable in production
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
    return envSchema.parse(process.env);
  } catch (error) {
    console.error("Invalid environment configuration:", error);
    process.exit(1);
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
