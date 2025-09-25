/**
 * OHTTP Fetch API Wrapper
 * 
 * Provides a fetch-like interface for making OHTTP requests
 */

import type { InnerRequest } from "@ohttp/shared";
import { CT_JSON } from "@ohttp/shared";
import { OhttpClient } from "./client.js";
import type { SendViaRelayOptions } from "./client.js";
import type { LoadKeyConfigOptions } from "./keys.js";
import { uint8ArrayToArrayBuffer } from "./utils.js";

/**
 * Request options for ohttpFetch
 */
export interface OhttpFetchOptions extends Omit<SendViaRelayOptions, 'fetchFn'> {
  /** HTTP method (default: GET) */
  method?: InnerRequest["method"];
  
  /** Request headers */
  headers?: Record<string, string>;
  
  /** Request body */
  body?: BodyInit | string;
  
  /** Padding bytes for size obfuscation */
  paddingBytes?: number;
  
  /** Custom fetch function for underlying requests */
  fetchFn?: typeof fetch;
}

/**
 * Fetch-like function for OHTTP requests
 * 
 * @param gatewayKeyConfigUrlOrBytes - Gateway key config URL or raw bytes
 * @param relayUrl - Relay server URL
 * @param targetUrl - Target URL to request
 * @param options - Request options
 * @returns Promise resolving to Response object
 */
export async function ohttpFetch(
  gatewayKeyConfigUrlOrBytes: string | Uint8Array,
  relayUrl: string,
  targetUrl: string,
  options: OhttpFetchOptions = {}
): Promise<Response> {
  const {
    method = "GET",
    headers = {},
    body,
    paddingBytes,
    signal,
    timeoutMs,
    fetchFn,
  } = options;
  
  // Create OHTTP client
  const client = typeof gatewayKeyConfigUrlOrBytes === "string"
    ? await OhttpClient.fromKeyConfigUrl(gatewayKeyConfigUrlOrBytes, { 
        signal, 
        timeoutMs,
        fetchFn 
      } as LoadKeyConfigOptions)
    : await OhttpClient.fromKeyConfigBytes(gatewayKeyConfigUrlOrBytes);
  
  // Convert body to Uint8Array
  let bodyBytes: Uint8Array | undefined;
  if (body !== undefined) {
    if (body instanceof Uint8Array) {
      bodyBytes = body;
    } else if (typeof body === "string") {
      bodyBytes = new TextEncoder().encode(body);
    } else if (body instanceof ArrayBuffer) {
      bodyBytes = new Uint8Array(body);
    } else if (ArrayBuffer.isView(body)) {
      bodyBytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    } else {
      // Handle other BodyInit types (Blob, FormData, etc.)
      const response = new Response(body);
      bodyBytes = new Uint8Array(await response.arrayBuffer());
    }
  }
  
  // Set default headers for JSON requests
  const requestHeaders = { ...headers };
  if (bodyBytes && !requestHeaders["content-type"]) {
    try {
      // Try to parse as JSON to detect JSON content
      const text = new TextDecoder().decode(bodyBytes);
      JSON.parse(text);
      requestHeaders["content-type"] = CT_JSON;
    } catch {
      // Not JSON, leave content-type unset
    }
  }
  
  if (!requestHeaders["accept"]) {
    requestHeaders["accept"] = CT_JSON;
  }
  
  // Build inner request
  const innerRequest: InnerRequest = {
    method,
    url: targetUrl,
    headers: requestHeaders,
    body: bodyBytes,
    paddingBytes,
  };
  
  // Send via relay
  const innerResponse = await client.sendViaRelay(relayUrl, innerRequest, {
    signal,
    timeoutMs,
    fetchFn,
  });
  
  // Convert to Response object
  return new Response(uint8ArrayToArrayBuffer(innerResponse.body), {
    status: innerResponse.status,
    headers: innerResponse.headers,
  });
}

/**
 * Convenience function for JSON-RPC requests
 */
export async function ohttpJsonRpc(
  gatewayKeyConfigUrlOrBytes: string | Uint8Array,
  relayUrl: string,
  targetRpcUrl: string,
  method: string,
  params?: unknown[],
  options: Omit<OhttpFetchOptions, 'method' | 'body' | 'headers'> & {
    headers?: Record<string, string>;
    id?: string | number;
  } = {}
): Promise<unknown> {
  const { id = Date.now(), headers = {}, ...fetchOptions } = options;
  
  // Build JSON-RPC request
  const jsonRpcRequest = {
    jsonrpc: "2.0" as const,
    method,
    params: params || [],
    id,
  };
  
  // Set JSON headers
  const requestHeaders = {
    "content-type": CT_JSON,
    "accept": CT_JSON,
    ...headers,
  };
  
  // Make request
  const response = await ohttpFetch(
    gatewayKeyConfigUrlOrBytes,
    relayUrl,
    targetRpcUrl,
    {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(jsonRpcRequest),
      ...fetchOptions,
    }
  );
  
  if (!response.ok) {
    throw new Error(`JSON-RPC request failed: ${response.status} ${response.statusText}`);
  }
  
  // Parse JSON-RPC response
  const jsonRpcResponse = await response.json();
  
  if (jsonRpcResponse.error) {
    throw new Error(`JSON-RPC error: ${jsonRpcResponse.error.message}`);
  }
  
  return jsonRpcResponse.result;
}
