/**
 * OHTTP Gateway endpoint handler
 */

import { CT_OHTTP_REQ, CT_OHTTP_RES, OHTTP_PROBLEM_TYPES } from "@ohttp/shared";
import { assertContentType, unwrapEncapsulatedRequest, createProblemResponse } from "@ohttp/core";
import type { GatewayConfig } from "../env.js";
import type { GatewayHpkeManager } from "../crypto/hpke.js";
import type { HpkeContext } from "@ohttp/hpke-engine";
import { validateInnerRequest, filterHeaders } from "../policy/allowlist.js";
import { validateRequestSize } from "../policy/size.js";
import { 
  processBhttpRequest, 
  createBhttpResponse, 
  createBhttpErrorResponse,
  validateBhttpRequest 
} from "../http/bhttp.js";
import { forwardToUpstream, createUpstreamErrorResponse } from "../http/forward.js";

/**
 * Extract ephemeral key from OHTTP encapsulated request
 * RFC 9458 Section 4.1 format: [Key Identifier (8)][HPKE KEM ID (16)][HPKE KDF ID (16)][HPKE AEAD ID (16)][Encapsulated KEM Shared Secret (Nenc)][HPKE-Protected Request]
 */
function extractEphemeralKey(encapsulatedRequest: Uint8Array): Uint8Array {
  try {
    // RFC 9458 Section 4.1: Encapsulated Request format
    if (encapsulatedRequest.length < 7 + 32) { // 7 bytes header + 32 bytes enc minimum
      throw new Error("Invalid OHTTP request: too short for RFC 9458 format");
    }
    
    let offset = 0;
    
    // Key Identifier (8 bits) - RFC 9458 Section 3.1
    offset += 1;
    
    // HPKE KEM ID (16 bits)
    const kemId = (encapsulatedRequest[offset] << 8) | encapsulatedRequest[offset + 1];
    offset += 2;
    
    // HPKE KDF ID (16 bits) 
    offset += 2;
    
    // HPKE AEAD ID (16 bits)
    offset += 2;
    
    // Encapsulated KEM Shared Secret (Nenc bytes)
    // For DHKEM_X25519_HKDF_SHA256, Nenc = 32 bytes
    const Nenc = kemId === 0x0020 ? 32 : 32; // X25519 uses 32-byte public keys
    
    if (offset + Nenc > encapsulatedRequest.length) {
      throw new Error("Invalid OHTTP request: truncated at encapsulated key");
    }
    
    // Extract enc (ephemeral public key)
    return encapsulatedRequest.slice(offset, offset + Nenc);
    
  } catch (error) {
    console.error("Failed to extract ephemeral key from OHTTP request:", error);
    throw new Error(`Invalid OHTTP request format: ${error}`);
  }
}
import { zeroizeBytes } from "../crypto/zeroize.js";

/**
 * Validate Date header for anti-replay protection (RFC 9458 Section 6.5.1)
 */
function validateDateHeader(headers: Record<string, string>, config: GatewayConfig): {
  valid: boolean;
  error?: string;
  correctedDate?: string;
} {
  const dateHeader = headers['date'];
  
  if (!dateHeader) {
    // RFC 9458 Section 6.5.1: Clients SHOULD include Date header
    // For now, we allow requests without Date header but warn
    console.warn("Request missing Date header - anti-replay protection disabled");
    return { valid: true };
  }
  
  try {
    const requestTime = new Date(dateHeader).getTime();
    const now = Date.now();
    
    // Allow 5 minutes of clock skew by default
    const skewToleranceMs = config.DATE_SKEW_TOLERANCE_MS || 300000; // 5 minutes
    const timeDiff = Math.abs(now - requestTime);
    
    if (timeDiff > skewToleranceMs) {
      // RFC 9458 Section 6.5.2: Provide corrected date
      const correctedDate = new Date(now).toUTCString();
      
      return {
        valid: false,
        error: `Date field in request outside of acceptable range. Time difference: ${timeDiff}ms`,
        correctedDate
      };
    }
    
    return { valid: true };
    
  } catch (error) {
    return {
      valid: false,
      error: `Invalid Date header format: ${dateHeader}`
    };
  }
}

