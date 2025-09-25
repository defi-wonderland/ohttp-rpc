/**
 * SDK functionality tests
 */

import { test, expect } from "bun:test";
import { 
  ConfigError, 
  CryptoError, 
  RelayNetworkError,
  parseKeyConfigFromBytes,
  loadKeyConfigFromUrl 
} from "@ohttp/sdk";
import { encodeOhttpKeys, createTestKeyConfig } from "@ohttp/core";
import { createHpkeEngine } from "@ohttp/hpke-engine";

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

test("Key config parsing", async () => {
  // Create test key config
  const engine = createHpkeEngine();
  const keyPair = await engine.generateKeyPair();
  
  const testConfig = createTestKeyConfig(keyPair.publicKey.bytes, keyPair.publicKey.kid);
  const encodedKeys = encodeOhttpKeys([testConfig]);
  
  // Parse the encoded keys
  const parsedConfig = await parseKeyConfigFromBytes(encodedKeys);
  
  expect(parsedConfig.keyId).toEqual(testConfig.keyId);
  expect(parsedConfig.publicKey).toEqual(testConfig.publicKey);
  expect(parsedConfig.suite).toEqual(testConfig.suite);
});

test("Key config parsing with invalid data", async () => {
  const invalidData = new Uint8Array([1, 2, 3]); // Too short
  
  await expect(parseKeyConfigFromBytes(invalidData)).rejects.toThrow(ConfigError);
});

test("Key config URL loading with mock", async () => {
  // Create a mock fetch function
  const engine = createHpkeEngine();
  const keyPair = await engine.generateKeyPair();
  const testConfig = createTestKeyConfig(keyPair.publicKey.bytes);
  const encodedKeys = encodeOhttpKeys([testConfig]);
  
  const mockFetch = async (url: string) => {
    if (url === "https://example.com/ohttp-keys") {
      return new Response(encodedKeys, {
        headers: {
          "content-type": "application/ohttp-keys",
          "etag": '"test-etag"',
        },
      });
    }
    throw new Error("Not found");
  };
  
  const config = await loadKeyConfigFromUrl("https://example.com/ohttp-keys", {
    fetchFn: mockFetch,
  });
  
  expect(config.publicKey).toEqual(testConfig.publicKey);
  expect(config.suite).toEqual(testConfig.suite);
});

test("Key config caching", async () => {
  let fetchCount = 0;
  
  const mockFetch = async () => {
    fetchCount++;
    const engine = createHpkeEngine();
    const keyPair = await engine.generateKeyPair();
    const testConfig = createTestKeyConfig(keyPair.publicKey.bytes);
    const encodedKeys = encodeOhttpKeys([testConfig]);
    
    return new Response(encodedKeys, {
      headers: { "content-type": "application/ohttp-keys" },
    });
  };
  
  // First request
  await loadKeyConfigFromUrl("https://cache-test.com/keys", {
    fetchFn: mockFetch,
    cacheMs: 1000,
  });
  expect(fetchCount).toBe(1);
  
  // Second request should use cache
  await loadKeyConfigFromUrl("https://cache-test.com/keys", {
    fetchFn: mockFetch,
    cacheMs: 1000,
  });
  expect(fetchCount).toBe(1); // Should still be 1 due to caching
});
