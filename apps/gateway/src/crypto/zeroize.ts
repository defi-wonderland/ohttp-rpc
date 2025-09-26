/**
 * Memory zeroization utilities for sensitive data
 */

import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Securely zeroize a Uint8Array
 */
export function zeroizeBytes(data: Uint8Array): void {
  if (data && data.length > 0) {
    data.fill(0);
  }
}

/**
 * Securely zeroize multiple byte arrays
 */
export function zeroizeAll(...arrays: (Uint8Array | undefined | null)[]): void {
  for (const array of arrays) {
    if (array) {
      zeroizeBytes(array);
    }
  }
}

/**
 * Create a zeroizing wrapper for temporary sensitive data
 */
export class ZeroizingBuffer {
  private buffer: Uint8Array;
  private zeroized = false;
  
  constructor(size: number) {
    this.buffer = new Uint8Array(size);
  }
  
  /**
   * Get the underlying buffer (use with caution)
   */
  getBuffer(): Uint8Array {
    if (this.zeroized) {
      throw new Error("Buffer has been zeroized");
    }
    return this.buffer;
  }
  
  /**
   * Copy data into the buffer
   */
  copyFrom(source: Uint8Array, offset = 0): void {
    if (this.zeroized) {
      throw new Error("Buffer has been zeroized");
    }
    
    if (offset + source.length > this.buffer.length) {
      throw new Error("Source data too large for buffer");
    }
    
    this.buffer.set(source, offset);
  }
  
  /**
   * Extract data from the buffer
   */
  slice(start?: number, end?: number): Uint8Array {
    if (this.zeroized) {
      throw new Error("Buffer has been zeroized");
    }
    
    return this.buffer.slice(start, end);
  }
  
  /**
   * Get buffer size
   */
  get length(): number {
    return this.buffer.length;
  }
  
  /**
   * Zeroize the buffer
   */
  zeroize(): void {
    if (!this.zeroized) {
      zeroizeBytes(this.buffer);
      this.zeroized = true;
    }
  }
  
  /**
   * Automatic cleanup on garbage collection
   */
  [Symbol.dispose](): void {
    this.zeroize();
  }
}

/**
 * Auto-zeroizing context for sensitive operations
 */
export async function withZeroizing<T>(
  buffers: ZeroizingBuffer[],
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } finally {
    for (const buffer of buffers) {
      buffer.zeroize();
    }
  }
}

/**
 * Derive key material using RFC 5869 compliant HKDF
 * 
 * SECURITY FIX: Replaced dangerous custom "simplified HKDF-like" implementation
 * with proper RFC 5869 HKDF from @noble/hashes for cryptographic security.
 */
export function deriveKeyMaterial(
  seed: Uint8Array,
  info: string,
  length: number
): Uint8Array {
  const infoBytes = new TextEncoder().encode(info);
  
  // Use RFC 5869 compliant HKDF with SHA-256
  // HKDF(IKM=seed, salt="", info=infoBytes, L=length)
  const salt = new Uint8Array(0); // Empty salt as per common practice
  
  const actualSalt = salt.length > 0 ? salt : undefined; // Use undefined for empty salt
  return hkdf(sha256, seed, actualSalt, infoBytes, length);
}

/**
 * Generate secure random bytes
 */
export function generateSecureRandom(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}
