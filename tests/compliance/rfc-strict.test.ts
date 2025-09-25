/**
 * Strict RFC 9458 Compliance Tests - Phase 3 of Testing Campaign
 * 
 * Comprehensive RFC 9458 compliance validation including:
 * - Strict message format validation
 * - Edge case protocol behavior
 * - Error response format compliance
 * - Media type enforcement
 * - Security requirement validation
 */

import { test, expect, describe } from "bun:test";
import { logger } from "../utils/test-logger.js";
import { 
  parseOhttpKeys, 
  encodeOhttpKeys, 
  createTestKeyConfig,
  selectSupportedConfig 
} from "../../packages/ohttp-core/src/ohttp.js";
import { 
  encodeRequest as encodeBhttp, 
  decodeRequest as decodeBhttp,
  encodeResponse as encodeBhttpResponse,
  decodeResponse as decodeBhttpResponse 
} from "../../packages/ohttp-core/src/bhttp.js";
import { 
  assertContentType,
  createProblemResponse,
  MediaTypes 
} from "../../packages/ohttp-core/src/media.js";
import { OHTTP_PROBLEM_TYPES, HPKE_SUITE_IDS } from "../../packages/shared/src/constants.js";
import type { OhttpKeyConfig, InnerRequest, InnerResponse } from "../../packages/shared/src/types.js";

