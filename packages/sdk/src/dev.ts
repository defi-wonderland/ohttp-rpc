/**
 * Development examples for OHTTP SDK
 * 
 * This file contains example usage patterns for the OHTTP SDK.
 * Run with: bun run dev:sdk
 */

import { OhttpClient, ohttpJsonRpc, OhttpRpcProvider } from "./index.js";

/**
 * Example 1: Basic OHTTP JSON-RPC request
 */
async function basicExample() {
  console.log("🔐 Basic OHTTP JSON-RPC Example");
  console.log("================================");
  
  // Example URLs - replace with your actual deployment
  const gatewayKeyUrl = "http://localhost:8800/ohttp-keys";
  const relayUrl = "http://localhost:8801/relay";  
  const rpcUrl = "https://eth.llamarpc.com";
  
  try {
    console.log("\n1. Making anonymized eth_chainId request...");
    
    const chainId = await ohttpJsonRpc(
      gatewayKeyUrl,
      relayUrl, 
      rpcUrl,
      "eth_chainId",
      []
    );
    
    console.log("✅ Chain ID:", chainId);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Request failed:", errorMessage);
  }
}

/**
 * Example 2: EIP-1193 Compatible Provider
 */
async function providerExample() {
  console.log("\n🔌 EIP-1193 Provider Example");
  console.log("=============================");
  
  const gatewayKeyUrl = "http://localhost:8800/ohttp-keys";
  const relayUrl = "http://localhost:8801/relay";
  const rpcUrl = "https://eth.llamarpc.com";
  
  try {
    console.log("\n1. Creating OHTTP provider...");
    
    const provider = new OhttpRpcProvider({
      gatewayKeyConfigUrl: gatewayKeyUrl,
      relayUrl,
      targetRpcUrl: rpcUrl,
      timeoutMs: 10000
    });
    
    console.log("✅ Provider created");
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log("\n2. Making provider requests...");
    const chainId = await provider.request({ 
      method: "eth_chainId", 
      params: [] 
    });
    console.log("✅ Chain ID via provider:", chainId);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Provider example failed:", errorMessage);
  }
}

/**
 * Example 3: Direct OHTTP Client usage
 */
async function clientExample() {
  console.log("\n🔧 Direct Client Example");
  console.log("=========================");
  
  const gatewayKeyUrl = "http://localhost:8800/ohttp-keys";
  const relayUrl = "http://localhost:8801/relay";
  
  try {
    console.log("\n1. Creating OHTTP client...");
    
    const client = await OhttpClient.fromKeyConfigUrl(gatewayKeyUrl);
    console.log("✅ Client initialized with gateway keys");
    
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
    
    console.log("\n2. Sending request via relay...");
    const response = await client.sendViaRelay(relayUrl, innerRequest);
    
    const responseText = new TextDecoder().decode(response.body);
    const result = JSON.parse(responseText);
    
    console.log("✅ Response:", result);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Client example failed:", errorMessage);
  }
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log("🚀 OHTTP SDK Development Examples");
  console.log("==================================");
  console.log("Make sure your local servers are running:");
  console.log("  Gateway: bun run dev:gateway"); 
  console.log("  Relay:   bun run dev:relay");
  console.log("");
  
  await basicExample();
  await providerExample(); 
  await clientExample();
  
  console.log("\n🎯 Examples completed!");
  console.log("See tests/e2e-integration.test.ts for more comprehensive examples.");
}

// Run examples if this file is executed directly
if (import.meta.main) {
  runExamples().catch(console.error);
}

export { runExamples };
