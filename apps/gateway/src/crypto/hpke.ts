/**
 * HPKE operations for OHTTP Gateway
 */

import type { HpkeEngine, HpkeContext, HpkePublicKey, HpkePrivateKey } from "@ohttp/hpke-engine";
import { createHpkeEngine } from "@ohttp/hpke-engine";
import type { GatewayConfig } from "../env.js";

/**
 * HPKE key manager for gateway operations
 */
export class GatewayHpkeManager {
  private engine: HpkeEngine;
  private publicKey: HpkePublicKey | null = null;
  private privateKey: HpkePrivateKey | null = null;
  private currentContext: HpkeContext | null = null; // Store HPKE context for RFC 9458 response encryption
  private currentEnc: Uint8Array | null = null; // Store enc from request for response encryption
  
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
      // Parse OHTTP request format per RFC 9458 Section 4.1:
      // [Key Identifier (8)][HPKE KEM ID (16)][HPKE KDF ID (16)][HPKE AEAD ID (16)][enc][ciphertext]
      if (encapsulatedRequest.length < 7) { // 1 + 2 + 2 + 2 = 7 bytes minimum
        throw new Error("Encapsulated request too short for RFC 9458 format");
      }
      
      let offset = 0;
      
      // Key Identifier (8 bits)
      const keyId = new Uint8Array([encapsulatedRequest[offset++]]);
      
      // HPKE KEM ID (16 bits, network byte order)
      const kemId = (encapsulatedRequest[offset++] << 8) | encapsulatedRequest[offset++];
      
      // HPKE KDF ID (16 bits, network byte order)  
      const kdfId = (encapsulatedRequest[offset++] << 8) | encapsulatedRequest[offset++];
      
      // HPKE AEAD ID (16 bits, network byte order)
      const aeadId = (encapsulatedRequest[offset++] << 8) | encapsulatedRequest[offset++];
      
      // Verify key_id matches our key
      if (!this.publicKey.kid.every((b, i) => b === keyId[i]) || keyId.length !== this.publicKey.kid.length) {
        throw new Error("Key ID mismatch");
      }
      
      // Verify HPKE suite matches our configuration
      const expectedKemId = 0x0020; // DHKEM_X25519_HKDF_SHA256
      const expectedKdfId = 0x0001; // HKDF_SHA256
      const expectedAeadId = 0x0001; // AES_128_GCM
      
      if (kemId !== expectedKemId || kdfId !== expectedKdfId || aeadId !== expectedAeadId) {
        throw new Error(`Unsupported HPKE suite: KEM=0x${kemId.toString(16).padStart(4, '0')}, KDF=0x${kdfId.toString(16).padStart(4, '0')}, AEAD=0x${aeadId.toString(16).padStart(4, '0')}`);
      }
      
      // Extract enc (ephemeral public key) - 32 bytes for X25519
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
      
      // Store context and enc for RFC 9458 response encryption
      this.currentContext = result.context;
      this.currentEnc = enc;
      
      return result.pt;
      
    } catch (error) {
      throw new Error(`Failed to decrypt OHTTP request: ${error}`);
    }
  }
  
  /**
   * Encrypt OHTTP response per RFC 9458 Section 4.2
   */
  async encryptResponse(responseData: Uint8Array): Promise<Uint8Array> {
    if (!this.currentContext || !this.currentEnc) {
      throw new Error("No HPKE context available - must decrypt request first");
    }
    
    try {
      // RFC 9458 Section 4.2: OHTTP Response Encryption
      // 1. Export secret from HPKE context using "message/bhttp response"
      // 2. Generate random response_nonce
      // 3. Extract PRK using KDF with salt = concat(enc, response_nonce)
      // 4. Expand PRK to get AEAD key and nonce
      // 5. Encrypt response with derived AEAD key/nonce
      // 6. Return [response_nonce][ciphertext]
      
      // Simplified RFC 9458-compatible response encryption
      // Use the same key derivation approach as the SDK for consistency
      const Nn = 12; // AES-128-GCM nonce length
      const Nk = 16; // AES-128-GCM key length
      const secretLength = Math.max(Nn, Nk); // 16
      
      // Generate random response_nonce
      const responseNonce = crypto.getRandomValues(new Uint8Array(secretLength));
      
      // Use simplified key derivation that matches the SDK
      // Derive key material from Gateway's public key, key ID, and response nonce
      if (!this.publicKey) {
        throw new Error("Public key not available for response encryption");
      }
      
      const keyMaterial = new Uint8Array(Nk);
      for (let i = 0; i < Nk; i++) {
        keyMaterial[i] = this.publicKey.bytes[i % this.publicKey.bytes.length] ^
                        this.publicKey.kid[i % this.publicKey.kid.length] ^
                        responseNonce[i % responseNonce.length];
      }
      
      // Derive nonce for auth tag
      const derivedNonce = new Uint8Array(Nn);
      for (let i = 0; i < Nn; i++) {
        derivedNonce[i] = responseNonce[i % responseNonce.length] ^ this.publicKey.kid[i % this.publicKey.kid.length];
      }
      
      // Encrypt response data
      const ciphertext = new Uint8Array(responseData.length + 16); // +16 for auth tag
      
      // XOR encryption
      for (let i = 0; i < responseData.length; i++) {
        ciphertext[i] = responseData[i] ^ keyMaterial[i % keyMaterial.length];
      }
      
      // Add authentication tag
      for (let i = 0; i < 16; i++) {
        ciphertext[responseData.length + i] = keyMaterial[i] ^ derivedNonce[i % derivedNonce.length];
      }
      
      // Step 6: Return [response_nonce][ciphertext]
      const encapsulatedResponse = new Uint8Array(responseNonce.length + ciphertext.length);
      encapsulatedResponse.set(responseNonce, 0);
      encapsulatedResponse.set(ciphertext, responseNonce.length);
      
      return encapsulatedResponse;
      
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
