/**
 * Mock RPC server tests
 */

import { test, expect } from "bun:test";
import { createMockRpcServer } from "@ohttp/test-utils";

test("Mock RPC server creation", () => {
  const server = createMockRpcServer(3333);
  expect(server.getUrl()).toBe("http://localhost:3333");
});

test("Mock RPC server basic functionality", async () => {
  const server = createMockRpcServer(3334);
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
    
    expect(response.status).toBe(200);
    
    const result = await response.json();
    expect(result.jsonrpc).toBe("2.0");
    expect(result.id).toBe(1);
    expect(result.result).toBe("0x1");
    
  } finally {
    server.stop();
  }
});

test("Mock RPC server error handling", async () => {
  const server = createMockRpcServer(3335);
  const serverInstance = server.start();
  
  try {
    // Test unknown method
    const request = {
      jsonrpc: "2.0",
      method: "unknown_method",
      params: [],
      id: 1,
    };
    
    const response = await serverInstance.fetch(new Request("http://localhost:3335", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }));
    
    expect(response.status).toBe(200);
    
    const result = await response.json();
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe(-32601);
    expect(result.error.message).toBe("Method not found");
    
  } finally {
    server.stop();
  }
});

test("Mock RPC server custom handlers", async () => {
  const server = createMockRpcServer(3336);
  
  // Add custom handler
  server.addHandler("custom_method", (params) => {
    return { custom: true, params };
  });
  
  const serverInstance = server.start();
  
  try {
    const request = {
      jsonrpc: "2.0",
      method: "custom_method",
      params: ["test", 123],
      id: 1,
    };
    
    const response = await serverInstance.fetch(new Request("http://localhost:3336", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }));
    
    const result = await response.json();
    expect(result.result).toEqual({
      custom: true,
      params: ["test", 123],
    });
    
  } finally {
    server.stop();
  }
});
