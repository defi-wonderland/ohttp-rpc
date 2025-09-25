/**
 * Development examples for OHTTP SDK
 * 
 * This file contains example usage patterns for the OHTTP SDK.
 * Run with: bun run dev:sdk
 */

import { OhttpClient, ohttpJsonRpc, OhttpRpcProvider } from "./index.js";
import { createLogger } from "@ohttp/shared";

const logger = createLogger('sdk-dev');

/**
 * Example 1: Basic OHTTP JSON-RPC request
 */
async function basicExample() {
  logger.info("🔐 Basic OHTTP JSON-RPC Example");
  logger.info("================================");
  
  // Example URLs - replace with your actual deployment
  const gatewayKeyUrl = "http://localhost:8800/ohttp-keys";
  const relayUrl = "http://localhost:8801/relay";  
  const rpcUrl = "https://eth.llamarpc.com";
  
  try {
    logger.info("\n1. Making anonymized eth_chainId request...");
    
    const chainId = await ohttpJsonRpc(
      gatewayKeyUrl,
      relayUrl, 
      rpcUrl,
      "eth_chainId",
      []
    );
    
    logger.info("Chain ID", { chainId });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Request failed", { error: errorMessage });
  }
}

/**
 * Example 2: EIP-1193 Compatible Provider
 */
async function providerExample() {
  logger.info("\n🔌 EIP-1193 Provider Example");
  logger.info("=============================");
  
  const gatewayKeyUrl = "http://localhost:8800/ohttp-keys";
  const relayUrl = "http://localhost:8801/relay";
  const rpcUrl = "https://eth.llamarpc.com";
  
  try {
    logger.info("\n1. Creating OHTTP provider...");
    
    const provider = new OhttpRpcProvider({
      gatewayKeyConfigUrl: gatewayKeyUrl,
      relayUrl,
      targetRpcUrl: rpcUrl,
      timeoutMs: 10000
    });
    
    logger.info(" Provider created");
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    logger.info("\n2. Making provider requests...");
    const chainId = await provider.request({ 
      method: "eth_chainId", 
      params: [] 
    });
    logger.info("Chain ID via provider", { chainId });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Provider example failed", { error: errorMessage });
  }
}

/**
 * Example 3: Direct OHTTP Client usage
 */
async function clientExample() {
  logger.info("\n Direct Client Example");
  logger.info("=========================");
  
  const gatewayKeyUrl = "http://localhost:8800/ohttp-keys";
  const relayUrl = "http://localhost:8801/relay";
  
  try {
    logger.info("\n1. Creating OHTTP client...");
    
    const client = await OhttpClient.fromKeyConfigUrl(gatewayKeyUrl);
    logger.info(" Client initialized with gateway keys");
    
    // Example inner request
    const innerRequest = {
      method: "POST" as const,
      url: "https://eth.llamarpc.com",
      headers: { "content-type": "application/json" },
      body: new TextEncoder().encode(JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_chainId", 
        params: [],
        id: 1
      }))
    };
    
    logger.info("\n2. Sending request via relay...");
    const response = await client.sendViaRelay(relayUrl, innerRequest);
    
    const responseText = new TextDecoder().decode(response.body);
    const result = JSON.parse(responseText);
    
    logger.info("Response", { result });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Client example failed", { error: errorMessage });
  }
}

/**
 * Run all examples
 */
async function runExamples() {
  logger.info(" OHTTP SDK Development Examples");
  logger.info("==================================");
  logger.info("Make sure your local servers are running");
  logger.info("Gateway: bun run dev:gateway"); 
  logger.info("Relay: bun run dev:relay");
  logger.info("");
  
  await basicExample();
  await providerExample(); 
  await clientExample();
  
  logger.info("\n Examples completed!");
  logger.info("See tests/e2e-integration.test.ts for more comprehensive examples.");
}

// Run examples if this file is executed directly
if (import.meta.main) {
  runExamples().catch(console.error);
}

export { runExamples };
