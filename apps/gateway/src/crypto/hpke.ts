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
      // Parse encapsulated request: enc (32 bytes for X25519) + ciphertext
      if (encapsulatedRequest.length < 32) {
        throw new Error("Encapsulated request too short");
      }
      
      const enc = encapsulatedRequest.slice(0, 32);
      const ciphertext = encapsulatedRequest.slice(32);
      
      // Decrypt using HPKE
      const result = await this.engine.openBase(
        this.publicKey,
        this.privateKey,
        null, // no additional authenticated data
        enc,
        ciphertext,
        info
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
    if (!this.publicKey) {
      throw new Error("HPKE keys not initialized");
    }
    
    try {
      // For response encryption, we need to use the same ephemeral key
      // This is a simplified implementation - in practice, you'd derive
      // the response encryption context from the request context
      
      // For now, return the response data as-is (this needs proper implementation)
      // TODO: Implement proper OHTTP response encryption
      return responseData;
      
    } catch (error) {
      throw new Error(`Failed to encrypt OHTTP response: ${error}`);
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
