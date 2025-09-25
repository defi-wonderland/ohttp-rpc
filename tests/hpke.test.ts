/**
 * HPKE engine tests
 */

import { test, expect } from "bun:test";
import { createHpkeEngine, WebCryptoHpkeEngine } from "@ohttp/hpke-engine";

test("HPKE engine creation", () => {
  const engine = createHpkeEngine();
  expect(engine).toBeInstanceOf(WebCryptoHpkeEngine);
  
  const suite = engine.suite();
  expect(suite.kem).toBe(0x0020); // DHKEM_X25519_HKDF_SHA256
  expect(suite.kdf).toBe(0x0001); // HKDF_SHA256
  expect(suite.aead).toBe(0x0001); // AES_128_GCM
});

test("HPKE key generation", async () => {
  const engine = createHpkeEngine();
  
  const keyPair = await engine.generateKeyPair();
  
  expect(keyPair.publicKey.kid).toBeInstanceOf(Uint8Array);
  expect(keyPair.publicKey.kid.length).toBe(8);
  expect(keyPair.publicKey.bytes).toBeInstanceOf(Uint8Array);
  expect(keyPair.publicKey.bytes.length).toBeGreaterThan(0);
  
  expect(keyPair.privateKey.bytes).toBeInstanceOf(Uint8Array);
  expect(keyPair.privateKey.bytes.length).toBeGreaterThan(0);
});

test("HPKE key derivation from seed", async () => {
  const engine = createHpkeEngine();
  const seed = new Uint8Array(32).fill(42);
  
  const keyPair = await engine.deriveKeyPair(seed);
  
  expect(keyPair.publicKey.kid).toEqual(seed.slice(0, 8));
  expect(keyPair.publicKey.bytes).toBeInstanceOf(Uint8Array);
  expect(keyPair.privateKey.bytes).toBeInstanceOf(Uint8Array);
  
  // Same seed should produce same keys
  const keyPair2 = await engine.deriveKeyPair(new Uint8Array(32).fill(42));
  expect(keyPair2.publicKey.bytes).toEqual(keyPair.publicKey.bytes);
});

test("HPKE seal/open round trip", async () => {
  const engine = createHpkeEngine();
  const keyPair = await engine.generateKeyPair();
  
  const plaintext = new TextEncoder().encode("Hello, OHTTP!");
  const info = new TextEncoder().encode("test-info");
  
  // Seal
  const sealResult = await engine.sealBase(
    keyPair.publicKey,
    null,
    plaintext,
    info
  );
  
  expect(sealResult.enc).toBeInstanceOf(Uint8Array);
  expect(sealResult.ct).toBeInstanceOf(Uint8Array);
  expect(sealResult.enc.length).toBeGreaterThan(0);
  expect(sealResult.ct.length).toBeGreaterThan(plaintext.length); // Should include auth tag
  
  // Open
  const openResult = await engine.openBase(
    keyPair.publicKey,
    keyPair.privateKey,
    null,
    sealResult.enc,
    sealResult.ct,
    info
  );
  
  expect(openResult.pt).toEqual(plaintext);
});

test("HPKE seal/open with empty plaintext", async () => {
  const engine = createHpkeEngine();
  const keyPair = await engine.generateKeyPair();
  
  const plaintext = new Uint8Array(0);
  
  const sealResult = await engine.sealBase(
    keyPair.publicKey,
    null,
    plaintext
  );
  
  const openResult = await engine.openBase(
    keyPair.publicKey,
    keyPair.privateKey,
    null,
    sealResult.enc,
    sealResult.ct
  );
  
  expect(openResult.pt).toEqual(plaintext);
  expect(openResult.pt.length).toBe(0);
});
