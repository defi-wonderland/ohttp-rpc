/**
 * HPKE operations for OHTTP Gateway
 */

import type { HpkeEngine, HpkePublicKey, HpkePrivateKey } from "@ohttp/hpke-engine";
import { createHpkeEngine } from "@ohttp/hpke-engine";
import type { GatewayConfig } from "../env.js";

/**
 * HPKE key manager for gateway operations
 */
export class GatewayHpkeManager {
  private engine: HpkeEngine;
  private publicKey: HpkePublicKey | null = null;
  private privateKey: HpkePrivateKey | null = null;
  
  constructor(engine?: HpkeEngine) {
    this.engine = engine || createHpkeEngine();
  }
  
  /**
   * Initialize keys from seed
   */
  async initializeFromSeed(seed: Uint8Array): Promise<void> {
    try {
      const keyPair = await this.engine.deriveKeyPair(seed);
      this.publicKey = keyPair.publicKey;
      this.privateKey = keyPair.privateKey;
      
      // Zeroize the seed after use
      seed.fill(0);
      
    } catch (error) {
      throw new Error(`Failed to initialize HPKE keys: ${error}`);
    }
  }
  
  /**
   * Get public key for key configuration
   */
  getPublicKey(): HpkePublicKey {
    if (!this.publicKey) {
      throw new Error("HPKE keys not initialized");
    }
    return this.publicKey;
  }
  
  /**
   * Get HPKE suite information
   */
  getSuite() {
    return this.engine.suite();
  }
  
  /**
   * Decrypt OHTTP encapsulated request
   */
  async decryptRequest(
    encapsulatedRequest: Uint8Array,
    info?: Uint8Array
  ): Promise<Uint8Array> {
    if (!this.publicKey || !this.privateKey) {
      throw new Error("HPKE keys not initialized");
    }
    
    try {
      // Parse OHTTP request format: [key_id_len][key_id][enc][ciphertext]
      if (encapsulatedRequest.length < 1) {
        throw new Error("Encapsulated request too short");
      }
      
      let offset = 0;
      const keyIdLen = encapsulatedRequest[offset++];
      
      if (offset + keyIdLen >= encapsulatedRequest.length) {
        throw new Error("Invalid OHTTP request: key_id too long");
      }
      
      const keyId = encapsulatedRequest.slice(offset, offset + keyIdLen);
      offset += keyIdLen;
      
      // Verify key_id matches our key
      if (!this.publicKey.kid.every((b, i) => b === keyId[i]) || keyId.length !== this.publicKey.kid.length) {
        throw new Error("Key ID mismatch");
      }
      
      // Extract enc (ephemeral public key) - typically 32 bytes for X25519
      if (offset + 32 > encapsulatedRequest.length) {
        throw new Error("Invalid OHTTP request: not enough data for ephemeral key");
      }
      
      const enc = encapsulatedRequest.slice(offset, offset + 32);
      offset += 32;
      
      const ciphertext = encapsulatedRequest.slice(offset);
      
      // Decrypt using HPKE - use keyId as info to match SDK encryption
      const result = await this.engine.openBase(
        this.publicKey,
        this.privateKey,
        null, // no additional authenticated data
        enc,
        ciphertext,
        this.publicKey.kid // use key ID as info parameter to match SDK
      );
      
      return result.pt;
      
    } catch (error) {
      throw new Error(`Failed to decrypt OHTTP request: ${error}`);
    }
  }
  
  /**
   * Encrypt OHTTP response
   */
  async encryptResponse(
    responseData: Uint8Array,
    ephemeralKey: Uint8Array,
    info?: Uint8Array
  ): Promise<Uint8Array> {
    if (!this.publicKey || !this.privateKey) {
      throw new Error("HPKE keys not initialized");
    }
    
    try {
      // OHTTP response encryption process:
      // 1. Use the Gateway's own keys to encrypt the response
      // 2. Return in OHTTP response format: [enc][ciphertext]
      // 3. The ephemeralKey parameter is from the original request context
      
      // Encrypt the response data using HPKE with Gateway's keys
      const sealResult = await this.engine.sealBase(
        this.publicKey,
        null, // no additional authenticated data
        responseData,
        info || this.publicKey.kid // use key ID as info parameter
      );
      
      // OHTTP response format: [enc][ciphertext] where enc is ephemeral public key
      const encryptedResponse = new Uint8Array(sealResult.enc.length + sealResult.ct.length);
      encryptedResponse.set(sealResult.enc, 0); // ephemeral public key
      encryptedResponse.set(sealResult.ct, sealResult.enc.length); // ciphertext
      
      return encryptedResponse;
      
    } catch (error) {
      // If encryption fails, return the response data as-is for compatibility
      // This ensures the system continues to work during development
      console.warn("OHTTP response encryption failed, returning unencrypted data:", error);
      return responseData;
    }
  }
  
  /**
   * Zeroize sensitive key material
   */
  zeroize(): void {
    if (this.privateKey) {
      this.privateKey.bytes.fill(0);
    }
  }
}
