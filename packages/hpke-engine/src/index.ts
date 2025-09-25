/**
 * @ohttp/hpke-engine - HPKE cryptographic engine for OHTTP
 */

// Export the interface types
export type {
  HpkeEngine,
  HpkeSealResult,
  HpkeOpenResult,
  HpkeContext,
  HpkePublicKey,
  HpkePrivateKey,
  HpkeSuiteInfo,
} from "./interface.js";

// Export errors
export { HpkeCapabilityError, HpkeCryptoError } from "./interface.js";

// Export WebCrypto implementation
export { WebCryptoHpkeEngine } from "./webcrypto.js";

import type { HpkeEngine } from "./interface.js";
import { WebCryptoHpkeEngine } from "./webcrypto.js";

/**
 * Create a default HPKE engine instance
 * 
 * Uses WebCrypto implementation with capability detection.
 * Throws HpkeCapabilityError if required crypto primitives are unavailable.
 */
export function createHpkeEngine(): HpkeEngine {
  return new WebCryptoHpkeEngine();
}
