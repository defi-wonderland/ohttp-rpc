/**
 * @ohttp/shared - Common types and constants for OHTTP protocol
 */

// Export all types
export type {
  HpkeSuite,
  OhttpKeyConfig,
  OhttpKeysDocument,
  InnerRequest,
  InnerResponse,
  HpkeSuiteIds,
  OhttpErrorType,
  OhttpError,
  JsonRpcRequest,
  JsonRpcResponse,
  EIP1193RequestArguments,
} from "./types.js";

// Export all constants
export {
  CT_OHTTP_REQ,
  CT_OHTTP_RES,
  CT_OHTTP_KEYS,
  CT_BHTTP,
  CT_JSON,
  CT_PROBLEM_JSON,
  HPKE_SUITE_IDS,
  DEFAULT_HPKE_SUITE,
  OHTTP_CONSTANTS,
  COMMON_RPC_ENDPOINTS,
  STANDARD_RPC_HEADERS,
  HTTP_STATUS,
  OHTTP_PROBLEM_TYPES,
} from "./constants.js";
