/**
 * Binary HTTP (bHTTP) encoding and decoding
 * 
 * Implements RFC 9292 binary HTTP message format for compact HTTP representation.
 * Supports known-length mode which is perfect for JSON-RPC requests/responses.
 */

import type { InnerRequest, InnerResponse } from "@ohttp/shared";
import { CT_JSON } from "@ohttp/shared";
import {
  encodeVarint,
  decodeVarint,
  encodeLengthPrefixed,
  decodeLengthPrefixed,
  concatBytes,
  stringToBytes,
  bytesToString,
} from "./bytes.js";

/**
 * HTTP method to numeric identifier mapping (RFC 9292)
 */
const METHOD_CODES: Record<string, number> = {
  "GET": 0,
  "POST": 1,
  "PUT": 2,
  "DELETE": 3,
  "HEAD": 4,
  "OPTIONS": 5,
  "PATCH": 6,
  "CONNECT": 7,
  "TRACE": 8,
} as const;

/**
 * Reverse mapping for method codes
 */
const CODE_METHODS: Record<number, string> = Object.fromEntries(
  Object.entries(METHOD_CODES).map(([method, code]) => [code, method])
);

/**
 * Encode an HTTP request as bHTTP (known-length mode)
 * 
 * Format:
 * - Framing indicator (1 byte): 0 for known-length
 * - Method (varint)
 * - Scheme (varint + string) 
 * - Authority (varint + string)
 * - Path (varint + string)
 * - Headers (varint count + header fields)
 * - Body (varint length + data)
 */
export function encodeRequest(request: InnerRequest): Uint8Array {
  const { method, url, headers = {}, body = new Uint8Array(0), paddingBytes = 0 } = request;
  
  // Parse URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  
  // Validate method
  const methodCode = METHOD_CODES[method.toUpperCase()];
  if (methodCode === undefined) {
    throw new Error(`Unsupported HTTP method: ${method}`);
  }
  
  const parts: Uint8Array[] = [];
  
  // Framing indicator (0 = known-length)
  parts.push(new Uint8Array([0]));
  
  // Method
  parts.push(encodeVarint(methodCode));
  
  // Scheme
  parts.push(encodeLengthPrefixed(stringToBytes(parsedUrl.protocol.slice(0, -1))));
  
  // Authority (host + port)
  const authority = parsedUrl.port 
    ? `${parsedUrl.hostname}:${parsedUrl.port}`
    : parsedUrl.hostname;
  parts.push(encodeLengthPrefixed(stringToBytes(authority)));
  
  // Path (includes query)
  const path = parsedUrl.pathname + parsedUrl.search;
  parts.push(encodeLengthPrefixed(stringToBytes(path)));
  
  // Headers
  const headerEntries = Object.entries(headers);
  parts.push(encodeVarint(headerEntries.length));
  
  for (const [name, value] of headerEntries) {
    // Header name (lowercase)
    parts.push(encodeLengthPrefixed(stringToBytes(name.toLowerCase())));
    // Header value
    parts.push(encodeLengthPrefixed(stringToBytes(value)));
  }
  
  // Body (with optional padding)
  let bodyWithPadding = body;
  if (paddingBytes > 0) {
    const padding = crypto.getRandomValues(new Uint8Array(paddingBytes));
    bodyWithPadding = concatBytes(body, padding);
  }
  parts.push(encodeLengthPrefixed(bodyWithPadding));
  
  return concatBytes(...parts);
}

/**
 * Decode a bHTTP response to HTTP response structure
 * 
 * Format:
 * - Framing indicator (1 byte): 0 for known-length
 * - Status code (varint)
 * - Headers (varint count + header fields)
 * - Body (varint length + data)
 */
export function decodeResponse(bytes: Uint8Array): InnerResponse {
  let offset = 0;
  
  // Check framing indicator
  if (bytes.length === 0 || bytes[0] !== 0) {
    throw new Error("Invalid bHTTP response: expected known-length framing");
  }
  offset += 1;
  
  // Status code
  const { value: status, consumed: statusBytes } = decodeVarint(bytes, offset);
  offset += statusBytes;
  
  // Headers
  const { value: headerCount, consumed: headerCountBytes } = decodeVarint(bytes, offset);
  offset += headerCountBytes;
  
  const headers: Record<string, string> = {};
  for (let i = 0; i < headerCount; i++) {
    // Header name
    const { data: nameBytes, consumed: nameConsumed } = decodeLengthPrefixed(bytes, offset);
    offset += nameConsumed;
    const name = bytesToString(nameBytes);
    
    // Header value
    const { data: valueBytes, consumed: valueConsumed } = decodeLengthPrefixed(bytes, offset);
    offset += valueConsumed;
    const value = bytesToString(valueBytes);
    
    headers[name.toLowerCase()] = value;
  }
  
  // Body
  const { data: body, consumed: bodyConsumed } = decodeLengthPrefixed(bytes, offset);
  offset += bodyConsumed;
  
  if (offset !== bytes.length) {
    throw new Error("Invalid bHTTP response: extra data after body");
  }
  
  return {
    status,
    headers,
    body,
  };
}

