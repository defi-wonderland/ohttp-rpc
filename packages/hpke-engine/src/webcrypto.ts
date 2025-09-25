/**
 * Simplified HPKE Engine Implementation for MVP
 * 
 * This is a simplified implementation for demonstration purposes.
 * In production, use a proper HPKE implementation.
 */

import { HPKE_SUITE_IDS } from "@ohttp/shared";
import type {
  HpkeEngine,
  HpkeSealResult,
  HpkeOpenResult,
  HpkePublicKey,
  HpkePrivateKey,
  HpkeSuiteInfo,
} from "./interface.js";
import { HpkeCryptoError } from "./interface.js";

/**
 * Simplified HPKE Engine for MVP
 * 
 * This is a mock implementation for demonstration. 
 * In production, use a proper HPKE library.
 */
export class WebCryptoHpkeEngine implements HpkeEngine {
  private static readonly SUITE_INFO: HpkeSuiteInfo = {
    kem: HPKE_SUITE_IDS.DHKEM_X25519_HKDF_SHA256,
    kdf: HPKE_SUITE_IDS.HKDF_SHA256,
    aead: HPKE_SUITE_IDS.AES_128_GCM,
  };

  constructor() {
    // Simplified - no capability checks for MVP
  }

  suite(): HpkeSuiteInfo {
    return WebCryptoHpkeEngine.SUITE_INFO;
  }

  async generateKeyPair(): Promise<{
    publicKey: HpkePublicKey;
    privateKey: HpkePrivateKey;
  }> {
    // Simplified implementation - generate random keys
    const publicKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const privateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const kid = crypto.getRandomValues(new Uint8Array(8));

    return {
      publicKey: {
        kid,
        bytes: publicKeyBytes,
      },
      privateKey: {
        bytes: privateKeyBytes,
      },
    };
  }

  async deriveKeyPair(seed: Uint8Array): Promise<{
    publicKey: HpkePublicKey;
    privateKey: HpkePrivateKey;
  }> {
    if (seed.length !== 32) {
      throw new HpkeCryptoError(
        "Seed must be exactly 32 bytes",
        "deriveKeyPair"
      );
    }

    // Simplified: use seed to generate deterministic keys
    const publicKeyBytes = new Uint8Array(32);
    const privateKeyBytes = new Uint8Array(32);
    
    // Simple deterministic generation from seed
    for (let i = 0; i < 32; i++) {
      publicKeyBytes[i] = seed[i] ^ 0xAA;
      privateKeyBytes[i] = seed[i] ^ 0x55;
    }
    
    const kid = seed.slice(0, 8);

    return {
      publicKey: {
        kid,
        bytes: publicKeyBytes,
      },
      privateKey: {
        bytes: privateKeyBytes,
      },
    };
  }

  async sealBase(
    _pk: HpkePublicKey,
    _aad: Uint8Array | null,
    pt: Uint8Array,
    _info?: Uint8Array
  ): Promise<HpkeSealResult> {
    // Simplified implementation for MVP
    const enc = crypto.getRandomValues(new Uint8Array(32));
    const ct = new Uint8Array(pt.length + 16); // Add 16 bytes for "auth tag"
    ct.set(pt);
    crypto.getRandomValues(ct.subarray(pt.length));

    return { enc, ct };
  }

  async openBase(
    _pk: HpkePublicKey,
    _sk: HpkePrivateKey,
    _aad: Uint8Array | null,
    _enc: Uint8Array,
    ct: Uint8Array,
    _info?: Uint8Array
  ): Promise<HpkeOpenResult> {
    // Simplified implementation for MVP
    if (ct.length < 16) {
      throw new HpkeCryptoError("Ciphertext too short", "openBase");
    }
    
    // Just return the ciphertext without the last 16 bytes (mock "auth tag")
    const pt = ct.slice(0, ct.length - 16);
    return { pt };
  }
}
