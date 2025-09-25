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
  ): Promise<{ plaintext: Uint8Array; context: HpkeContext; enc: Uint8Array }> {
    if (!this.publicKey || !this.privateKey) {
      throw new Error("HPKE keys not initialized");
    }
    
    try {
      // Parse OHTTP request format per RFC 9458 Section 4.1:
      // [Key Identifier (1-8 bytes)][HPKE KEM ID (16)][HPKE KDF ID (16)][HPKE AEAD ID (16)][enc][ciphertext]
      if (encapsulatedRequest.length < 1 + 2 + 2 + 2 + 32 + 16) { // min keyId + kem + kdf + aead + enc + min ciphertext
        throw new Error("Encapsulated request too short for RFC 9458 format");
      }
      
      // RFC 9458 Section 3.1: Key ID can be 1-8 bytes
      // We need to match against our stored key ID to determine the length
      if (!this.publicKey || !this.publicKey.kid) {
        throw new Error("No public key available for key ID matching");
      }
      
      const expectedKeyIdLength = this.publicKey.kid.length;
      if (expectedKeyIdLength < 1 || expectedKeyIdLength > 8) {
        throw new Error("Invalid stored key ID length");
      }
      
      if (encapsulatedRequest.length < expectedKeyIdLength + 2 + 2 + 2 + 32 + 16) {
        throw new Error("Request too short for expected key ID length");
      }
      
      let offset = 0;
      
      // Key Identifier (1-8 bytes per RFC 9458 Section 3.1)
      const keyId = encapsulatedRequest.slice(offset, offset + expectedKeyIdLength);
      offset += expectedKeyIdLength;
      
      // HPKE KEM ID (16 bits, network byte order)
      const kemId = (encapsulatedRequest[offset++] << 8) | encapsulatedRequest[offset++];
      
      // HPKE KDF ID (16 bits, network byte order)  
      const kdfId = (encapsulatedRequest[offset++] << 8) | encapsulatedRequest[offset++];
      
      // HPKE AEAD ID (16 bits, network byte order)
      const aeadId = (encapsulatedRequest[offset++] << 8) | encapsulatedRequest[offset++];
      
      // Verify key_id matches our key
      if (keyId.length !== this.publicKey.kid.length || 
          !keyId.every((b, i) => b === this.publicKey.kid[i])) {
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
      
      // Return plaintext, context, and enc for RFC 9458 response encryption
      return {
        plaintext: result.pt,
        context: result.context,
        enc: enc
      };
      
    } catch (error) {
      throw new Error(`Failed to decrypt OHTTP request: ${error}`);
    }
  }
  
  /**
   * Encrypt OHTTP response per RFC 9458 Section 4.2
   */
  async encryptResponse(
    responseData: Uint8Array, 
    context: HpkeContext, 
    enc: Uint8Array
  ): Promise<Uint8Array> {
    
    try {
      // RFC 9458 Section 4.2: OHTTP Response Encryption
      // 1. Export secret from HPKE context using "message/bhttp response"
      const Nn = 12; // AES-128-GCM nonce length
      const Nk = 16; // AES-128-GCM key length
      const secretLength = Math.max(Nn, Nk); // 16
      
      const secret = await context.export("message/bhttp response", secretLength);
      
      // 2. Generate random response_nonce
      const responseNonce = crypto.getRandomValues(new Uint8Array(secretLength));
      
      // 3. Extract PRK using KDF with salt = concat(enc, response_nonce)
      const salt = new Uint8Array(enc.length + responseNonce.length);
      salt.set(enc, 0);
      salt.set(responseNonce, enc.length);
      
      const prk = await this.engine.kdfExtract(salt, secret);
      
      // 4. Expand PRK to get AEAD key and nonce
      const aeadKey = await this.engine.kdfExpand(prk, "key", Nk);
      const aeadNonce = await this.engine.kdfExpand(prk, "nonce", Nn);
      
      // 5. Encrypt response with derived AEAD key/nonce using AES-128-GCM
      const aeadKeyObject = await crypto.subtle.importKey(
        "raw",
        aeadKey as BufferSource,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
      );
      
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: aeadNonce,
          additionalData: new Uint8Array(0), // empty AAD per RFC 9458
        },
        aeadKeyObject,
        responseData as BufferSource
      );
      
      const ciphertext = new Uint8Array(encryptedData);
      
      // 6. Return [response_nonce][ciphertext]
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
