/**
 * OHTTP message framing and utilities
 * 
 * Implements OHTTP wire format helpers for encapsulated requests/responses.
 * Handles key configuration parsing and OHTTP message construction.
 */

import type { OhttpKeyConfig, OhttpKeysDocument, HpkeSuite } from "@ohttp/shared";
import { HPKE_SUITE_IDS, DEFAULT_HPKE_SUITE } from "@ohttp/shared";
import {
  encodeLengthPrefixed,
  decodeLengthPrefixed,
  concatBytes,
} from "./bytes.js";

/**
 * OHTTP Encapsulated Request (message/ohttp-req)
 */
export type EncapsulatedRequest = Uint8Array;

/**
 * OHTTP Encapsulated Response (message/ohttp-res)
 */
export type EncapsulatedResponse = Uint8Array;

/**
 * Wrap encapsulated request data with optional context info
 * 
 * For MVP, this is mostly a pass-through, but reserves space for
 * future multi-key scenarios or additional framing.
 */
export function wrapEncapsulatedRequest(
  encData: Uint8Array,
  ctInfo?: Uint8Array
): EncapsulatedRequest {
  // MVP: Simple pass-through
  // Future: Could add framing for multi-key support
  if (ctInfo && ctInfo.length > 0) {
    // Prepend context info length + data for future extensibility
    return concatBytes(encodeLengthPrefixed(ctInfo), encData);
  }
  
  return encData;
}

/**
 * Unwrap encapsulated request to get raw encrypted data
 */
export function unwrapEncapsulatedRequest(
  wrapped: EncapsulatedRequest
): { encData: Uint8Array; ctInfo?: Uint8Array } {
  // MVP: Check if this looks like it has context info prefix
  try {
    const { data: ctInfo, consumed } = decodeLengthPrefixed(wrapped, 0);
    if (consumed < wrapped.length) {
      // Has context info
      return {
        encData: wrapped.slice(consumed),
        ctInfo,
      };
    }
  } catch {
    // No context info, treat as raw encrypted data
  }
  
  return { encData: wrapped };
}

/**
 * Wrap encapsulated response data
 */
export function wrapEncapsulatedResponse(encData: Uint8Array): EncapsulatedResponse {
  // MVP: Simple pass-through
  return encData;
}

/**
 * Parse OHTTP key configuration document (application/ohttp-keys)
 * 
 * Format (per RFC 9458):
 * - Key configurations are length-prefixed
 * - Each config: key_id (1-8 bytes) + kem_id (2 bytes) + kdf_id (2 bytes) + aead_id (2 bytes) + public_key
 */
export function parseOhttpKeys(keysDocument: OhttpKeysDocument): OhttpKeyConfig[] {
  const configs: OhttpKeyConfig[] = [];
  let offset = 0;
  
  while (offset < keysDocument.length) {
    try {
      const { data: configBytes, consumed } = decodeLengthPrefixed(keysDocument, offset);
      offset += consumed;
      
      const config = parseKeyConfig(configBytes);
      configs.push(config);
    } catch (error) {
      throw new Error(`Failed to parse OHTTP key config at offset ${offset}: ${error}`);
    }
  }
  
  if (configs.length === 0) {
    throw new Error("No valid key configurations found");
  }
  
  return configs;
}

/**
 * Parse a single key configuration from bytes
 */
function parseKeyConfig(configBytes: Uint8Array): OhttpKeyConfig {
  if (configBytes.length < 7) {
    throw new Error("Key config too short");
  }
  
  let offset = 0;
  
  // Key ID length (1 byte) + Key ID (1-8 bytes)
  const keyIdLength = configBytes[offset];
  offset += 1;
  
  if (keyIdLength < 1 || keyIdLength > 8) {
    throw new Error(`Invalid key ID length: ${keyIdLength}`);
  }
  
  if (offset + keyIdLength > configBytes.length) {
    throw new Error("Key config truncated at key ID");
  }
  
  const keyId = configBytes.slice(offset, offset + keyIdLength);
  offset += keyIdLength;
  
  // KEM ID (2 bytes, big-endian)
  if (offset + 2 > configBytes.length) {
    throw new Error("Key config truncated at KEM ID");
  }
  
  const kemId = (configBytes[offset] << 8) | configBytes[offset + 1];
  offset += 2;
  
  // KDF ID (2 bytes, big-endian)
  if (offset + 2 > configBytes.length) {
    throw new Error("Key config truncated at KDF ID");
  }
  
  const kdfId = (configBytes[offset] << 8) | configBytes[offset + 1];
  offset += 2;
  
  // AEAD ID (2 bytes, big-endian)
  if (offset + 2 > configBytes.length) {
    throw new Error("Key config truncated at AEAD ID");
  }
  
  const aeadId = (configBytes[offset] << 8) | configBytes[offset + 1];
  offset += 2;
  
  // Public key (remaining bytes)
  const publicKey = configBytes.slice(offset);
  
  if (publicKey.length === 0) {
    throw new Error("Empty public key");
  }
  
  // Map numeric IDs to suite names
  const suite = mapSuiteIds(kemId, kdfId, aeadId);
  
  return {
    keyId,
    suite,
    publicKey,
  };
}

