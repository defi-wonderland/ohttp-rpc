/**
 * EIP-1193 Compatible OHTTP RPC Provider
 * 
 * Provides a wallet-compatible interface for Ethereum RPC calls over OHTTP
 */

import type { 
  EIP1193RequestArguments,
  JsonRpcRequest,
  JsonRpcResponse 
} from "@ohttp/shared";
import type { HpkeEngine } from "@ohttp/hpke-engine";
import { createHpkeEngine } from "@ohttp/hpke-engine";
import { OhttpClient } from "./client.js";
import { ohttpJsonRpc } from "./fetch.js";
import { TargetRpcError, ConfigError } from "./errors.js";

/**
 * Provider configuration options
 */
export interface OhttpRpcProviderOptions {
  /** Gateway key configuration (URL or bytes) */
  gatewayKeyConfig: string | Uint8Array;
  
  /** Relay server URL */
  relayUrl: string;
  
  /** Target RPC endpoint URL */
  targetRpcUrl: string;
  
  /** Custom HPKE engine (optional) */
  engine?: HpkeEngine;
  
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  
  /** Default padding bytes for requests */
  paddingBytes?: number;
  
  /** Custom fetch function */
  fetchFn?: typeof fetch;
}

/**
 * Event types for EIP-1193 compatibility
 */
export type ProviderEvent = 
  | "connect"
  | "disconnect" 
  | "accountsChanged"
  | "chainChanged"
  | "message";

/**
 * EIP-1193 compatible OHTTP RPC Provider
 */
export class OhttpRpcProvider {
  private client: OhttpClient | null = null;
  private eventListeners = new Map<ProviderEvent, Set<Function>>();
  
  constructor(private readonly options: OhttpRpcProviderOptions) {
    // Validate configuration
    if (!options.gatewayKeyConfig) {
      throw new ConfigError("Gateway key configuration is required");
    }
    if (!options.relayUrl) {
      throw new ConfigError("Relay URL is required");
    }
    if (!options.targetRpcUrl) {
      throw new ConfigError("Target RPC URL is required");
    }
    
    // Initialize client asynchronously
    this.initializeClient();
  }
  
  /**
   * Initialize the OHTTP client
   */
  private async initializeClient(): Promise<void> {
    try {
      const { gatewayKeyConfig, engine = createHpkeEngine() } = this.options;
      
      this.client = typeof gatewayKeyConfig === "string"
        ? await OhttpClient.fromKeyConfigUrl(gatewayKeyConfig, { engine })
        : await OhttpClient.fromKeyConfigBytes(gatewayKeyConfig, engine);
        
      // Emit connect event
      this.emit("connect", { chainId: null });
      
    } catch (error) {
      console.error("Failed to initialize OHTTP client:", error);
      this.emit("disconnect", error);
    }
  }
  
  /**
   * EIP-1193 request method
   */
  async request(args: EIP1193RequestArguments): Promise<unknown> {
    const { method, params } = args;
    
    // Ensure client is initialized
    if (!this.client) {
      // Try to initialize if not already done
      await this.initializeClient();
      if (!this.client) {
        throw new ConfigError("OHTTP client not initialized");
      }
    }
    
    try {
      // Handle special provider methods
      if (method === "eth_requestAccounts" || method === "eth_accounts") {
        // OHTTP provider doesn't manage accounts
        return [];
      }
      
      if (method === "wallet_requestPermissions") {
        // No permissions needed for read-only access
        return [];
      }
      
      if (method === "wallet_getPermissions") {
        return [];
      }
      
      // Make JSON-RPC request via OHTTP
      const result = await ohttpJsonRpc(
        this.options.gatewayKeyConfig,
        this.options.relayUrl,
        this.options.targetRpcUrl,
        method,
        params as unknown[],
        {
          timeoutMs: this.options.timeoutMs,
          paddingBytes: this.options.paddingBytes,
          fetchFn: this.options.fetchFn,
        }
      );
      
      return result;
      
    } catch (error) {
      // Convert errors to EIP-1193 format
      if (error instanceof TargetRpcError && error.rpcError) {
        throw {
          code: error.rpcError.code,
          message: error.rpcError.message,
          data: error.rpcError.data,
        };
      }
      
      // Generic error
      throw {
        code: -32603, // Internal error
        message: error instanceof Error ? error.message : "Unknown error",
        data: error,
      };
    }
  }
  
  /**
   * EIP-1193 event listener management
   */
  on(event: ProviderEvent, listener: Function): this {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
    return this;
  }
  
  removeListener(event: ProviderEvent, listener: Function): this {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
    return this;
  }
  
  /**
   * Emit events to listeners
   */
  private emit(event: ProviderEvent, data?: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }
  
  /**
   * Check if provider is connected
   */
  isConnected(): boolean {
    return this.client !== null;
  }
  
  /**
   * Get current chain ID
   */
  async getChainId(): Promise<string> {
    const chainId = await this.request({ method: "eth_chainId" });
    return chainId as string;
  }
  
  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<string> {
    const blockNumber = await this.request({ method: "eth_blockNumber" });
    return blockNumber as string;
  }
  
  /**
   * Get account balance
   */
  async getBalance(address: string, blockTag = "latest"): Promise<string> {
    const balance = await this.request({ 
      method: "eth_getBalance", 
      params: [address, blockTag] 
    });
    return balance as string;
  }
  
  /**
   * Send raw transaction
   */
  async sendRawTransaction(signedTx: string): Promise<string> {
    const txHash = await this.request({ 
      method: "eth_sendRawTransaction", 
      params: [signedTx] 
    });
    return txHash as string;
  }
  
  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(txHash: string): Promise<unknown> {
    return await this.request({ 
      method: "eth_getTransactionReceipt", 
      params: [txHash] 
    });
  }
  
  /**
   * Estimate gas for transaction
   */
  async estimateGas(txParams: Record<string, unknown>): Promise<string> {
    const gasEstimate = await this.request({ 
      method: "eth_estimateGas", 
      params: [txParams] 
    });
    return gasEstimate as string;
  }
  
  /**
   * Get current gas price
   */
  async getGasPrice(): Promise<string> {
    const gasPrice = await this.request({ method: "eth_gasPrice" });
    return gasPrice as string;
  }
  
  /**
   * Call contract method
   */
  async call(callParams: Record<string, unknown>, blockTag = "latest"): Promise<string> {
    const result = await this.request({ 
      method: "eth_call", 
      params: [callParams, blockTag] 
    });
    return result as string;
  }
}
