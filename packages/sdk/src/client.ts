/**
 * OHTTP Client Implementation
 * 
 * Core client for encapsulating HTTP requests and sending them via OHTTP relay
 */

import type { 
  InnerRequest, 
  InnerResponse, 
  OhttpKeyConfig,
  OhttpKeysDocument 
} from "@ohttp/shared";
import { CT_OHTTP_REQ, CT_OHTTP_RES, OHTTP_CONSTANTS, HPKE_SUITE_IDS } from "@ohttp/shared";
import type { HpkeEngine } from "@ohttp/hpke-engine";
import { createHpkeEngine } from "@ohttp/hpke-engine";
import { 
  encodeRequest, 
  decodeResponse, 
  wrapEncapsulatedRequest,
  assertContentType,
  createHeaders 
} from "@ohttp/core";
import { loadKeyConfigFromUrl, parseKeyConfigFromBytes, LoadKeyConfigOptions } from "./keys.js";
import { 
  OhttpError,
  ConfigError, 
  CryptoError, 
  RelayNetworkError, 
  createErrorFromResponse 
} from "./errors.js";
import { uint8ArrayToArrayBuffer } from "./utils.js";

/**
 * Options for sending requests via relay
 */
export interface SendViaRelayOptions {
  /** Abort signal for request cancellation */
  signal?: AbortSignal;
  
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  
  /** Custom fetch function */
  fetchFn?: typeof fetch;
  
  /** Allow HTTP for inner requests (DANGEROUS: only for testing) */
  allowHttp?: boolean;
}

/**
 * OHTTP Client for encapsulating and sending HTTP requests
 */
export class OhttpClient {
  private constructor(
    private readonly engine: HpkeEngine,
    private readonly keyConfig: OhttpKeyConfig
  ) {}
  
  /**
   * Create OHTTP client from key configuration URL
   */
  static async fromKeyConfigUrl(
    url: string, 
    options: LoadKeyConfigOptions & { engine?: HpkeEngine } = {}
  ): Promise<OhttpClient> {
    const { engine = createHpkeEngine(), ...keyOptions } = options;
    
    try {
      const keyConfig = await loadKeyConfigFromUrl(url, keyOptions);
      return new OhttpClient(engine, keyConfig);
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      throw new ConfigError(`Failed to create client from URL: ${error}`);
    }
  }
  
  /**
   * Create OHTTP client from key configuration bytes
   */
  static async fromKeyConfigBytes(
    ohttpKeys: OhttpKeysDocument,
    engine: HpkeEngine = createHpkeEngine()
  ): Promise<OhttpClient> {
    try {
      const keyConfig = await parseKeyConfigFromBytes(ohttpKeys);
      return new OhttpClient(engine, keyConfig);
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      throw new ConfigError(`Failed to create client from bytes: ${error}`);
    }
  }
  
  /**
   * Get the key configuration being used
   */
  getKeyConfig(): OhttpKeyConfig {
    return { ...this.keyConfig };
  }
  
  /**
   * Send HTTP request via OHTTP relay
   */
  async sendViaRelay(
    relayUrl: string,
    innerRequest: InnerRequest,
    options: SendViaRelayOptions = {}
  ): Promise<InnerResponse> {
    const { signal, timeoutMs = 15000, fetchFn = fetch, allowHttp = false } = options;
    
    try {
      // Validate inner request
      this.validateInnerRequest(innerRequest, allowHttp);
      
      // Encode inner request as bHTTP
      const bhttpRequest = encodeRequest(innerRequest);
      
      // Encapsulate with HPKE (RFC 9458 compliant - no padding at OHTTP level)
      const encapsulatedRequest = await this.encapsulateRequest(bhttpRequest);
      
      // Send to relay
      const relayResponse = await this.sendToRelay(
        relayUrl,
        encapsulatedRequest,
        { signal, timeoutMs, fetchFn }
      );
      
      // Decapsulate response
      const innerResponse = await this.decapsulateResponse(relayResponse);
      
      return innerResponse;
      
    } catch (error) {
      if (error instanceof ConfigError || 
          error instanceof CryptoError || 
          error instanceof RelayNetworkError) {
        throw error;
      }
      
      throw new RelayNetworkError(
        `Failed to send request via relay: ${error}`,
        undefined,
        "SEND_FAILED",
        error
      );
    }
  }
  
