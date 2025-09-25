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
  private currentContext: any = null; // Store HPKE context for response decryption
  private currentEnc: Uint8Array | null = null; // Store enc from request for response decryption
  
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
      
      // Store enc and context for response decryption (RFC 9458 requires this for salt derivation)
      this.currentEnc = sealResult.enc;
      this.currentContext = sealResult.context;
      
      // Create proper OHTTP request format per RFC 9458 Section 4.1:
      // [Key Identifier (1-8 bytes)][HPKE KEM ID (16)][HPKE KDF ID (16)][HPKE AEAD ID (16)][enc][ciphertext]
      
      if (this.keyConfig.keyId.length < 1 || this.keyConfig.keyId.length > 8) {
        throw new CryptoError("Key ID must be 1-8 bytes per RFC 9458 Section 3.1", "INVALID_KEY_ID");
      }
      
      const kemId = HPKE_SUITE_IDS.DHKEM_X25519_HKDF_SHA256; // 0x0020
      const kdfId = HPKE_SUITE_IDS.HKDF_SHA256; // 0x0001  
      const aeadId = HPKE_SUITE_IDS.AES_128_GCM; // 0x0001
      
      const ohttpRequest = new Uint8Array(
        this.keyConfig.keyId.length + 2 + 2 + 2 + sealResult.enc.length + sealResult.ct.length // key_id + kem_id + kdf_id + aead_id + enc + ciphertext
      );
      
      let offset = 0;
      // Key Identifier (1-8 bytes per RFC 9458 Section 3.1)
      ohttpRequest.set(this.keyConfig.keyId, offset);
      offset += this.keyConfig.keyId.length;
      
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
   * Decapsulate OHTTP response per RFC 9458 Section 4.2
   */
  private async decapsulateResponse(
    encapsulatedResponse: Uint8Array
  ): Promise<InnerResponse> {
    if (!this.currentContext || !this.currentEnc) {
      throw new CryptoError("No HPKE context available - must encapsulate request first", "NO_CONTEXT");
    }
    
    try {
      // RFC 9458 Section 4.2: OHTTP Response Decapsulation
      // Format: [response_nonce][AEAD-protected response]
      
      const Nn = 12; // AES-128-GCM nonce length
      const Nk = 16; // AES-128-GCM key length  
      const secretLength = Math.max(Nn, Nk); // 16
      
      if (encapsulatedResponse.length < secretLength + 16) { // nonce + minimum AEAD output
        throw new CryptoError("Response too short for RFC 9458 format", "INVALID_RESPONSE_FORMAT");
      }
      
      // Parse [response_nonce][ciphertext]
      const responseNonce = encapsulatedResponse.slice(0, secretLength);
      const ciphertext = encapsulatedResponse.slice(secretLength);
      
      // RFC 9458 compliant decryption:
      // 1. secret = context.Export("message/bhttp response", max(Nn, Nk))
      const secret = await this.currentContext.export("message/bhttp response", secretLength);
      
      // 2. salt = concat(enc, response_nonce)  
      const salt = new Uint8Array(this.currentEnc.length + responseNonce.length);
      salt.set(this.currentEnc, 0);
      salt.set(responseNonce, this.currentEnc.length);
      
      // 3. prk = Extract(salt, secret)
      const prk = await this.engine.kdfExtract(salt, secret);
      
      // 4. aead_key = Expand(prk, "key", Nk)
      const aeadKey = await this.engine.kdfExpand(prk, "key", Nk);
      
      // 5. aead_nonce = Expand(prk, "nonce", Nn)
      const aeadNonce = await this.engine.kdfExpand(prk, "nonce", Nn);
      
      // 6. response = Open(aead_key, aead_nonce, "", ciphertext)
      const aeadKeyObject = await crypto.subtle.importKey(
        "raw",
        aeadKey as BufferSource,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );
      
      const decryptedData = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: aeadNonce as BufferSource,
          additionalData: new Uint8Array(0), // empty AAD per RFC 9458
        },
        aeadKeyObject,
        ciphertext as BufferSource
      );
      
      const responseData = new Uint8Array(decryptedData);
      
      // Decode the inner bHTTP response
      const innerResponse = decodeResponse(responseData);
      return innerResponse;
      
    } catch (error) {
      throw new CryptoError(
        `Failed to decapsulate response: ${error}`,
        "DECAPSULATION_FAILED",
        error
      );
    }
  }

}
