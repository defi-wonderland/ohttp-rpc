/**
 * Utility functions for SDK
 */

/**
 * Convert Uint8Array to ArrayBuffer for fetch body
 */
export function uint8ArrayToArrayBuffer(uint8Array: Uint8Array): ArrayBuffer {
  // If it's already backed by an ArrayBuffer and covers the whole buffer
  if (uint8Array.byteOffset === 0 && 
      uint8Array.byteLength === uint8Array.buffer.byteLength &&
      uint8Array.buffer instanceof ArrayBuffer) {
    return uint8Array.buffer as ArrayBuffer;
  }
  
  // Otherwise, create a new ArrayBuffer and copy the data
  const arrayBuffer = new ArrayBuffer(uint8Array.length);
  new Uint8Array(arrayBuffer).set(uint8Array);
  return arrayBuffer;
}

