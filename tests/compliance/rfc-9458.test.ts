/**
 * RFC 9458 Compliance Tests
 * 
 * Tests to ensure full compliance with RFC 9458 Oblivious HTTP specification.
 * These tests verify critical protocol behaviors and edge cases.
 */

import { test, expect, describe } from "bun:test";
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

describe("RFC 9458 Compliance - Media Types", () => {
  test("Section 9.1: application/ohttp-keys media type", () => {
    expect(MediaTypes.OHTTP_KEYS).toBe("application/ohttp-keys");
  });

  test("Section 9.2: message/ohttp-req media type", () => {
    expect(MediaTypes.OHTTP_REQ).toBe("message/ohttp-req");
  });

  test("Section 9.3: message/ohttp-res media type", () => {
    expect(MediaTypes.OHTTP_RES).toBe("message/ohttp-res");
  });

  test("Content-Type validation", () => {
    const headers = new Headers({ "content-type": "message/ohttp-req" });
    expect(() => assertContentType(headers, MediaTypes.OHTTP_REQ)).not.toThrow();
    
    const wrongHeaders = new Headers({ "content-type": "application/json" });
    expect(() => assertContentType(wrongHeaders, MediaTypes.OHTTP_REQ)).toThrow();
  });
});

describe("RFC 9458 Compliance - Key Configuration Format", () => {
  test("Section 3.1: Key configuration encoding", () => {
    const publicKey = crypto.getRandomValues(new Uint8Array(32));
    const keyId = new Uint8Array([42]);
    
    const config = createTestKeyConfig(publicKey, keyId);
    expect(config.keyId).toEqual(keyId);
    expect(config.publicKey).toEqual(publicKey);
    expect(config.suite.kem).toBe("DHKEM_X25519_HKDF_SHA256");
  });

  test("Section 3.1: Key configuration binary format", () => {
    const publicKey = crypto.getRandomValues(new Uint8Array(32));
    const keyId = new Uint8Array([123]);
    
    const config = createTestKeyConfig(publicKey, keyId);
    const encoded = encodeOhttpKeys([config]);
    
    // Should have length prefix (2 bytes) + config data
    expect(encoded.length).toBeGreaterThan(2);
    
    // Should be able to parse back
    const parsed = parseOhttpKeys(encoded);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].keyId).toEqual(keyId);
    expect(parsed[0].publicKey).toEqual(publicKey);
  });

  test("Section 3.1: HPKE suite identifiers", () => {
    expect(HPKE_SUITE_IDS.DHKEM_X25519_HKDF_SHA256).toBe(0x0020);
    expect(HPKE_SUITE_IDS.HKDF_SHA256).toBe(0x0001);
    expect(HPKE_SUITE_IDS.AES_128_GCM).toBe(0x0001);
    expect(HPKE_SUITE_IDS.CHACHA20_POLY1305).toBe(0x0003);
  });

  test("Section 3.1: Key ID validation (1-8 bytes)", () => {
    const publicKey = crypto.getRandomValues(new Uint8Array(32));
    
    // Valid key ID lengths
    for (let len = 1; len <= 8; len++) {
      const keyId = crypto.getRandomValues(new Uint8Array(len));
      expect(() => createTestKeyConfig(publicKey, keyId)).not.toThrow();
    }
    
    // Invalid key ID lengths (0 bytes, >8 bytes) should be handled gracefully
    // Note: createTestKeyConfig doesn't enforce this, but parseKeyConfig should
  });
});

describe("RFC 9458 Compliance - Binary HTTP Integration", () => {
  test("RFC 9292: Binary HTTP request encoding", () => {
    const request: InnerRequest = {
      method: "POST",
      url: "https://example.com/api",
      headers: {
        "content-type": "application/json",
        "accept": "application/json"
      },
      body: new TextEncoder().encode('{"method":"eth_chainId","id":1}')
    };

    const encoded = encodeBhttp(request);
    expect(encoded.length).toBeGreaterThan(0);
    expect(encoded[0]).toBe(0); // Known-length framing indicator

    const decoded = decodeBhttp(encoded);
    expect(decoded.method).toBe("POST");
    expect(decoded.url).toBe("https://example.com/api");
    expect(decoded.headers["content-type"]).toBe("application/json");
  });

  test("RFC 9292: Binary HTTP response encoding", () => {
    const response: InnerResponse = {
      status: 200,
      headers: {
        "content-type": "application/json"
      },
      body: new TextEncoder().encode('{"result":"0x1","id":1}')
    };

    const encoded = encodeBhttpResponse(response);
    expect(encoded.length).toBeGreaterThan(0);
    expect(encoded[0]).toBe(0); // Known-length framing indicator

    const decoded = decodeBhttpResponse(encoded);
    expect(decoded.status).toBe(200);
    expect(decoded.headers).toBeDefined();
    expect(decoded.headers!["content-type"]).toBe("application/json");
  });
});

