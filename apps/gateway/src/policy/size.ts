/**
 * Size validation and limits for OHTTP Gateway
 */

import type { GatewayConfig } from "../env.js";

/**
 * Size limits for different components
 */
export const SIZE_LIMITS = {
  MAX_URL_LENGTH: 2048,
  MAX_HEADER_NAME_LENGTH: 256,
  MAX_HEADER_VALUE_LENGTH: 8192,
  MAX_TOTAL_HEADERS_SIZE: 32768, // 32KB
  MAX_REQUEST_LINE_LENGTH: 8192,
} as const;

/**
 * Validate request size constraints
 */
export function validateRequestSize(
  url: string,
  headers: Record<string, string>,
  bodySize: number,
  config: GatewayConfig
): { valid: boolean; reason?: string } {
  // Check URL length
  if (url.length > SIZE_LIMITS.MAX_URL_LENGTH) {
    return {
      valid: false,
      reason: `URL too long: ${url.length} > ${SIZE_LIMITS.MAX_URL_LENGTH}`,
    };
  }
  
  // Check body size against configured limit
  if (bodySize > config.MAX_INNER_BYTES) {
    return {
      valid: false,
      reason: `Body too large: ${bodySize} > ${config.MAX_INNER_BYTES}`,
    };
  }
  
  // Check individual header sizes and total
  let totalHeadersSize = 0;
  
  for (const [name, value] of Object.entries(headers)) {
    if (name.length > SIZE_LIMITS.MAX_HEADER_NAME_LENGTH) {
      return {
        valid: false,
        reason: `Header name too long: ${name.length} > ${SIZE_LIMITS.MAX_HEADER_NAME_LENGTH}`,
      };
    }
    
    if (value.length > SIZE_LIMITS.MAX_HEADER_VALUE_LENGTH) {
      return {
        valid: false,
        reason: `Header value too long: ${value.length} > ${SIZE_LIMITS.MAX_HEADER_VALUE_LENGTH}`,
      };
    }
    
    totalHeadersSize += name.length + value.length + 4; // +4 for ": " and "\r\n"
  }
  
  if (totalHeadersSize > SIZE_LIMITS.MAX_TOTAL_HEADERS_SIZE) {
    return {
      valid: false,
      reason: `Total headers too large: ${totalHeadersSize} > ${SIZE_LIMITS.MAX_TOTAL_HEADERS_SIZE}`,
    };
  }
  
  return { valid: true };
}

/**
 * Calculate approximate wire size of HTTP request
 */
export function calculateRequestWireSize(
  method: string,
  url: string,
  headers: Record<string, string>,
  bodySize: number
): number {
  // Request line: "METHOD /path HTTP/1.1\r\n"
  const parsedUrl = new URL(url);
  const requestLine = `${method} ${parsedUrl.pathname}${parsedUrl.search} HTTP/1.1\r\n`;
  
  // Headers: "Name: Value\r\n"
  let headersSize = 0;
  for (const [name, value] of Object.entries(headers)) {
    headersSize += name.length + value.length + 4; // ": " + "\r\n"
  }
  
  // Empty line between headers and body: "\r\n"
  const emptyLine = 2;
  
  return requestLine.length + headersSize + emptyLine + bodySize;
}

/**
 * Estimate response overhead for size planning
 */
export function estimateResponseOverhead(
  requestSize: number,
  encryptionOverhead: number = 64 // Approximate HPKE overhead
): number {
  // bHTTP framing overhead (rough estimate)
  const bhttpOverhead = Math.ceil(requestSize / 127) + 10; // Varint encoding + structure
  
  // OHTTP encapsulation overhead
  const ohttpOverhead = encryptionOverhead;
  
  return bhttpOverhead + ohttpOverhead;
}

/**
 * Check if response would exceed reasonable limits
 */
export function validateResponseSize(
  responseSize: number,
  maxResponseSize: number = 10 * 1024 * 1024 // 10MB default
): { valid: boolean; reason?: string } {
  if (responseSize > maxResponseSize) {
    return {
      valid: false,
      reason: `Response too large: ${responseSize} > ${maxResponseSize}`,
    };
  }
  
  return { valid: true };
}
