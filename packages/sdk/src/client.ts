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
import { CT_OHTTP_REQ, CT_OHTTP_RES, OHTTP_CONSTANTS } from "@ohttp/shared";
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
    const { signal, timeoutMs = 15000, fetchFn = fetch } = options;
    
    try {
      // Validate inner request
      this.validateInnerRequest(innerRequest);
      
      // Encode inner request as bHTTP
      const bhttpRequest = encodeRequest(innerRequest);
      
      // Encapsulate with HPKE
      const encapsulatedRequest = await this.encapsulateRequest(
        bhttpRequest,
        innerRequest.paddingBytes
      );
      
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
  private validateInnerRequest(request: InnerRequest): void {
    // Check URL is absolute
    try {
      const url = new URL(request.url);
      if (url.protocol !== "https:") {
        throw new ConfigError("Inner request must use HTTPS");
      }
    } catch {
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
   * Encapsulate bHTTP request using HPKE
   */
  private async encapsulateRequest(
    bhttpRequest: Uint8Array,
    paddingBytes?: number
  ): Promise<Uint8Array> {
    try {
      // Add padding if requested
      let requestWithPadding = bhttpRequest;
      if (paddingBytes && paddingBytes > 0) {
        const padding = crypto.getRandomValues(new Uint8Array(paddingBytes));
        requestWithPadding = new Uint8Array(bhttpRequest.length + padding.length);
        requestWithPadding.set(bhttpRequest);
        requestWithPadding.set(padding, bhttpRequest.length);
      }
      
      // Create HPKE public key object
      const hpkePublicKey = {
        kid: this.keyConfig.keyId,
        bytes: this.keyConfig.publicKey,
      };
      
      // Seal the request
      const sealResult = await this.engine.sealBase(
        hpkePublicKey,
        null, // no additional authenticated data
        requestWithPadding,
        this.keyConfig.keyId // use key ID as info parameter
      );
      
      // Combine encapsulated key + ciphertext
      const encapsulatedData = new Uint8Array(
        sealResult.enc.length + sealResult.ct.length
      );
      encapsulatedData.set(sealResult.enc);
      encapsulatedData.set(sealResult.ct, sealResult.enc.length);
      
      // Wrap for wire format
      return wrapEncapsulatedRequest(encapsulatedData);
      
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
      // For this implementation, we assume the response is directly decryptable
      // In a real implementation, you'd need to track the ephemeral keys used
      // This is a simplified version for the MVP
      
      // TODO: Implement proper response decapsulation
      // For now, assume the response is already decapsulated bHTTP
      const innerResponse = decodeResponse(encapsulatedResponse);
      
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
