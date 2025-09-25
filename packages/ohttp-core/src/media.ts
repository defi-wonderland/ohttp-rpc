/**
 * Media type utilities for OHTTP protocol
 * 
 * Handles Content-Type validation and manipulation for OHTTP messages
 */

import {
  CT_OHTTP_REQ,
  CT_OHTTP_RES,
  CT_OHTTP_KEYS,
  CT_BHTTP,
  CT_JSON,
  CT_PROBLEM_JSON,
} from "@ohttp/shared";

/**
 * Assert that headers contain the expected Content-Type
 * Throws an error if the content type doesn't match
 */
export function assertContentType(headers: Headers, expected: string): void {
  const contentType = headers.get("content-type");
  
  if (!contentType) {
    throw new Error(`Missing Content-Type header, expected: ${expected}`);
  }
  
  // Handle media type with parameters (e.g., "application/json; charset=utf-8")
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  const expectedType = expected.toLowerCase();
  
  if (mediaType !== expectedType) {
    throw new Error(
      `Invalid Content-Type: ${contentType}, expected: ${expected}`
    );
  }
}

/**
 * Set Content-Type header on a Headers object or init
 */
export function setContentType(
  headers: HeadersInit | Headers,
  value: string
): HeadersInit {
  if (headers instanceof Headers) {
    headers.set("content-type", value);
    return headers;
  }
  
  if (Array.isArray(headers)) {
    // Remove existing content-type entries
    const filtered = headers.filter(([key]) => 
      key.toLowerCase() !== "content-type"
    );
    filtered.push(["content-type", value]);
    return filtered;
  }
  
  if (typeof headers === "object" && headers !== null) {
    return {
      ...headers,
      "content-type": value,
    };
  }
  
  return { "content-type": value };
}

/**
 * Create Headers with Content-Type set
 */
export function createHeaders(contentType: string, additional?: HeadersInit): Headers {
  const headers = new Headers(additional);
  headers.set("content-type", contentType);
  return headers;
}

/**
 * Validate that a content type is one of the OHTTP protocol types
 */
export function isOhttpMediaType(contentType: string): boolean {
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  
  return [
    CT_OHTTP_REQ,
    CT_OHTTP_RES,
    CT_OHTTP_KEYS,
    CT_BHTTP,
  ].includes(mediaType);
}

/**
 * Check if content type indicates JSON data
 */
export function isJsonMediaType(contentType: string): boolean {
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  
  return [
    CT_JSON,
    CT_PROBLEM_JSON,
  ].includes(mediaType) || mediaType.endsWith('+json');
}

/**
 * Extract charset from Content-Type header
 */
export function extractCharset(contentType: string): string | null {
  const charsetMatch = contentType.match(/charset=([^;,\s]+)/i);
  return charsetMatch ? charsetMatch[1] : null;
}

/**
 * Normalize Content-Type header by removing extra whitespace and lowercasing
 */
export function normalizeContentType(contentType: string): string {
  return contentType
    .split(';')
    .map((part, index) => {
      const trimmed = part.trim();
      return index === 0 ? trimmed.toLowerCase() : trimmed;
    })
    .join('; ');
}

/**
 * Media type constants for easy access
 */
export const MediaTypes = {
  OHTTP_REQ: CT_OHTTP_REQ,
  OHTTP_RES: CT_OHTTP_RES,
  OHTTP_KEYS: CT_OHTTP_KEYS,
  BHTTP: CT_BHTTP,
  JSON: CT_JSON,
  PROBLEM_JSON: CT_PROBLEM_JSON,
} as const;

/**
 * Create problem+json response for OHTTP errors
 */
export function createProblemResponse(
  type: string,
  title: string,
  status: number,
  detail?: string,
  instance?: string
): { headers: Headers; body: Uint8Array } {
  const problem = {
    type,
    title,
    status,
    ...(detail && { detail }),
    ...(instance && { instance }),
  };
  
  const headers = createHeaders(CT_PROBLEM_JSON);
  const body = new TextEncoder().encode(JSON.stringify(problem));
  
  return { headers, body };
}
