/**
 * Wagmi OHTTP Integration
 * 
 * Drop-in OHTTP support for Wagmi. Just replace http() with ohttp() in your config.
 * 
 * @example
 * ```typescript
 * import { createConfig } from 'wagmi'
 * import { mainnet } from 'wagmi/chains'
 * import { ohttp } from '@ohttp/sdk/wagmi'
 * 
 * const config = createConfig({
 *   chains: [mainnet],
 *   transports: {
 *     [mainnet.id]: ohttp('https://mainnet.infura.io/v3/YOUR_KEY')
 *   }
 * })
 * ```
 */

// Re-export Viem transport for Wagmi compatibility
export { ohttp, ohttpMultichain, type OhttpOptions } from './viem.js';

/**
 * Quick setup for common Wagmi + OHTTP patterns
 * 
 * @example Multiple chains with same OHTTP config:
 * ```typescript
 * import { mainnet, polygon } from 'wagmi/chains'
 * import { ohttpConfig } from '@ohttp/sdk/wagmi'
 * 
 * const config = ohttpConfig({
 *   chains: [mainnet, polygon],
 *   rpcUrls: {
 *     [mainnet.id]: 'https://mainnet.infura.io/v3/YOUR_KEY',
 *     [polygon.id]: 'https://polygon-rpc.com'
 *   }
 * })
 * ```
 */
export function ohttpConfig({ 
  chains, 
  rpcUrls, 
  ohttpOptions 
}: {
  chains: readonly [any, ...any[]];
  rpcUrls: Record<number, string>;
  ohttpOptions?: any;
}) {
  const { ohttpMultichain } = require('./viem.js');
  const transports = ohttpMultichain(rpcUrls, ohttpOptions);
  
  return {
    chains,
    transports,
  };
}
