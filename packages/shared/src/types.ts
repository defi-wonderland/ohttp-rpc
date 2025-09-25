/**
 * HPKE Suite configuration for OHTTP
 */
export type HpkeSuite = {
  kem: "DHKEM_X25519_HKDF_SHA256";
  kdf: "HKDF_SHA256";
  aead: "AES_128_GCM" | "CHACHA20_POLY1305";
};

/**
 * OHTTP Key Configuration
 */
export type OhttpKeyConfig = {
  keyId: Uint8Array;        // 1–8 bytes
  suite: HpkeSuite;
  publicKey: Uint8Array;    // KEM public key
};

/**
 * Binary application/ohttp-keys document
 */
export type OhttpKeysDocument = Uint8Array;

/**
 * Inner HTTP request for encapsulation
 */
export type InnerRequest = {
  method: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
  url: string;                                  // absolute URL
  headers?: Record<string, string>;             // lowercased
  body?: Uint8Array;
  paddingBytes?: number;
};

/**
 * Inner HTTP response from decapsulation
 */
export type InnerResponse = {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
};

/**
 * HPKE Suite identifiers (RFC 9180 registry values)
 */
export type HpkeSuiteIds = {
  kem: number;    // KEM identifier
  kdf: number;    // KDF identifier  
  aead: number;   // AEAD identifier
};

/**
 * OHTTP error types for structured error handling
 */
export type OhttpErrorType = 
  | "ConfigError"           // Key config parsing/validation
  | "CryptoError"          // HPKE seal/open failures
  | "RelayNetworkError"    // Network issues with relay
  | "GatewayPolicyError"   // Policy violations at gateway
  | "TargetRpcError";      // RPC endpoint errors

/**
 * Standard OHTTP error structure
 */
export type OhttpError = {
  type: OhttpErrorType;
  message: string;
  code?: string;
  details?: unknown;
};

/**
 * JSON-RPC request structure
 */
export type JsonRpcRequest = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown[];
  id: string | number | null;
};

/**
 * JSON-RPC response structure
 */
export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

/**
 * EIP-1193 request arguments
 */
export type EIP1193RequestArguments = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

/**
 * Logger types
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export type LogContext = {
  component?: string;
  requestId?: string;
  userId?: string;
  [key: string]: any;
};

export type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: Error;
};

export type LoggerConfig = {
  level: LogLevel;
  enableTimestamp: boolean;
  enableContext: boolean;
  format: 'json' | 'text';
  destination: 'console' | 'file' | 'none';
};
