/**
 * HTTP forwarding to upstream RPC endpoints
 */

import type { GatewayConfig } from "../env.js";
import { validateResponseSize } from "../policy/size.js";

/**
 * Forward HTTP request to upstream RPC endpoint
 */
export async function forwardToUpstream(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: Uint8Array,
  config: GatewayConfig
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.UPSTREAM_TOTAL_TIMEOUT_MS
  );
  
  try {
    // Prepare headers for upstream request
    const upstreamHeaders = prepareUpstreamHeaders(headers, url);
    
    // Make upstream request
      const response = await fetch(url, {
        method,
        headers: upstreamHeaders,
        body: body.length > 0 ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : undefined,
        signal: controller.signal,
        redirect: config.ALLOW_REDIRECTS ? "follow" : "manual",
      });
    
    clearTimeout(timeoutId);
    
    // Read response body
    const responseBody = new Uint8Array(await response.arrayBuffer());
    
    // Validate response size
    const sizeCheck = validateResponseSize(responseBody.length);
    if (!sizeCheck.valid) {
      throw new Error(sizeCheck.reason);
    }
    
    // Extract response headers
    const responseHeaders = extractResponseHeaders(response);
    
    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
    };
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error("Upstream request timeout");
      }
      
      throw new Error(`Upstream request failed: ${error.message}`);
    }
    
    throw new Error("Upstream request failed with unknown error");
  }
}

/**
 * Prepare headers for upstream request
 */
function prepareUpstreamHeaders(
  headers: Record<string, string>,
  targetUrl: string
): Record<string, string> {
  const upstreamHeaders: Record<string, string> = { ...headers };
  
  // Set Host header based on target URL
  try {
    const url = new URL(targetUrl);
    upstreamHeaders["host"] = url.host;
  } catch {
    // Invalid URL, let fetch handle it
  }
  
  // Remove hop-by-hop headers
  const hopByHopHeaders = [
    "connection",
    "keep-alive", 
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
  ];
  
  for (const header of hopByHopHeaders) {
    delete upstreamHeaders[header];
  }
  
  // Add standard headers if missing
  if (!upstreamHeaders["user-agent"]) {
    upstreamHeaders["user-agent"] = "OHTTP-Gateway/1.0";
  }
  
  if (!upstreamHeaders["accept"] && !upstreamHeaders["content-type"]) {
    upstreamHeaders["accept"] = "application/json";
  }
  
  return upstreamHeaders;
}

/**
 * Extract relevant response headers
 */
function extractResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  
  // Allow these response headers through
  const allowedHeaders = [
    "content-type",
    "content-length", 
    "cache-control",
    "expires",
    "last-modified",
    "etag",
    "vary",
    "access-control-allow-origin",
    "access-control-allow-methods",
    "access-control-allow-headers",
  ];
  
  for (const [name, value] of Array.from(response.headers.entries())) {
    const lowerName = name.toLowerCase();
    if (allowedHeaders.includes(lowerName)) {
      headers[lowerName] = value;
    }
  }
  
  return headers;
}

/**
 * Create timeout error response
 */
export function createTimeoutErrorResponse(): {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
} {
  const errorBody = {
    error: {
      message: "Gateway timeout waiting for upstream response",
      type: "gateway_timeout",
      status: 504,
    },
  };
  
  return {
    status: 504,
    headers: {
      "content-type": "application/json",
    },
    body: new TextEncoder().encode(JSON.stringify(errorBody)),
  };
}

/**
 * Create upstream error response
 */
export function createUpstreamErrorResponse(
  error: string,
  status: number = 502
): {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
} {
  const errorBody = {
    error: {
      message: `Upstream error: ${error}`,
      type: "upstream_error",
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
