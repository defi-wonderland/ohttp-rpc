# OHTTP + Viem/Wagmi Integration Examples

## 🚀 Quick Start

### Viem Integration

Replace `http()` with `ohttp()` - that's it!

```typescript
// Before (regular HTTP)
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http('https://mainnet.infura.io/v3/YOUR_KEY')
})

// After (OHTTP privacy)
import { createPublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import { ohttp } from '@ohttp/sdk/viem'

const client = createPublicClient({
  chain: mainnet,
  transport: ohttp('https://mainnet.infura.io/v3/YOUR_KEY', {
    gateway: 'https://your-gateway.com',
    relay: 'https://your-relay.com'
  })
})

// Use exactly the same - full type safety!
const blockNumber = await client.getBlockNumber()
const balance = await client.getBalance({ 
  address: '0x742d35Cc6634C0532925a3b8D3Ac6bC6Bf2f5C6' 
})
```

### Wagmi Integration

Same pattern - just replace `http()` with `ohttp()`:

```typescript
// Before (regular HTTP)
import { createConfig, http } from 'wagmi'
import { mainnet } from 'wagmi/chains'

export const config = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: http('https://mainnet.infura.io/v3/YOUR_KEY')
  }
})

// After (OHTTP privacy)
import { createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { ohttp } from '@ohttp/sdk/wagmi'

export const config = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: ohttp('https://mainnet.infura.io/v3/YOUR_KEY', {
      gateway: 'https://your-gateway.com',
      relay: 'https://your-relay.com'
    })
  }
})

// All your existing hooks work the same!
function MyComponent() {
  const { data: blockNumber } = useBlockNumber()
  const { data: balance } = useBalance({
    address: '0x742d35Cc6634C0532925a3b8D3Ac6bC6Bf2f5C6'
  })
  
  return <div>Block: {blockNumber}, Balance: {balance?.formatted}</div>
}
```

## 🌐 Multi-Chain Setup

### Multiple Chains with Viem

```typescript
import { createPublicClient } from 'viem'
import { mainnet, polygon, arbitrum } from 'viem/chains'
import { ohttpMultichain } from '@ohttp/sdk/viem'

// Configure all your chains at once
const transports = ohttpMultichain({
  [mainnet.id]: 'https://mainnet.infura.io/v3/YOUR_KEY',
  [polygon.id]: 'https://polygon-rpc.com',
  [arbitrum.id]: 'https://arb1.arbitrum.io/rpc'
}, {
  gateway: 'https://your-gateway.com',
  relay: 'https://your-relay.com',
  timeout: 10000,
  padding: 64
})

// Create clients for each chain
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: transports[mainnet.id]
})

const polygonClient = createPublicClient({
  chain: polygon,
  transport: transports[polygon.id]
})
```

### Multiple Chains with Wagmi

```typescript
import { createConfig } from 'wagmi'
import { mainnet, polygon, arbitrum } from 'wagmi/chains'
import { ohttpConfig } from '@ohttp/sdk/wagmi'

export const config = createConfig({
  ...ohttpConfig({
    chains: [mainnet, polygon, arbitrum],
    rpcUrls: {
      [mainnet.id]: 'https://mainnet.infura.io/v3/YOUR_KEY',
      [polygon.id]: 'https://polygon-rpc.com',
      [arbitrum.id]: 'https://arb1.arbitrum.io/rpc'
    },
    ohttpOptions: {
      gateway: 'https://your-gateway.com',
      relay: 'https://your-relay.com',
      timeout: 10000,
      padding: 64
    }
  })
})
```

## ⚙️ Custom Configuration

### With Custom OHTTP Servers

```typescript
import { ohttp } from '@ohttp/sdk/viem'

const transport = ohttp('https://mainnet.infura.io/v3/YOUR_KEY', {
  gateway: 'https://your-gateway.com',  // Your OHTTP gateway
  relay: 'https://your-relay.com',      // Your OHTTP relay
  timeout: 15000,                       // 15 second timeout
  padding: 128                          // Extra padding for privacy
})
```

### Production Setup

For production, you should run your own OHTTP infrastructure:

```typescript
const config = createConfig({
  chains: [mainnet, polygon],
  transports: {
    [mainnet.id]: ohttp('https://mainnet.infura.io/v3/YOUR_KEY', {
      gateway: 'https://gateway.yourdomain.com',
      relay: 'https://relay.yourdomain.com'
    }),
    [polygon.id]: ohttp('https://polygon-rpc.com', {
      gateway: 'https://gateway.yourdomain.com', 
      relay: 'https://relay.yourdomain.com'
    })
  }
})
```

## 📦 Installation

```bash
npm install @ohttp/sdk viem wagmi
```

## 🔒 Privacy Benefits

When you use OHTTP transport:

1. **Your IP is hidden** from the RPC provider (Infura, Alchemy, etc.)
2. **Request content is hidden** from your ISP and network observers
3. **No correlation** between your identity and blockchain queries
4. **Same performance** as regular HTTP requests
5. **Full compatibility** with existing Viem/Wagmi code

## ⚠️ Important Notes

- This is experimental software - audit before production use
- **Default gateway/relay URLs are placeholders (example.com) - you MUST deploy your own infrastructure**
- OHTTP requires both gateway and relay servers to be running
- See deployment docs for setting up your own infrastructure
- The `ohttp()` function will fail if you don't provide valid gateway and relay URLs

## 🛠️ Advanced Usage

### Error Handling

```typescript
import { createPublicClient } from 'viem'
import { ohttp } from '@ohttp/sdk/viem'

const client = createPublicClient({
  chain: mainnet,
  transport: ohttp('https://mainnet.infura.io/v3/YOUR_KEY', {
    timeout: 30000  // Longer timeout for slow networks
  })
})

try {
  const balance = await client.getBalance({ address: '0x...' })
} catch (error) {
  if (error.code === -32603) {
    console.log('OHTTP transport error:', error.message)
  }
}
```

### React Hook Example

```typescript
import { usePublicClient } from 'wagmi'
import { useEffect, useState } from 'react'

function BlockNumber() {
  const client = usePublicClient()
  const [block, setBlock] = useState<bigint>()

  useEffect(() => {
    if (client) {
      // This goes through OHTTP automatically!
      client.getBlockNumber().then(setBlock)
    }
  }, [client])

  return <div>Latest block: {block?.toString()}</div>
}
```

That's it! Your dApp now has privacy-preserving RPC calls with zero code changes to your existing logic. 🎉