/**
 * Decode a bHTTP request (for gateway processing)
 */
export function decodeRequest(bytes: Uint8Array): InnerRequest {
  let offset = 0;
  
  // Check framing indicator
  if (bytes.length === 0 || bytes[0] !== 0) {
    throw new Error("Invalid bHTTP request: expected known-length framing");
  }
  offset += 1;
  
  // Method
  const { value: methodCode, consumed: methodBytes } = decodeVarint(bytes, offset);
  offset += methodBytes;
  
  const method = CODE_METHODS[methodCode];
  if (!method) {
    throw new Error(`Unknown HTTP method code: ${methodCode}`);
  }
  
  // Scheme
  const { data: schemeBytes, consumed: schemeConsumed } = decodeLengthPrefixed(bytes, offset);
  offset += schemeConsumed;
  const scheme = bytesToString(schemeBytes);
  
  // Authority
  const { data: authorityBytes, consumed: authorityConsumed } = decodeLengthPrefixed(bytes, offset);
  offset += authorityConsumed;
  const authority = bytesToString(authorityBytes);
  
  // Path
  const { data: pathBytes, consumed: pathConsumed } = decodeLengthPrefixed(bytes, offset);
  offset += pathConsumed;
  const path = bytesToString(pathBytes);
  
  // Reconstruct URL
  const url = `${scheme}://${authority}${path}`;
  
  // Headers
  const { value: headerCount, consumed: headerCountBytes } = decodeVarint(bytes, offset);
  offset += headerCountBytes;
  
  const headers: Record<string, string> = {};
  for (let i = 0; i < headerCount; i++) {
    // Header name
    const { data: nameBytes, consumed: nameConsumed } = decodeLengthPrefixed(bytes, offset);
    offset += nameConsumed;
    const name = bytesToString(nameBytes);
    
    // Header value
    const { data: valueBytes, consumed: valueConsumed } = decodeLengthPrefixed(bytes, offset);
    offset += valueConsumed;
    const value = bytesToString(valueBytes);
    
    headers[name.toLowerCase()] = value;
  }
  
  // Body
  const { data: body, consumed: bodyConsumed } = decodeLengthPrefixed(bytes, offset);
  offset += bodyConsumed;
  
  if (offset !== bytes.length) {
    throw new Error("Invalid bHTTP request: extra data after body");
  }
  
  return {
    method: method as InnerRequest["method"],
    url,
    headers,
    body,
  };
}

/**
 * Encode an HTTP response as bHTTP
 */
export function encodeResponse(response: InnerResponse): Uint8Array {
  const { status, headers = {}, body = new Uint8Array(0) } = response;
  
  const parts: Uint8Array[] = [];
  
  // Framing indicator (0 = known-length)
  parts.push(new Uint8Array([0]));
  
  // Status code
  parts.push(encodeVarint(status));
  
  // Headers
  const headerEntries = Object.entries(headers);
  parts.push(encodeVarint(headerEntries.length));
  
  for (const [name, value] of headerEntries) {
    // Header name (lowercase)
    parts.push(encodeLengthPrefixed(stringToBytes(name.toLowerCase())));
    // Header value
    parts.push(encodeLengthPrefixed(stringToBytes(value)));
  }
  
  // Body
  parts.push(encodeLengthPrefixed(body));
  
  return concatBytes(...parts);
}

/**
 * Create a JSON-RPC bHTTP request
 */
export function createJsonRpcRequest(
  targetUrl: string,
  jsonRpcBody: object,
  options: {
    headers?: Record<string, string>;
    paddingBytes?: number;
  } = {}
): Uint8Array {
  const { headers = {}, paddingBytes } = options;
  
  const defaultHeaders = {
    "content-type": CT_JSON,
    "accept": CT_JSON,
  };
  
  const request: InnerRequest = {
    method: "POST",
    url: targetUrl,
    headers: { ...defaultHeaders, ...headers },
    body: new TextEncoder().encode(JSON.stringify(jsonRpcBody)),
    paddingBytes,
  };
  
  return encodeRequest(request);
}

/**
 * Parse JSON from bHTTP response body
 */
export function parseJsonResponse(response: InnerResponse): unknown {
  if (response.body.length === 0) {
    throw new Error("Empty response body");
  }
  
  const contentType = response.headers["content-type"] || "";
  if (!contentType.includes("json")) {
    throw new Error(`Expected JSON response, got: ${contentType}`);
  }
  
  const text = bytesToString(response.body);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in response: ${error}`);
  }
}