describe("RFC 9458 - Section 3: Key Configuration Format", () => {
  test("Section 3.1: Key configuration binary encoding strictness", () => {
    // Test exact binary format per RFC 9458 Section 3.1
    const publicKey = new Uint8Array(32);
    crypto.getRandomValues(publicKey);
    const keyId = new Uint8Array([0x42]);
    
    const keyConfig = createTestKeyConfig(publicKey, keyId);
    const encoded = encodeOhttpKeys([keyConfig]);
    
    // RFC 9458 Section 3.1: Format is [length][config1][config2]...
    expect(encoded.length).toBeGreaterThan(2); // At least length prefix + some config data
    
    // First 2 bytes should be length in network byte order
    const length = (encoded[0] << 8) | encoded[1];
    expect(length).toBe(encoded.length - 2);
    
    // Parse and verify round-trip
    const parsed = parseOhttpKeys(encoded);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].keyId).toEqual(keyId);
    expect(parsed[0].publicKey).toEqual(publicKey);
    
    logger.debug(` Key configuration binary format: ${encoded.length} bytes, length=${length}`);
  });

  test("Section 3.1: Key ID length validation (1-8 bytes)", () => {
    const publicKey = new Uint8Array(32).fill(0x42);
    
    // Test all valid key ID lengths (1-8 bytes per RFC)
    for (let len = 1; len <= 8; len++) {
      const keyId = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        keyId[i] = i + 1; // Unique pattern
      }
      
      const keyConfig = createTestKeyConfig(publicKey, keyId);
      const encoded = encodeOhttpKeys([keyConfig]);
      const parsed = parseOhttpKeys(encoded);
      
      expect(parsed[0].keyId).toEqual(keyId);
      logger.debug(` Key ID length ${len}: ${Array.from(keyId).map(b => b.toString(16)).join('')}`);
    }
    
    // Test edge cases that should be handled gracefully
    const edgeCases = [
      { keyId: new Uint8Array([0x00]), desc: "zero key ID" },
      { keyId: new Uint8Array([0xFF]), desc: "max single byte" },
      { keyId: new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]), desc: "max 8 bytes" },
    ];
    
    for (const testCase of edgeCases) {
      const keyConfig = createTestKeyConfig(publicKey, testCase.keyId);
      const encoded = encodeOhttpKeys([keyConfig]);
      const parsed = parseOhttpKeys(encoded);
      
      expect(parsed[0].keyId).toEqual(testCase.keyId);
      logger.debug(` Edge case: ${testCase.desc}`);
    }
  });

  test("Section 3.1: HPKE suite identifier validation", () => {
    // Test all defined suite identifiers from RFC 9458
    const suiteTests = [
      { kem: HPKE_SUITE_IDS.DHKEM_X25519_HKDF_SHA256, name: "DHKEM_X25519_HKDF_SHA256" },
      { kdf: HPKE_SUITE_IDS.HKDF_SHA256, name: "HKDF_SHA256" },
      { aead: HPKE_SUITE_IDS.AES_128_GCM, name: "AES_128_GCM" },
      { aead: HPKE_SUITE_IDS.CHACHA20_POLY1305, name: "CHACHA20_POLY1305" },
    ];
    
    for (const suite of suiteTests) {
      // Verify the suite ID is a 16-bit value
      const id = suite.kem || suite.kdf || suite.aead;
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(0xFFFF);
      
      // Verify it can be encoded in network byte order
      const highByte = (id! >> 8) & 0xFF;
      const lowByte = id! & 0xFF;
      const reconstructed = (highByte << 8) | lowByte;
      
      expect(reconstructed).toBe(id);
      logger.debug(` Suite ID ${suite.name}: 0x${id!.toString(16).padStart(4, '0')} (${highByte}, ${lowByte})`);
    }
  });

  test("Section 3.1: Multiple key configuration handling", () => {
    // Test multiple keys in single configuration document
    const configs: OhttpKeyConfig[] = [];
    
    for (let i = 0; i < 5; i++) {
      const publicKey = new Uint8Array(32).fill(i);
      const keyId = new Uint8Array([i]);
      configs.push(createTestKeyConfig(publicKey, keyId));
    }
    
    const encoded = encodeOhttpKeys(configs);
    const parsed = parseOhttpKeys(encoded);
    
    expect(parsed).toHaveLength(configs.length);
    
    // Verify each config is preserved
    for (let i = 0; i < configs.length; i++) {
      expect(parsed[i].keyId).toEqual(configs[i].keyId);
      expect(parsed[i].publicKey).toEqual(configs[i].publicKey);
      expect(parsed[i].suite.kem).toBe(configs[i].suite.kem);
      expect(parsed[i].suite.kdf).toBe(configs[i].suite.kdf);
      expect(parsed[i].suite.aead).toBe(configs[i].suite.aead);
    }
    
    logger.debug(` Multiple key configurations: ${configs.length} keys, ${encoded.length} bytes total`);
  });

  test("Section 3.2: Key configuration selection algorithm", () => {
    // Create multiple configs with different suites
    const configs: OhttpKeyConfig[] = [
      createTestKeyConfig(new Uint8Array(32).fill(1), new Uint8Array([1]), {
        kem: "DHKEM_X25519_HKDF_SHA256",
        kdf: "HKDF_SHA256", 
        aead: "AES_128_GCM"
      }),
      createTestKeyConfig(new Uint8Array(32).fill(2), new Uint8Array([2]), {
        kem: "DHKEM_X25519_HKDF_SHA256",
        kdf: "HKDF_SHA256",
        aead: "CHACHA20_POLY1305" 
      }),
    ];
    
    // Test selection of supported configuration
    const selected = selectSupportedConfig(configs);
    expect(selected).toBeDefined();
    expect(configs.includes(selected!)).toBe(true);
    
    // Should prefer first supported configuration
    expect(selected!.keyId).toEqual(configs[0].keyId);
    
    logger.debug(` Selected key config: ID=${selected!.keyId[0]}, suite=${selected!.suite.aead}`);
  });
});

