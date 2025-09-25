/**
 * Reusable Test Utilities and Data Generators - Phase 6 of Testing Campaign
 * 
 * Comprehensive test utilities including:
 * - Data generators for edge cases
 * - Mock factories and builders
 * - Test fixtures and scenarios
 * - Assertion helpers
 * - Performance benchmarking utilities
 */

import { createHpkeEngine } from "../packages/hpke-engine/src/index.js";
import { encodeOhttpKeys, createTestKeyConfig } from "../packages/ohttp-core/src/ohttp.js";
import { encodeRequest as encodeBhttp } from "../packages/ohttp-core/src/bhttp.js";
import type { OhttpKeyConfig, InnerRequest, InnerResponse } from "@ohttp/shared";

// =============================================================================
// Data Generators
// =============================================================================

/**
 * Generate test data with various characteristics
 */
export class DataGenerator {
  /**
   * Generate random bytes with specified characteristics
   */
  static randomBytes(length: number, options: {
    pattern?: 'random' | 'zeros' | 'ones' | 'incremental' | 'alternating';
    seed?: number;
  } = {}): Uint8Array {
    const { pattern = 'random', seed } = options;
    const data = new Uint8Array(length);
    
    switch (pattern) {
      case 'zeros':
        data.fill(0);
        break;
        
      case 'ones':
        data.fill(0xFF);
        break;
        
      case 'incremental':
        for (let i = 0; i < length; i++) {
          data[i] = i % 256;
        }
        break;
        
      case 'alternating':
        for (let i = 0; i < length; i++) {
          data[i] = i % 2 === 0 ? 0x00 : 0xFF;
        }
        break;
        
      case 'random':
      default:
        if (seed !== undefined) {
          // Simple seeded random for reproducible tests
          let seedValue = seed;
          for (let i = 0; i < length; i++) {
            seedValue = (seedValue * 1664525 + 1013904223) % Math.pow(2, 32);
            data[i] = (seedValue >>> 24) & 0xFF;
          }
        } else {
          crypto.getRandomValues(data);
        }
        break;
    }
    
    return data;
  }
  
  /**
   * Generate edge case strings
   */
  static edgeCaseStrings(): string[] {
    return [
      "", // Empty string
      "a", // Single character
      "Hello, World!", // Normal string
      "🔐🌐🚀", // Unicode emojis
      "Ñiño", // Accented characters
      "こんにちは", // Non-Latin script
      "𝕳𝖊𝖑𝖑𝖔", // Mathematical symbols
      "\x00\x01\x02", // Control characters
      "A".repeat(1000), // Long string
      "A".repeat(65536), // Very long string
      "Line1\nLine2\rLine3\r\n", // Line breaks
      "Tab\tSeparated\tValues", // Tabs
      "\"Quoted\" 'String'", // Quotes
      "\\Escaped\\Characters\\", // Backslashes
      "SQL'; DROP TABLE users; --", // SQL injection attempt
      "<script>alert('xss')</script>", // XSS attempt
      "../../../etc/passwd", // Path traversal
      "%2e%2e%2f%2e%2e%2f", // URL encoded traversal
    ];
  }
  
  /**
   * Generate malicious URLs for security testing
   */
  static maliciousUrls(): string[] {
    return [
      "javascript:alert('xss')",
      "data:text/html,<script>alert('xss')</script>",
      "file:///etc/passwd",
      "ftp://evil.com/malware",
      "https://eth.llamarpc.com@evil.com/",
      "https://еth.llamarpc.com", // Cyrillic 'е'
      "http://127.0.0.1/",
      "http://169.254.169.254/", // AWS metadata
      "https://eth.llamarpc.com/../../../etc/passwd",
      "https://eth.llamarpc.com/%2e%2e%2f%2e%2e%2f",
      "https://evil.com/eth.llamarpc.com",
      "https://localhost.evil.com:3000",
    ];
  }
  
