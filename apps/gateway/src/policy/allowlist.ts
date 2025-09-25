/**
 * Target and header allowlist policy enforcement
 */

import type { GatewayConfig } from "../env.js";

/**
 * Check if target URL is allowed
 */
export function isTargetAllowed(url: string, config: GatewayConfig): boolean {
  try {
    const targetUrl = new URL(url);
    
    // Security: Block dangerous protocols
    const allowedProtocols = ["http:", "https:"];
    if (!allowedProtocols.includes(targetUrl.protocol)) {
      return false;
    }
    
    // Security: Block path traversal attempts and sensitive paths
    const normalizedPath = targetUrl.pathname.replace(/\/+/g, "/"); // Normalize multiple slashes
    
    // Decode URL-encoded characters to catch encoded path traversal
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(normalizedPath);
    } catch {
      // Invalid encoding, reject
      return false;
    }
    
    // Check for path traversal in both encoded and decoded forms
    const pathsToCheck = [normalizedPath, decodedPath];
    for (const path of pathsToCheck) {
      if (path.includes("/../") || path.includes("..\\") || 
          path.endsWith("/..") || path === ".." ||
          path.includes("%2e%2e") || path.includes("%2E%2E")) {
        return false;
      }
    }
    
    // Security: Block access to sensitive system paths (even on allowed origins)
    const sensitivePaths = ["/etc/", "/proc/", "/sys/", "/dev/", "/var/", "/root/", "/home/", "/usr/bin/", "/bin/"];
    for (const path of pathsToCheck) {
      const lowerPath = path.toLowerCase();
      if (sensitivePaths.some(sensitivePrefix => lowerPath.startsWith(sensitivePrefix))) {
        return false;
      }
    }
    
    // Security: Block suspicious domains (subdomain confusion attacks)
    const hostname = targetUrl.hostname.toLowerCase();
    if (hostname.includes("@") || hostname.includes(" ")) {
      return false;
    }
    
    // Enforce HTTPS requirement
    if (config.REQUIRE_TLS_UPSTREAM && targetUrl.protocol !== "https:") {
      return false;
    }
    
    // Check against allowed targets
    const origin = `${targetUrl.protocol}//${targetUrl.host}`;
    
    return config.ALLOWED_TARGETS.some(allowedTarget => {
      // Exact match
      if (allowedTarget === origin) {
        return true;
      }
      
      // Prefix match (for subdomain wildcards)
      if (allowedTarget.endsWith("*")) {
        const prefix = allowedTarget.slice(0, -1);
        return origin.startsWith(prefix);
      }
      
      return false;
    });
    
  } catch (error) {
    // Invalid URL
    return false;
  }
}

/**
 * Filter headers to only allowed ones
 */
export function filterHeaders(
  headers: Record<string, string>,
  config: GatewayConfig
): Record<string, string> {
  const filtered: Record<string, string> = {};
  
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    
    if (config.ALLOWED_HEADERS.includes(lowerName)) {
      filtered[lowerName] = value;
    }
  }
  
  return filtered;
}

/**
 * Validate inner request against policy
 */
export function validateInnerRequest(
  url: string,
  headers: Record<string, string>,
  bodySize: number,
  config: GatewayConfig
): { allowed: boolean; reason?: string } {
  // Check target allowlist
  if (!isTargetAllowed(url, config)) {
    return { 
      allowed: false, 
      reason: "Target not in allowlist" 
    };
  }
  
  // Check body size
  if (bodySize > config.MAX_INNER_BYTES) {
    return { 
      allowed: false, 
      reason: `Request too large: ${bodySize} > ${config.MAX_INNER_BYTES}` 
    };
  }
  
  // Check for forbidden headers that could deanonymize
  const forbiddenHeaders = [
    "cookie",
    "x-forwarded-for", 
    "x-real-ip",
    "x-client-ip",
    "cf-connecting-ip",
    "user-agent",
    "referer",
    "origin",
  ];
  
  for (const headerName of Object.keys(headers)) {
    if (forbiddenHeaders.includes(headerName.toLowerCase())) {
      return {
        allowed: false,
        reason: `Forbidden header: ${headerName}`
      };
    }
  }
  
  return { allowed: true };
}

/**
 * Create policy error response
 */
export function createPolicyErrorResponse(
  reason: string,
  status: number = 403
): { status: number; headers: Record<string, string>; body: Uint8Array } {
  const errorBody = {
    error: {
      type: "policy_violation",
      message: reason,
      status,
    },
  };
  
  return {
    status,
    headers: {
      "content-type": "application/json",
    },
    body: new TextEncoder().encode(JSON.stringify(errorBody)),
  };
}
