/**
 * Viem OHTTP Transport
 * 
 * Drop-in replacement for Viem's http() transport that routes requests through OHTTP.
 * Provides the same API but with privacy-preserving request routing.
 * 
 * @example
 * ```typescript
 * import { createPublicClient } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { ohttp } from '@ohttp/sdk/viem'
 * 
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: ohttp('https://mainnet.infura.io/v3/YOUR_KEY')
 * })
 * ```
 */

import type { Transport, Chain, EIP1193RequestFn } from 'viem';
import { createTransport, RpcRequestError } from 'viem';
import { ohttpJsonRpc } from './fetch.js';
import { ConfigError, TargetRpcError } from './errors.js';

/**
 * OHTTP transport options
 */
export interface OhttpOptions {
  /** Gateway server that provides OHTTP keys (optional, uses public gateway if not provided) */
  gateway?: string;
  
  /** Relay server that forwards requests (optional, uses public relay if not provided) */
  relay?: string;
  
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  
  /** Request padding for privacy (default: 64 bytes) */
  padding?: number;
}

// Default public OHTTP infrastructure (replace with your own for production)
const DEFAULT_GATEWAY = 'https://ohttp-gateway.example.com';
const DEFAULT_RELAY = 'https://ohttp-relay.example.com';

/**
 * Create OHTTP transport - drop-in replacement for Viem's http()
 * 
 * @param url - The RPC endpoint URL (just like http() transport)
 * @param options - Optional OHTTP configuration
 * 
 * @example Simple usage (replaces http() transport):
 * ```typescript
 * import { createPublicClient } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { ohttp } from '@ohttp/sdk/viem'
 * 
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: ohttp('https://mainnet.infura.io/v3/YOUR_KEY')
 * })
 * ```
 * 
 * @example With custom OHTTP servers:
 * ```typescript
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: ohttp('https://mainnet.infura.io/v3/YOUR_KEY', {
 *     gateway: 'https://your-gateway.com',
 *     relay: 'https://your-relay.com',
 *     timeout: 15000,
 *     padding: 128
 *   })
 * })
 * ```
 */
export function ohttp(url: string, options: OhttpOptions = {}): Transport {
  const {
    gateway = DEFAULT_GATEWAY,
    relay = DEFAULT_RELAY,
    timeout = 10000,
    padding = 64,
  } = options;

  return () => createTransport({
    key: 'ohttp',
    name: 'OHTTP Transport',
    request: (async ({ method, params }: any) => {
      try {
        const result = await ohttpJsonRpc(
          `${gateway}/ohttp-keys`,
          `${relay}/relay`,
          url,
          method,
          Array.isArray(params) ? params : params ? [params] : [],
          {
            timeoutMs: timeout,
            paddingBytes: padding,
          }
        );
        return result;
      } catch (error) {
        throw convertToRpcError(error, method, params);
      }
    }) as EIP1193RequestFn,
    type: 'ohttp',
  });
}

/**
 * Convert errors to Viem's RpcRequestError format
 */
function convertToRpcError(error: unknown, method: string, params: unknown): RpcRequestError {
  if (error instanceof TargetRpcError && error.rpcError) {
    return new RpcRequestError({
      body: { method, params },
      error: {
        code: error.rpcError.code,
        message: error.rpcError.message,
        data: error.rpcError.data,
      },
      url: 'ohttp://encrypted',
    });
  }

  // Generic error handling
  const message = error instanceof Error ? error.message : 'Unknown error';
  return new RpcRequestError({
    body: { method, params },
    error: {
      code: -32603, // Internal error
      message,
    },
    url: 'ohttp://encrypted',
  });
}

/**
 * Configure multiple chains with OHTTP
 * 
 * @example
 * ```typescript
 * import { createPublicClient } from 'viem'
 * import { mainnet, polygon } from 'viem/chains'
 * import { ohttpMultichain } from '@ohttp/sdk/viem'
 * 
 * const transports = ohttpMultichain({
 *   [mainnet.id]: 'https://mainnet.infura.io/v3/YOUR_KEY',
 *   [polygon.id]: 'https://polygon-rpc.com',
 * })
 * 
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: transports[mainnet.id]
 * })
 * ```
 */
export function ohttpMultichain(
  urls: Record<number, string>,
  options?: OhttpOptions
): Record<number, Transport> {
  return Object.fromEntries(
    Object.entries(urls).map(([chainId, url]) => [
      parseInt(chainId),
      ohttp(url, options)
    ])
  );
}

// Re-export types for convenience  
export type { OhttpOptions as OhttpTransportOptions };
