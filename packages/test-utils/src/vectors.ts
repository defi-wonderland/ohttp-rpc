/**
 * Test vectors for OHTTP/HPKE/bHTTP testing
 */

import { encodeRequest, createJsonRpcRequest } from "@ohttp/core";
import type { InnerRequest, JsonRpcRequest } from "@ohttp/shared";

/**
 * Test vector for bHTTP encoding
 */
export interface BhttpTestVector {
  name: string;
  request: InnerRequest;
  expectedBytes: Uint8Array;
}

/**
 * Test vector for HPKE operations
 */
export interface HpkeTestVector {
  name: string;
  seed: Uint8Array;
  plaintext: Uint8Array;
  info?: Uint8Array;
  expectedPublicKey?: Uint8Array;
}

/**
 * Test vector for JSON-RPC requests
 */
export interface JsonRpcTestVector {
  name: string;
  method: string;
  params: unknown[];
  id: string | number;
  expectedRequest: JsonRpcRequest;
}

/**
 * bHTTP test vectors
 */
export const bhttpVectors: BhttpTestVector[] = [
  {
    name: "Simple GET request",
    request: {
      method: "GET",
      url: "https://example.com/api",
      headers: {
        "accept": "application/json",
      },
    },
    expectedBytes: new Uint8Array([
      // This would be the actual encoded bytes
      // For now, we'll generate them dynamically
    ]),
  },
  
  {
    name: "JSON-RPC POST request",
    request: {
      method: "POST",
      url: "https://mainnet.infura.io/v3/test",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: new TextEncoder().encode(JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_chainId",
        params: [],
        id: 1,
      })),
    },
    expectedBytes: new Uint8Array([]),
  },
];

/**
 * HPKE test vectors
 */
export const hpkeVectors: HpkeTestVector[] = [
  {
    name: "Basic seal/open",
    seed: new Uint8Array(32).fill(1), // All ones
    plaintext: new TextEncoder().encode("Hello, OHTTP!"),
    info: new TextEncoder().encode("test-info"),
  },
  
  {
    name: "Empty plaintext",
    seed: new Uint8Array(32).fill(0), // All zeros
    plaintext: new Uint8Array(0),
  },
  
  {
    name: "Large plaintext",
    seed: crypto.getRandomValues(new Uint8Array(32)),
    plaintext: new Uint8Array(1024).fill(42),
  },
];

/**
 * JSON-RPC test vectors
 */
export const jsonRpcVectors: JsonRpcTestVector[] = [
  {
    name: "eth_chainId",
    method: "eth_chainId",
    params: [],
    id: 1,
    expectedRequest: {
      jsonrpc: "2.0",
      method: "eth_chainId",
      params: [],
      id: 1,
    },
  },
  
  {
    name: "eth_getBalance",
    method: "eth_getBalance",
    params: ["0x742d35Cc6634C0532925a3b8D3Ac6bC6Bf2f5C6", "latest"],
    id: "balance-check",
    expectedRequest: {
      jsonrpc: "2.0",
      method: "eth_getBalance",
      params: ["0x742d35Cc6634C0532925a3b8D3Ac6bC6Bf2f5C6", "latest"],
      id: "balance-check",
    },
  },
  
  {
    name: "eth_sendRawTransaction",
    method: "eth_sendRawTransaction",
    params: ["0xf86c808504a817c800825208942..."],
    id: 42,
    expectedRequest: {
      jsonrpc: "2.0",
      method: "eth_sendRawTransaction",
      params: ["0xf86c808504a817c800825208942..."],
      id: 42,
    },
  },
];

/**
 * Generate bHTTP test vectors dynamically
 */
export function generateBhttpVectors(): BhttpTestVector[] {
  return bhttpVectors.map(vector => ({
    ...vector,
    expectedBytes: encodeRequest(vector.request),
  }));
}

/**
 * Generate JSON-RPC bHTTP requests
 */
export function generateJsonRpcBhttpVectors(): Array<{
  name: string;
  rpcRequest: JsonRpcRequest;
  bhttpBytes: Uint8Array;
}> {
  return jsonRpcVectors.map(vector => ({
    name: vector.name,
    rpcRequest: vector.expectedRequest,
    bhttpBytes: createJsonRpcRequest(
      "https://example.com/rpc",
      vector.expectedRequest
    ),
  }));
}

/**
 * Common test data
 */
export const testData = {
  // Common Ethereum addresses
  addresses: {
    zero: "0x0000000000000000000000000000000000000000",
    dead: "0x000000000000000000000000000000000000dEaD",
    vitalik: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    test: "0x742d35Cc6634C0532925a3b8D3Ac6bC6Bf2f5C6",
  },
  
  // Common transaction hashes
  txHashes: {
    genesis: "0x0000000000000000000000000000000000000000000000000000000000000000",
    test: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  },
  
  // Common block numbers
  blocks: {
    genesis: "0x0",
    latest: "latest",
    pending: "pending",
    test: "0x1234567",
  },
  
  // Sample raw transactions
  rawTx: {
    simple: "0xf86c808504a817c800825208942d35cc6634c0532925a3b8d3ac6bc6bf2f5c61880de0b6b3a764000080820a95a0123456789abcdef123456789abcdef123456789abcdef123456789abcdef1234a0123456789abcdef123456789abcdef123456789abcdef123456789abcdef1234",
  },
};

/**
 * Utility to create test HPKE seed
 */
export function createTestSeed(pattern: number = 0): Uint8Array {
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    seed[i] = (pattern + i) % 256;
  }
  return seed;
}

/**
 * Utility to create test padding
 */
export function createTestPadding(size: number): Uint8Array {
  return new Uint8Array(size).fill(0);
}
