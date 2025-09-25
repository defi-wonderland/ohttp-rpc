/**
 * CORS handling for OHTTP Relay
 */

import type { RelayConfig } from "./env.js";

/**
 * Check if origin is allowed (internal helper)
 */
function isOriginAllowedInternal(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) {
    return false;
  }
  
  // Handle wildcard
  if (allowedOrigins.includes("*")) {
    return true;
  }
  
  return allowedOrigins.includes(origin);
}

/**
 * Check if origin is allowed (public API with config)
 */
export function isOriginAllowed(origin: string | null, configOrOrigins: RelayConfig | string[]): boolean {
  // Handle both config object and array of origins for backward compatibility
  const allowedOrigins = Array.isArray(configOrOrigins) 
    ? configOrOrigins 
    : configOrOrigins.ALLOWED_ORIGINS;
  
  return isOriginAllowedInternal(origin, allowedOrigins);
}

/**
 * Create CORS headers for preflight response
 */
export function createCorsHeaders(
  origin: string | null,
  config: RelayConfig
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
  
  if (origin && isOriginAllowed(origin, config)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  
  return headers;
}

/**
 * Handle CORS preflight request
 */
export function handlePreflight(request: Request, config: RelayConfig): Response {
  const origin = request.headers.get("origin");
  
  if (!isOriginAllowed(origin, config.ALLOWED_ORIGINS)) {
    return new Response("CORS: Origin not allowed", { status: 403 });
  }
  
  const corsHeaders = createCorsHeaders(origin, config);
  
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Add CORS headers to response
 */
export function addCorsHeaders(
  response: Response, 
  origin: string | null, 
  config: RelayConfig
): Response {
  if (!isOriginAllowed(origin, config)) {
    return response;
  }
  
  const corsHeaders = createCorsHeaders(origin, config);
  
  // Create new response with CORS headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(Array.from((response.headers as any).entries())),
      ...corsHeaders,
    },
  });
  
  return newResponse;
}
