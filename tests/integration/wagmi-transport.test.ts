/**
 * Wagmi OHTTP Transport - Real RPC Tests
 * 
 * Tests the wagmi OHTTP transport with actual RPC calls through running servers:
 * Wagmi Config -> OHTTP Transport -> Relay Server -> Gateway Server -> Real Ethereum RPC
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { logger } from "../utils/test-logger.js";
import { createPublicClient } from "viem";
import { mainnet, polygon } from "viem/chains";
import { ohttp, ohttpMultichain, ohttpConfig } from "../../packages/sdk/src/wagmi.js";

// Import server components
import { createServer as createRelayServer } from "../../apps/relay/src/index.js";
import { createServer as createGatewayServer } from "../../apps/gateway/src/index.js";
import { getDevConfig as getRelayConfig } from "../../apps/relay/src/env.js";
import { getDevConfig as getGatewayConfig } from "../../apps/gateway/src/env.js";

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
  logger.debug(" Starting Wagmi OHTTP Transport with real RPC endpoints...");
  
  // Start Gateway Server with real RPC endpoints
  const gatewayConfig = {
    ...getGatewayConfig(),
    GATEWAY_PORT: 8860,
    ALLOWED_TARGETS: [
      REAL_RPC_ENDPOINTS.mainnet,
      REAL_RPC_ENDPOINTS.polygon,
      REAL_RPC_ENDPOINTS.backup,
      "https://mainnet.infura.io",
      "https://rpc.ankr.com/polygon",
      "https://polygon-mainnet.g.alchemy.com"
    ],
    LOG_LEVEL: "error" as const,
    REQUIRE_TLS_UPSTREAM: true
  };
  
  const gateway = createGatewayServer(gatewayConfig);
  await gateway.start();
  logger.debug(` Gateway server started on port ${gatewayConfig.GATEWAY_PORT}`);
  
  // Start Relay Server
  const relayConfig = {
    ...getRelayConfig(),
    RELAY_PORT: 8861,
    GATEWAY_URL: `http://localhost:${gatewayConfig.GATEWAY_PORT}/gateway`,
    GATEWAY_KEYS_URL: `http://localhost:${gatewayConfig.GATEWAY_PORT}/ohttp-keys`,
    LOG_LEVEL: "error" as const
  };
  
  const relay = createRelayServer(relayConfig);
  relay.start();
  logger.debug(` Relay server started on port ${relayConfig.RELAY_PORT}`);
  
  // Give servers time to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  servers = {
    gateway,
    relay,
    gatewayPort: gatewayConfig.GATEWAY_PORT,
    relayPort: relayConfig.RELAY_PORT
  };
  
  logger.debug(" Wagmi OHTTP Transport with real RPC endpoints ready!");
});

afterAll(async () => {
  logger.debug("🧹 Cleaning up Wagmi OHTTP Transport test infrastructure...");
  
  if (servers) {
    await servers.gateway.close();
    logger.debug(" Gateway server stopped");
    
    await servers.relay.close();
    logger.debug(" Relay server stopped");
  }
  
  logger.debug(" Wagmi OHTTP Transport cleanup complete!");
});

describe("Wagmi OHTTP Transport - Real RPC Integration", () => {
  test("Basic wagmi config with real Ethereum RPC", async () => {
    const config = ohttpConfig({
      chains: [mainnet],
      rpcUrls: {
        [mainnet.id]: REAL_RPC_ENDPOINTS.mainnet,
      },
      ohttpOptions: {
        gateway: `http://localhost:${servers.gatewayPort}`,
        relay: `http://localhost:${servers.relayPort}`,
        timeout: 30000
      }
    });
    
    expect(config.chains).toHaveLength(1);
    expect(config.chains[0]).toBe(mainnet);
    expect(config.transports[mainnet.id]).toBeInstanceOf(Function);
    
    // Test the transport works
    const client = createPublicClient({
      chain: mainnet,
      transport: config.transports[mainnet.id],
    });
    
    logger.debug("📡 Making eth_chainId request through wagmi OHTTP config...");
    
    const chainId = await client.getChainId();
    expect(chainId).toBe(1);
    
    logger.debug(` Wagmi OHTTP config eth_chainId successful: ${chainId}`);
  });

  test("Multichain wagmi config with real RPC endpoints", async () => {
    const config = ohttpConfig({
      chains: [mainnet, polygon],
      rpcUrls: {
        [mainnet.id]: REAL_RPC_ENDPOINTS.mainnet,
        [polygon.id]: REAL_RPC_ENDPOINTS.polygon,
      },
      ohttpOptions: {
        gateway: `http://localhost:${servers.gatewayPort}`,
        relay: `http://localhost:${servers.relayPort}`,
        timeout: 30000
      }
    });
    
    expect(config.chains).toHaveLength(2);
    expect(config.transports[mainnet.id]).toBeInstanceOf(Function);
    expect(config.transports[polygon.id]).toBeInstanceOf(Function);
    
    // Test both transports work
    const mainnetClient = createPublicClient({
      chain: mainnet,
      transport: config.transports[mainnet.id],
    });
    
    const polygonClient = createPublicClient({
      chain: polygon,
      transport: config.transports[polygon.id],
    });
    
    logger.debug("📡 Making requests through multichain wagmi OHTTP config...");
    
    const [mainnetChainId, polygonChainId] = await Promise.all([
      mainnetClient.getChainId(),
      polygonClient.getChainId()
    ]);
    
    expect(mainnetChainId).toBe(1); // Ethereum mainnet
    expect(polygonChainId).toBe(137); // Polygon mainnet
    
    logger.debug(` Multichain wagmi OHTTP config successful: mainnet=${mainnetChainId}, polygon=${polygonChainId}`);
  });

  test("Manual transport configuration with real RPC", async () => {
    // Create individual transports like in typical Wagmi usage
    const mainnetTransport = ohttp(REAL_RPC_ENDPOINTS.mainnet, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 30000,
      padding: 64
    });
    
    const polygonTransport = ohttp(REAL_RPC_ENDPOINTS.polygon, {
      gateway: `http://localhost:${servers.gatewayPort}`,
      relay: `http://localhost:${servers.relayPort}`,
      timeout: 35000,
      padding: 128
    });
    
    // Simulate typical Wagmi config structure
    const config = {
      chains: [mainnet, polygon],
      transports: {
        [mainnet.id]: mainnetTransport,
        [polygon.id]: polygonTransport,
      },
    };
    
    const mainnetClient = createPublicClient({
      chain: mainnet,
      transport: config.transports[mainnet.id],
    });
    
    const polygonClient = createPublicClient({
      chain: polygon,
      transport: config.transports[polygon.id],
    });
    
    logger.debug("📡 Making requests through manual transport configuration...");
    
    const [mainnetChainId, polygonChainId] = await Promise.all([
      mainnetClient.getChainId(),
      polygonClient.getChainId()
    ]);
    
    expect(mainnetChainId).toBe(1);
    expect(polygonChainId).toBe(137);
    
    logger.debug(` Manual transport configuration works: mainnet=${mainnetChainId}, polygon=${polygonChainId}`);
  });

  test("ohttpMultichain helper with real RPC endpoints", async () => {
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
    
    // Test the transports
    const mainnetClient = createPublicClient({
      chain: mainnet,
      transport: transports[mainnet.id],
    });
    
    const polygonClient = createPublicClient({
      chain: polygon,
      transport: transports[polygon.id],
    });
    
    logger.debug("📡 Making requests through ohttpMultichain helper...");
    
    const [mainnetChainId, polygonChainId] = await Promise.all([
      mainnetClient.getChainId(),
      polygonClient.getChainId()
    ]);
    
    expect(mainnetChainId).toBe(1);
    expect(polygonChainId).toBe(137);
    
    logger.debug(` ohttpMultichain helper works: mainnet=${mainnetChainId}, polygon=${polygonChainId}`);
  });
});

describe("Wagmi OHTTP Transport - Real RPC Operations", () => {
  test("Complex operations through wagmi config", async () => {
    const config = ohttpConfig({
      chains: [mainnet],
      rpcUrls: {
        [mainnet.id]: REAL_RPC_ENDPOINTS.mainnet,
      },
      ohttpOptions: {
        gateway: `http://localhost:${servers.gatewayPort}`,
        relay: `http://localhost:${servers.relayPort}`,
        timeout: 30000
      }
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: config.transports[mainnet.id],
    });
    
    logger.debug("📡 Making complex operations through wagmi OHTTP config...");
    
    // Test multiple operations
    const [chainId, blockNumber, gasPrice, balance] = await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
      client.getGasPrice(),
      client.getBalance({ address: "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe" }) // Ethereum Foundation
    ]);
    
    expect(chainId).toBe(1);
    expect(blockNumber).toBeGreaterThan(18000000n);
    expect(gasPrice).toBeGreaterThan(1000000n);
    expect(balance).toBeGreaterThan(0n);
    
    logger.debug(` Complex operations successful:`);
    logger.debug(`   Chain ID: ${chainId}`);
    logger.debug(`   Block: ${blockNumber.toLocaleString()}`);
    logger.debug(`   Gas Price: ${(gasPrice / 1000000000n).toString()} gwei`);
    logger.debug(`   ETH Foundation Balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`);
  });

  test("Error handling through wagmi config", async () => {
    const config = ohttpConfig({
      chains: [mainnet],
      rpcUrls: {
        [mainnet.id]: REAL_RPC_ENDPOINTS.mainnet,
      },
      ohttpOptions: {
        gateway: `http://localhost:${servers.gatewayPort}`,
        relay: `http://localhost:${servers.relayPort}`,
        timeout: 30000
      }
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: config.transports[mainnet.id],
    });
    
    logger.debug("📡 Testing error handling through wagmi OHTTP config...");
    
    try {
      await client.request({
        method: "invalid_method" as any,
        params: []
      });
      expect(false).toBe(true); // Should not reach here
    } catch (error: any) {
      expect(error).toBeDefined();
      expect(error.message).toMatch(/method.*not (found|supported)/i);
      logger.debug(` Error handling works: ${error.message}`);
    }
  });

  test("Performance with wagmi config and real RPC", async () => {
    const config = ohttpConfig({
      chains: [mainnet],
      rpcUrls: {
        [mainnet.id]: REAL_RPC_ENDPOINTS.mainnet,
      },
      ohttpOptions: {
        gateway: `http://localhost:${servers.gatewayPort}`,
        relay: `http://localhost:${servers.relayPort}`,
        timeout: 30000
      }
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: config.transports[mainnet.id],
    });
    
    logger.debug("📡 Testing performance with wagmi OHTTP config and real RPC...");
    
    const startTime = Date.now();
    const requestCount = 3; // Conservative for real network
    
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
    
    logger.debug(` Performance test: ${requestCount} requests in ${duration}ms (${avgLatency.toFixed(0)}ms avg)`);
  });
});

describe("Wagmi OHTTP Transport - Environment Patterns", () => {
  test("Development vs Production configuration pattern", async () => {
    const isDevelopment = false; // Simulate production
    
    const baseOptions = {
      timeout: 30000,
      padding: 64,
    };
    
    const developmentOptions = {
      ...baseOptions,
      gateway: "http://localhost:8788/ohttp-keys",
      relay: "http://localhost:8787",
    };
    
    const productionOptions = {
      ...baseOptions,
      gateway: `http://localhost:${servers.gatewayPort}`, // Use our test servers as "production"
      relay: `http://localhost:${servers.relayPort}`,
    };
    
    const ohttpOptions = isDevelopment ? developmentOptions : productionOptions;
    
    const config = ohttpConfig({
      chains: [mainnet],
      rpcUrls: {
        [mainnet.id]: REAL_RPC_ENDPOINTS.mainnet,
      },
      ohttpOptions
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: config.transports[mainnet.id],
    });
    
    logger.debug("📡 Testing environment-specific configuration pattern...");
    
    const chainId = await client.getChainId();
    expect(chainId).toBe(1);
    
    logger.debug(` Environment-specific configuration works: ${isDevelopment ? 'development' : 'production'} mode`);
  });

  test("Fallback RPC configuration pattern", async () => {
    // Simulate a pattern where you have primary and fallback RPCs
    const primaryRpc = REAL_RPC_ENDPOINTS.mainnet;
    const fallbackRpc = REAL_RPC_ENDPOINTS.backup;
    
    // For this test, we'll just use the primary (in real usage, you might implement fallback logic)
    const config = ohttpConfig({
      chains: [mainnet],
      rpcUrls: {
        [mainnet.id]: primaryRpc, // Could implement fallback logic here
      },
      ohttpOptions: {
        gateway: `http://localhost:${servers.gatewayPort}`,
        relay: `http://localhost:${servers.relayPort}`,
        timeout: 30000
      }
    });
    
    const client = createPublicClient({
      chain: mainnet,
      transport: config.transports[mainnet.id],
    });
    
    logger.debug("📡 Testing fallback RPC configuration pattern...");
    
    const chainId = await client.getChainId();
    expect(chainId).toBe(1);
    
    logger.debug(` Fallback RPC configuration pattern works (using primary: ${primaryRpc})`);
  });
});
