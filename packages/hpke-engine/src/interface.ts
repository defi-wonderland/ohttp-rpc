/**
 * HPKE Engine Interface - Portable abstraction for HPKE operations
 * 
 * This interface allows swapping between WebCrypto and WASM implementations
 * without changing the rest of the codebase.
 */

/**
 * Result of HPKE seal operation
 */
export interface HpkeSealResult {
  enc: Uint8Array;  // Encapsulated key
  ct: Uint8Array;   // Ciphertext
  context?: HpkeContext; // HPKE sender context for RFC 9458 response decryption (optional for compatibility)
}

/**
 * HPKE Context for RFC 9458 compliance
 * Represents the receiver context from SetupBaseR() that can export secrets
 */
export interface HpkeContext {
  /**
   * Export secret from HPKE context per RFC 9458 Section 4.4
   * @param exporterContext - Context string for export (e.g., "message/bhttp response")
   * @param length - Length of secret to export in bytes
   * @returns Exported secret
   */
  export(exporterContext: string, length: number): Promise<Uint8Array>;
}

/**
 * Result of HPKE open operation
 */
export interface HpkeOpenResult {
  pt: Uint8Array;   // Plaintext
  context: HpkeContext; // HPKE receiver context for RFC 9458 response encryption
}

/**
 * HPKE public key representation
 */
export interface HpkePublicKey {
  kid: Uint8Array;    // Key ID for identification
  bytes: Uint8Array;  // Raw public key bytes
}

/**
 * HPKE private key representation
 */
export interface HpkePrivateKey {
  bytes: Uint8Array;  // Raw private key bytes
}

/**
 * HPKE suite identifiers
 */
export interface HpkeSuiteInfo {
  kem: number;   // Key Encapsulation Mechanism ID
  kdf: number;   // Key Derivation Function ID  
  aead: number;  // Authenticated Encryption with Associated Data ID
}

/**
 * Core HPKE Engine interface
 * 
 * Implements HPKE base mode operations as defined in RFC 9180.
 * All operations are async to support both WebCrypto and WASM backends.
 */
export interface HpkeEngine {
  /**
   * Get the HPKE suite identifiers supported by this engine
   */
  suite(): HpkeSuiteInfo;

  /**
   * Generate a new HPKE keypair
   * 
   * @returns Promise resolving to public and private key pair
   */
  generateKeyPair(): Promise<{
    publicKey: HpkePublicKey;
    privateKey: HpkePrivateKey;
  }>;

  /**
   * Derive keypair from seed (for deterministic key generation)
   * 
   * @param seed - 32-byte seed for key derivation
   * @returns Promise resolving to public and private key pair
   */
  deriveKeyPair(seed: Uint8Array): Promise<{
    publicKey: HpkePublicKey;
    privateKey: HpkePrivateKey;
  }>;

  /**
   * HPKE Base Mode Seal
   * 
   * Encrypts plaintext for the given public key using HPKE base mode.
   * 
   * @param pk - Recipient's public key
   * @param aad - Additional authenticated data (can be null)
   * @param pt - Plaintext to encrypt
   * @param info - Application-specific info parameter
   * @returns Promise resolving to encapsulated key and ciphertext
   */
  sealBase(
    pk: HpkePublicKey,
    aad: Uint8Array | null,
    pt: Uint8Array,
    info?: Uint8Array
  ): Promise<HpkeSealResult>;

  /**
   * HPKE Base Mode Open
   * 
   * Decrypts ciphertext using HPKE base mode and returns context for RFC 9458.
   * 
   * @param pk - Recipient's public key (for verification)
   * @param sk - Recipient's private key
   * @param aad - Additional authenticated data (must match seal)
   * @param enc - Encapsulated key from seal operation
   * @param ct - Ciphertext from seal operation
   * @param info - Application-specific info parameter (must match seal)
   * @returns Promise resolving to decrypted plaintext and HPKE context
   */
  openBase(
    pk: HpkePublicKey,
    sk: HpkePrivateKey,
    aad: Uint8Array | null,
    enc: Uint8Array,
    ct: Uint8Array,
    info?: Uint8Array
  ): Promise<HpkeOpenResult>;

  /**
   * KDF Extract operation per RFC 5869
   * Used for RFC 9458 response encryption key derivation
   * 
   * @param salt - Salt value (can be zero-length)
   * @param ikm - Input keying material
   * @returns Pseudo-random key
   */
  kdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array>;

  /**
   * KDF Expand operation per RFC 5869
   * Used for RFC 9458 response encryption key derivation
   * 
   * @param prk - Pseudo-random key from Extract
   * @param info - Context and application specific info
   * @param length - Length of output keying material in bytes
   * @returns Output keying material
   */
  kdfExpand(prk: Uint8Array, info: string, length: number): Promise<Uint8Array>;
}

/**
 * Error thrown when HPKE engine lacks required capabilities
 */
export class HpkeCapabilityError extends Error {
  constructor(message: string, public readonly missingCapability: string) {
    super(message);
    this.name = "HpkeCapabilityError";
  }
}

/**
 * Error thrown during HPKE cryptographic operations
 */
export class HpkeCryptoError extends Error {
  constructor(message: string, public readonly operation: string) {
    super(message);
    this.name = "HpkeCryptoError";
  }
}