  /**
   * Generate valid test URLs
   */
  static validUrls(): string[] {
    return [
      "https://eth.llamarpc.com",
      "https://mainnet.infura.io/v3/api-key",
      "https://rpc.ankr.com/eth",
      "https://api.etherscan.io/api",
      "https://polygon-rpc.com",
      "https://bsc-dataseed.binance.org",
      "http://localhost:3000", // For testing
      "http://localhost:8545",
    ];
  }
  
  /**
   * Generate JSON-RPC test methods with parameters
   */
  static jsonRpcMethods(): Array<{ method: string; params: unknown[] }> {
    return [
      { method: "eth_chainId", params: [] },
      { method: "eth_blockNumber", params: [] },
      { method: "net_version", params: [] },
      { method: "eth_getBalance", params: ["0x742d35Cc6638C0532C9Fd5D2b5a8d5b4e1234567", "latest"] },
      { method: "eth_getBlockByNumber", params: ["latest", false] },
      { method: "eth_getTransactionCount", params: ["0x742d35Cc6638C0532C9Fd5D2b5a8d5b4e1234567", "pending"] },
      { method: "eth_gasPrice", params: [] },
      { method: "eth_estimateGas", params: [{ to: "0x742d35Cc6638C0532C9Fd5D2b5a8d5b4e1234567", value: "0x1" }] },
      { method: "eth_call", params: [{ to: "0x742d35Cc6638C0532C9Fd5D2b5a8d5b4e1234567", data: "0x70a08231" }, "latest"] },
      { method: "eth_sendRawTransaction", params: ["0x" + "a".repeat(200)] },
    ];
  }
  
  /**
   * Generate HTTP headers with edge cases
   */
  static httpHeaders(): Record<string, string>[] {
    return [
      {}, // No headers
      { "content-type": "application/json" }, // Basic
      { "content-type": "application/json", "accept": "application/json" }, // Common
      { "authorization": "Bearer " + "a".repeat(1000) }, // Long header value
      { "x-test": "value\r\nX-Injected: true" }, // CRLF injection attempt
      { "content-type": "application/json", "x-custom-1": "value1", "x-custom-2": "value2" }, // Multiple custom
      { "accept-encoding": "gzip, deflate, br" }, // Compression
      { "cache-control": "no-cache, no-store, must-revalidate" }, // Cache control
      { "user-agent": "TestAgent/1.0" }, // User agent (should be filtered)
      { "x-forwarded-for": "192.168.1.1" }, // Forwarded header (should be filtered)
    ];
  }
}

// =============================================================================
// Mock Factories
// =============================================================================

/**
 * Factory for creating test key configurations
 */
export class KeyConfigFactory {
  /**
   * Create a basic test key configuration
   */
  static async create(options: {
    keyId?: Uint8Array;
    publicKey?: Uint8Array;
    suite?: OhttpKeyConfig['suite'];
  } = {}): Promise<OhttpKeyConfig> {
    const hpkeEngine = createHpkeEngine();
    
    let keyId = options.keyId;
    let publicKey = options.publicKey;
    
    if (!keyId || !publicKey) {
      try {
        const keyPair = await hpkeEngine.generateKeyPair();
        keyId = keyId || keyPair.publicKey.kid;
        publicKey = publicKey || keyPair.publicKey.bytes;
      } catch (error) {
        console.warn(`⚠️ HPKE key generation failed, using provided fallback data: ${(error as Error).message}`);
        // Only use fallback if explicitly provided
        if (!keyId || !publicKey) {
          throw new Error(`HPKE key generation failed and no fallback data provided: ${(error as Error).message}`);
        }
      }
    }
    
    return createTestKeyConfig(publicKey, keyId, options.suite);
  }
  
  /**
   * Create multiple key configurations
   */
  static async createMultiple(count: number): Promise<OhttpKeyConfig[]> {
    const configs = [];
    
    for (let i = 0; i < count; i++) {
      const config = await this.create({
        keyId: new Uint8Array([i]),
        publicKey: DataGenerator.randomBytes(32, { seed: i }),
      });
      configs.push(config);
    }
    
    return configs;
  }
  
