/**
 * OHTTP Gateway Server
 * 
 * Decrypts OHTTP requests, applies policy, forwards to RPC endpoints,
 * and returns encrypted responses.
 */

import { loadConfig, getDevConfig, validateHpkeSeed, type GatewayConfig } from "./env.js";
import { GatewayHpkeManager } from "./crypto/hpke.js";
import { handleOhttpKeys, handleConditionalOhttpKeys, handleOhttpKeysJson } from "./handlers/keys.js";
import { handleGateway, validateGatewayRequest } from "./handlers/gateway.js";

/**
 * Gateway metrics (privacy-preserving)
 */
interface GatewayMetrics {
  totalRequests: number;
  successfulRequests: number;
  policyDenials: number;
  upstreamErrors: number;
  cryptoErrors: number;
  averageLatencyMs: number;
}

const metrics: GatewayMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  policyDenials: 0,
  upstreamErrors: 0,
  cryptoErrors: 0,
  averageLatencyMs: 0,
};

const latencySamples: number[] = [];

/**
 * Record request metrics
 */
function recordRequest(type: 'success' | 'policy_denial' | 'upstream_error' | 'crypto_error', latency: number): void {
  metrics.totalRequests++;
  
  switch (type) {
    case 'success':
      metrics.successfulRequests++;
      break;
    case 'policy_denial':
      metrics.policyDenials++;
      break;
    case 'upstream_error':
      metrics.upstreamErrors++;
      break;
    case 'crypto_error':
      metrics.cryptoErrors++;
      break;
  }
  
  // Update latency moving average
  latencySamples.push(latency);
  if (latencySamples.length > 1000) {
    latencySamples.shift();
  }
  
  const sum = latencySamples.reduce((acc, sample) => acc + sample, 0);
  metrics.averageLatencyMs = sum / latencySamples.length;
}

/**
 * OHTTP Gateway Server
 */
class GatewayServer {
  private hpkeManager: GatewayHpkeManager;
  
  constructor(
    private config: GatewayConfig,
    hpkeManager?: GatewayHpkeManager
  ) {
    this.hpkeManager = hpkeManager || new GatewayHpkeManager();
  }
  
  /**
   * Initialize the gateway
   */
  async initialize(): Promise<void> {
    try {
      // Validate and decode HPKE seed
      const seedBytes = validateHpkeSeed(this.config.HPKE_SEED);
      
      // Initialize HPKE manager
      await this.hpkeManager.initializeFromSeed(seedBytes);
      
      console.log("✓ HPKE keys initialized");
      console.log("✓ Gateway ready");
      
    } catch (error) {
      console.error("Failed to initialize gateway:", error);
      throw error;
    }
  }
  
  /**
   * Handle incoming request
   */
  async handleRequest(request: Request): Promise<Response> {
    const startTime = Date.now();
    const url = new URL(request.url);
    
    try {
      // Handle different endpoints
      switch (url.pathname) {
        case "/ohttp-keys":
          return await this.handleKeysRequest(request);
          
        case "/ohttp-keys.json":
          return await handleOhttpKeysJson(this.hpkeManager);
          
        case "/gateway":
          return await this.handleGatewayRequest(request, startTime);
          
        case "/health":
          return this.handleHealthCheck();
          
        case "/metrics":
          return this.handleMetrics();
          
        default:
          return new Response("Not found", { status: 404 });
      }
      
    } catch (error) {
      const latency = Date.now() - startTime;
      recordRequest('crypto_error', latency);
      
      console.error("Gateway request error:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }
  
  /**
   * Handle OHTTP keys request
   */
  private async handleKeysRequest(request: Request): Promise<Response> {
    if (request.method === "GET") {
      // Check for conditional request
      if (request.headers.get("if-none-match")) {
        return await handleConditionalOhttpKeys(request, this.hpkeManager);
      }
      return await handleOhttpKeys(this.hpkeManager);
    }
    
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "if-none-match",
          "access-control-max-age": "86400",
        },
      });
    }
    
    return new Response("Method not allowed", { status: 405 });
  }
  
  /**
   * Handle gateway request
   */
  private async handleGatewayRequest(request: Request, startTime: number): Promise<Response> {
    // Validate request
    const validation = validateGatewayRequest(request);
    if (!validation.valid) {
      const latency = Date.now() - startTime;
      recordRequest('policy_denial', latency);
      return new Response(validation.error, { status: 400 });
    }
    
    try {
      const response = await handleGateway(request, this.hpkeManager, this.config);
      
      const latency = Date.now() - startTime;
      const requestType = response.status === 200 ? 'success' : 
                         response.status === 403 ? 'policy_denial' :
                         response.status >= 500 ? 'upstream_error' : 'crypto_error';
      
      recordRequest(requestType, latency);
      
      return response;
      
    } catch (error) {
      const latency = Date.now() - startTime;
      recordRequest('crypto_error', latency);
      throw error;
    }
  }
  
  /**
   * Handle health check
   */
  private handleHealthCheck(): Response {
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      hpke: {
        initialized: !!this.hpkeManager,
        suite: this.hpkeManager?.getSuite(),
      },
      metrics: {
        totalRequests: metrics.totalRequests,
        successRate: metrics.totalRequests > 0 
          ? ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1) + "%"
          : "0%",
        averageLatency: metrics.averageLatencyMs.toFixed(1) + "ms",
      },
    };
    
    return new Response(JSON.stringify(health, null, 2), {
      headers: { "content-type": "application/json" },
    });
  }
  
  /**
   * Handle metrics endpoint
   */
  private handleMetrics(): Response {
    return new Response(JSON.stringify(metrics, null, 2), {
      headers: { "content-type": "application/json" },
    });
  }
}

/**
 * Create server instance
 */
function createServer(config: GatewayConfig) {
  const gateway = new GatewayServer(config);
  
  return {
    port: config.GATEWAY_PORT,
    
    async fetch(request: Request): Promise<Response> {
      return gateway.handleRequest(request);
    },
    
    // Initialize the gateway
    initialize: () => gateway.initialize(),
  };
}

/**
 * Main server startup
 */
async function main() {
  // Load configuration
  const config = process.env.NODE_ENV === "development" 
    ? getDevConfig()
    : loadConfig();
  
  console.log("Starting OHTTP Gateway Server...");
  console.log(`Port: ${config.GATEWAY_PORT}`);
  console.log(`Allowed Targets: ${config.ALLOWED_TARGETS.join(", ")}`);
  console.log(`Allowed Headers: ${config.ALLOWED_HEADERS.join(", ")}`);
  console.log(`Max Inner Bytes: ${config.MAX_INNER_BYTES}`);
  
  // Create and initialize server
  const server = createServer(config);
  await server.initialize();
  
  console.log(`🚀 Gateway server running on port ${server.port}`);
  console.log(`OHTTP Keys: http://localhost:${server.port}/ohttp-keys`);
  console.log(`Health check: http://localhost:${server.port}/health`);
  
  return server;
}

// Export for testing
export { createServer, GatewayServer };

// Start server if this is the main module
if (import.meta.main) {
  main().then(server => {
    // Server started
  }).catch(console.error);
}
