/**
 * OHTTP Keys endpoint handler
 */

import { CT_OHTTP_KEYS, createLogger } from "@ohttp/shared";
import { encodeOhttpKeys, createTestKeyConfig } from "@ohttp/core";
import type { GatewayHpkeManager } from "../crypto/hpke.js";

const logger = createLogger('keys-handler');

/**
 * Handle GET /ohttp-keys request
 */
export async function handleOhttpKeys(
  hpkeManager: GatewayHpkeManager
): Promise<Response> {
  try {
    // Get public key from HPKE manager
    const publicKey = hpkeManager.getPublicKey();
    const suite = hpkeManager.getSuite();
    
    // Map suite IDs to our type system
    const hpkeSuite = {
      kem: "DHKEM_X25519_HKDF_SHA256" as const,
      kdf: "HKDF_SHA256" as const,
      aead: suite.aead === 1 ? "AES_128_GCM" as const : "CHACHA20_POLY1305" as const,
    };
    
    // Create key configuration
    const keyConfig = createTestKeyConfig(
      publicKey.bytes,
      publicKey.kid,
      hpkeSuite
    );
    
    // Encode as binary OHTTP keys document
    const keysDocument = encodeOhttpKeys([keyConfig]);
    
    // Create response with caching headers
    const headers = new Headers({
      "content-type": CT_OHTTP_KEYS,
      "content-length": keysDocument.length.toString(),
      "cache-control": "public, max-age=86400", // Cache for 24 hours
      "vary": "Accept-Encoding",
    });
    
    // Add ETag for conditional requests
    const etag = await generateETag(keysDocument);
    headers.set("etag", etag);
    
    return new Response(keysDocument as BodyInit, {
      status: 200,
      headers,
    });
    
  } catch (error) {
    logger.error("Failed to generate OHTTP keys", {}, error instanceof Error ? error : undefined);
    
    return new Response("Internal server error", {
      status: 500,
      headers: {
        "content-type": "text/plain",
      },
    });
  }
}

/**
 * Handle conditional GET request for OHTTP keys
 */
export async function handleConditionalOhttpKeys(
  request: Request,
  hpkeManager: GatewayHpkeManager
): Promise<Response> {
  try {
    // Check for If-None-Match header
    const ifNoneMatch = request.headers.get("if-none-match");
    
    if (ifNoneMatch) {
      // Generate current ETag
      const publicKey = hpkeManager.getPublicKey();
      const suite = hpkeManager.getSuite();
      
      const hpkeSuite = {
        kem: "DHKEM_X25519_HKDF_SHA256" as const,
        kdf: "HKDF_SHA256" as const,
        aead: suite.aead === 1 ? "AES_128_GCM" as const : "CHACHA20_POLY1305" as const,
      };
      
      const keyConfig = createTestKeyConfig(
        publicKey.bytes,
        publicKey.kid,
        hpkeSuite
      );
      
      const keysDocument = encodeOhttpKeys([keyConfig]);
      const currentETag = await generateETag(keysDocument);
      
      // Check if ETag matches
      if (ifNoneMatch === currentETag) {
        return new Response(null, {
          status: 304,
          headers: {
            "cache-control": "public, max-age=86400",
            "etag": currentETag,
          },
        });
      }
    }
    
    // ETag doesn't match or not provided, return full response
    return handleOhttpKeys(hpkeManager);
    
  } catch (error) {
    logger.error("Failed to handle conditional OHTTP keys request", {}, error instanceof Error ? error : undefined);
    return handleOhttpKeys(hpkeManager);
  }
}

/**
 * Generate ETag for key configuration
 */
async function generateETag(keysDocument: Uint8Array): Promise<string> {
  // Create hash of the keys document for ETag
    const hashBuffer = await crypto.subtle.digest("SHA-256", keysDocument as BufferSource);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Convert to hex string
  const hashHex = Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Return as quoted ETag
  return `"${hashHex.substring(0, 16)}"`;
}

/**
 * Create JSON representation of keys for debugging
 */
export async function handleOhttpKeysJson(
  hpkeManager: GatewayHpkeManager
): Promise<Response> {
  try {
    const publicKey = hpkeManager.getPublicKey();
    const suite = hpkeManager.getSuite();
    
    // Create human-readable representation
    const keysJson = {
      keys: [
        {
          keyId: Array.from(publicKey.kid),
          keyIdHex: Array.from(publicKey.kid)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(''),
          suite: {
            kem: "DHKEM_X25519_HKDF_SHA256",
            kemId: suite.kem,
            kdf: "HKDF_SHA256", 
            kdfId: suite.kdf,
            aead: suite.aead === 1 ? "AES_128_GCM" : "CHACHA20_POLY1305",
            aeadId: suite.aead,
          },
          publicKey: Array.from(publicKey.bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(''),
          publicKeyLength: publicKey.bytes.length,
        },
      ],
      note: "This is a JSON representation for debugging. Use /ohttp-keys for the binary format.",
    };
    
    return new Response(JSON.stringify(keysJson, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=86400",
      },
    });
    
  } catch (error) {
    logger.error("Failed to generate OHTTP keys JSON", {}, error instanceof Error ? error : undefined);
    
    return new Response(
      JSON.stringify({ error: "Failed to generate keys" }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
        },
      }
    );
  }
}
