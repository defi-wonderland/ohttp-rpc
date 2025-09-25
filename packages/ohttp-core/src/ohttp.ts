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
  // OHTTP Request Format: [key_id_len][key_id][enc][ciphertext]
  // For proper framing, we need to ensure the data includes the HPKE encapsulation
  
  if (ctInfo && ctInfo.length > 0) {
    // Include context information for multi-key scenarios
    // Format: [ctinfo_len][ctinfo][enc_data]
    return concatBytes(encodeLengthPrefixed(ctInfo), encData);
  }
  
  // For single-key scenarios, ensure proper OHTTP format
  // The encData should already contain [key_id_len][key_id][enc][ciphertext]
  return encData;
}

/**
 * Unwrap encapsulated request to get raw encrypted data
 */
export function unwrapEncapsulatedRequest(
  wrapped: EncapsulatedRequest
): { encData: Uint8Array; ctInfo?: Uint8Array } {
  // For single-key scenarios (which is our current implementation),
  // the wrapped data is already in the correct OHTTP format: [key_id_len][key_id][enc][ciphertext]
  // Just return it as-is without trying to parse context info
  
  // NOTE: Multi-key scenarios with context info are not currently supported
  // Future enhancement: detect and handle format [ctinfo_len][ctinfo][ohttp_request]
  // Current implementation supports single-key scenarios per RFC 9458
  
  return { encData: wrapped };
}

/**
 * Wrap encapsulated response data
 */
export function wrapEncapsulatedResponse(encData: Uint8Array): EncapsulatedResponse {
  // OHTTP Response Format: [enc][ciphertext] where enc is the ephemeral public key
  // The encData should already be properly formatted by the HPKE encryption
  // No additional framing needed at this level
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
  // Minimum: 1 byte key_id + 2 bytes kem_id + 32 bytes public_key + 2 bytes sym_alg_len + 4 bytes sym_alg = 41 bytes
  if (configBytes.length < 41) {
    throw new Error("Key config too short for RFC 9458 format");
  }
  
  let offset = 0;
  
  // Key Identifier (8 bits) - RFC 9458 Section 3.1
  // Note: RFC 9458 specifies Key ID is exactly 1 byte (8 bits)
  if (offset + 1 > configBytes.length) {
    throw new Error("Key config truncated at Key ID");
  }
  const keyId = new Uint8Array([configBytes[offset]]);
  offset += 1;
  
  // HPKE KEM ID (16 bits, network byte order)
  if (offset + 2 > configBytes.length) {
    throw new Error("Key config truncated at KEM ID");
  }
  
  const kemId = (configBytes[offset] << 8) | configBytes[offset + 1];
  offset += 2;
  
  // HPKE Public Key (32 bytes for X25519)
  if (offset + 32 > configBytes.length) {
    throw new Error("Key config truncated at public key");
  }
  
  const publicKey = configBytes.slice(offset, offset + 32);
  offset += 32;
  
  // HPKE Symmetric Algorithms Length (16 bits)
  if (offset + 2 > configBytes.length) {
    throw new Error("Key config truncated at symmetric algorithms length");
  }
  
  const symAlgLength = (configBytes[offset] << 8) | configBytes[offset + 1];
  offset += 2;
  
  if (symAlgLength < 4 || symAlgLength % 4 !== 0) {
    throw new Error("Invalid symmetric algorithms length");
  }
  
  if (offset + symAlgLength > configBytes.length) {
    throw new Error("Key config truncated at symmetric algorithms");
  }
  
  // Parse first KDF+AEAD pair (we only support one for now)
  const kdfId = (configBytes[offset] << 8) | configBytes[offset + 1];
  offset += 2;
  
  const aeadId = (configBytes[offset] << 8) | configBytes[offset + 1];
  offset += 2;
  
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
  
  // Key Identifier (8 bits) - RFC 9458 Section 3.1
  if (keyId.length !== 1) {
    throw new Error("Key ID must be exactly 1 byte per RFC 9458");
  }
  parts.push(keyId);
  
  // HPKE KEM ID (16 bits, network byte order)
  parts.push(new Uint8Array([kemId >> 8, kemId & 0xff]));
  
  // HPKE Public Key (Npk * 8 bits - 32 bytes for X25519)
  parts.push(publicKey);
  
  // HPKE Symmetric Algorithms Length (16 bits) - 4 bytes for one KDF+AEAD pair
  const symAlgLength = 4; // 2 bytes KDF ID + 2 bytes AEAD ID
  parts.push(new Uint8Array([symAlgLength >> 8, symAlgLength & 0xff]));
  
  // HPKE Symmetric Algorithms: KDF ID (16 bits) + AEAD ID (16 bits)
  parts.push(new Uint8Array([kdfId >> 8, kdfId & 0xff])); // KDF ID
  parts.push(new Uint8Array([aeadId >> 8, aeadId & 0xff])); // AEAD ID
  
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