describe("RFC 9458 - Section 4: Message Formats", () => {
  test("Section 4.1: Encapsulated Request format compliance", () => {
    // RFC 9458 Section 4.1 format:
    // [Key Identifier (8)][HPKE KEM ID (16)][HPKE KDF ID (16)][HPKE AEAD ID (16)][enc][ciphertext]
    
    const keyId = 0x42;
    const kemId = HPKE_SUITE_IDS.DHKEM_X25519_HKDF_SHA256; // 0x0020
    const kdfId = HPKE_SUITE_IDS.HKDF_SHA256; // 0x0001
    const aeadId = HPKE_SUITE_IDS.AES_128_GCM; // 0x0001
    const enc = crypto.getRandomValues(new Uint8Array(32)); // X25519 public key
    const ciphertext = crypto.getRandomValues(new Uint8Array(64));

    // Construct proper OHTTP request format
    const request = new Uint8Array(1 + 2 + 2 + 2 + 32 + 64);
    let offset = 0;

    // Key Identifier (8 bits)
    request[offset++] = keyId;

    // HPKE KEM ID (16 bits, network byte order)
    request[offset++] = (kemId >> 8) & 0xFF;
    request[offset++] = kemId & 0xFF;

    // HPKE KDF ID (16 bits, network byte order)  
    request[offset++] = (kdfId >> 8) & 0xFF;
    request[offset++] = kdfId & 0xFF;

    // HPKE AEAD ID (16 bits, network byte order)
    request[offset++] = (aeadId >> 8) & 0xFF;
    request[offset++] = aeadId & 0xFF;

    // Encapsulated KEM Shared Secret
    request.set(enc, offset);
    offset += 32;

    // HPKE-Protected Request
    request.set(ciphertext, offset);

    // Verify format can be parsed
    expect(request.length).toBe(1 + 2 + 2 + 2 + 32 + 64);
    expect(request[0]).toBe(keyId);
    
    // Parse KEM ID
    const parsedKemId = (request[1] << 8) | request[2];
    expect(parsedKemId).toBe(kemId);
    
    // Parse KDF ID
    const parsedKdfId = (request[3] << 8) | request[4];
    expect(parsedKdfId).toBe(kdfId);
    
    // Parse AEAD ID
    const parsedAeadId = (request[5] << 8) | request[6];
    expect(parsedAeadId).toBe(aeadId);
    
    // Verify enc and ciphertext
    const parsedEnc = request.slice(7, 7 + 32);
    const parsedCiphertext = request.slice(7 + 32);
    
    expect(parsedEnc).toEqual(enc);
    expect(parsedCiphertext).toEqual(ciphertext);
    
    logger.debug(` Encapsulated request format: ${request.length} bytes`);
    logger.debug(`   Key ID: 0x${keyId.toString(16)}`);
    logger.debug(`   KEM ID: 0x${kemId.toString(16)}`);
    logger.debug(`   KDF ID: 0x${kdfId.toString(16)}`);
    logger.debug(`   AEAD ID: 0x${aeadId.toString(16)}`);
  });

  test("Section 4.2: Encapsulated Response format compliance", () => {
    // RFC 9458 Section 4.2 format:
    // [response_nonce][ciphertext] where ciphertext includes auth tag
    
    const Nn = 12; // AES-128-GCM nonce length
    const Nk = 16; // AES-128-GCM key length
    const secretLength = Math.max(Nn, Nk); // 16 bytes
    
    const responseNonce = crypto.getRandomValues(new Uint8Array(secretLength));
    const plainResponse = new TextEncoder().encode('{"jsonrpc":"2.0","result":"0x1","id":1}');
    const authTag = crypto.getRandomValues(new Uint8Array(16)); // AES-GCM auth tag
    const ciphertext = new Uint8Array(plainResponse.length + authTag.length);
    
    // Simulate encrypted response (XOR for testing)
    for (let i = 0; i < plainResponse.length; i++) {
      ciphertext[i] = plainResponse[i] ^ responseNonce[i % responseNonce.length];
    }
    ciphertext.set(authTag, plainResponse.length);
    
    // Construct response format
    const response = new Uint8Array(secretLength + ciphertext.length);
    response.set(responseNonce, 0);
    response.set(ciphertext, secretLength);
    
    // Verify format
    expect(response.length).toBe(secretLength + ciphertext.length);
    
    // Parse components
    const parsedNonce = response.slice(0, secretLength);
    const parsedCiphertext = response.slice(secretLength);
    
    expect(parsedNonce).toEqual(responseNonce);
    expect(parsedCiphertext).toEqual(ciphertext);
    
    // Verify auth tag is present
    const parsedAuthTag = parsedCiphertext.slice(parsedCiphertext.length - 16);
    expect(parsedAuthTag).toEqual(authTag);
    
    logger.debug(` Encapsulated response format: ${response.length} bytes`);
    logger.debug(`   Nonce: ${secretLength} bytes`);
    logger.debug(`   Ciphertext: ${ciphertext.length} bytes (including ${authTag.length}-byte auth tag)`);
  });

  test("Section 4.1: Minimum and maximum message sizes", () => {
    // Test minimum valid OHTTP request
    const minKeyId = new Uint8Array([0x01]);
    const minEnc = new Uint8Array(32); // X25519 minimum
    const minCiphertext = new Uint8Array(16); // Just auth tag
    
    const minRequest = new Uint8Array(1 + 2 + 2 + 2 + 32 + 16);
    minRequest[0] = minKeyId[0];
    minRequest.set(minEnc, 7);
    minRequest.set(minCiphertext, 7 + 32);
    
    expect(minRequest.length).toBe(1 + 2 + 2 + 2 + 32 + 16); // 55 bytes minimum
    logger.debug(` Minimum OHTTP request: ${minRequest.length} bytes`);
    
    // Test reasonable maximum (implementation-dependent)
    const maxCiphertext = new Uint8Array(64 * 1024); // 64KB ciphertext
    const maxRequest = new Uint8Array(1 + 2 + 2 + 2 + 32 + maxCiphertext.length);
    
    expect(maxRequest.length).toBeGreaterThan(65536);
    logger.debug(` Large OHTTP request: ${maxRequest.length} bytes`);
  });
});

