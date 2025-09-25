/**
 * bHTTP processing for OHTTP Gateway
 */

import type { InnerRequest, InnerResponse } from "@ohttp/shared";
import { decodeRequest, encodeResponse } from "@ohttp/core";

/**
 * Process bHTTP request and convert to standard HTTP request parameters
 */
export function processBhttpRequest(bhttpData: Uint8Array): {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Uint8Array;
} {
  try {
    const innerRequest = decodeRequest(bhttpData);
    
    return {
      method: innerRequest.method,
      url: innerRequest.url,
      headers: innerRequest.headers || {},
      body: innerRequest.body || new Uint8Array(0),
    };
    
  } catch (error) {
    throw new Error(`Failed to process bHTTP request: ${error}`);
  }
}

/**
 * Create bHTTP response from HTTP response data
 */
export function createBhttpResponse(
  status: number,
  headers: Record<string, string>,
  body: Uint8Array
): Uint8Array {
  try {
    const innerResponse: InnerResponse = {
      status,
      headers,
      body,
    };
    
    return encodeResponse(innerResponse);
    
  } catch (error) {
    throw new Error(`Failed to create bHTTP response: ${error}`);
  }
}

/**
 * Create error response in bHTTP format
 */
export function createBhttpErrorResponse(
  status: number,
  errorMessage: string,
  errorType?: string
): Uint8Array {
  const errorBody = {
    error: {
      message: errorMessage,
      type: errorType || "gateway_error",
      status,
    },
  };
  
  const headers = {
    "content-type": "application/json",
  };
  
  const body = new TextEncoder().encode(JSON.stringify(errorBody));
  
  return createBhttpResponse(status, headers, body);
}

/**
 * Validate bHTTP request structure
 */
export function validateBhttpRequest(bhttpData: Uint8Array): {
  valid: boolean;
  error?: string;
} {
  try {
    // Try to decode the request
    const request = decodeRequest(bhttpData);
    
    // Basic validation
    if (!request.method || !request.url) {
      return {
        valid: false,
        error: "Missing required fields (method or URL)",
      };
    }
    
    // Validate URL format
    try {
      new URL(request.url);
    } catch {
      return {
        valid: false,
        error: "Invalid URL format",
      };
    }
    
    // Validate method
    const allowedMethods = ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"];
    if (!allowedMethods.includes(request.method.toUpperCase())) {
      return {
        valid: false,
        error: `Unsupported HTTP method: ${request.method}`,
      };
    }
    
    return { valid: true };
    
  } catch (error) {
    return {
      valid: false,
      error: `Invalid bHTTP format: ${error}`,
    };
  }
}

/**
 * Extract content type from bHTTP request headers
 */
export function extractContentType(headers: Record<string, string>): string | null {
  return headers["content-type"] || headers["Content-Type"] || null;
}

/**
 * Check if bHTTP request is a JSON-RPC request
 */
export function isJsonRpcRequest(
  method: string,
  headers: Record<string, string>,
  body: Uint8Array
): boolean {
  // Must be POST
  if (method.toUpperCase() !== "POST") {
    return false;
  }
  
  // Must have JSON content type
  const contentType = extractContentType(headers);
  if (!contentType || !contentType.includes("application/json")) {
    return false;
  }
  
  // Try to parse body as JSON-RPC
  try {
    const text = new TextDecoder().decode(body);
    const parsed = JSON.parse(text);
    
    return (
      parsed.jsonrpc === "2.0" &&
      typeof parsed.method === "string" &&
      (parsed.id !== undefined)
    );
  } catch {
    return false;
  }
}

/**
 * Parse JSON-RPC request from bHTTP body
 */
export function parseJsonRpcRequest(body: Uint8Array): {
  method: string;
  params?: unknown[];
  id: string | number | null;
} {
  try {
    const text = new TextDecoder().decode(body);
    const parsed = JSON.parse(text);
    
    if (parsed.jsonrpc !== "2.0") {
      throw new Error("Not a JSON-RPC 2.0 request");
    }
    
    return {
      method: parsed.method,
      params: parsed.params,
      id: parsed.id,
    };
    
  } catch (error) {
    throw new Error(`Failed to parse JSON-RPC request: ${error}`);
  }
}
