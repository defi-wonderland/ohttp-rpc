/**
 * @ohttp/core - Protocol helpers for OHTTP and bHTTP
 */

// Export bHTTP functions
export {
  encodeRequest,
  decodeRequest,
  encodeResponse,
  decodeResponse,
  createJsonRpcRequest,
  parseJsonResponse,
} from "./bhttp.js";

// Export OHTTP functions
export type {
  EncapsulatedRequest,
  EncapsulatedResponse,
} from "./ohttp.js";

export {
  wrapEncapsulatedRequest,
  unwrapEncapsulatedRequest,
  wrapEncapsulatedResponse,
  parseOhttpKeys,
  encodeOhttpKeys,
  selectSupportedConfig,
  createTestKeyConfig,
} from "./ohttp.js";

// Export media type utilities
export {
  assertContentType,
  setContentType,
  createHeaders,
  isOhttpMediaType,
  isJsonMediaType,
  extractCharset,
  normalizeContentType,
  createProblemResponse,
  MediaTypes,
} from "./media.js";

// Export byte utilities
export {
  encodeVarint,
  decodeVarint,
  encodeLengthPrefixed,
  decodeLengthPrefixed,
  concatBytes,
  bytesEqual,
  stringToBytes,
  bytesToString,
  bytesToHex,
  hexToBytes,
  generatePadding,
} from "./bytes.js";