  /**
   * Create edge case key configurations
   */
  static createEdgeCases(): OhttpKeyConfig[] {
    return [
      // Minimum key ID
      createTestKeyConfig(DataGenerator.randomBytes(32), new Uint8Array([0x00])),
      
      // Maximum single-byte key ID
      createTestKeyConfig(DataGenerator.randomBytes(32), new Uint8Array([0xFF])),
      
      // Multi-byte key ID
      createTestKeyConfig(DataGenerator.randomBytes(32), new Uint8Array([0x01, 0x02, 0x03])),
      
      // Maximum key ID length (8 bytes)
      createTestKeyConfig(DataGenerator.randomBytes(32), new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])),
      
      // All-zeros public key
      createTestKeyConfig(new Uint8Array(32).fill(0x00), new Uint8Array([0x01])),
      
      // All-ones public key
      createTestKeyConfig(new Uint8Array(32).fill(0xFF), new Uint8Array([0x02])),
    ];
  }
}

/**
 * Factory for creating test HTTP requests
 */
export class RequestFactory {
  /**
   * Create a basic JSON-RPC request
   */
  static jsonRpc(options: {
    method?: string;
    params?: unknown[];
    id?: string | number;
    url?: string;
    headers?: Record<string, string>;
    paddingBytes?: number;
  } = {}): InnerRequest {
    const {
      method = "eth_chainId",
      params = [],
      id = 1,
      url = "https://eth.llamarpc.com",
      headers = { "content-type": "application/json" },
      paddingBytes
    } = options;
    
    const jsonRpcRequest = {
      jsonrpc: "2.0" as const,
      method,
      params,
      id
    };
    
    return {
      method: "POST",
      url,
      headers,
      body: new TextEncoder().encode(JSON.stringify(jsonRpcRequest)),
      paddingBytes
    };
  }
  
  /**
   * Create requests with various sizes
   */
  static withSizes(sizes: number[]): InnerRequest[] {
    return sizes.map(size => ({
      method: "POST",
      url: "https://test.com",
      headers: { "content-type": "application/octet-stream" },
      body: DataGenerator.randomBytes(size)
    }));
  }
  
  /**
   * Create requests with edge case data
   */
  static edgeCases(): InnerRequest[] {
    const edgeCases = [];
    
    // Empty body
    edgeCases.push({
      method: "GET",
      url: "https://test.com",
      headers: { "accept": "application/json" }
    });
    
    // Binary data
    edgeCases.push({
      method: "POST",
      url: "https://test.com",
      headers: { "content-type": "application/octet-stream" },
      body: new Uint8Array([0x00, 0xFF, 0x7F, 0x80, 0x01, 0xFE])
    });
    
    // Large request
    edgeCases.push({
      method: "POST",
      url: "https://test.com",
      headers: { "content-type": "text/plain" },
      body: new TextEncoder().encode("x".repeat(100000))
    });
    
    // Unicode content
    edgeCases.push({
      method: "POST",
      url: "https://test.com",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: new TextEncoder().encode(JSON.stringify({ message: "Hello 🌍! Ñiño こんにちは" }))
    });
    
    return edgeCases;
  }
  
  /**
   * Create malformed requests for error testing
   */
  static malformed(): Array<{ name: string; request: Partial<InnerRequest> }> {
    return [
      {
        name: "missing method",
        request: {
          url: "https://test.com",
          headers: { "content-type": "application/json" }
        }
      },
      {
        name: "missing URL",
        request: {
          method: "POST",
          headers: { "content-type": "application/json" }
        }
      },
      {
        name: "invalid method",
        request: {
          method: "INVALID" as any,
          url: "https://test.com",
          headers: { "content-type": "application/json" }
        }
      },
      {
        name: "invalid URL",
        request: {
          method: "POST",
          url: "not-a-url",
          headers: { "content-type": "application/json" }
        }
      }
    ];
  }
}

/**
 * Factory for creating test HTTP responses
 */
export class ResponseFactory {
  /**
   * Create a basic JSON-RPC response
   */
  static jsonRpc(options: {
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
    id?: string | number;
    headers?: Record<string, string>;
  } = {}): InnerResponse {
    const {
      result = "0x1",
      error,
      id = 1,
      headers = { "content-type": "application/json" }
    } = options;
    
    const jsonRpcResponse = error
      ? { jsonrpc: "2.0" as const, error, id }
      : { jsonrpc: "2.0" as const, result, id };
    
    return {
      status: 200,
      headers,
      body: new TextEncoder().encode(JSON.stringify(jsonRpcResponse))
    };
  }
  
