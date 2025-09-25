/**
 * bHTTP encoding/decoding tests
 */

import { test, expect } from "bun:test";
import { encodeRequest, decodeRequest, encodeResponse, decodeResponse } from "@ohttp/core";
import type { InnerRequest, InnerResponse } from "@ohttp/shared";

test("bHTTP request encoding/decoding", () => {
  const request: InnerRequest = {
    method: "POST",
    url: "https://example.com/api/test",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
    },
    body: new TextEncoder().encode('{"test": "data"}'),
  };
  
  // Encode request
  const encoded = encodeRequest(request);
  expect(encoded).toBeInstanceOf(Uint8Array);
  expect(encoded.length).toBeGreaterThan(0);
  
  // Decode request
  const decoded = decodeRequest(encoded);
  expect(decoded.method).toBe(request.method);
  expect(decoded.url).toBe(request.url);
  expect(decoded.headers).toEqual(request.headers);
  expect(decoded.body).toEqual(request.body);
});

test("bHTTP response encoding/decoding", () => {
  const response: InnerResponse = {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    body: new TextEncoder().encode('{"result": "success"}'),
  };
  
  // Encode response
  const encoded = encodeResponse(response);
  expect(encoded).toBeInstanceOf(Uint8Array);
  expect(encoded.length).toBeGreaterThan(0);
  
  // Decode response
  const decoded = decodeResponse(encoded);
  expect(decoded.status).toBe(response.status);
  expect(decoded.headers).toEqual(response.headers);
  expect(decoded.body).toEqual(response.body);
});

test("bHTTP GET request without body", () => {
  const request: InnerRequest = {
    method: "GET",
    url: "https://api.example.com/status",
    headers: {
      "accept": "application/json",
    },
  };
  
  const encoded = encodeRequest(request);
  const decoded = decodeRequest(encoded);
  
  expect(decoded.method).toBe("GET");
  expect(decoded.url).toBe(request.url);
  expect(decoded.body).toEqual(new Uint8Array(0));
});

test("bHTTP with padding", () => {
  const request: InnerRequest = {
    method: "POST",
    url: "https://rpc.example.com/",
    headers: {
      "content-type": "application/json",
    },
    body: new TextEncoder().encode('{"jsonrpc":"2.0","method":"eth_chainId","id":1}'),
    paddingBytes: 64,
  };
  
  const encoded = encodeRequest(request);
  const decoded = decodeRequest(encoded);
  
  // For JSON content, padding should be skipped to prevent corruption
  // Body should be the original data without padding
  expect(decoded.body?.length).toBe(request.body!.length);
  
  // Data should be unchanged (no padding added to JSON)
  if (decoded.body && request.body) {
    expect(decoded.body).toEqual(new Uint8Array(request.body!));
  }
});

test("bHTTP with padding for non-JSON content", () => {
  const request: InnerRequest = {
    method: "POST",
    url: "https://example.com/api/data",
    headers: {
      "content-type": "text/plain", // Non-JSON content
    },
    body: new TextEncoder().encode("some plain text data"),
    paddingBytes: 32,
  };
  
  const encoded = encodeRequest(request);
  const decoded = decodeRequest(encoded);
  
  // For non-JSON content, padding should be applied
  expect(decoded.body?.length).toBe(request.body!.length + 32);
  
  // Original data should be at the beginning
  if (decoded.body && request.body) {
    const originalData = decoded.body.slice(0, request.body.length);
    expect(originalData).toEqual(new Uint8Array(request.body!));
  }
});
