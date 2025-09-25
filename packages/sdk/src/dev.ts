/**
 * Development utilities and examples for OHTTP SDK
 */

import { OhttpClient, ohttpFetch, OhttpRpcProvider } from "./index.js";

/**
 * Example usage of OHTTP SDK
 */
async function example() {
  console.log("OHTTP SDK Development Examples");
  console.log("==============================");
  
  // Example gateway and relay URLs (replace with actual URLs)
  const gatewayKeyUrl = "https://gateway.example.com/ohttp-keys";
  const relayUrl = "https://relay.example.com/relay";
  const rpcUrl = "https://mainnet.infura.io/v3/YOUR_PROJECT_ID";
  
  try {
    console.log("\n1. Creating OHTTP Client...");
    const client = await OhttpClient.fromKeyConfigUrl(gatewayKeyUrl);
    console.log("✓ Client created successfully");
    
    console.log("\n2. Making JSON-RPC request...");
    const response = await ohttpFetch(
      gatewayKeyUrl,
      relayUrl,
      rpcUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_chainId",
          params: [],
          id: 1,
        }),
        paddingBytes: 64,
      }
    );
    
    const result = await response.json();
    console.log("✓ Chain ID:", result);
    
    console.log("\n3. Using EIP-1193 Provider...");
    const provider = new OhttpRpcProvider({
      gatewayKeyConfig: gatewayKeyUrl,
      relayUrl,
      targetRpcUrl: rpcUrl,
      paddingBytes: 64,
    });
    
    // Wait for connection
    await new Promise(resolve => {
      provider.on("connect", resolve);
      setTimeout(resolve, 1000); // Fallback timeout
    });
    
    if (provider.isConnected()) {
      const chainId = await provider.getChainId();
      console.log("✓ Chain ID via provider:", chainId);
      
      const blockNumber = await provider.getBlockNumber();
      console.log("✓ Latest block:", blockNumber);
    }
    
    console.log("\n✓ All examples completed successfully!");
    
  } catch (error) {
    console.error("\n✗ Example failed:", error);
  }
}

// Run example if this file is executed directly
if (import.meta.main) {
  example().catch(console.error);
}

export { example };
