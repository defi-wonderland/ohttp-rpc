#!/usr/bin/env bun
/**
 * Development script to start relay and gateway servers
 */

import { $ } from "bun";

async function startServers() {
  console.log(" Starting OHTTP development servers...\n");
  
  // Start gateway server
  const gatewayProcess = Bun.spawn({
    cmd: ["bun", "--hot", "apps/gateway/src/index.ts"],
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  
  // Wait a bit for gateway to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Start relay server
  const relayProcess = Bun.spawn({
    cmd: ["bun", "--hot", "apps/relay/src/index.ts"],
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
    stdout: "inherit", 
    stderr: "inherit",
  });
  
  console.log("✓ Gateway server started on http://localhost:8788");
  console.log("✓ Relay server started on http://localhost:8787");
  console.log("\nEndpoints:");
  console.log("  Gateway OHTTP Keys: http://localhost:8788/ohttp-keys");
  console.log("  Gateway Health:     http://localhost:8788/health");
  console.log("  Relay Health:       http://localhost:8787/health");
  console.log("\nPress Ctrl+C to stop servers\n");
  
  // Handle shutdown
  process.on("SIGINT", () => {
    console.log("\n Shutting down servers...");
    gatewayProcess.kill();
    relayProcess.kill();
    process.exit(0);
  });
  
  // Wait for processes
  await Promise.all([
    gatewayProcess.exited,
    relayProcess.exited,
  ]);
}

if (import.meta.main) {
  startServers().catch(console.error);
}
