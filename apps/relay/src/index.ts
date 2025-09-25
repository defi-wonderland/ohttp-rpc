/**
 * OHTTP Relay Server
 * 
 * Stateless proxy that forwards OHTTP encapsulated requests to the gateway
 * without seeing the plaintext content. Handles CORS and basic rate limiting.
 */

import { CT_OHTTP_REQ, CT_OHTTP_RES, createLogger } from "@ohttp/shared";
import { assertContentType } from "@ohttp/core";
import { loadConfig, getDevConfig, type RelayConfig } from "./env.js";
import { handlePreflight, addCorsHeaders, isOriginAllowed } from "./cors.js";
import { 
  recordRequest, 
  recordRequestComplete, 
  recordRateLimitHit,
  getMetrics,
  logMetricsSummary 
} from "./metrics.js";

/**
 * Simple in-memory rate limiter
 */
class RateLimiter {
  private requests = new Map<string, number[]>();
  
  constructor(private maxRequests: number, private windowMs = 60000) {}
  
  isAllowed(clientId: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get existing requests for this client
    let requests = this.requests.get(clientId) || [];
    
    // Remove old requests outside the window
    requests = requests.filter(time => time > windowStart);
    
    // Check if under limit
    if (requests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    requests.push(now);
    this.requests.set(clientId, requests);
    
    return true;
  }
  
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    for (const [clientId, requests] of this.requests.entries()) {
      const validRequests = requests.filter(time => time > windowStart);
      if (validRequests.length === 0) {
        this.requests.delete(clientId);
      } else {
        this.requests.set(clientId, validRequests);
      }
    }
  }
}

/**
 * OHTTP Relay Server
 */
class RelayServer {
  private rateLimiter: RateLimiter;
  private logger = createLogger('relay');
  
  constructor(private config: RelayConfig) {
    this.rateLimiter = new RateLimiter(config.RATE_LIMIT_RPM);
    
    // Configure logger
    this.logger.configure({
      level: this.config.LOG_LEVEL,
      format: this.config.LOG_FORMAT,
    });
    
    // Periodic cleanup of rate limiter
    setInterval(() => this.rateLimiter.cleanup(), 60000);
    
    // Periodic metrics logging
    if (config.LOG_LEVEL === "debug" || config.LOG_LEVEL === "info") {
      setInterval(() => logMetricsSummary(), 30000);
    }
  }
  
  /**
   * Handle incoming request
   */
  async handleRequest(request: Request): Promise<Response> {
    const startTime = Date.now();
    const origin = request.headers.get("origin");
    
    try {
      // Record request attempt
      recordRequest();
      
      // Handle CORS preflight
      if (request.method === "OPTIONS") {
        return handlePreflight(request, this.config);
      }
      
      // Only allow POST requests to /relay
      if (request.method !== "POST") {
        return this.errorResponse(405, "Method not allowed", origin);
      }
      
      const url = new URL(request.url);
      if (url.pathname !== "/relay") {
        return this.errorResponse(404, "Not found", origin);
      }
      
      // Check rate limiting
      const clientId = this.getClientId(request);
      if (!this.rateLimiter.isAllowed(clientId)) {
        recordRateLimitHit();
        return this.errorResponse(429, "Too many requests", origin);
      }
      
      // Validate content type
      try {
        assertContentType(request.headers, CT_OHTTP_REQ);
      } catch (error) {
        return this.errorResponse(400, `Invalid content type: ${error}`, origin);
      }
      
      // Check body size
      const contentLength = request.headers.get("content-length");
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > this.config.MAX_BODY_BYTES) {
          return this.errorResponse(413, "Request too large", origin);
        }
      }
      
      // Forward to gateway
      const response = await this.forwardToGateway(request);
      
      // Record success metrics
      const latency = Date.now() - startTime;
      const bytesTransferred = parseInt(response.headers.get("content-length") || "0", 10);
      recordRequestComplete(response.status, latency, bytesTransferred);
      