  /**
   * Create error responses
   */
  static errors(): Array<{ name: string; response: InnerResponse }> {
    return [
      {
        name: "400 Bad Request",
        response: {
          status: 400,
          headers: { "content-type": "text/plain" },
          body: new TextEncoder().encode("Bad Request")
        }
      },
      {
        name: "401 Unauthorized",
        response: {
          status: 401,
          headers: { "content-type": "application/json" },
          body: new TextEncoder().encode(JSON.stringify({ error: "Unauthorized" }))
        }
      },
      {
        name: "403 Forbidden",
        response: {
          status: 403,
          headers: { "content-type": "text/plain" },
          body: new TextEncoder().encode("Forbidden")
        }
      },
      {
        name: "404 Not Found",
        response: {
          status: 404,
          headers: { "content-type": "text/html" },
          body: new TextEncoder().encode("<html><body>Not Found</body></html>")
        }
      },
      {
        name: "500 Internal Server Error",
        response: {
          status: 500,
          headers: { "content-type": "application/json" },
          body: new TextEncoder().encode(JSON.stringify({
            error: {
              code: -32603,
              message: "Internal error",
              data: { details: "Something went wrong" }
            }
          }))
        }
      },
      {
        name: "503 Service Unavailable",
        response: {
          status: 503,
          headers: { 
            "content-type": "text/plain",
            "retry-after": "60"
          },
          body: new TextEncoder().encode("Service Unavailable")
        }
      }
    ];
  }
}

// =============================================================================
// Test Scenarios
// =============================================================================

/**
 * Pre-built test scenarios
 */
export class TestScenarios {
  /**
   * Basic functionality scenarios
   */
  static basic(): Array<{ name: string; request: InnerRequest; expectedStatus: number }> {
    return [
      {
        name: "Simple GET request",
        request: RequestFactory.jsonRpc({ method: "eth_chainId" }),
        expectedStatus: 200
      },
      {
        name: "POST with parameters",
        request: RequestFactory.jsonRpc({ 
          method: "eth_getBalance", 
          params: ["0x742d35Cc6638C0532C9Fd5D2b5a8d5b4e1234567", "latest"] 
        }),
        expectedStatus: 200
      },
      {
        name: "Large request",
        request: RequestFactory.jsonRpc({ 
          method: "eth_call", 
          params: [{ data: "0x" + "a".repeat(1000) }, "latest"] 
        }),
        expectedStatus: 200
      }
    ];
  }
  
  /**
   * Error handling scenarios
   */
  static errorHandling(): Array<{ name: string; setup: () => void; expectError: boolean }> {
    return [
      {
        name: "Network timeout",
        setup: () => {
          // Mock setup for timeout simulation
        },
        expectError: true
      },
      {
        name: "Invalid JSON response",
        setup: () => {
          // Mock setup for malformed response
        },
        expectError: true
      },
      {
        name: "RPC error response",
        setup: () => {
          // Mock setup for RPC error
        },
        expectError: true
      }
    ];
  }
  
  /**
   * Performance test scenarios
   */
  static performance(): Array<{ name: string; config: any; expectations: any }> {
    return [
      {
        name: "High throughput",
        config: { concurrency: 100, duration: 10000 },
        expectations: { minThroughput: 50, maxLatency: 1000 }
      },
      {
        name: "Memory efficiency",
        config: { payloadSize: 10000, iterations: 1000 },
        expectations: { maxMemoryGrowth: 50 * 1024 * 1024 }
      },
      {
        name: "CPU efficiency",
        config: { operations: 1000, complexity: "high" },
        expectations: { maxCpuTime: 5000 }
      }
    ];
  }
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Custom assertion helpers for OHTTP testing
 */
export class AssertionHelpers {
  /**
   * Assert that a response is a valid JSON-RPC response
   */
  static assertValidJsonRpc(response: any, expectedId?: string | number): void {
    expect(response).toBeDefined();
    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBeDefined();
    
    if (expectedId !== undefined) {
      expect(response.id).toBe(expectedId);
    }
    
    // Should have either result or error, but not both
    const hasResult = response.result !== undefined;
    const hasError = response.error !== undefined;
    
    expect(hasResult || hasError).toBe(true);
    expect(hasResult && hasError).toBe(false);
    
    if (hasError) {
      expect(typeof response.error.code).toBe("number");
      expect(typeof response.error.message).toBe("string");
    }
  }
  