/**
 * Map numeric suite IDs to HpkeSuite
 */
function mapSuiteIds(kemId: number, kdfId: number, aeadId: number): HpkeSuite {
  // Check if this matches our supported suite
  if (
    kemId === HPKE_SUITE_IDS.DHKEM_X25519_HKDF_SHA256 &&
    kdfId === HPKE_SUITE_IDS.HKDF_SHA256 &&
    (aeadId === HPKE_SUITE_IDS.AES_128_GCM || aeadId === HPKE_SUITE_IDS.CHACHA20_POLY1305)
  ) {
    return {
      kem: "DHKEM_X25519_HKDF_SHA256",
      kdf: "HKDF_SHA256",
      aead: aeadId === HPKE_SUITE_IDS.AES_128_GCM ? "AES_128_GCM" : "CHACHA20_POLY1305",
    };
  }
  
  throw new Error(
    `Unsupported HPKE suite: KEM=${kemId}, KDF=${kdfId}, AEAD=${aeadId}`
  );
}

/**
 * Encode OHTTP key configuration to binary format
 */
export function encodeOhttpKeys(configs: OhttpKeyConfig[]): OhttpKeysDocument {
  const configBytes = configs.map(encodeKeyConfig);
  return concatBytes(...configBytes.map(encodeLengthPrefixed));
}

/**
 * Encode a single key configuration
 */
function encodeKeyConfig(config: OhttpKeyConfig): Uint8Array {
  const { keyId, suite, publicKey } = config;
  
  if (keyId.length < 1 || keyId.length > 8) {
    throw new Error(`Invalid key ID length: ${keyId.length}`);
  }
  
  // Map suite to numeric IDs
  const kemId = HPKE_SUITE_IDS.DHKEM_X25519_HKDF_SHA256;
  const kdfId = HPKE_SUITE_IDS.HKDF_SHA256;
  const aeadId = suite.aead === "AES_128_GCM" 
    ? HPKE_SUITE_IDS.AES_128_GCM 
    : HPKE_SUITE_IDS.CHACHA20_POLY1305;
  
  const parts: Uint8Array[] = [];
  
  // Key ID length + Key ID
  parts.push(new Uint8Array([keyId.length]));
  parts.push(keyId);
  
  // KEM ID (2 bytes, big-endian)
  parts.push(new Uint8Array([kemId >> 8, kemId & 0xff]));
  
  // KDF ID (2 bytes, big-endian)
  parts.push(new Uint8Array([kdfId >> 8, kdfId & 0xff]));
  
  // AEAD ID (2 bytes, big-endian)
  parts.push(new Uint8Array([aeadId >> 8, aeadId & 0xff]));
  
  // Public key
  parts.push(publicKey);
  
  return concatBytes(...parts);
}

/**
 * Select the first supported key configuration from a list
 */
export function selectSupportedConfig(configs: OhttpKeyConfig[]): OhttpKeyConfig | null {
  // For MVP, we only support the default suite
  for (const config of configs) {
    if (
      config.suite.kem === DEFAULT_HPKE_SUITE.kem &&
      config.suite.kdf === DEFAULT_HPKE_SUITE.kdf &&
      (config.suite.aead === "AES_128_GCM" || config.suite.aead === "CHACHA20_POLY1305")
    ) {
      return config;
    }
  }
  
  return null;
}

/**
 * Create a simple key configuration for testing/development
 */
export function createTestKeyConfig(
  publicKey: Uint8Array,
  keyId?: Uint8Array,
  suite: HpkeSuite = DEFAULT_HPKE_SUITE
): OhttpKeyConfig {
  return {
    keyId: keyId || crypto.getRandomValues(new Uint8Array(8)),
    suite,
    publicKey,
  };
}
