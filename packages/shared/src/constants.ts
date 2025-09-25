/**
 * OHTTP Media Types (RFC 9458)
 */
export const CT_OHTTP_REQ = "message/ohttp-req";
export const CT_OHTTP_RES = "message/ohttp-res";
export const CT_OHTTP_KEYS = "application/ohttp-keys";

/**
 * bHTTP Media Type (RFC 9292)
 */
export const CT_BHTTP = "message/bhttp";

/**
 * Standard HTTP Media Types
 */
export const CT_JSON = "application/json";
export const CT_PROBLEM_JSON = "application/problem+json";

/**
 * HPKE Suite Identifiers (RFC 9180 registry)
 */
export const HPKE_SUITE_IDS = {
  // KEM identifiers
  DHKEM_X25519_HKDF_SHA256: 0x0020,
  
  // KDF identifiers  
  HKDF_SHA256: 0x0001,
  
  // AEAD identifiers
  AES_128_GCM: 0x0001,
  CHACHA20_POLY1305: 0x0003,
} as const;

/**
 * Default HPKE suite for MVP
 */
export const DEFAULT_HPKE_SUITE = {
  kem: "DHKEM_X25519_HKDF_SHA256",
  kdf: "HKDF_SHA256", 
  aead: "AES_128_GCM",
} as const;

/**
 * OHTTP Protocol Constants
 */
export const OHTTP_CONSTANTS = {
  // Key ID size limits (1-8 bytes)
  MIN_KEY_ID_SIZE: 1,
  MAX_KEY_ID_SIZE: 8,
  
  // Default padding size for requests
  DEFAULT_PADDING_BYTES: 64,
  
  // Maximum supported inner request size (512KB)
  MAX_INNER_REQUEST_SIZE: 524_288,
  
  // Maximum supported relay body size (1MB)  
  MAX_RELAY_BODY_SIZE: 1_048_576,
} as const;

/**
 * Common Ethereum RPC endpoints for ALLOWED_TARGETS
 */
export const COMMON_RPC_ENDPOINTS = [
  "https://mainnet.infura.io",
  "https://eth.llamarpc.com", 
  "https://rpc.ankr.com/eth",
  "https://ethereum.publicnode.com",
  "https://eth-mainnet.public.blastapi.io",
] as const;

/**
 * Standard headers for RPC requests
 */
export const STANDARD_RPC_HEADERS = [
  "content-type",
  "accept", 
  "authorization",
] as const;

/**
 * HTTP status codes for OHTTP responses
 */
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  GATEWAY_TIMEOUT: 504,
} as const;

/**
 * OHTTP problem type URIs (RFC 9458 Section 9.4-9.5)
 */
export const OHTTP_PROBLEM_TYPES = {
  OHTTP_KEY: "https://iana.org/assignments/http-problem-types#ohttp-key",
  DATE_NOT_ACCEPTABLE: "https://iana.org/assignments/http-problem-types#date",
} as const;
