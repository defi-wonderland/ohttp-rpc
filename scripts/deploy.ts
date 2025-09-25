#!/usr/bin/env bun
/**
 * OHTTP Deployment Script
 * 
 * Automated deployment helper for gateway and relay servers
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

interface DeploymentConfig {
  mode: 'docker' | 'native';
  services: ('gateway' | 'relay')[];
  environment: 'development' | 'production';
}

/**
 * Execute command with streaming output
 */
function execCommand(command: string, args: string[], cwd?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: cwd || process.cwd(),
      stdio: 'inherit',
      shell: true,
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

/**
 * Check if Docker is available
 */
async function checkDockerAvailable(): Promise<boolean> {
  try {
    await execCommand('docker', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Bun is available
 */
async function checkBunAvailable(): Promise<boolean> {
  try {
    await execCommand('bun', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deploy using Docker Compose
 */
async function deployDocker(config: DeploymentConfig): Promise<void> {
  console.log('🐳 Deploying with Docker Compose...');
  
  // Check for environment file
  const envFile = join(process.cwd(), '.env');
  if (!existsSync(envFile)) {
    console.log('');
    console.log('  No .env file found. Creating from template...');
    console.log('📋 Please edit .env file with your configuration:');
    console.log('   1. Set GATEWAY_HPKE_SEED (generate with: bun apps/gateway/scripts/generate-keys.ts)');
    console.log('   2. Configure GATEWAY_ALLOWED_TARGETS');
    console.log('   3. Set RELAY_ALLOWED_ORIGINS');
    console.log('');
    
    // Copy template
    await execCommand('cp', ['docker.env.example', '.env']);
    
    console.log(' Created .env from template');
    console.log(' Edit .env file and run deployment again');
    return;
  }
  
  // Build services
  const services = config.services.length > 0 ? config.services : ['gateway', 'relay'];
  
  console.log(`🔨 Building services: ${services.join(', ')}`);
  await execCommand('docker-compose', ['build', ...services]);
  
  // Start services
  console.log(` Starting services: ${services.join(', ')}`);
  await execCommand('docker-compose', ['up', '-d', ...services]);
  
  // Show status
  console.log('');
  console.log(' Deployment Status:');
  await execCommand('docker-compose', ['ps']);
  
  console.log('');
  console.log(' Health Checks:');
  for (const service of services) {
    const port = service === 'gateway' ? '8788' : '8787';
    console.log(`   ${service}: http://localhost:${port}/health`);
  }
  
  console.log('');
  console.log('📋 Management Commands:');
  console.log('   View logs: docker-compose logs -f [service]');
  console.log('   Stop services: docker-compose down');
  console.log('   Restart: docker-compose restart [service]');
}

/**
 * Deploy natively with Bun
 */
async function deployNative(config: DeploymentConfig): Promise<void> {
  console.log('🏃 Deploying natively with Bun...');
  
  const services = config.services.length > 0 ? config.services : ['gateway', 'relay'];
  
  for (const service of services) {
    const servicePath = join(process.cwd(), 'apps', service);
    const envFile = join(servicePath, '.env');
    
    console.log(`\n Setting up ${service}...`);
    
    // Check for configuration
    if (!existsSync(envFile)) {
      console.log(`  No .env file found for ${service}`);
      console.log(`📋 Run setup: cd apps/${service} && bun run setup`);
      continue;
    }
    
    // Install dependencies
    console.log(`📦 Installing dependencies for ${service}...`);
    await execCommand('bun', ['install'], servicePath);
    
    // Build
    console.log(`🔨 Building ${service}...`);
    await execCommand('bun', ['run', 'build'], servicePath);
    
    // Validate configuration
    console.log(` Validating ${service} configuration...`);
    try {
      await execCommand('bun', ['run', 'validate-config'], servicePath);
    } catch (error) {
      console.error(` Configuration validation failed for ${service}`);
      throw error;
    }
  }
  
  console.log('');
  console.log(' Native deployment prepared');
  console.log('');
  console.log(' Start services:');
  for (const service of services) {
    console.log(`   ${service}: cd apps/${service} && bun run start`);
  }
}

/**
 * Show deployment help
 */
function showHelp(): void {
  console.log(' OHTTP Deployment Script');
  console.log('==========================');
  console.log('');
  console.log('Usage:');
  console.log('  bun scripts/deploy.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --mode <docker|native>    Deployment mode (default: auto-detect)');
  console.log('  --service <gateway|relay> Deploy specific service (default: both)');
  console.log('  --env <dev|prod>          Environment (default: production)');
  console.log('  --help                    Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  bun scripts/deploy.ts                    # Deploy both services (auto-detect mode)');
  console.log('  bun scripts/deploy.ts --mode docker      # Force Docker deployment');
  console.log('  bun scripts/deploy.ts --service gateway  # Deploy only gateway');
  console.log('  bun scripts/deploy.ts --mode native      # Force native deployment');
}

/**
 * Main deployment function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    showHelp();
    return;
  }
  
  // Parse arguments
  const config: DeploymentConfig = {
    mode: 'docker', // Default to docker
    services: [],
    environment: 'production',
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mode':
        config.mode = args[++i] as 'docker' | 'native';
        break;
      case '--service':
        config.services.push(args[++i] as 'gateway' | 'relay');
        break;
      case '--env':
        config.environment = args[++i] as 'development' | 'production';
        break;
    }
  }
  
  // Auto-detect mode if not specified
  if (config.mode === 'docker' && !args.includes('--mode')) {
    const hasDocker = await checkDockerAvailable();
    const hasBun = await checkBunAvailable();
    
    if (!hasDocker && hasBun) {
      config.mode = 'native';
    } else if (!hasDocker && !hasBun) {
      console.error(' Neither Docker nor Bun is available');
      console.error('   Install Docker: https://docs.docker.com/get-docker/');
      console.error('   Install Bun: https://bun.sh/docs/installation');
      process.exit(1);
    }
  }
  
  console.log(' OHTTP Deployment');
  console.log('===================');
  console.log('');
  console.log(`📋 Configuration:`);
  console.log(`   Mode: ${config.mode}`);
  console.log(`   Services: ${config.services.length > 0 ? config.services.join(', ') : 'gateway, relay'}`);
  console.log(`   Environment: ${config.environment}`);
  console.log('');
  
  try {
    if (config.mode === 'docker') {
      await deployDocker(config);
    } else {
      await deployNative(config);
    }
    
    console.log('');
    console.log(' Deployment completed successfully!');
    
  } catch (error) {
    console.error('');
    console.error(' Deployment failed:');
    console.error(error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
