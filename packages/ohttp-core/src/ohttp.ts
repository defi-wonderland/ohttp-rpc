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
 * Format (per RFC 9458 Section 3.1):
 * - [2-byte length in network byte order][config1][config2]...
 * - Each config: key_id (1-8 bytes) + kem_id (2 bytes) + kdf_id (2 bytes) + aead_id (2 bytes) + public_key
 */
export function parseOhttpKeys(keysDocument: OhttpKeysDocument): OhttpKeyConfig[] {
  if (keysDocument.length < 2) {
    throw new Error("OHTTP keys document too short");
  }
  
  // RFC 9458: First 2 bytes are length in network byte order
  const length = (keysDocument[0] << 8) | keysDocument[1];
  
  if (length !== keysDocument.length - 2) {
    throw new Error(`Length mismatch: expected ${length}, got ${keysDocument.length - 2}`);
  }
  
  const configs: OhttpKeyConfig[] = [];
  let offset = 2; // Skip the length field
  
  // Parse individual configurations until we've consumed all data
  while (offset < keysDocument.length) {
    try {
      // Parse the configuration and get the consumed bytes
      const { config, consumed } = parseKeyConfigWithSize(keysDocument.slice(offset));
      configs.push(config);
      offset += consumed;
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
 * Parse a single key configuration from bytes and return consumed size
 */
function parseKeyConfigWithSize(configBytes: Uint8Array): { config: OhttpKeyConfig; consumed: number } {
  // We need to determine the size of just the first configuration in the buffer
  // Parse the configuration to get the Key ID length and symmetric algorithms length
  
  if (configBytes.length < 41) {
    throw new Error("Key config too short for RFC 9458 format");
  }
  
  // We need to find where the symmetric algorithms length is for the FIRST config
  // Since we don't know the Key ID length yet, we need to try different possibilities
  
  let keyIdLength = 1;
  let validConfig = null;
  let configSize = 0;
  
  // Try Key ID lengths from 1 to 8 bytes
  for (keyIdLength = 1; keyIdLength <= 8 && keyIdLength <= configBytes.length - 38; keyIdLength++) {
    try {
      const minConfigSize = keyIdLength + 2 + 32 + 2 + 4; // keyId + kemId + publicKey + symAlgLen + 4-byte symAlg
      
      if (configBytes.length < minConfigSize) {
        continue;
      }
      
      // Check if the symmetric algorithms length at this position makes sense
      const symAlgLengthOffset = keyIdLength + 2 + 32;
      const symAlgLength = (configBytes[symAlgLengthOffset] << 8) | configBytes[symAlgLengthOffset + 1];
      
      if (symAlgLength >= 4 && symAlgLength % 4 === 0) {
        configSize = keyIdLength + 2 + 32 + 2 + symAlgLength;
        
        if (configSize <= configBytes.length) {
          // Try to parse with this configuration size
          const configSlice = configBytes.slice(0, configSize);
          validConfig = parseKeyConfig(configSlice);
          break;
        }
      }
    } catch {
      // Continue trying other Key ID lengths
      continue;
    }
  }
  
  if (!validConfig) {
    throw new Error("Could not determine valid key configuration structure");
  }
  
  return { config: validConfig, consumed: configSize };
}

/**
 * Parse a single key configuration from bytes
 */
function parseKeyConfig(configBytes: Uint8Array): OhttpKeyConfig {
  // Minimum: 1 byte key_id + 2 bytes kem_id + 32 bytes public_key + 2 bytes sym_alg_len + 4 bytes sym_alg = 41 bytes
  if (configBytes.length < 41) {
    throw new Error("Key config too short for RFC 9458 format");
  }
  
  // First, determine the Key ID length by working backwards from the symmetric algorithms length
  // The symmetric algorithms length is at a known offset from the end
  if (configBytes.length < 6) { // Need at least 2 bytes symAlgLen + 4 bytes symAlg
    throw new Error("Key config truncated at symmetric algorithms length");
  }
  
  const symAlgLengthOffset = configBytes.length - 6; // 2 bytes before the 4-byte symmetric algorithms
  const symAlgLength = (configBytes[symAlgLengthOffset] << 8) | configBytes[symAlgLengthOffset + 1];
  
  if (symAlgLength < 4 || symAlgLength % 4 !== 0) {
    throw new Error("Invalid symmetric algorithms length");
  }
  
  // Calculate Key ID length: total - (2 bytes KEM + 32 bytes pubkey + 2 bytes symAlgLen + symAlgLength)
  const keyIdLength = configBytes.length - (2 + 32 + 2 + symAlgLength);
  
  if (keyIdLength < 1 || keyIdLength > 8) {
    throw new Error(`Invalid Key ID length: ${keyIdLength} (must be 1-8 bytes)`);
  }
  
  let offset = 0;
  
  // Key Identifier (1-8 bytes) - RFC 9458 Section 3.1
  const keyId = configBytes.slice(offset, offset + keyIdLength);
  offset += keyIdLength;
  
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
  
  const actualSymAlgLength = (configBytes[offset] << 8) | configBytes[offset + 1];
  offset += 2;
  
  if (actualSymAlgLength < 4 || actualSymAlgLength % 4 !== 0) {
    throw new Error("Invalid symmetric algorithms length");
  }
  
  if (offset + actualSymAlgLength > configBytes.length) {
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
 * Encode OHTTP key configuration to binary format (RFC 9458 Section 3.1)
 */
export function encodeOhttpKeys(configs: OhttpKeyConfig[]): OhttpKeysDocument {
  const configBytes = configs.map(encodeKeyConfig);
  const allConfigs = concatBytes(...configBytes);
  
  // RFC 9458 Section 3.1: [2-byte length in network byte order][config1][config2]...
  // Length is the total size of all config data (excluding the length field itself)
  const length = allConfigs.length;
  const lengthBytes = new Uint8Array([length >> 8, length & 0xff]);
  
  return concatBytes(lengthBytes, allConfigs);
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
  
  // Key Identifier (1-8 bytes) - RFC 9458 Section 3.1
  if (keyId.length < 1 || keyId.length > 8) {
    throw new Error("Key ID must be 1-8 bytes per RFC 9458 Section 3.1");
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