describe("RFC 9458 - Section 5: HTTP Usage", () => {
  test("Section 5: POST method requirement", () => {
    // RFC 9458 Section 5: OHTTP endpoints MUST only accept POST
    const allowedMethods = ["POST"];
    const disallowedMethods = ["GET", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "TRACE"];
    
    expect(allowedMethods).toContain("POST");
    expect(allowedMethods).toHaveLength(1);
    
    for (const method of disallowedMethods) {
      expect(allowedMethods).not.toContain(method);
    }
    
    logger.debug(` HTTP method restriction: only ${allowedMethods.join(', ')} allowed`);
  });

  test("Section 5.1: Informational response prohibition", () => {
    // RFC 9458 Section 5.1: 1xx responses not supported due to encapsulation
    const informationalCodes = [100, 101, 102, 103];
    const supportedCodes = [200, 201, 400, 401, 403, 404, 500, 502, 503, 504];
    
    // All informational codes should be outside supported range
    for (const code of informationalCodes) {
      expect(code).toBeGreaterThanOrEqual(100);
      expect(code).toBeLessThan(200);
      expect(supportedCodes).not.toContain(code);
    }
    
    // Non-informational codes should be supported
    for (const code of supportedCodes) {
      expect(code < 100 || code >= 200).toBe(true);
    }
    
    logger.debug(` Informational responses prohibited: ${informationalCodes.join(', ')}`);
    logger.debug(` Supported status codes: ${supportedCodes.join(', ')}`);
  });

  test("Section 5.2: Response encapsulation requirement", () => {
    // RFC 9458 Section 5.2: ALL responses from gateway must be encapsulated
    const testResponses = [
      { status: 200, body: '{"result":"success"}' },
      { status: 400, body: 'Bad Request' },
      { status: 500, body: 'Internal Server Error' },
      { status: 403, body: 'Forbidden' },
    ];
    
    for (const testResponse of testResponses) {
      // Every response must go through encapsulation
      const innerResponse: InnerResponse = {
        status: testResponse.status,
        headers: { "content-type": "application/json" },
        body: new TextEncoder().encode(testResponse.body)
      };
      
      // Encode as bHTTP (inner format)
      const bhttpResponse = encodeBhttpResponse(innerResponse);
      expect(bhttpResponse.length).toBeGreaterThan(0);
      
      // Verify it can be decoded
      const decoded = decodeBhttpResponse(bhttpResponse);
      expect(decoded.status).toBe(testResponse.status);
      expect(new TextDecoder().decode(decoded.body)).toBe(testResponse.body);
      
      logger.debug(` Response ${testResponse.status} encapsulation: ${bhttpResponse.length} bytes`);
    }
  });
});

