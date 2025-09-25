/**
 * Mock JSON-RPC server for testing
 */

import type { JsonRpcRequest, JsonRpcResponse } from "@ohttp/shared";
import { CT_JSON } from "@ohttp/shared";

/**
 * Mock RPC method handlers
 */
type RpcHandler = (params: unknown[]) => unknown;

/**
 * Mock JSON-RPC server
 */
export class MockRpcServer {
  private handlers = new Map<string, RpcHandler>();
  private server: { port: number; fetch: (request: Request) => Promise<Response> } | null = null;
  
  constructor(private port: number = 3001) {
    this.setupDefaultHandlers();
  }
  
  /**
   * Add RPC method handler
   */
  addHandler(method: string, handler: RpcHandler): void {
    this.handlers.set(method, handler);
  }
  
  /**
   * Remove RPC method handler
   */
  removeHandler(method: string): void {
    this.handlers.delete(method);
  }
  
  /**
   * Setup default Ethereum RPC handlers
   */
  private setupDefaultHandlers(): void {
    // Chain ID
    this.addHandler("eth_chainId", () => "0x1");
    
    // Block number
    this.addHandler("eth_blockNumber", () => "0x1234567");
    
    // Gas price
    this.addHandler("eth_gasPrice", () => "0x4a817c800");
    
    // Get balance
    this.addHandler("eth_getBalance", (params) => {
      const address = params[0];
      // Return different balances for different addresses
      if (typeof address === "string" && address.toLowerCase().includes("dead")) {
        return "0x0";
      }
      return "0xde0b6b3a7640000"; // 1 ETH
    });
    
    // Estimate gas
    this.addHandler("eth_estimateGas", () => "0x5208"); // 21000 gas
    
    // Send raw transaction
    this.addHandler("eth_sendRawTransaction", (params) => {
      const rawTx = params[0];
      if (typeof rawTx !== "string") {
        throw { code: -32602, message: "Invalid params" };
      }
      
      // Simulate transaction hash
      return "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("");
    });
    
    // Get transaction receipt
    this.addHandler("eth_getTransactionReceipt", (params) => {
      const txHash = params[0];
      if (typeof txHash !== "string") {
        return null;
      }
      
      return {
        transactionHash: txHash,
        blockNumber: "0x1234567",
        blockHash: "0x" + Array(64).fill("a").join(""),
        transactionIndex: "0x0",
        from: "0x" + Array(40).fill("1").join(""),
        to: "0x" + Array(40).fill("2").join(""),
        gasUsed: "0x5208",
        cumulativeGasUsed: "0x5208",
        status: "0x1",
        logs: [],
      };
    });
    
    // Call contract
    this.addHandler("eth_call", () => {
      return "0x" + Array(64).fill("0").join(""); // Empty return data
    });
    
    // Get logs
    this.addHandler("eth_getLogs", () => []);
    
    // Net version
    this.addHandler("net_version", () => "1");
    
    // Web3 client version
    this.addHandler("web3_clientVersion", () => "MockRPC/1.0.0");
  }
  
  /**
   * Handle JSON-RPC request
   */
  private async handleRequest(request: Request): Promise<Response> {
    try {
      // Only handle POST requests
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      
      // Parse JSON-RPC request
      const body = await request.text();
      let jsonRpcRequest: JsonRpcRequest;
      
      try {
        jsonRpcRequest = JSON.parse(body);
      } catch {
        return this.createErrorResponse(-32700, "Parse error", null);
      }
      
      // Validate JSON-RPC format
      if (jsonRpcRequest.jsonrpc !== "2.0" || !jsonRpcRequest.method) {
        return this.createErrorResponse(-32600, "Invalid Request", jsonRpcRequest.id);
      }
      
      // Find handler
      const handler = this.handlers.get(jsonRpcRequest.method);
      if (!handler) {
        return this.createErrorResponse(-32601, "Method not found", jsonRpcRequest.id);
      }
      
      // Execute handler
      try {
        const result = handler(jsonRpcRequest.params || []);
        
        const response: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: jsonRpcRequest.id,
          result,
        };
        
        return new Response(JSON.stringify(response), {
          headers: { "content-type": CT_JSON },
        });
        
      } catch (error) {
        // Handler threw an error
        if (typeof error === "object" && error !== null && "code" in error) {
          const errorObj = error as { code: unknown; message?: string; data?: unknown };
          return this.createErrorResponse(
            errorObj.code as number,
            errorObj.message || "Unknown error",
            jsonRpcRequest.id,
            errorObj.data
          );
        }
        
        return this.createErrorResponse(-32603, "Internal error", jsonRpcRequest.id);
      }
      
    } catch (error) {
      console.error("Mock RPC server error:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }
  
  /**
   * Create JSON-RPC error response
   */
  private createErrorResponse(
    code: number,
    message: string,
    id: string | number | null,
    data?: unknown
  ): Response {
    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
        ...(data ? { data } : {}),
      },
    };
    
    return new Response(JSON.stringify(response), {
      headers: { "content-type": CT_JSON },
    });
  }
  
  /**
   * Start the mock server
   */
  start(): { port: number; fetch: (request: Request) => Promise<Response> } {
    if (this.server) {
      throw new Error("Server already started");
    }
    
    this.server = {
      port: this.port,
      fetch: (request: Request) => this.handleRequest(request),
    };
    
    console.log(`Mock RPC server started on port ${this.port}`);
    return this.server;
  }
  
  /**
   * Stop the mock server
   */
  stop(): void {
    if (this.server) {
      this.server = null;
      console.log("Mock RPC server stopped");
    }
  }
  
  /**
   * Get server URL
   */
  getUrl(): string {
    return `http://localhost:${this.port}`;
  }
}

/**
 * Create a mock RPC server with default Ethereum handlers
 */
export function createMockRpcServer(port?: number): MockRpcServer {
  return new MockRpcServer(port);
}