  /**
   * Assert that a key configuration is valid
   */
  static assertValidKeyConfig(config: OhttpKeyConfig): void {
    expect(config.keyId).toBeInstanceOf(Uint8Array);
    expect(config.keyId.length).toBeGreaterThan(0);
    expect(config.keyId.length).toBeLessThanOrEqual(8);
    
    expect(config.publicKey).toBeInstanceOf(Uint8Array);
    expect(config.publicKey.length).toBeGreaterThan(0);
    
    expect(config.suite).toBeDefined();
    expect(config.suite.kem).toBeDefined();
    expect(config.suite.kdf).toBeDefined();
    expect(config.suite.aead).toBeDefined();
  }
  
  /**
   * Assert that an inner request is valid
   */
  static assertValidInnerRequest(request: InnerRequest): void {
    expect(request.method).toBeDefined();
    expect(typeof request.method).toBe("string");
    
    // Method should be a valid HTTP method
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH'];
    expect(validMethods).toContain(request.method.toUpperCase());
    
    expect(request.url).toBeDefined();
    expect(typeof request.url).toBe("string");
    
    // URL should be valid
    expect(() => new URL(request.url)).not.toThrow();
    
    if (request.headers) {
      expect(typeof request.headers).toBe("object");
      
      // All header names should be lowercase strings
      for (const [name, value] of Object.entries(request.headers)) {
        expect(typeof name).toBe("string");
        expect(name).toBe(name.toLowerCase());
        expect(typeof value).toBe("string");
      }
    }
    
    if (request.body) {
      expect(request.body).toBeInstanceOf(Uint8Array);
    }
    
    if (request.paddingBytes) {
      expect(typeof request.paddingBytes).toBe("number");
      expect(request.paddingBytes).toBeGreaterThan(0);
    }
  }
  
  /**
   * Assert that an inner response is valid
   */
  static assertValidInnerResponse(response: InnerResponse): void {
    expect(typeof response.status).toBe("number");
    expect(response.status).toBeGreaterThanOrEqual(100);
    expect(response.status).toBeLessThan(600);
    
    if (response.headers) {
      expect(typeof response.headers).toBe("object");
      
      for (const [name, value] of Object.entries(response.headers)) {
        expect(typeof name).toBe("string");
        expect(typeof value).toBe("string");
      }
    }
    
    expect(response.body).toBeInstanceOf(Uint8Array);
  }
  
  /**
   * Assert performance characteristics
   */
  static assertPerformance(
    metrics: { duration: number; memoryUsage: number; cpuUsage?: number },
    expectations: { maxDuration?: number; maxMemory?: number; maxCpu?: number }
  ): void {
    if (expectations.maxDuration !== undefined) {
      expect(metrics.duration).toBeLessThan(expectations.maxDuration);
    }
    
    if (expectations.maxMemory !== undefined) {
      expect(metrics.memoryUsage).toBeLessThan(expectations.maxMemory);
    }
    
    if (expectations.maxCpu !== undefined && metrics.cpuUsage !== undefined) {
      expect(metrics.cpuUsage).toBeLessThan(expectations.maxCpu);
    }
  }
  
