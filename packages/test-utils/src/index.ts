/**
 * @ohttp/test-utils - Testing utilities for OHTTP protocol
 */

// Export mock RPC server
export { MockRpcServer, createMockRpcServer } from "./mock-rpc.js";

// Export test vectors
export {
  bhttpVectors,
  hpkeVectors,
  jsonRpcVectors,
  generateBhttpVectors,
  generateJsonRpcBhttpVectors,
  testData,
  createTestSeed,
  createTestPadding,
} from "./vectors.js";
export type {
  BhttpTestVector,
  HpkeTestVector,
  JsonRpcTestVector,
} from "./vectors.js";

// E2E testing utilities removed - use tests/e2e-integration.test.ts instead