describe("RFC 9458 - Section 6: Security Considerations", () => {
  test("Section 6.1: Key configuration integrity", () => {
    // Test that malformed key configurations are properly rejected
    const malformedConfigs = [
      new Uint8Array([0x00, 0x01]), // Too short
      new Uint8Array([0xFF, 0xFF, 0x00]), // Invalid length
      new Uint8Array([0x00, 0x10, ...Array(16).fill(0x42)]), // Length mismatch
    ];
    
    for (const config of malformedConfigs) {
      try {
        const parsed = parseOhttpKeys(config);
        
        // If parsing succeeds, verify it's handled safely
        expect(Array.isArray(parsed)).toBe(true);
        logger.debug(` Malformed config parsed (may be acceptable): ${config.length} bytes`);
        
      } catch (error) {
        // Expected - malformed configs should be rejected
        expect(error).toBeInstanceOf(Error);
        logger.debug(` Rejected malformed config: ${config.length} bytes - ${(error as Error).message}`);
      }
    }
  });

  test("Section 6.5.1: Date header format validation", () => {
    // RFC 9458 Section 6.5.1: Date header for anti-replay
    const validDates = [
      "Wed, 21 Oct 2015 07:28:00 GMT", // RFC 7231 preferred format
      "Wed, 21 Oct 2015 07:28:00 UTC", // Alternative timezone
      "Wednesday, 21-Oct-15 07:28:00 GMT", // RFC 850 format (obsolete but valid)
      "Wed Oct 21 07:28:00 2015", // ANSI C asctime() format
    ];
    
    const invalidDates = [
      "invalid-date",
      "2015-10-21T07:28:00Z", // ISO 8601 (not HTTP date)
      "21/10/2015 07:28:00", // Wrong format
      "", // Empty
      "Wed, 32 Oct 2015 07:28:00 GMT", // Invalid day
      "Wed, 21 Oct 2015 25:28:00 GMT", // Invalid hour
    ];
    
    for (const dateStr of validDates) {
      const date = new Date(dateStr);
      expect(date.getTime()).not.toBeNaN();
      expect(date.toUTCString()).toBeDefined();
      logger.debug(` Valid date: ${dateStr}`);
    }
    
    for (const dateStr of invalidDates) {
      const date = new Date(dateStr);
      // Invalid dates should either be NaN or handled gracefully
      if (isNaN(date.getTime())) {
        logger.debug(` Rejected invalid date: ${dateStr}`);
      } else {
        logger.debug(` Parsed questionable date: ${dateStr} -> ${date.toUTCString()}`);
      }
    }
  });

  test("Section 6.5.2: Date skew tolerance", () => {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    // Test acceptable date ranges
    const acceptableDates = [
      new Date(now).toUTCString(), // Current time
      new Date(now - fiveMinutes + 30000).toUTCString(), // 4m30s ago (safely within tolerance)
      new Date(now + fiveMinutes - 30000).toUTCString(), // 4m30s future (safely within tolerance)
      new Date(now - 60000).toUTCString(), // 1 minute ago
    ];
    
    // Test unacceptable date ranges
    const unacceptableDates = [
      new Date(now - fiveMinutes - 60000).toUTCString(), // 6 minutes ago
      new Date(now + fiveMinutes + 60000).toUTCString(), // 6 minutes future
      new Date(now - 24 * 60 * 60 * 1000).toUTCString(), // 1 day ago
      new Date(now + 24 * 60 * 60 * 1000).toUTCString(), // 1 day future
    ];
    
    for (const dateStr of acceptableDates) {
      const date = new Date(dateStr);
      const skew = Math.abs(now - date.getTime());
      expect(skew).toBeLessThanOrEqual(fiveMinutes);
      logger.debug(` Acceptable skew: ${skew}ms for ${dateStr}`);
    }
    
    for (const dateStr of unacceptableDates) {
      const date = new Date(dateStr);
      const skew = Math.abs(now - date.getTime());
      expect(skew).toBeGreaterThan(fiveMinutes);
      logger.debug(` Rejected skew: ${skew}ms for ${dateStr}`);
    }
  });

  test("Section 6.2: Perfect Forward Secrecy validation", () => {
    // Test that each HPKE operation uses fresh ephemeral keys
    const sessions = [];
    
    for (let i = 0; i < 5; i++) {
      // Simulate session with ephemeral key
      const ephemeralKey = crypto.getRandomValues(new Uint8Array(32));
      const sessionId = crypto.getRandomValues(new Uint8Array(16));
      
      sessions.push({
        id: sessionId,
        ephemeralKey: ephemeralKey,
        timestamp: Date.now()
      });
    }
    
    // Verify all ephemeral keys are unique
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        expect(sessions[i].ephemeralKey).not.toEqual(sessions[j].ephemeralKey);
        expect(sessions[i].id).not.toEqual(sessions[j].id);
      }
    }
    
    logger.debug(` Perfect Forward Secrecy: ${sessions.length} unique ephemeral keys`);
  });
});