  /**
   * Assert that no memory leaks occurred
   */
  static assertNoMemoryLeaks(
    initialMemory: NodeJS.MemoryUsage,
    finalMemory: NodeJS.MemoryUsage,
    tolerance: number = 10 * 1024 * 1024 // 10MB default tolerance
  ): void {
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    
    expect(memoryGrowth).toBeLessThan(tolerance);
    
    // RSS should not grow excessively either
    const rssGrowth = finalMemory.rss - initialMemory.rss;
    expect(rssGrowth).toBeLessThan(tolerance * 2);
  }
}

// =============================================================================
// Performance Benchmarking Utilities
// =============================================================================

/**
 * Benchmarking utilities for performance testing
 */
export class BenchmarkUtils {
  /**
   * Measure execution time of an operation
   */
  static async measureTime<T>(operation: () => Promise<T> | T): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await operation();
    const end = performance.now();
    
    return {
      result,
      duration: end - start
    };
  }
  
  /**
   * Measure memory usage of an operation
   */
  static async measureMemory<T>(operation: () => Promise<T> | T): Promise<{ result: T; memoryDelta: number }> {
    const memoryBefore = process.memoryUsage();
    const result = await operation();
    const memoryAfter = process.memoryUsage();
    
    return {
      result,
      memoryDelta: memoryAfter.heapUsed - memoryBefore.heapUsed
    };
  }
  
  /**
   * Run a benchmark with multiple iterations
   */
  static async benchmark<T>(
    name: string,
    operation: () => Promise<T> | T,
    iterations: number = 100
  ): Promise<{
    name: string;
    iterations: number;
    totalTime: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
    standardDeviation: number;
    operationsPerSecond: number;
  }> {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const { duration } = await this.measureTime(operation);
      times.push(duration);
    }
    
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / iterations;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    const variance = times.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / iterations;
    const standardDeviation = Math.sqrt(variance);
    
    const operationsPerSecond = 1000 / averageTime; // Convert ms to ops/sec
    
    return {
      name,
      iterations,
      totalTime,
      averageTime,
      minTime,
      maxTime,
      standardDeviation,
      operationsPerSecond
    };
  }
  
  /**
   * Compare two benchmark results
   */
  static compareBenchmarks(
    baseline: ReturnType<typeof BenchmarkUtils.benchmark> extends Promise<infer T> ? T : never,
    current: ReturnType<typeof BenchmarkUtils.benchmark> extends Promise<infer T> ? T : never
  ): {
    speedupRatio: number;
    isRegression: boolean;
    percentChange: number;
  } {
    const speedupRatio = baseline.averageTime / current.averageTime;
    const percentChange = ((current.averageTime - baseline.averageTime) / baseline.averageTime) * 100;
    const isRegression = speedupRatio < 0.95; // Consider 5% slowdown a regression
    
    return {
      speedupRatio,
      isRegression,
      percentChange
    };
  }
}

// =============================================================================
// Test Environment Utilities
// =============================================================================

/**
 * Utilities for test environment management
 */
export class TestEnvironment {
  /**
   * Clean up test environment
   */
  static cleanup(): void {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Clear any global state
    // (Add specific cleanup as needed)
  }
  
  /**
   * Setup test environment with specific conditions
   */
  static setup(conditions: {
    memoryPressure?: boolean;
    cpuLoad?: boolean;
    networkDelay?: number;
  } = {}): () => void {
    const cleanupFunctions: Array<() => void> = [];
    
    if (conditions.memoryPressure) {
      // Create memory pressure
      const memoryBallast: Uint8Array[] = [];
      for (let i = 0; i < 50; i++) {
        memoryBallast.push(new Uint8Array(1024 * 1024)); // 1MB each
      }
      
      cleanupFunctions.push(() => {
        memoryBallast.length = 0;
      });
    }
    
    if (conditions.cpuLoad) {
      // Create CPU load
      const interval = setInterval(() => {
        const start = Date.now();
        while (Date.now() - start < 10) {
          // Busy wait for 10ms every 100ms
        }
      }, 100);
      
      cleanupFunctions.push(() => {
        clearInterval(interval);
      });
    }
    
    // Return cleanup function
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
      this.cleanup();
    };
  }
  
  /**
   * Get system information for test context
   */
  static getSystemInfo(): {
    platform: string;
    arch: string;
    nodeVersion: string;
    memory: NodeJS.MemoryUsage;
    uptime: number;
  } {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
  }
}

// =============================================================================
// Export all utilities
// =============================================================================

// All classes are already exported individually above