/**
 * Create problem+json response for date validation errors (RFC 9458 Section 6.5.2)
 */
async function createDateErrorResponse(
  error: string,
  correctedDate: string,
  hpkeManager: GatewayHpkeManager,
  decryptResult: { context: HpkeContext; enc: Uint8Array }
): Promise<Response> {
  const { headers, body } = createProblemResponse(
    OHTTP_PROBLEM_TYPES.DATE_NOT_ACCEPTABLE,
    "Date Not Acceptable",
    400,
    error,
    undefined
  );
  
  // Add corrected date header
  headers.set("date", correctedDate);
  
  // Encode as bHTTP response
  const headersObj: Record<string, string> = {};
  headers.forEach((value, key) => {
    headersObj[key] = value;
  });
  
  const bhttpResponse = createBhttpResponse(400, headersObj, body);
  
  // Encrypt the response
  const encapsulatedResponse = await hpkeManager.encryptResponse(
    bhttpResponse, 
    decryptResult.context, 
    decryptResult.enc
  );
  
  return new Response(encapsulatedResponse as BodyInit, {
    status: 200,
    headers: {
      "content-type": CT_OHTTP_RES,
      "content-length": encapsulatedResponse.length.toString(),
      "date": correctedDate,
    },
  });
}

/**
 * Handle POST /gateway request
 */
export async function handleGateway(
  request: Request,
  hpkeManager: GatewayHpkeManager,
  config: GatewayConfig
): Promise<Response> {
  let encapsulatedRequest: Uint8Array | null = null;
  let decryptedRequest: Uint8Array | null = null;
  let decryptResult: { plaintext: Uint8Array; context: HpkeContext; enc: Uint8Array } | null = null;
  
  try {
    // Validate content type
    assertContentType(request.headers, CT_OHTTP_REQ);
    
    // Read encapsulated request
    encapsulatedRequest = new Uint8Array(await request.arrayBuffer());
    
    // Validate request size
    if (encapsulatedRequest.length > config.MAX_INNER_BYTES * 2) {
      // Allow some overhead for encryption
      return await createEncapsulatedErrorResponse(413, "Request too large");
    }
    
    // Unwrap encapsulated request
    const { encData, ctInfo } = unwrapEncapsulatedRequest(encapsulatedRequest);
    
    // Decrypt the request
    decryptResult = await hpkeManager.decryptRequest(encData, ctInfo);
    decryptedRequest = decryptResult.plaintext;
    
    // Validate bHTTP format
    const bhttpValidation = validateBhttpRequest(decryptedRequest);
    if (!bhttpValidation.valid) {
      return await createEncapsulatedErrorResponse(400, bhttpValidation.error || "Invalid bHTTP format", hpkeManager, decryptResult);
    }
    
    // Process bHTTP request
    const { method, url, headers, body } = processBhttpRequest(decryptedRequest);
    
    // Validate Date header for anti-replay protection (RFC 9458 Section 6.5.1)
    const dateValidation = validateDateHeader(headers, config);
    if (!dateValidation.valid && dateValidation.correctedDate) {
      return await createDateErrorResponse(
        dateValidation.error || "Date not acceptable",
        dateValidation.correctedDate,
        hpkeManager,
        decryptResult
      );
    }
    
    // Validate request against policy
    const policyValidation = validateInnerRequest(url, headers, body.length, config);
    if (!policyValidation.allowed) {
      return await createEncapsulatedErrorResponse(403, policyValidation.reason || "Request not allowed", hpkeManager, decryptResult);
    }
    
    // Validate request size constraints
    const sizeValidation = validateRequestSize(url, headers, body.length, config);
    if (!sizeValidation.valid) {
      return await createEncapsulatedErrorResponse(413, sizeValidation.reason || "Request too large", hpkeManager, decryptResult);
    }
    
    // Filter headers to allowlist
    const filteredHeaders = filterHeaders(headers, config);
    
    // Forward to upstream
    const upstreamResponse = await forwardToUpstream(
      method,
      url,
      filteredHeaders,
      body,
      config
    );
    
    // Create bHTTP response
    const bhttpResponse = createBhttpResponse(
      upstreamResponse.status,
      upstreamResponse.headers,
      upstreamResponse.body
    );
    
    // Encrypt response using RFC 9458 Section 4.2 method
    const encapsulatedResponse = await hpkeManager.encryptResponse(
      bhttpResponse, 
      decryptResult.context, 
      decryptResult.enc
    );
    
    return new Response(encapsulatedResponse as BodyInit, {
      status: 200,
      headers: {
        "content-type": CT_OHTTP_RES,
        "content-length": encapsulatedResponse.length.toString(),
      },
    });
    
  } catch (error) {
    console.error("Gateway processing error:", error);
    
    // Determine error type and status
    let status = 500;
    let message = "Internal gateway error";
    
    if (error instanceof Error) {
      if (error.message.includes("decrypt")) {
        status = 400;
        message = "Failed to decrypt request";
      } else if (error.message.includes("timeout")) {
        status = 504;
        message = "Upstream timeout";
      } else if (error.message.includes("upstream")) {
        status = 502;
        message = "Upstream error";
      }
    }
    
    return await createEncapsulatedErrorResponse(status, message, hpkeManager, decryptResult || undefined);
    
  } finally {
    // Zeroize sensitive data
    if (encapsulatedRequest) {
      zeroizeBytes(encapsulatedRequest);
    }
    if (decryptedRequest) {
      zeroizeBytes(decryptedRequest);
    }
  }
}

