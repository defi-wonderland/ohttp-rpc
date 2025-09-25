/**
 * Mock RPC server tests - direct import version
 */

import { test, expect } from "bun:test";
import { MockRpcServer } from "../packages/test-utils/src/mock-rpc.js";

test("Mock RPC server creation", () => {
  const server = new MockRpcServer(3333);
  expect(server.getUrl()).toBe("http://localhost:3333");
});

test("Mock RPC server basic functionality", async () => {
  const server = new MockRpcServer(3334);
  const serverInstance = server.start();
  
  try {
    // Test eth_chainId
    const chainIdRequest = {
      jsonrpc: "2.0",
      method: "eth_chainId",
      params: [],
      id: 1,
    };
    
    const response = await serverInstance.fetch(new Request("http://localhost:3334", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(chainIdRequest),
    }));
    
    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.jsonrpc).toBe("2.0");
    expect(result.id).toBe(1);
    expect(result.result).toBe("0x1");
    
    // Test eth_blockNumber
    const blockRequest = {
      jsonrpc: "2.0",
      method: "eth_blockNumber",
      params: [],
      id: 2,
    };
    
    const blockResponse = await serverInstance.fetch(new Request("http://localhost:3334", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(blockRequest),
    }));
    
    expect(blockResponse.ok).toBe(true);
    const blockResult = await blockResponse.json();
    expect(blockResult.result).toMatch(/^0x[0-9a-f]+$/);
    
  } finally {
    server.stop();
  }
});

test("Mock RPC server error handling", async () => {
  const server = new MockRpcServer(3335);
  const serverInstance = server.start();
  
  try {
    // Test unsupported method
    const request = {
      jsonrpc: "2.0",
      method: "unsupported_method",
      params: [],
      id: 1,
    };
    
    const response = await serverInstance.fetch(new Request("http://localhost:3335", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }));
    
    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe(-32601);
    
  } finally {
    server.stop();
  }
});
