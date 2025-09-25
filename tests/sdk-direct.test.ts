/**
 * SDK functionality tests - direct import version
 */

import { test, expect } from "bun:test";
import { 
  ConfigError, 
  CryptoError, 
  RelayNetworkError,
} from "../packages/sdk/src/errors.js";
import { loadKeyConfigFromUrl, parseKeyConfigFromBytes } from "../packages/sdk/src/keys.js";
import { encodeOhttpKeys } from "../packages/ohttp-core/src/ohttp.js";
import { createHpkeEngine } from "../packages/hpke-engine/src/index.js";

test("Error types", () => {
  const configError = new ConfigError("Test config error");
  expect(configError.type).toBe("ConfigError");
  expect(configError.message).toBe("Test config error");
  expect(configError.name).toBe("ConfigError");
  
  const cryptoError = new CryptoError("Test crypto error", "SEAL_FAILED");
  expect(cryptoError.type).toBe("CryptoError");
  expect(cryptoError.code).toBe("SEAL_FAILED");
  
  const networkError = new RelayNetworkError("Network failed", 502);
  expect(networkError.type).toBe("RelayNetworkError");
  expect(networkError.status).toBe(502);
});

test("Key configuration parsing", async () => {
  // Create test HPKE key pair
  const hpkeEngine = createHpkeEngine();
  const keyPair = await hpkeEngine.generateKeyPair();
  
  // Create test key config
  const keyConfig = {
    keyId: keyPair.publicKey.kid,
    suite: {
      kem: "DHKEM_X25519_HKDF_SHA256" as const,
      kdf: "HKDF_SHA256" as const,
      aead: "AES_128_GCM" as const,
    },
    publicKey: keyPair.publicKey.bytes,
  };
  
  // Encode keys document
  const keysDocument = encodeOhttpKeys([keyConfig]);
  
  // Test parsing
  const parsed = await parseKeyConfigFromBytes(keysDocument);
  expect(parsed.keyId).toEqual(keyConfig.keyId);
  expect(parsed.suite.kem).toBe(keyConfig.suite.kem);
  expect(parsed.suite.kdf).toBe(keyConfig.suite.kdf);
  expect(parsed.suite.aead).toBe(keyConfig.suite.aead);
  expect(parsed.publicKey).toEqual(keyConfig.publicKey);
});

test("Key configuration loading with mock response", async () => {
  // Create test HPKE key pair
  const hpkeEngine = createHpkeEngine();
  const keyPair = await hpkeEngine.generateKeyPair();
  
  // Create test key config
  const keyConfig = {
    keyId: keyPair.publicKey.kid,
    suite: {
      kem: "DHKEM_X25519_HKDF_SHA256" as const,
      kdf: "HKDF_SHA256" as const,
      aead: "AES_128_GCM" as const,
    },
    publicKey: keyPair.publicKey.bytes,
  };
  
  const keysDocument = encodeOhttpKeys([keyConfig]);
  
  // Mock fetch function
  const mockFetch = async (url: string) => {
    expect(url).toBe("https://example.com/ohttp-keys");
    return new Response(keysDocument as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/ohttp-keys",
      },
    });
  };
  
  // Test loading with custom fetch
  const loaded = await loadKeyConfigFromUrl("https://example.com/ohttp-keys", {
    fetchFn: mockFetch,
  });
  
  expect(loaded.keyId).toEqual(keyConfig.keyId);
  expect(loaded.publicKey).toEqual(keyConfig.publicKey);
});

test("Configuration error handling", async () => {
  // Test invalid URL
  const invalidFetch = async () => {
    throw new Error("Network error");
  };
  
  await expect(loadKeyConfigFromUrl("https://invalid.com", {
    fetchFn: invalidFetch,
  })).rejects.toThrow(ConfigError);
  
  // Test invalid key document
  const invalidDocument = new Uint8Array([0x00, 0x01, 0x02]); // Invalid format
  
  expect(() => parseKeyConfigFromBytes(invalidDocument)).toThrow(ConfigError);
});
