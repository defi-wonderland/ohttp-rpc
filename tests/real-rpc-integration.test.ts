/**
 * Real RPC Integration Tests
 * 
 * Tests the complete OHTTP flow with real RPC endpoints:
 * Client -> Relay Server -> Gateway Server -> Real RPC (eth.llamarpc.com)
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { ohttpJsonRpc } from "../packages/sdk/src/fetch.js";

// Import server components
import { createServer as createRelayServer } from "../apps/relay/src/index.js";
import { createServer as createGatewayServer } from "../apps/gateway/src/index.js";
import { getDevConfig as getRelayConfig } from "../apps/relay/src/env.js";
import { getDevConfig as getGatewayConfig } from "../apps/gateway/src/env.js";

interface TestServers {
  gateway: any;
  relay: any;
  gatewayPort: number;
  relayPort: number;
}

let servers: TestServers;

beforeAll(async () => {
  console.log("🚀 Starting Real RPC Integration test infrastructure...");
  
  // Start Gateway Server with real RPC endpoints in ALLOWED_TARGETS
  const gatewayConfig = {
    ...getGatewayConfig(),
    GATEWAY_PORT: 8802,
    ALLOWED_TARGETS: [
      "https://eth.llamarpc.com",
      "https://rpc.ankr.com/eth", 
      "https://mainnet.infura.io"
    ],
    LOG_LEVEL: "error" as const, // Reduce noise in tests
    REQUIRE_TLS_UPSTREAM: true, // Enforce HTTPS for real endpoints
  };
  
  const gateway = createGatewayServer(gatewayConfig);
  await gateway.start();
  console.log(`✅ Gateway server started on port ${gatewayConfig.GATEWAY_PORT}`);
  
  // Start Relay Server
  const relayConfig = {
    ...getRelayConfig(),
    RELAY_PORT: 8803,
    GATEWAY_URL: `http://localhost:${gatewayConfig.GATEWAY_PORT}/gateway`,
    GATEWAY_KEYS_URL: `http://localhost:${gatewayConfig.GATEWAY_PORT}/ohttp-keys`,
    LOG_LEVEL: "error" as const // Reduce noise in tests
  };
  
  const relay = createRelayServer(relayConfig);
  relay.start();
  console.log(`✅ Relay server started on port ${relayConfig.RELAY_PORT}`);
  
  // Give servers time to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  servers = {
    gateway,
    relay,
    gatewayPort: gatewayConfig.GATEWAY_PORT,
    relayPort: relayConfig.RELAY_PORT
  };
  
  console.log("🎯 Real RPC Integration test infrastructure ready!");
});

afterAll(async () => {
  console.log("🧹 Cleaning up Real RPC Integration test infrastructure...");
  
  if (servers) {
    await servers.gateway.close();
    console.log("✅ Gateway server stopped");
    
    await servers.relay.close();
    console.log("✅ Relay server stopped");
  }
  
  console.log("🎯 Real RPC Integration cleanup complete!");
});

describe("Real RPC Integration - Live Network Tests", () => {
  test("Real getBlockNumber request through OHTTP to eth.llamarpc.com", async () => {
    const keyConfigUrl = `http://localhost:${servers.gatewayPort}/ohttp-keys`;
    const relayUrl = `http://localhost:${servers.relayPort}/relay`;
    const targetRpcUrl = "https://eth.llamarpc.com";
    
    console.log("📡 Making real getBlockNumber request...");
    
    // Make real eth_blockNumber request
    const result = await ohttpJsonRpc(
      keyConfigUrl,
      relayUrl,
      targetRpcUrl,
      "eth_blockNumber",
      [],
      { timeoutMs: 30000 } // Longer timeout for real network
    );
    
    // Validate result is a valid hex block number
    expect(result).toMatch(/^0x[0-9a-f]+$/i);
    
    // Convert to number and validate it's reasonable (should be a large number for mainnet)
    const blockNumber = parseInt(result, 16);
    expect(blockNumber).toBeGreaterThan(18000000); // Should be well past this block by now
    expect(blockNumber).toBeLessThan(50000000); // Reasonable upper bound
    
    console.log(`✅ Real getBlockNumber successful: ${result} (decimal: ${blockNumber.toLocaleString()})`);
  });
  
  test("Real chainId request through OHTTP to eth.llamarpc.com", async () => {
    const keyConfigUrl = `http://localhost:${servers.gatewayPort}/ohttp-keys`;
    const relayUrl = `http://localhost:${servers.relayPort}/relay`;
    const targetRpcUrl = "https://eth.llamarpc.com";
    
    console.log("📡 Making real chainId request...");
    
    // Make real eth_chainId request
    const result = await ohttpJsonRpc(
      keyConfigUrl,
      relayUrl,
      targetRpcUrl,
      "eth_chainId",
      [],
      { timeoutMs: 30000 }
    );
    
    // Should be "0x1" for Ethereum mainnet
    expect(result).toBe("0x1");
    
    console.log(`✅ Real chainId successful: ${result} (Ethereum Mainnet)`);
  });
  
  test("Real getBlockNumber with multiple approved endpoints", async () => {
    const keyConfigUrl = `http://localhost:${servers.gatewayPort}/ohttp-keys`;
    const relayUrl = `http://localhost:${servers.relayPort}/relay`;
    
    const approvedEndpoints = [
      "https://eth.llamarpc.com",
      "https://rpc.ankr.com/eth"
    ];
    
    console.log("📡 Testing multiple approved RPC endpoints...");
    
    const results = [];
    
    for (const endpoint of approvedEndpoints) {
      try {
        const result = await ohttpJsonRpc(
          keyConfigUrl,
          relayUrl,
          endpoint,
          "eth_blockNumber",
          [],
          { timeoutMs: 30000 }
        );
        
        // Validate result
        expect(result).toMatch(/^0x[0-9a-f]+$/i);
        const blockNumber = parseInt(result, 16);
        expect(blockNumber).toBeGreaterThan(18000000);
        
        results.push({ endpoint, blockNumber, success: true });
        console.log(`✅ ${endpoint}: ${result} (${blockNumber.toLocaleString()})`);
      } catch (error) {
        console.warn(`⚠️  ${endpoint} failed: ${error}`);
        results.push({ endpoint, error: error.message, success: false });
      }
    }
    
    // At least one endpoint should succeed
    const successCount = results.filter(r => r.success).length;
    expect(successCount).toBeGreaterThan(0);
    
    console.log(`✅ Multiple endpoints test: ${successCount}/${approvedEndpoints.length} successful`);
  });
  
  test("Real request validation - block numbers should be close", async () => {
    const keyConfigUrl = `http://localhost:${servers.gatewayPort}/ohttp-keys`;
    const relayUrl = `http://localhost:${servers.relayPort}/relay`;
    const targetRpcUrl = "https://eth.llamarpc.com";
    
    console.log("📡 Making multiple block number requests to validate consistency...");
    
    // Make two requests quickly
    const [result1, result2] = await Promise.all([
      ohttpJsonRpc(keyConfigUrl, relayUrl, targetRpcUrl, "eth_blockNumber", [], { timeoutMs: 30000 }),
      ohttpJsonRpc(keyConfigUrl, relayUrl, targetRpcUrl, "eth_blockNumber", [], { timeoutMs: 30000 })
    ]);
    
    const block1 = parseInt(result1, 16);
    const block2 = parseInt(result2, 16);
    
    // Block numbers should be very close (within a few blocks)
    const blockDiff = Math.abs(block1 - block2);
    expect(blockDiff).toBeLessThanOrEqual(5); // Should be within 5 blocks
    
    console.log(`✅ Block consistency check: ${result1} and ${result2} (diff: ${blockDiff})`);
  });
  
  test("Error handling with unauthorized endpoint", async () => {
    const keyConfigUrl = `http://localhost:${servers.gatewayPort}/ohttp-keys`;
    const relayUrl = `http://localhost:${servers.relayPort}/relay`;
    const unauthorizedUrl = "https://cloudflare-eth.com"; // Not in ALLOWED_TARGETS
    
    console.log("🔒 Testing unauthorized endpoint rejection...");
    
    try {
      await ohttpJsonRpc(
        keyConfigUrl,
        relayUrl,
        unauthorizedUrl,
        "eth_blockNumber",
        [],
        { timeoutMs: 30000 }
      );
      
      // Should not reach here
      expect(false).toBe(true);
    } catch (error: any) {
      // Should get a target not allowed error (could be 403 or "Target not allowed")
      expect(error).toBeDefined();
      expect(error.message).toMatch(/(Target not allowed|403|Forbidden)/i);
      console.log(`✅ Unauthorized endpoint correctly rejected: ${error.message}`);
    }
  });
  
  test("Performance test with real endpoint", async () => {
    const keyConfigUrl = `http://localhost:${servers.gatewayPort}/ohttp-keys`;
    const relayUrl = `http://localhost:${servers.relayPort}/relay`;
    const targetRpcUrl = "https://eth.llamarpc.com";
    
    console.log("⚡ Running performance test with real endpoint...");
    
    const startTime = Date.now();
    const requestCount = 3; // Keep it reasonable for real network
    
    // Send requests in parallel
    const promises = Array.from({ length: requestCount }, () => 
      ohttpJsonRpc(
        keyConfigUrl,
        relayUrl,
        targetRpcUrl,
        "eth_blockNumber",
        [],
        { timeoutMs: 30000 }
      )
    );
    
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    // Validate all results
    results.forEach(result => {
      expect(result).toMatch(/^0x[0-9a-f]+$/i);
      const blockNumber = parseInt(result, 16);
      expect(blockNumber).toBeGreaterThan(18000000);
    });
    
    const duration = endTime - startTime;
    const avgLatency = duration / requestCount;
    
    // Should complete within reasonable time (allow more time for real network)
    expect(avgLatency).toBeLessThan(10000); // 10 seconds average
    
    console.log(`✅ Performance test: ${requestCount} requests in ${duration}ms (${avgLatency.toFixed(0)}ms avg)`);
  });
});
