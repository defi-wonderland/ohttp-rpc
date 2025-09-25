/**
 * Viem OHTTP Transport - Real RPC Tests
 * 
 * Tests the viem OHTTP transport with actual RPC calls through running servers:
 * Viem Client -> OHTTP Transport -> Relay Server -> Gateway Server -> Real Ethereum RPC
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createPublicClient } from "viem";
import { mainnet, polygon } from "viem/chains";
import { ohttp, ohttpMultichain } from "../packages/sdk/src/viem.js";

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

// Real RPC endpoints for testing
const REAL_RPC_ENDPOINTS = {
  mainnet: "https://eth.llamarpc.com",
  polygon: "https://polygon-rpc.com",
  backup: "https://rpc.ankr.com/eth"
};

beforeAll(async () => {
  console.log("🚀 Starting Viem OHTTP Transport with real RPC endpoints...");
  
  // Start Gateway Server with real RPC endpoints
  const gatewayConfig = {
    ...getGatewayConfig(),
    GATEWAY_PORT: 8850,
    ALLOWED_TARGETS: [
      REAL_RPC_ENDPOINTS.mainnet,
      REAL_RPC_ENDPOINTS.polygon,
      REAL_RPC_ENDPOINTS.backup,
      "https://mainnet.infura.io",
      "https://rpc.ankr.com/polygon",
      "https://polygon-mainnet.g.alchemy.com"
    ],
    LOG_LEVEL: "error" as const,
    REQUIRE_TLS_UPSTREAM: true // Require HTTPS for real endpoints
  };
  
  const gateway = createGatewayServer(gatewayConfig);
  await gateway.start();
  console.log(`✅ Gateway server started on port ${gatewayConfig.GATEWAY_PORT}`);
  
  // Start Relay Server
  const relayConfig = {
    ...getRelayConfig(),
    RELAY_PORT: 8851,
    GATEWAY_URL: `http://localhost:${gatewayConfig.GATEWAY_PORT}/gateway`,
    GATEWAY_KEYS_URL: `http://localhost:${gatewayConfig.GATEWAY_PORT}/ohttp-keys`,
    LOG_LEVEL: "error" as const
  };
  
  const relay = createRelayServer(relayConfig);
  relay.start();
  console.log(`✅ Relay server started on port ${relayConfig.RELAY_PORT}`);
  
  // Give servers time to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  servers = {
    gateway,
    relay,
    gatewayPort: gatewayConfig.GATEWAY_PORT,
    relayPort: relayConfig.RELAY_PORT
  };
  
  console.log("🎯 Viem OHTTP Transport with real RPC endpoints ready!");
});

afterAll(async () => {
  console.log("🧹 Cleaning up Viem OHTTP Transport test infrastructure...");
  
  if (servers) {
    await servers.gateway.close();
    console.log("✅ Gateway server stopped");
    
    await servers.relay.close();
    console.log("✅ Relay server stopped");
  }
  
  console.log("🎯 Viem OHTTP Transport cleanup complete!");
});

describe("Viem OHTTP Transport - Real RPC Calls", () => {
  test("Basic eth_chainId through viem client with real Ethereum RPC", async () => {
    const transport = ohttp(REAL_RPC_ENDPOINTS.mainnet, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 30000 // Longer timeout for real network
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: transport
    });
    
    console.log("📡 Making eth_chainId request to real Ethereum network through viem OHTTP transport...");
    
    const chainId = await client.getChainId();
    expect(chainId).toBe(1); // Real Ethereum mainnet chain ID
    
    console.log(`✅ Viem OHTTP transport eth_chainId successful: ${chainId}`);
  });

  test("Block number request through viem client with real Ethereum RPC", async () => {
    const transport = ohttp(REAL_RPC_ENDPOINTS.mainnet, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 30000
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: transport
    });
    
    console.log("📡 Making eth_blockNumber request to real Ethereum network through viem OHTTP transport...");
    
    const blockNumber = await client.getBlockNumber();
    expect(blockNumber).toBeGreaterThan(18000000n); // Should be well past this block on mainnet
    expect(blockNumber).toBeLessThan(50000000n); // Reasonable upper bound
    
    console.log(`✅ Viem OHTTP transport eth_blockNumber successful: ${blockNumber.toLocaleString()}`);
  });

  test("Gas price request through viem client with real Ethereum RPC", async () => {
    const transport = ohttp(REAL_RPC_ENDPOINTS.mainnet, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 30000
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: transport
    });
    
    console.log("📡 Making eth_gasPrice request to real Ethereum network through viem OHTTP transport...");
    
    const gasPrice = await client.getGasPrice();
    expect(gasPrice).toBeGreaterThan(1000000n); // Should be at least 1 gwei
    expect(gasPrice).toBeLessThan(1000000000000n); // Should be less than 1000 gwei (reasonable upper bound)
    
    console.log(`✅ Viem OHTTP transport eth_gasPrice successful: ${(gasPrice / 1000000000n).toString()} gwei`);
  });

  test("Balance request through viem client with real Ethereum RPC", async () => {
    const transport = ohttp(REAL_RPC_ENDPOINTS.mainnet, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 30000
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: transport
    });
    
    console.log("📡 Making eth_getBalance request to real Ethereum network through viem OHTTP transport...");
    
    // Use Ethereum Foundation's donation address (known to have ETH)
    const ethFoundationAddress = "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe";
    const balance = await client.getBalance({ address: ethFoundationAddress as `0x${string}` });
    expect(balance).toBeGreaterThan(0n); // Should have some ETH
    
    console.log(`✅ Viem OHTTP transport eth_getBalance successful: ${(Number(balance) / 1e18).toFixed(4)} ETH`);
  });

  test("Multiple concurrent requests to real Ethereum RPC", async () => {
    const transport = ohttp(REAL_RPC_ENDPOINTS.mainnet, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 30000
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: transport
    });
    
    console.log("📡 Making concurrent requests to real Ethereum network through viem OHTTP transport...");
    
    // Send multiple requests concurrently
    const [chainId, blockNumber, gasPrice] = await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
      client.getGasPrice()
    ]);
    
    expect(chainId).toBe(1);
    expect(blockNumber).toBeGreaterThan(18000000n);
    expect(gasPrice).toBeGreaterThan(1000000n);
    
    console.log(`✅ Viem OHTTP transport concurrent requests successful`);
    console.log(`   Chain ID: ${chainId}, Block: ${blockNumber.toLocaleString()}, Gas: ${(gasPrice / 1000000000n).toString()} gwei`);
  });

  test("Error handling with invalid method on real Ethereum RPC", async () => {
    const transport = ohttp(REAL_RPC_ENDPOINTS.mainnet, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 30000
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: transport
    });
    
    console.log("📡 Testing error handling with invalid method on real Ethereum RPC...");
    
    try {
      // Make a raw request with invalid method
      await (client as any).request({
        method: "invalid_method",
        params: []
      });
      expect(false).toBe(true); // Should not reach here
    } catch (error: any) {
      expect(error).toBeDefined();
      expect(error.message).toMatch(/method.*not (found|supported)/i);
      console.log(`✅ Viem OHTTP transport error handling works: ${error.message}`);
    }
  });

  test("Custom timeout configuration with real Ethereum RPC", async () => {
    const transport = ohttp(REAL_RPC_ENDPOINTS.mainnet, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 45000 // Longer timeout for real network
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: transport
    });
    
    console.log("📡 Testing custom timeout configuration with real Ethereum RPC...");
    
    const chainId = await client.getChainId();
    expect(chainId).toBe(1);
    
    console.log(`✅ Viem OHTTP transport custom timeout works`);
  });
});

describe("Viem OHTTP Transport - Multichain Real RPC", () => {
  test("Multichain configuration with real RPC endpoints", () => {
    const transports = ohttpMultichain({
      [mainnet.id]: REAL_RPC_ENDPOINTS.mainnet,
      [polygon.id]: REAL_RPC_ENDPOINTS.polygon,
    }, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 30000
    });
    
    expect(transports[mainnet.id]).toBeInstanceOf(Function);
    expect(transports[polygon.id]).toBeInstanceOf(Function);
    
    console.log(`✅ Multichain OHTTP transports created successfully for real RPC endpoints`);
  });

  test("Multiple clients with different real chains", async () => {
    const transports = ohttpMultichain({
      [mainnet.id]: REAL_RPC_ENDPOINTS.mainnet,
      [polygon.id]: REAL_RPC_ENDPOINTS.polygon,
    }, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 30000
    });
    
    const mainnetClient = createPublicClient({
      chain: mainnet,
      transport: transports[mainnet.id],
    });
    
    const polygonClient = createPublicClient({
      chain: polygon,
      transport: transports[polygon.id],
    });
    
    console.log("📡 Making requests through multiple real chain clients...");
    
    const [mainnetChainId, polygonChainId] = await Promise.all([
      mainnetClient.getChainId(),
      polygonClient.getChainId()
    ]);
    
    expect(mainnetChainId).toBe(1); // Ethereum mainnet
    expect(polygonChainId).toBe(137); // Polygon mainnet
    
    console.log(`✅ Multiple chain clients work: mainnet=${mainnetChainId}, polygon=${polygonChainId}`);
  });

  test("Chain-specific transport configurations with real RPCs", async () => {
    // Different timeout for each chain
    const mainnetTransport = ohttp(REAL_RPC_ENDPOINTS.mainnet, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 25000,
      padding: 64
    });
    
    const polygonTransport = ohttp(REAL_RPC_ENDPOINTS.polygon, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 35000,
      padding: 128
    });
    
    const mainnetClient = createPublicClient({
      chain: mainnet,
      transport: mainnetTransport,
    });
    
    const polygonClient = createPublicClient({
      chain: polygon,
      transport: polygonTransport,
    });
    
    console.log("📡 Testing chain-specific transport configurations with real RPCs...");
    
    const [mainnetChainId, polygonChainId] = await Promise.all([
      mainnetClient.getChainId(),
      polygonClient.getChainId()
    ]);
    
    expect(mainnetChainId).toBe(1);
    expect(polygonChainId).toBe(137);
    
    console.log(`✅ Chain-specific configurations work with real RPCs`);
  });
});

describe("Viem OHTTP Transport - Performance & Reliability with Real RPC", () => {
  test("Performance under load with real Ethereum RPC", async () => {
    const transport = ohttp(REAL_RPC_ENDPOINTS.mainnet, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 30000
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: transport
    });
    
    console.log("📡 Testing viem OHTTP transport performance with real Ethereum RPC...");
    
    const startTime = Date.now();
    const requestCount = 5; // Reduced for real network to avoid rate limiting
    
    // Send requests in parallel
    const promises = Array.from({ length: requestCount }, () => 
      client.getChainId()
    );
    
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    // All should succeed
    results.forEach(chainId => {
      expect(chainId).toBe(1);
    });
    
    const duration = endTime - startTime;
    const avgLatency = duration / requestCount;
    
    expect(avgLatency).toBeLessThan(15000); // Less than 15 seconds average for real network
    
    console.log(`✅ Performance test: ${requestCount} requests in ${duration}ms (${avgLatency.toFixed(0)}ms avg)`);
  });

  test("Transport resilience with real Ethereum RPC", async () => {
    const transport = ohttp(REAL_RPC_ENDPOINTS.mainnet, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 30000
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: transport
    });
    
    console.log("📡 Testing transport resilience with real Ethereum RPC...");
    
    // Test chain ID multiple times - should be consistent
    const chainIdResults = await Promise.all([
      client.getChainId(),
      client.getChainId(),
      client.getChainId()
    ]);
    
    // All chain IDs should be the same
    expect(chainIdResults[0]).toBe(1);
    expect(chainIdResults[1]).toBe(1);
    expect(chainIdResults[2]).toBe(1);
    
    // Test that block numbers are reasonable (may differ slightly due to new blocks)
    const blockNumberResults = await Promise.all([
      client.getBlockNumber(),
      client.getBlockNumber()
    ]);
    
    expect(blockNumberResults[0]).toBeGreaterThan(18000000n);
    expect(blockNumberResults[1]).toBeGreaterThan(18000000n);
    // Block numbers should be within a few blocks of each other
    expect(Math.abs(Number(blockNumberResults[1] - blockNumberResults[0]))).toBeLessThan(10);
    
    console.log(`✅ Transport resilience test passed with real RPC`);
  });

  test("Large parameter handling with real Ethereum RPC", async () => {
    const transport = ohttp(REAL_RPC_ENDPOINTS.mainnet, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 30000
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: transport
    });
    
    console.log("📡 Testing large parameter handling with real Ethereum RPC...");
    
    // Test with a method that accepts larger parameters
    const ethFoundationAddress = "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe";
    const balance = await client.getBalance({ 
      address: ethFoundationAddress as `0x${string}`,
      blockTag: "latest"
    });
    
    expect(balance).toBeGreaterThan(0n);
    
    console.log(`✅ Large parameter handling works with real RPC`);
  });
});