      // Add CORS headers and return
      return addCorsHeaders(response, origin, this.config);
      
    } catch (error) {
      // Record failure metrics
      const latency = Date.now() - startTime;
      recordRequestComplete(500, latency, 0);
      
      this.logger.error("Relay error", { latency: `${latency}ms`, origin }, error instanceof Error ? error : undefined);
      return this.errorResponse(500, "Internal server error", origin);
    }
  }
  
  /**
   * Forward request to gateway
   */
  private async forwardToGateway(request: Request): Promise<Response> {
    // Create timeout signal
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(), 
      this.config.TOTAL_TIMEOUT_MS
    );
    
    try {
      // Get request body
      const body = await request.arrayBuffer();
      
      // Forward to gateway
      const response = await fetch(this.config.GATEWAY_URL, {
        method: "POST",
        headers: {
          "content-type": CT_OHTTP_REQ,
          "content-length": body.byteLength.toString(),
        },
        body,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Validate response content type
      if (response.ok) {
        try {
          assertContentType(response.headers, CT_OHTTP_RES);
        } catch (error) {
          this.logger.warn("Gateway returned invalid content type", {}, error instanceof Error ? error : undefined);
        }
      }
      
      // Return response (preserve status and headers)
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "content-type": response.headers.get("content-type") || CT_OHTTP_RES,
          "content-length": response.headers.get("content-length") || "0",
        },
      });
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Gateway request timeout");
      }
      
      throw error;
    }
  }
  
  /**
   * Create error response with CORS headers
   */
  private errorResponse(status: number, message: string, origin: string | null): Response {
    const response = new Response(message, { status });
    return addCorsHeaders(response, origin, this.config);
  }
  
  /**
   * Get client identifier for rate limiting (IP-based)
   */
  private getClientId(request: Request): string {
    // In a real deployment, you might use CF-Connecting-IP or similar
    return request.headers.get("x-forwarded-for") || 
           request.headers.get("x-real-ip") || 
           "unknown";
  }
}

/**
 * Health check endpoint
 */
function handleHealthCheck(): Response {
  const metrics = getMetrics();
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    metrics: {
      totalRequests: metrics.totalRequests,
      successRate: metrics.totalRequests > 0 
        ? (metrics.successfulRequests / metrics.totalRequests * 100).toFixed(1) + "%"
        : "0%",
      averageLatency: metrics.averageLatencyMs.toFixed(1) + "ms",
    },
  };
  
  return new Response(JSON.stringify(health, null, 2), {
    headers: { "content-type": "application/json" },
  });
}

/**
 * Main server setup
 */
function createServer(config: RelayConfig) {
  const relay = new RelayServer(config);
  let server: any = null;
  
  const serverObject = {
    port: config.RELAY_PORT,
    
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      
      // Health check endpoint
      if (url.pathname === "/health") {
        return handleHealthCheck();
      }
      
      // Main relay handler
      return relay.handleRequest(request);
    },
    
    start(): void {
      if (!server) {
        server = Bun.serve({
          port: config.RELAY_PORT,
          fetch: this.fetch.bind(this),
        });
        relay.logger.info("Relay server running", { port: config.RELAY_PORT });
      }
    },
    
    async close(): Promise<void> {
      if (server) {
        server.stop();
        server = null;
        relay.logger.info("Relay server stopped");
      }
    }
  };
  
  return serverObject;
}

/**
 * Start the server
 */
async function main() {
  // Load configuration
  const config = process.env.NODE_ENV === "development" 
    ? getDevConfig()
    : loadConfig();
  
  const logger = createLogger('relay-main', {
    level: config.LOG_LEVEL,
    format: config.LOG_FORMAT,
  });
  
  logger.info("Starting OHTTP Relay Server");
  logger.info("Configuration", {
    port: config.RELAY_PORT,
    gateway: config.GATEWAY_URL,
    allowedOrigins: config.ALLOWED_ORIGINS.length,
    maxBodyBytes: config.MAX_BODY_BYTES,
    rateLimitRpm: config.RATE_LIMIT_RPM,
    logLevel: config.LOG_LEVEL,
  });
  
  // Start server
  const server = createServer(config);
  server.start();
  
  logger.info("Server endpoints", {
    health: `http://localhost:${server.port}/health`,
  });
  
  // Export for Bun
  return server;
}

// Export for testing
export { createServer, RelayServer };

// Start server if this is the main module
if (import.meta.main) {
  main().then(server => {
    // Server started
  }).catch(error => {
    const logger = createLogger('relay-main');
    logger.error("Failed to start server", {}, error instanceof Error ? error : undefined);
    process.exit(1);
  });
}
