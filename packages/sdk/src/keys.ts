/**
 * OHTTP Key Configuration Management
 * 
 * Handles fetching, caching, and parsing of OHTTP key configurations
 */

import type { OhttpKeyConfig } from "@ohttp/shared";
import { CT_OHTTP_KEYS } from "@ohttp/shared";
import { parseOhttpKeys, selectSupportedConfig, assertContentType } from "@ohttp/core";
import { ConfigError } from "./errors.js";

/**
 * Key configuration cache entry
 */
interface KeyConfigCacheEntry {
  config: OhttpKeyConfig;
  expiry: number;
  etag?: string;
}

/**
 * In-memory cache for key configurations
 */
const keyConfigCache = new Map<string, KeyConfigCacheEntry>();

/**
 * Options for key configuration loading
 */
export interface LoadKeyConfigOptions {
  /** Custom fetch function (for testing or custom environments) */
  fetchFn?: typeof fetch;
  
  /** Cache duration in milliseconds (default: 1 hour) */
  cacheMs?: number;
  
  /** Abort signal for request cancellation */
  signal?: AbortSignal;
  
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Load OHTTP key configuration from URL with caching
 */
export async function loadKeyConfigFromUrl(
  url: string,
  options: LoadKeyConfigOptions = {}
): Promise<OhttpKeyConfig> {
  const {
    fetchFn = fetch,
    cacheMs = 3600000, // 1 hour default
    signal,
    timeoutMs = 10000,
  } = options;
  
  // Check cache first
  const cached = keyConfigCache.get(url);
  if (cached && Date.now() < cached.expiry) {
    return cached.config;
  }
  
  try {
    // Create timeout signal if specified
    let fetchSignal = signal;
    let timeoutId: NodeJS.Timeout | undefined;
    
    if (timeoutMs > 0) {
      const controller = new AbortController();
      
      if (signal) {
        // Combine with existing signal
        if (signal.aborted) {
          throw new Error("Request aborted");
        }
        
        const combinedController = new AbortController();
        const abortHandler = () => combinedController.abort();
        
        signal.addEventListener("abort", abortHandler);
        timeoutId = setTimeout(() => {
          combinedController.abort();
          signal.removeEventListener("abort", abortHandler);
        }, timeoutMs);
        
        fetchSignal = combinedController.signal;
      } else {
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        fetchSignal = controller.signal;
      }
    }
    
    // Prepare headers with conditional request if we have cached ETag
    const headers: HeadersInit = {};
    if (cached?.etag) {
      headers["if-none-match"] = cached.etag;
    }
    
    // Fetch key configuration
    const response = await fetchFn(url, {
      method: "GET",
      headers,
      signal: fetchSignal,
    });
    
    // Clear timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    // Handle 304 Not Modified
    if (response.status === 304 && cached) {
      // Refresh cache expiry
      cached.expiry = Date.now() + cacheMs;
      return cached.config;
    }
    
    if (!response.ok) {
      throw new ConfigError(
        `Failed to fetch key config from ${url}: ${response.status} ${response.statusText}`,
        response.status.toString()
      );
    }
    
    // Validate content type
    assertContentType(response.headers, CT_OHTTP_KEYS);
    
    // Parse key configuration
    const keyBytes = new Uint8Array(await response.arrayBuffer());
    const config = await parseKeyConfigFromBytes(keyBytes);
    
    // Cache the result
    const etag = response.headers.get("etag") || undefined;
    keyConfigCache.set(url, {
      config,
      expiry: Date.now() + cacheMs,
      etag,
    });
    
    return config;
    
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new ConfigError("Request timeout or cancelled", "TIMEOUT");
      }
      
      throw new ConfigError(
        `Failed to load key config from ${url}: ${error.message}`,
        "NETWORK_ERROR",
        error
      );
    }
    
    throw new ConfigError(
      `Unexpected error loading key config from ${url}`,
      "UNKNOWN_ERROR",
      error
    );
  }
}

/**
 * Parse OHTTP key configuration from bytes
 */
export async function parseKeyConfigFromBytes(keyBytes: Uint8Array): Promise<OhttpKeyConfig> {
  try {
    // Parse the key document
    const configs = parseOhttpKeys(keyBytes);
    
    if (configs.length === 0) {
      throw new ConfigError("No key configurations found in document");
    }
    
    // Select the first supported configuration
    const selectedConfig = selectSupportedConfig(configs);
    
    if (!selectedConfig) {
      const suites = configs.map(c => 
        `${c.suite.kem}+${c.suite.kdf}+${c.suite.aead}`
      ).join(", ");
      
      throw new ConfigError(
        `No supported HPKE suites found. Available: ${suites}`,
        "UNSUPPORTED_SUITE"
      );
    }
    
    return selectedConfig;
    
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    
    throw new ConfigError(
      `Failed to parse key configuration: ${error}`,
      "PARSE_ERROR",
      error
    );
  }
}

/**
 * Clear key configuration cache
 */
export function clearKeyConfigCache(url?: string): void {
  if (url) {
    keyConfigCache.delete(url);
  } else {
    keyConfigCache.clear();
  }
}

/**
 * Get cache statistics for debugging
 */
export function getKeyConfigCacheStats(): {
  size: number;
  entries: Array<{ url: string; expiry: number; hasEtag: boolean }>;
} {
  const entries = Array.from(keyConfigCache.entries()).map(([url, entry]) => ({
    url,
    expiry: entry.expiry,
    hasEtag: !!entry.etag,
  }));
  
  return {
    size: keyConfigCache.size,
    entries,
  };
}