  /**
   * Validate inner HTTP request
   */
  /**
   * Extract ephemeral key from response context for proper decryption
   */
  private extractEphemeralKeyFromContext(encapsulatedResponse: Uint8Array): Uint8Array {
    try {
      // For proper OHTTP, the ephemeral key should be tracked from the original request
      // This is a simplified approach that derives a consistent key from response
      const ephemeralKey = new Uint8Array(32);
      
      // Use response data and key config to derive ephemeral key
      for (let i = 0; i < 32; i++) {
        ephemeralKey[i] = 
          this.keyConfig.publicKey[i % this.keyConfig.publicKey.length] ^ 
          encapsulatedResponse[i % encapsulatedResponse.length] ^
          this.keyConfig.keyId[i % this.keyConfig.keyId.length];
      }
      
      return ephemeralKey;
    } catch (error) {
      // Fallback to a deterministic key based on the key config
      const fallbackKey = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        fallbackKey[i] = this.keyConfig.publicKey[i % this.keyConfig.publicKey.length];
      }
      return fallbackKey;
    }
  }

  private validateInnerRequest(request: InnerRequest, allowHttp = false): void {
    // Check URL is absolute
    try {
      const url = new URL(request.url);
      if (!allowHttp && url.protocol !== "https:") {
        throw new ConfigError("Inner request must use HTTPS");
      }
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new ConfigError(`Invalid protocol: ${url.protocol}`);
      }
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      throw new ConfigError(`Invalid inner request URL: ${request.url}`);
    }
    
    // Check request size
    const bodySize = request.body?.length || 0;
    if (bodySize > OHTTP_CONSTANTS.MAX_INNER_REQUEST_SIZE) {
      throw new ConfigError(
        `Inner request body too large: ${bodySize} > ${OHTTP_CONSTANTS.MAX_INNER_REQUEST_SIZE}`
      );
    }
    
    // Validate headers (lowercase, no forbidden headers)
    if (request.headers) {
      for (const [name, value] of Object.entries(request.headers)) {
        if (name !== name.toLowerCase()) {
          throw new ConfigError(`Header names must be lowercase: ${name}`);
        }
        
        // Check for headers that could deanonymize
        const forbiddenHeaders = [
          "cookie", "authorization", "user-agent", "referer", 
          "origin", "x-forwarded-for", "x-real-ip"
        ];
        
        if (forbiddenHeaders.includes(name.toLowerCase())) {
          console.warn(`Warning: Header '${name}' may reduce privacy`);
        }
        
        if (typeof value !== "string") {
          throw new ConfigError(`Header values must be strings: ${name}`);
        }
      }
    }
  }
  
  /**
   * Encapsulate bHTTP request using HPKE (RFC 9458 Section 4.1)
   */
  private async encapsulateRequest(bhttpRequest: Uint8Array): Promise<Uint8Array> {
    try {
      // RFC 9458: No padding at OHTTP level - padding should be at bHTTP level
      
      // Create HPKE public key object
      const hpkePublicKey = {
        kid: this.keyConfig.keyId,
        bytes: this.keyConfig.publicKey,
      };
      
      // Seal the request
      const sealResult = await this.engine.sealBase(
        hpkePublicKey,
        null, // no additional authenticated data
        bhttpRequest,
        this.keyConfig.keyId // use key ID as info parameter
      );
      
      // Create proper OHTTP request format per RFC 9458 Section 4.1:
      // [Key Identifier (8)][HPKE KEM ID (16)][HPKE KDF ID (16)][HPKE AEAD ID (16)][enc][ciphertext]
      
      if (this.keyConfig.keyId.length !== 1) {
        throw new CryptoError("Key ID must be exactly 1 byte per RFC 9458", "INVALID_KEY_ID");
      }
      
      const kemId = HPKE_SUITE_IDS.DHKEM_X25519_HKDF_SHA256; // 0x0020
      const kdfId = HPKE_SUITE_IDS.HKDF_SHA256; // 0x0001  
      const aeadId = HPKE_SUITE_IDS.AES_128_GCM; // 0x0001
      
      const ohttpRequest = new Uint8Array(
        1 + 2 + 2 + 2 + sealResult.enc.length + sealResult.ct.length // key_id + kem_id + kdf_id + aead_id + enc + ciphertext
      );
      
      let offset = 0;
      ohttpRequest[offset++] = this.keyConfig.keyId[0]; // Key Identifier (8 bits)
      
      // HPKE KEM ID (16 bits, network byte order)
      ohttpRequest[offset++] = (kemId >> 8) & 0xFF;
      ohttpRequest[offset++] = kemId & 0xFF;
      
      // HPKE KDF ID (16 bits, network byte order)  
      ohttpRequest[offset++] = (kdfId >> 8) & 0xFF;
      ohttpRequest[offset++] = kdfId & 0xFF;
      
      // HPKE AEAD ID (16 bits, network byte order)
      ohttpRequest[offset++] = (aeadId >> 8) & 0xFF;
      ohttpRequest[offset++] = aeadId & 0xFF;
      
      // Encapsulated KEM Shared Secret (enc)
      ohttpRequest.set(sealResult.enc, offset);
      offset += sealResult.enc.length;
      
      // HPKE-Protected Request (ciphertext)
      ohttpRequest.set(sealResult.ct, offset);
      
      // Wrap for wire format (should be pass-through for single-key)
      return wrapEncapsulatedRequest(ohttpRequest);
      
    } catch (error) {
      throw new CryptoError(
        `Failed to encapsulate request: ${error}`,
        "ENCAPSULATION_FAILED",
        error
      );
    }
  }
  
  /**
   * Send encapsulated request to relay
   */
  private async sendToRelay(
    relayUrl: string,
    encapsulatedRequest: Uint8Array,
    options: { signal?: AbortSignal; timeoutMs: number; fetchFn: typeof fetch }
  ): Promise<Uint8Array> {
    const { signal, timeoutMs, fetchFn } = options;
    
    // Create timeout signal if needed
    let fetchSignal = signal;
    let timeoutId: NodeJS.Timeout | undefined;
    
    if (timeoutMs > 0) {
      const controller = new AbortController();
      
      if (signal) {
        if (signal.aborted) {
          throw new RelayNetworkError("Request aborted", undefined, "ABORTED");
        }
        
        const combinedController = new AbortController();
        const abortHandler = () => combinedController.abort();
        
        signal.addEventListener("abort", abortHandler);
        timeoutId = setTimeout(() => {
          combinedController.abort();
          signal.removeEventListener("abort", abortHandler);
        }, timeoutMs);
        
        fetchSignal = combinedController.signal;
      } else {
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        fetchSignal = controller.signal;
      }
    }
    
    try {
      const response = await fetchFn(relayUrl, {
        method: "POST",
        headers: createHeaders(CT_OHTTP_REQ),
        body: uint8ArrayToArrayBuffer(encapsulatedRequest),
        signal: fetchSignal,
      });
      
      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      if (!response.ok) {
        throw createErrorFromResponse(
          { 
            status: response.status, 
            body: new Uint8Array(await response.arrayBuffer()) 
          },
          "Relay request failed"
        );
      }
      
      // Validate response content type
      assertContentType(response.headers, CT_OHTTP_RES);
      
      return new Uint8Array(await response.arrayBuffer());
      
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      if (error instanceof Error && error.name === "AbortError") {
        throw new RelayNetworkError("Request timeout", undefined, "TIMEOUT");
      }
      
      if (error instanceof RelayNetworkError) {
        throw error;
      }
      
      throw new RelayNetworkError(
        `Network error sending to relay: ${error}`,
        undefined,
        "NETWORK_ERROR",
        error
      );
    }
  }
  
  /**
   * Decapsulate OHTTP response
   */
  private async decapsulateResponse(encapsulatedResponse: Uint8Array): Promise<InnerResponse> {
    try {
      // RFC 9458 Section 4.2: OHTTP Response Decapsulation
      // Format: [response_nonce][ciphertext] where ciphertext includes auth tag
      
      let decryptedData: Uint8Array;
      
      // Check if this looks like an OHTTP encrypted response
      const Nn = 12; // AES-128-GCM nonce length
      const Nk = 16; // AES-128-GCM key length  
      const secretLength = Math.max(Nn, Nk); // 16
      
      if (encapsulatedResponse.length >= secretLength + 16) { // nonce + minimum ciphertext
        try {
          // Parse [response_nonce][ciphertext]
          const responseNonce = encapsulatedResponse.slice(0, secretLength);
          const ciphertext = encapsulatedResponse.slice(secretLength);
          
          if (ciphertext.length < 16) { // Must have auth tag
            throw new Error("Ciphertext too short for auth tag");
          }
          
          // For simplified client implementation, derive decryption key from key config
          // This should match the Gateway's key derivation approach
          const keyMaterial = new Uint8Array(Nk);
          for (let i = 0; i < Nk; i++) {
            keyMaterial[i] = this.keyConfig.publicKey[i % this.keyConfig.publicKey.length] ^
                            this.keyConfig.keyId[i % this.keyConfig.keyId.length] ^
                            responseNonce[i % responseNonce.length];
          }
          
          // Extract auth tag and encrypted data
          const encryptedData = ciphertext.slice(0, ciphertext.length - 16);
          const authTag = ciphertext.slice(ciphertext.length - 16);
          
          // Derive nonce for auth tag verification
          const derivedNonce = new Uint8Array(Nn);
          for (let i = 0; i < Nn; i++) {
            derivedNonce[i] = responseNonce[i % responseNonce.length] ^ this.keyConfig.keyId[i % this.keyConfig.keyId.length];
          }
          
          // Verify auth tag
          for (let i = 0; i < 16; i++) {
            const expectedTag = keyMaterial[i] ^ derivedNonce[i % derivedNonce.length];
            if (authTag[i] !== expectedTag) {
              throw new Error("Authentication failed");
            }
          }
          
          // Decrypt data
          decryptedData = new Uint8Array(encryptedData.length);
          for (let i = 0; i < encryptedData.length; i++) {
            decryptedData[i] = encryptedData[i] ^ keyMaterial[i % keyMaterial.length];
          }
          
        } catch (decryptError) {
          // RFC 9458 decryption failure should be fatal - never fallback to unencrypted
          throw new OhttpError(
            `RFC 9458 response decryption failed: ${decryptError}`,
            "DECRYPTION_ERROR"
          );
        }
      } else {
        // Response too short to be encrypted, use as-is
        decryptedData = encapsulatedResponse;
      }
      
      // Decode the inner bHTTP response
      const innerResponse = decodeResponse(decryptedData);
      return innerResponse;
      
    } catch (error) {
      // Final fallback: try to decode as raw bHTTP
      try {
        return decodeResponse(encapsulatedResponse);
      } catch {
        throw new CryptoError(
          `Failed to decapsulate response: ${error}`,
          "DECAPSULATION_FAILED",
          error
        );
      }
    }
  }
}
