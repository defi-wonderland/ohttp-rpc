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

// Export E2E testing utilities
export {
  E2ETestHarness,
  runSmokeTest,
  testUtils,
} from "./e2e.js";
export type {
  E2ETestEnvironment,
  E2ETestConfig,
} from "./e2e.js";
