/**
 * Simplified HPKE implementation for MVP
 */

import type {
  HpkeEngine,
  HpkeSealResult,
  HpkeOpenResult,
  HpkePublicKey,
  HpkePrivateKey,
  HpkeSuiteInfo,
} from "./interface.js";
import { HpkeCryptoError } from "./interface.js";
import { HPKE_SUITE_IDS } from "@ohttp/shared";

export class SimpleHpkeEngine implements HpkeEngine {
  private static readonly SUITE_INFO: HpkeSuiteInfo = {
    kem: HPKE_SUITE_IDS.DHKEM_X25519_HKDF_SHA256,
    kdf: HPKE_SUITE_IDS.HKDF_SHA256,
    aead: HPKE_SUITE_IDS.AES_128_GCM,
  };

  suite(): HpkeSuiteInfo {
    return SimpleHpkeEngine.SUITE_INFO;
  }

  async generateKeyPair(): Promise<{
    publicKey: HpkePublicKey;
    privateKey: HpkePrivateKey;
  }> {
    const publicKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const privateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const kid = crypto.getRandomValues(new Uint8Array(8));

    return {
      publicKey: { kid, bytes: publicKeyBytes },
      privateKey: { bytes: privateKeyBytes },
    };
  }

  async deriveKeyPair(seed: Uint8Array): Promise<{
    publicKey: HpkePublicKey;
    privateKey: HpkePrivateKey;
  }> {
    if (seed.length !== 32) {
      throw new HpkeCryptoError("Seed must be exactly 32 bytes", "deriveKeyPair");
    }

    const publicKeyBytes = new Uint8Array(32);
    const privateKeyBytes = new Uint8Array(32);
    
    for (let i = 0; i < 32; i++) {
      publicKeyBytes[i] = seed[i] ^ 0xAA;
      privateKeyBytes[i] = seed[i] ^ 0x55;
    }
    
    return {
      publicKey: { kid: seed.slice(0, 8), bytes: publicKeyBytes },
      privateKey: { bytes: privateKeyBytes },
    };
  }

  async sealBase(
    _pk: HpkePublicKey,
    _aad: Uint8Array | null,
    pt: Uint8Array,
    _info?: Uint8Array
  ): Promise<HpkeSealResult> {
    // Simplified: just return the plaintext with some random bytes as "encryption"
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
    // Simplified: just return the ciphertext without the last 16 bytes
    if (ct.length < 16) {
      throw new HpkeCryptoError("Ciphertext too short", "openBase");
    }
    
    const pt = ct.slice(0, ct.length - 16);
    return { pt };
  }
}
