/**
 * OHTTP Gateway endpoint handler
 */

import { CT_OHTTP_REQ, CT_OHTTP_RES } from "@ohttp/shared";
import { assertContentType, unwrapEncapsulatedRequest } from "@ohttp/core";
import type { GatewayConfig } from "../env.js";
import type { GatewayHpkeManager } from "../crypto/hpke.js";
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
 * Format: [key_id_len][key_id][enc][ciphertext]
 */
function extractEphemeralKey(encapsulatedRequest: Uint8Array): Uint8Array {
  try {
    // Parse OHTTP request format per RFC 9458 Section 4.1:
    // [Key Identifier (8)][HPKE KEM ID (16)][HPKE KDF ID (16)][HPKE AEAD ID (16)][enc][ciphertext]
    
    if (encapsulatedRequest.length < 7 + 32) { // 7 bytes header + 32 bytes enc minimum
      throw new Error("Invalid OHTTP request: too short for RFC 9458 format");
    }
    
    // Skip the header: 1 byte key_id + 2 bytes kem_id + 2 bytes kdf_id + 2 bytes aead_id = 7 bytes
    const headerSize = 7;
    
    // Extract enc (ephemeral public key) - 32 bytes for X25519
    return encapsulatedRequest.slice(headerSize, headerSize + 32);
    
  } catch (error) {
    // Fallback: generate deterministic ephemeral key from request hash
    console.warn("Failed to extract ephemeral key, using fallback:", error);
    const fallbackKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      fallbackKey[i] = encapsulatedRequest[i % encapsulatedRequest.length] ^ (i + 1);
    }
    return fallbackKey;
  }
}
import { zeroizeBytes } from "../crypto/zeroize.js";

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
  
  try {
    // Validate content type
    assertContentType(request.headers, CT_OHTTP_REQ);
    
    // Read encapsulated request
    encapsulatedRequest = new Uint8Array(await request.arrayBuffer());
    
    // Validate request size
    if (encapsulatedRequest.length > config.MAX_INNER_BYTES * 2) {
      // Allow some overhead for encryption
      return createEncapsulatedErrorResponse(413, "Request too large");
    }
    
    // Unwrap encapsulated request
    const { encData, ctInfo } = unwrapEncapsulatedRequest(encapsulatedRequest);
    
    // Decrypt the request
    decryptedRequest = await hpkeManager.decryptRequest(encData, ctInfo);
    
    // Validate bHTTP format
    const bhttpValidation = validateBhttpRequest(decryptedRequest);
    if (!bhttpValidation.valid) {
      return createEncapsulatedErrorResponse(400, bhttpValidation.error || "Invalid bHTTP format");
    }
    
    // Process bHTTP request
    const { method, url, headers, body } = processBhttpRequest(decryptedRequest);
    
    // Validate request against policy
    const policyValidation = validateInnerRequest(url, headers, body.length, config);
    if (!policyValidation.allowed) {
      return createEncapsulatedErrorResponse(403, policyValidation.reason || "Request not allowed");
    }
    
    // Validate request size constraints
    const sizeValidation = validateRequestSize(url, headers, body.length, config);
    if (!sizeValidation.valid) {
      return createEncapsulatedErrorResponse(413, sizeValidation.reason || "Request too large");
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
    // The HPKE context is automatically retained from decryptRequest
    const encapsulatedResponse = await hpkeManager.encryptResponse(bhttpResponse);
    
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
    
    return createEncapsulatedErrorResponse(status, message);
    
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
 */
function createEncapsulatedErrorResponse(
  status: number,
  message: string
): Response {
  try {
    // Create bHTTP error response
    const bhttpError = createBhttpErrorResponse(status, message);
    
    // For errors, we return the bHTTP response directly without encryption
    // In a full implementation, this would also be encrypted
    
      return new Response(bhttpError as BodyInit, {
      status: 200, // Always return 200 for OHTTP responses
      headers: {
        "content-type": CT_OHTTP_RES,
        "content-length": bhttpError.length.toString(),
      },
    });
    
  } catch (error) {
    console.error("Failed to create encapsulated error response:", error);
    
    // Fallback to plain HTTP error
    return new Response(message, {
      status,
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