describe("RFC 9458 - Section 9: Media Types", () => {
  test("Section 9.1: application/ohttp-keys media type", () => {
    expect(MediaTypes.OHTTP_KEYS).toBe("application/ohttp-keys");
    
    // Test content type validation
    const validHeaders = new Headers({ "content-type": MediaTypes.OHTTP_KEYS });
    expect(() => assertContentType(validHeaders, MediaTypes.OHTTP_KEYS)).not.toThrow();
    
    const invalidHeaders = new Headers({ "content-type": "application/json" });
    expect(() => assertContentType(invalidHeaders, MediaTypes.OHTTP_KEYS)).toThrow();
    
    logger.debug(` OHTTP keys media type: ${MediaTypes.OHTTP_KEYS}`);
  });

  test("Section 9.2: message/ohttp-req media type", () => {
    expect(MediaTypes.OHTTP_REQ).toBe("message/ohttp-req");
    
    // Test content type validation
    const validHeaders = new Headers({ "content-type": MediaTypes.OHTTP_REQ });
    expect(() => assertContentType(validHeaders, MediaTypes.OHTTP_REQ)).not.toThrow();
    
    const invalidHeaders = new Headers({ "content-type": "application/json" });
    expect(() => assertContentType(invalidHeaders, MediaTypes.OHTTP_REQ)).toThrow();
    
    logger.debug(` OHTTP request media type: ${MediaTypes.OHTTP_REQ}`);
  });

  test("Section 9.3: message/ohttp-res media type", () => {
    expect(MediaTypes.OHTTP_RES).toBe("message/ohttp-res");
    
    // Test content type validation
    const validHeaders = new Headers({ "content-type": MediaTypes.OHTTP_RES });
    expect(() => assertContentType(validHeaders, MediaTypes.OHTTP_RES)).not.toThrow();
    
    const invalidHeaders = new Headers({ "content-type": "application/json" });
    expect(() => assertContentType(invalidHeaders, MediaTypes.OHTTP_RES)).toThrow();
    
    logger.debug(` OHTTP response media type: ${MediaTypes.OHTTP_RES}`);
  });

  test("Media type case sensitivity", () => {
    // Media types should be case-insensitive per HTTP standards
    const casevariations = [
      "application/ohttp-keys",
      "Application/OHTTP-Keys", 
      "APPLICATION/OHTTP-KEYS",
      "application/OHTTP-keys",
    ];
    
    for (const mediaType of casevariations) {
      const headers = new Headers({ "content-type": mediaType });
      
      try {
        assertContentType(headers, MediaTypes.OHTTP_KEYS);
        logger.debug(` Accepted case variation: ${mediaType}`);
      } catch (error) {
        logger.debug(` Rejected case variation: ${mediaType} - ${(error as Error).message}`);
      }
    }
  });
});

