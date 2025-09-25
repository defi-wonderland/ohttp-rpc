/**
 * Byte manipulation utilities for OHTTP protocol
 * 
 * Provides utilities for varint encoding, length prefixes, and Uint8Array operations
 */

/**
 * Encode a number as a variable-length integer (varint)
 * Uses LEB128 encoding for compact representation
 */
export function encodeVarint(value: number): Uint8Array {
  if (value < 0) {
    throw new Error("Varint cannot encode negative numbers");
  }

  const bytes: number[] = [];
  
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);

  return new Uint8Array(bytes);
}

/**
 * Decode a variable-length integer from bytes
 * Returns the decoded value and number of bytes consumed
 */
export function decodeVarint(bytes: Uint8Array, offset = 0): { value: number; consumed: number } {
  let value = 0;
  let shift = 0;
  let consumed = 0;

  while (offset + consumed < bytes.length) {
    const byte = bytes[offset + consumed];
    consumed++;

    value |= (byte & 0x7f) << shift;
    
    if ((byte & 0x80) === 0) {
      return { value, consumed };
    }
    
    shift += 7;
    if (shift >= 32) {
      throw new Error("Varint too long");
    }
  }

  throw new Error("Incomplete varint");
}

/**
 * Encode length-prefixed data
 * Format: [varint length][data]
 */
export function encodeLengthPrefixed(data: Uint8Array): Uint8Array {
  const lengthBytes = encodeVarint(data.length);
  const result = new Uint8Array(lengthBytes.length + data.length);
  
  result.set(lengthBytes, 0);
  result.set(data, lengthBytes.length);
  
  return result;
}

/**
 * Decode length-prefixed data
 * Returns the data and total bytes consumed
 */
export function decodeLengthPrefixed(
  bytes: Uint8Array,
  offset = 0
): { data: Uint8Array; consumed: number } {
  const { value: length, consumed: lengthBytes } = decodeVarint(bytes, offset);
  
  if (offset + lengthBytes + length > bytes.length) {
    throw new Error("Insufficient data for length-prefixed field");
  }
  
  const data = bytes.slice(offset + lengthBytes, offset + lengthBytes + length);
  
  return {
    data,
    consumed: lengthBytes + length,
  };
}

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  
  return result;
}

/**
 * Compare two Uint8Arrays for equality
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  
  return true;
}

/**
 * Convert string to UTF-8 bytes
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert UTF-8 bytes to string
 */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Convert bytes to hex string for debugging
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }
  
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  
  return bytes;
}

/**
 * Generate random padding bytes
 */
export function generatePadding(size: number): Uint8Array {
  if (size <= 0) {
    return new Uint8Array(0);
  }
  
  return crypto.getRandomValues(new Uint8Array(size));
}
