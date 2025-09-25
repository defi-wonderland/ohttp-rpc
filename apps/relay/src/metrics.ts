/**
 * Privacy-preserving metrics for OHTTP Relay
 * 
 * Tracks only coarse metrics without logging request bodies or user identifiers
 */

/**
 * Request metrics counter
 */
interface Metrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  statusCodes: Record<number, number>;
  bytesTransferred: number;
  averageLatencyMs: number;
  rateLimitHits: number;
}

/**
 * Latency tracking for moving average
 */
interface LatencyTracker {
  samples: number[];
  maxSamples: number;
}

/**
 * Global metrics state
 */
let metrics: Metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  statusCodes: {},
  bytesTransferred: 0,
  averageLatencyMs: 0,
  rateLimitHits: 0,
};

let latencyTracker: LatencyTracker = {
  samples: [],
  maxSamples: 1000, // Keep last 1000 samples for moving average
};

/**
 * Record a request attempt
 */
export function recordRequest(): void {
  metrics.totalRequests++;
}

/**
 * Record request completion
 */
export function recordRequestComplete(
  status: number,
  latencyMs: number,
  bytesTransferred: number
): void {
  // Update success/failure counters
  if (status >= 200 && status < 400) {
    metrics.successfulRequests++;
  } else {
    metrics.failedRequests++;
  }
  
  // Update status code histogram
  metrics.statusCodes[status] = (metrics.statusCodes[status] || 0) + 1;
  
  // Update bytes transferred
  metrics.bytesTransferred += bytesTransferred;
  
  // Update latency moving average
  updateLatencyAverage(latencyMs);
}

/**
 * Record rate limit hit
 */
export function recordRateLimitHit(): void {
  metrics.rateLimitHits++;
}

/**
 * Update moving average latency
 */
function updateLatencyAverage(latencyMs: number): void {
  latencyTracker.samples.push(latencyMs);
  
  // Keep only the most recent samples
  if (latencyTracker.samples.length > latencyTracker.maxSamples) {
    latencyTracker.samples.shift();
  }
  
  // Calculate moving average
  const sum = latencyTracker.samples.reduce((acc, sample) => acc + sample, 0);
  metrics.averageLatencyMs = sum / latencyTracker.samples.length;
}

/**
 * Get current metrics (for health checks or monitoring)
 */
export function getMetrics(): Metrics {
  return { ...metrics };
}

/**
 * Reset metrics (for testing or periodic resets)
 */
export function resetMetrics(): void {
  metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    statusCodes: {},
    bytesTransferred: 0,
    averageLatencyMs: 0,
    rateLimitHits: 0,
  };
  
  latencyTracker = {
    samples: [],
    maxSamples: 1000,
  };
}

/**
 * Log metrics summary (called periodically)
 */
export function logMetricsSummary(): void {
  const { 
    totalRequests, 
    successfulRequests, 
    failedRequests, 
    averageLatencyMs,
    rateLimitHits 
  } = metrics;
  
  const successRate = totalRequests > 0 
    ? ((successfulRequests / totalRequests) * 100).toFixed(1)
    : "0.0";
  
  console.log(`[METRICS] Requests: ${totalRequests} (${successRate}% success), ` +
             `Avg latency: ${averageLatencyMs.toFixed(1)}ms, ` +
             `Rate limits: ${rateLimitHits}`);
}
