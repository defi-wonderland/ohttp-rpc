/**
 * OHTTP SDK Error Types
 * 
 * Structured error handling for different failure scenarios
 */

import type { OhttpErrorType } from "@ohttp/shared";

/**
 * Base class for all OHTTP SDK errors
 */
export abstract class OhttpError extends Error {
  abstract readonly type: OhttpErrorType;
  
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Error in key configuration parsing or validation
 */
export class ConfigError extends OhttpError {
  readonly type = "ConfigError" as const;
  
  constructor(message: string, code?: string, details?: unknown) {
    super(message, code, details);
  }
}

/**
 * HPKE cryptographic operation failure
 */
export class CryptoError extends OhttpError {
  readonly type = "CryptoError" as const;
  
  constructor(message: string, code?: string, details?: unknown) {
    super(message, code, details);
  }
}

/**
 * Network error communicating with relay
 */
export class RelayNetworkError extends OhttpError {
  readonly type = "RelayNetworkError" as const;
  
  constructor(
    message: string,
    public readonly status?: number,
    code?: string,
    details?: unknown
  ) {
    super(message, code, details);
  }
}

/**
 * Gateway policy violation (403, 413, etc.)
 */
export class GatewayPolicyError extends OhttpError {
  readonly type = "GatewayPolicyError" as const;
  
  constructor(
    message: string,
    public readonly status: number,
    code?: string,
    details?: unknown
  ) {
    super(message, code, details);
  }
}

/**
 * RPC endpoint error (4xx/5xx from target)
 */
export class TargetRpcError extends OhttpError {
  readonly type = "TargetRpcError" as const;
  
  constructor(
    message: string,
    public readonly status: number,
    public readonly rpcError?: {
      code: number;
      message: string;
      data?: unknown;
    },
    code?: string,
    details?: unknown
  ) {
    super(message, code, details);
  }
}

/**
 * Create appropriate error from HTTP response
 */
export function createErrorFromResponse(
  response: { status: number; body?: Uint8Array },
  context: string
): OhttpError {
  const { status, body } = response;
  let message = `${context}: HTTP ${status}`;
  let details: unknown;
  
  // Try to parse error details from response body
  if (body && body.length > 0) {
    try {
      const text = new TextDecoder().decode(body);
      const parsed = JSON.parse(text);
      
      if (parsed.error) {
        // JSON-RPC error
        return new TargetRpcError(
          `RPC error: ${parsed.error.message}`,
          status,
          parsed.error,
          parsed.error.code?.toString()
        );
      }
      
      if (parsed.title || parsed.detail) {
        // RFC 7807 Problem Details
        message = parsed.title || message;
        details = parsed;
      } else {
        details = parsed;
      }
    } catch {
      // Not JSON, use as text
      const text = new TextDecoder().decode(body);
      if (text.length > 0) {
        details = text;
      }
    }
  }
  
  // Categorize by status code
  if (status >= 400 && status < 500) {
    if (status === 403 || status === 413) {
      return new GatewayPolicyError(message, status, undefined, details);
    }
    return new TargetRpcError(message, status, undefined, undefined, details);
  }
  
  if (status >= 500) {
    return new RelayNetworkError(message, status, undefined, details);
  }
  
  return new RelayNetworkError(message, status, undefined, details);
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RelayNetworkError) {
    // Retry on network errors and 5xx status codes
    return !error.status || error.status >= 500;
  }
  
  if (error instanceof TargetRpcError) {
    // Don't retry RPC errors (they're deterministic)
    return false;
  }
  
  if (error instanceof GatewayPolicyError) {
    // Don't retry policy violations
    return false;
  }
  
  if (error instanceof ConfigError || error instanceof CryptoError) {
    // Don't retry config or crypto errors
    return false;
  }
  
  // Unknown errors might be retryable
  return true;
}