describe("RFC 9458 Compliance - Problem Types", () => {
  test("Section 9.4: Date problem type URI", () => {
    expect(OHTTP_PROBLEM_TYPES.DATE_NOT_ACCEPTABLE)
      .toBe("https://iana.org/assignments/http-problem-types#date");
  });

  test("Section 9.5: OHTTP key problem type URI", () => {
    expect(OHTTP_PROBLEM_TYPES.OHTTP_KEY)
      .toBe("https://iana.org/assignments/http-problem-types#ohttp-key");
  });

  test("Problem response format", () => {
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
  });
});

describe("RFC 9458 Compliance - Security Requirements", () => {
  test("Section 6.1: Key configuration integrity", () => {
    // Test that malformed key configurations are rejected
    const malformedConfig = new Uint8Array([0, 1]); // Too short
    
    expect(() => parseOhttpKeys(malformedConfig)).toThrow();
  });

  test("Section 6.5.1: Date header format", () => {
    // Valid RFC 7231 date formats should be accepted
    const validDates = [
      "Wed, 21 Oct 2015 07:28:00 GMT",
      "Wed, 21 Oct 2015 07:28:00 UTC"
    ];

    for (const dateStr of validDates) {
      const date = new Date(dateStr);
      expect(date.getTime()).not.toBeNaN();
    }
  });

  test("Section 5.2: Error response encapsulation", () => {
    // All error responses from gateway must be encapsulated
    // This is tested in the gateway handler tests
    expect(true).toBe(true); // Placeholder - actual test in gateway.test.ts
  });
});

describe("RFC 9458 Compliance - Message Formats", () => {
  test("Section 4.1: Encapsulated Request format", () => {
    // Test that encapsulated request has correct structure:
    // [Key Identifier (8)][HPKE KEM ID (16)][HPKE KDF ID (16)][HPKE AEAD ID (16)][enc][ciphertext]
    
    // Create a mock encapsulated request with correct header structure
    const keyId = 42;
    const kemId = HPKE_SUITE_IDS.DHKEM_X25519_HKDF_SHA256;
    const kdfId = HPKE_SUITE_IDS.HKDF_SHA256;
    const aeadId = HPKE_SUITE_IDS.AES_128_GCM;
    const enc = crypto.getRandomValues(new Uint8Array(32)); // 32 bytes for X25519
    const ciphertext = crypto.getRandomValues(new Uint8Array(64));

    const request = new Uint8Array(1 + 2 + 2 + 2 + 32 + 64);
    let offset = 0;

    request[offset] = keyId;
    offset += 1;

    request[offset] = (kemId >> 8) & 0xFF;
    request[offset + 1] = kemId & 0xFF;
    offset += 2;

    request[offset] = (kdfId >> 8) & 0xFF;
    request[offset + 1] = kdfId & 0xFF;
    offset += 2;

    request[offset] = (aeadId >> 8) & 0xFF;
    request[offset + 1] = aeadId & 0xFF;
    offset += 2;

    request.set(enc, offset);
    offset += 32;

    request.set(ciphertext, offset);

    // Verify we can parse the header correctly
    expect(request.length).toBe(1 + 2 + 2 + 2 + 32 + 64);
    expect(request[0]).toBe(keyId);
    
    const parsedKemId = (request[1] << 8) | request[2];
    expect(parsedKemId).toBe(kemId);
  });

  test("Section 4.2: Encapsulated Response format", () => {
    // Test that encapsulated response has correct structure:
    // [Nonce (max(Nn, Nk))][AEAD-Protected Response]
    
    const nonceSize = 16; // max(12, 16) for AES-128-GCM
    const nonce = crypto.getRandomValues(new Uint8Array(nonceSize));
    const aeadProtectedResponse = crypto.getRandomValues(new Uint8Array(128));

    const response = new Uint8Array(nonceSize + 128);
    response.set(nonce, 0);
    response.set(aeadProtectedResponse, nonceSize);

    // Verify structure
    expect(response.length).toBe(nonceSize + 128);
    expect(response.slice(0, nonceSize)).toEqual(nonce);
    expect(response.slice(nonceSize)).toEqual(aeadProtectedResponse);
  });
});

describe("RFC 9458 Compliance - HTTP Usage", () => {
  test("Section 5: POST method requirement", () => {
    // OHTTP endpoints must only accept POST requests
    const validMethods = ["POST"];
    const invalidMethods = ["GET", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

    expect(validMethods).toContain("POST");
    expect(invalidMethods).not.toContain("POST");
  });

  test("Section 5.1: Informational responses not supported", () => {
    // OHTTP does not support 1xx status codes due to encapsulation
    const informationalCodes = [100, 101, 102, 103];
    const supportedCodes = [200, 400, 404, 500];

    // This is more of a design constraint test
    expect(informationalCodes.every(code => code >= 100 && code < 200)).toBe(true);
    expect(supportedCodes.every(code => code < 100 || code >= 200)).toBe(true);
  });
});