/**
 * Create encapsulated error response
 * RFC 9458 Section 5.2: ALL responses from gateway must be encapsulated
 */
async function createEncapsulatedErrorResponse(
  status: number,
  message: string,
  hpkeManager?: GatewayHpkeManager,
  decryptResult?: { context: HpkeContext; enc: Uint8Array }
): Promise<Response> {
  try {
    // Create bHTTP error response
    const bhttpError = createBhttpErrorResponse(status, message);
    
    // RFC 9458 Section 5.2: All gateway responses must be encapsulated
    if (hpkeManager && decryptResult) {
      try {
        const encapsulatedResponse = await hpkeManager.encryptResponse(
          bhttpError, 
          decryptResult.context, 
          decryptResult.enc
        );
        return new Response(encapsulatedResponse as BodyInit, {
          status: 200, // Always return 200 for OHTTP responses
          headers: {
            "content-type": CT_OHTTP_RES,
            "content-length": encapsulatedResponse.length.toString(),
          },
        });
      } catch (encryptError) {
        console.error("Failed to encrypt error response:", encryptError);
        // RFC 9458 Section 5.2: Cannot fallback to unencrypted responses
        // If we cannot encrypt, we must return a generic error
        throw new Error("Cannot encrypt response - HPKE context not available");
      }
    }
    
    // RFC 9458 Section 5.2 violation: Cannot return unencrypted responses
    // If no HPKE manager is available, we cannot process OHTTP requests
    throw new Error("HPKE manager required for OHTTP gateway responses");
    
  } catch (error) {
    console.error("Failed to create encapsulated error response:", error);
    
    // RFC 9458 compliant behavior: Return HTTP 500 for encryption failures
    // This indicates a server-side issue, not a client request issue
    return new Response("Internal Server Error - Cannot encrypt response", {
      status: 500,
      headers: {
        "content-type": "text/plain",
      },
    });
  }
}

/**
 * Validate gateway request method and path
 */
export function validateGatewayRequest(request: Request): {
  valid: boolean;
  error?: string;
} {
  // Must be POST
  if (request.method !== "POST") {
    return {
      valid: false,
      error: "Gateway endpoint only accepts POST requests",
    };
  }
  
  // Check path
  const url = new URL(request.url);
  if (url.pathname !== "/gateway") {
    return {
      valid: false,
      error: "Invalid gateway path",
    };
  }
  
  return { valid: true };
}

/**
 * Create CORS headers for gateway responses (if needed)
 */
export function createGatewayCorsHeaders(): Record<string, string> {
  // Gateway typically doesn't need CORS since it's accessed via relay
  // But we include basic headers for direct testing
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}
