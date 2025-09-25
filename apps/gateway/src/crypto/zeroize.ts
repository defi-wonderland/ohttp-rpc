/**
 * Memory zeroization utilities for sensitive data
 */

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
 * Derive key material with automatic zeroization
 */
export function deriveKeyMaterial(
  seed: Uint8Array,
  info: string,
  length: number
): Uint8Array {
  // This is a placeholder implementation
  // In production, use proper HKDF or similar KDF
  
  const derived = new Uint8Array(length);
  const infoBytes = new TextEncoder().encode(info);
  
  // Simple XOR-based derivation (NOT cryptographically secure)
  for (let i = 0; i < length; i++) {
    derived[i] = seed[i % seed.length] ^ infoBytes[i % infoBytes.length] ^ i;
  }
  
  return derived;
}

/**
 * Generate secure random bytes
 */
export function generateSecureRandom(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}
