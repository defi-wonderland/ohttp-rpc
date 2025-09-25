/**
 * @ohttp/sdk - Client SDK for OHTTP protocol
 * 
 * This package provides a comprehensive TypeScript SDK for making privacy-preserving
 * HTTP requests using the OHTTP (Oblivious HTTP) protocol. It's specifically designed
 * for blockchain applications but can be used for any HTTP requests that require
 * client anonymization.
 * 
 * ## Key Features
 * - Complete OHTTP protocol implementation (RFC 9458)
 * - HPKE encryption for request privacy
 * - EIP-1193 compatible Ethereum provider
 * - Fetch-like API for easy integration
 * - TypeScript-first with full type safety
 * 
 * ## Basic Usage
 * ```typescript
 * import { ohttpFetch } from "@ohttp/sdk";
 * 
 * const response = await ohttpFetch(
 *   "https://gateway.example.com/ohttp-keys",
 *   "https://relay.example.com/relay", 
 *   "https://api.example.com/data"
 * );
 * ```
 * 
 * @see {@link https://datatracker.ietf.org/doc/rfc9458/} OHTTP RFC 9458
 * @see {@link https://eips.ethereum.org/EIPS/eip-1193} EIP-1193 Provider Standard
 */

// Export main client class
export { OhttpClient } from "./client.js";
export type { SendViaRelayOptions } from "./client.js";

// Export fetch-like interface  
export { ohttpFetch, ohttpJsonRpc } from "./fetch.js";
export type { OhttpFetchOptions } from "./fetch.js";

// Export EIP-1193 provider
export { OhttpRpcProvider } from "./provider.js";
export type { OhttpRpcProviderOptions, ProviderEvent } from "./provider.js";

// Export key management utilities
export { 
  loadKeyConfigFromUrl, 
  parseKeyConfigFromBytes,
  clearKeyConfigCache,
  getKeyConfigCacheStats 
} from "./keys.js";
export type { LoadKeyConfigOptions } from "./keys.js";

// Export error types
export {
  OhttpError,
  ConfigError,
  CryptoError,
  RelayNetworkError,
  GatewayPolicyError,
  TargetRpcError,
  createErrorFromResponse,
  isRetryableError,
} from "./errors.js";

// Export Viem integration (separate import path for tree-shaking)
// import { ohttp } from "@ohttp/sdk/viem";

// Export Wagmi integration (separate import path for tree-shaking)  
// import { ohttp } from "@ohttp/sdk/wagmi";
