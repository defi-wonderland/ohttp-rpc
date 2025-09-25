/**
 * Environment configuration for OHTTP Relay
 */

import { z } from "zod";

/**
 * Environment variable schema
 */
const envSchema = z.object({
  // Server configuration
  RELAY_PORT: z.coerce.number().default(8787),
  
  // Gateway configuration
  GATEWAY_URL: z.string().url(),
  
  // CORS configuration
  ALLOWED_ORIGINS: z.string().transform(val => 
    val.split(',').map(origin => origin.trim())
  ).default("*"),
  
  // Security limits
  MAX_BODY_BYTES: z.coerce.number().default(1048576), // 1MB
  
  // Timeout configuration
  CONNECT_TIMEOUT_MS: z.coerce.number().default(3000),
  TOTAL_TIMEOUT_MS: z.coerce.number().default(15000),
  
  // Rate limiting (requests per minute per IP)
  RATE_LIMIT_RPM: z.coerce.number().default(60),
  
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
    return envSchema.parse(process.env);
  } catch (error) {
    console.error("Invalid environment configuration:", error);
    process.exit(1);
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
