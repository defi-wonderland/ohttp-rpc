/**
 * End-to-end testing utilities
 */

// import { OhttpClient, ohttpFetch, OhttpRpcProvider } from "@ohttp/sdk";
import { MockRpcServer } from "./mock-rpc.js";
// import type { GatewayServer } from "../../apps/gateway/src/index.js";
// import type { RelayServer } from "../../apps/relay/src/index.js";

// Temporary placeholder types for servers
interface GatewayServer {
  port: number;
  stop(): Promise<void>;
}

interface RelayServer {
  port: number;
  stop(): Promise<void>;
}

/**
 * E2E test environment
 */
export interface E2ETestEnvironment {
  mockRpc: MockRpcServer;
  gateway: GatewayServer;
  relay: RelayServer;
  gatewayUrl: string;
  relayUrl: string;
  rpcUrl: string;
}

/**
 * E2E test configuration
 */
export interface E2ETestConfig {
  rpcPort?: number;
  gatewayPort?: number;
  relayPort?: number;
  timeout?: number;
}

/**
 * E2E test harness
 */
export class E2ETestHarness {
  private mockRpc: MockRpcServer | null = null;
  private environment: E2ETestEnvironment | null = null;
  
  constructor(private config: E2ETestConfig = {}) {}
  
  /**
   * Setup test environment
   */
  async setup(): Promise<E2ETestEnvironment> {
    const {
      rpcPort = 3001,
      gatewayPort = 8788,
      relayPort = 8787,
    } = this.config;
    
    try {
      // Start mock RPC server
      this.mockRpc = new MockRpcServer(rpcPort);
      const mockRpcServer = this.mockRpc.start();
      
      // TODO: Start gateway and relay servers
      // This would require importing the actual server classes
      // For now, we'll create placeholder URLs
      
      this.environment = {
        mockRpc: this.mockRpc,
        gateway: {} as GatewayServer, // Placeholder
        relay: {} as RelayServer, // Placeholder
        gatewayUrl: `http://localhost:${gatewayPort}`,
        relayUrl: `http://localhost:${relayPort}`,
        rpcUrl: this.mockRpc.getUrl(),
      };
      
      console.log("E2E test environment setup complete");
      return this.environment;
      
    } catch (error) {
      await this.cleanup();
      throw new Error(`Failed to setup E2E environment: ${error}`);
    }
  }
  
  /**
   * Cleanup test environment
   */
  async cleanup(): Promise<void> {
    if (this.mockRpc) {
      this.mockRpc.stop();
      this.mockRpc = null;
    }
    
    this.environment = null;
    console.log("E2E test environment cleaned up");
  }
  
  /**
   * Get test environment
   */
  getEnvironment(): E2ETestEnvironment {
    if (!this.environment) {
      throw new Error("E2E environment not setup");
    }
    return this.environment;
  }
  
  /**
   * Run basic connectivity test
   */
  async testConnectivity(): Promise<boolean> {
    const env = this.getEnvironment();
    
    try {
      // Test mock RPC directly
      const rpcResponse = await fetch(env.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_chainId",
          params: [],
          id: 1,
        }),
      });
      
      if (!rpcResponse.ok) {
        throw new Error(`Mock RPC not responding: ${rpcResponse.status}`);
      }
      
      const rpcResult = await rpcResponse.json();
      console.log("✓ Mock RPC connectivity:", rpcResult.result);
      
      // TODO: Test gateway and relay connectivity
      // This would require the actual servers to be running
      
      return true;
      
    } catch (error) {
      console.error("✗ Connectivity test failed:", error);
      return false;
    }
  }
  
  /**
   * Run end-to-end OHTTP test
   */
  async testE2EFlow(): Promise<boolean> {
    const env = this.getEnvironment();
    
    try {
      // TODO: This would require actual gateway/relay servers
      // For now, we'll test the SDK components in isolation
      
      console.log("E2E flow test (mock implementation)");
      console.log("Gateway URL:", env.gatewayUrl);
      console.log("Relay URL:", env.relayUrl);
      console.log("RPC URL:", env.rpcUrl);
      
      // Test would involve:
      // 1. Create OHTTP client with gateway key config
      // 2. Make request via relay to RPC
      // 3. Verify response
      
      return true;
      
    } catch (error) {
      console.error("✗ E2E flow test failed:", error);
      return false;
    }
  }
}

/**
 * Run quick E2E smoke test
 */
export async function runSmokeTest(config?: E2ETestConfig): Promise<boolean> {
  const harness = new E2ETestHarness(config);
  
  try {
    await harness.setup();
    
    const connectivityOk = await harness.testConnectivity();
    if (!connectivityOk) {
      return false;
    }
    
    const e2eOk = await harness.testE2EFlow();
    return e2eOk;
    
  } finally {
    await harness.cleanup();
  }
}

/**
 * Test utilities for common scenarios
 */
export const testUtils = {
  /**
   * Create test JSON-RPC request
   */
  createJsonRpcRequest(method: string, params: unknown[] = [], id: string | number = 1) {
    return {
      jsonrpc: "2.0" as const,
      method,
      params,
      id,
    };
  },
  
  /**
   * Wait for a condition to be true
   */
  async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  },
  
  /**
   * Generate test data
   */
  generateTestData: {
    address: () => "0x" + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(""),
    txHash: () => "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(""),
    bytes: (length: number) => crypto.getRandomValues(new Uint8Array(length)),
  },
};