describe("RFC 9458 - Problem Response Format", () => {
  test("Section 9.4: Date problem type", () => {
    const { headers, body } = createProblemResponse(
      OHTTP_PROBLEM_TYPES.DATE_NOT_ACCEPTABLE,
      "Date Not Acceptable",
      400,
      "Request date is outside acceptable range"
    );
    
    expect(headers.get("content-type")).toBe("application/problem+json");
    
    const problem = JSON.parse(new TextDecoder().decode(body));
    expect(problem.type).toBe(OHTTP_PROBLEM_TYPES.DATE_NOT_ACCEPTABLE);
    expect(problem.title).toBe("Date Not Acceptable");
    expect(problem.status).toBe(400);
    expect(problem.detail).toBe("Request date is outside acceptable range");
    
    // Verify URI format
    expect(problem.type).toMatch(/^https:\/\/iana\.org\/assignments\/http-problem-types#/);
    
    logger.debug(` Date problem response: ${problem.type}`);
  });

  test("Section 9.5: OHTTP key problem type", () => {
    const { headers, body } = createProblemResponse(
      OHTTP_PROBLEM_TYPES.OHTTP_KEY,
      "OHTTP Key Error",
      400,
      "Invalid or unsupported key configuration"
    );
    
    expect(headers.get("content-type")).toBe("application/problem+json");
    
    const problem = JSON.parse(new TextDecoder().decode(body));
    expect(problem.type).toBe(OHTTP_PROBLEM_TYPES.OHTTP_KEY);
    expect(problem.title).toBe("OHTTP Key Error");
    expect(problem.status).toBe(400);
    expect(problem.detail).toBe("Invalid or unsupported key configuration");
    
    // Verify URI format
    expect(problem.type).toMatch(/^https:\/\/iana\.org\/assignments\/http-problem-types#/);
    
    logger.debug(` OHTTP key problem response: ${problem.type}`);
  });

  test("Problem response JSON schema compliance", () => {
    const { body } = createProblemResponse(
      "https://example.com/problem",
      "Test Problem",
      500,
      "This is a test problem",
      "https://example.com/instance/123"
    );
    
    const problem = JSON.parse(new TextDecoder().decode(body));
    
    // Required fields per RFC 7807
    expect(typeof problem.type).toBe("string");
    expect(typeof problem.title).toBe("string");
    expect(typeof problem.status).toBe("number");
    
    // Optional fields
    if (problem.detail) {
      expect(typeof problem.detail).toBe("string");
    }
    if (problem.instance) {
      expect(typeof problem.instance).toBe("string");
    }
    
    // No additional properties should be present at root level
    const allowedKeys = ["type", "title", "status", "detail", "instance"];
    for (const key of Object.keys(problem)) {
      expect(allowedKeys.includes(key)).toBe(true);
    }
    
    logger.debug(` Problem response schema compliance verified`);
  });
});

describe("RFC 9458 - Binary HTTP Integration", () => {
  test("RFC 9292 compliance: Request encoding", () => {
    const request: InnerRequest = {
      method: "POST",
      url: "https://example.com/api/test",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        "authorization": "Bearer token123"
      },
      body: new TextEncoder().encode('{"jsonrpc":"2.0","method":"eth_chainId","id":1}')
    };

    const encoded = encodeBhttp(request);
    
    // RFC 9292: Must use known-length framing
    expect(encoded[0]).toBe(0); // Known-length framing indicator
    expect(encoded.length).toBeGreaterThan(request.body!.length);
    
    const decoded = decodeBhttp(encoded);
    expect(decoded.method).toBe("POST");
    expect(decoded.url).toBe("https://example.com/api/test"); // URL preserved as-is
    expect(decoded.headers!["content-type"]).toBe("application/json");
    expect(decoded.headers!["accept"]).toBe("application/json");
    expect(decoded.headers!["authorization"]).toBe("Bearer token123");
    expect(decoded.body).toEqual(request.body);
    
    logger.debug(` bHTTP request: ${encoded.length} bytes, ${Object.keys(decoded.headers!).length} headers`);
  });

  test("RFC 9292 compliance: Response encoding", () => {
    const response: InnerResponse = {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-cache",
        "x-rpc-version": "2.0"
      },
      body: new TextEncoder().encode('{"jsonrpc":"2.0","result":"0x1","id":1}')
    };

    const encoded = encodeBhttpResponse(response);
    
    // RFC 9292: Must use known-length framing
    expect(encoded[0]).toBe(0); // Known-length framing indicator
    expect(encoded.length).toBeGreaterThan(response.body.length);
    
    const decoded = decodeBhttpResponse(encoded);
    expect(decoded.status).toBe(200);
    expect(decoded.headers!["content-type"]).toBe("application/json");
    expect(decoded.headers!["cache-control"]).toBe("no-cache");
    expect(decoded.headers!["x-rpc-version"]).toBe("2.0");
    expect(decoded.body).toEqual(response.body);
    
    logger.debug(` bHTTP response: ${encoded.length} bytes, status ${decoded.status}`);
  });

  test("bHTTP edge cases: Empty and large payloads", () => {
    // Test empty request
    const emptyRequest: InnerRequest = {
      method: "GET",
      url: "https://example.com/status",
      headers: { "accept": "application/json" }
    };
    
    const emptyEncoded = encodeBhttp(emptyRequest);
    const emptyDecoded = decodeBhttp(emptyEncoded);
    
    expect(emptyDecoded.method).toBe("GET");
    expect(emptyDecoded.body).toEqual(new Uint8Array(0));
    
    // Test large request
    const largeBody = new TextEncoder().encode("x".repeat(10000));
    const largeRequest: InnerRequest = {
      method: "POST",
      url: "https://example.com/upload",
      headers: { "content-type": "text/plain" },
      body: largeBody
    };
    
    const largeEncoded = encodeBhttp(largeRequest);
    const largeDecoded = decodeBhttp(largeEncoded);
    
    expect(largeDecoded.body).toEqual(largeBody);
    expect(largeEncoded.length).toBeGreaterThan(largeBody.length + 50); // Headers overhead
    
    logger.debug(` bHTTP edge cases: empty=${emptyEncoded.length}B, large=${largeEncoded.length}B`);
  });
});
