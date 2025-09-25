#!/usr/bin/env bun
/**
 * Build all packages and applications
 */

import { $ } from "bun";

const packages = [
  "packages/shared",
  "packages/hpke-engine", 
  "packages/ohttp-core",
  "packages/sdk",
  "packages/test-utils",
];

const apps = [
  "apps/relay",
  "apps/gateway",
];

async function buildPackages() {
  console.log("🔨 Building packages...");
  
  for (const pkg of packages) {
    console.log(`  Building ${pkg}...`);
    try {
      await $`cd ${pkg} && bun run build`.quiet();
      console.log(`  ✓ ${pkg} built successfully`);
    } catch (error) {
      console.error(`  ✗ Failed to build ${pkg}:`, error);
      process.exit(1);
    }
  }
}

async function buildApps() {
  console.log("🏗️  Building applications...");
  
  for (const app of apps) {
    console.log(`  Building ${app}...`);
    try {
      await $`cd ${app} && bun run build`.quiet();
      console.log(`  ✓ ${app} built successfully`);
    } catch (error) {
      console.error(`  ✗ Failed to build ${app}:`, error);
      process.exit(1);
    }
  }
}

async function typecheck() {
  console.log("🔍 Type checking...");
  try {
    await $`bun run typecheck`.quiet();
    console.log("  ✓ Type checking passed");
  } catch (error) {
    console.error("  ✗ Type checking failed:", error);
    process.exit(1);
  }
}

async function main() {
  console.log("Building OHTTP-RPC project...\n");
  
  await typecheck();
  await buildPackages();
  await buildApps();
  
  console.log("\n🎉 Build completed successfully!");
}

if (import.meta.main) {
  main().catch(console.error);
}
