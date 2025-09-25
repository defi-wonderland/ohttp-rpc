# OHTTP Deployment Guide

This guide covers secure deployment of the OHTTP Gateway and Relay servers for production use.

## Quick Start

### 1. Docker Deployment (Recommended)

The fastest way to deploy both services:

```bash
# Generate secure keys
bun apps/gateway/scripts/generate-keys.ts

# Setup environment
cp docker.env.example .env
# Edit .env with your configuration (especially GATEWAY_HPKE_SEED)

# Deploy both services
bun scripts/deploy.ts --mode docker
```

### 2. Native Deployment

For more control or when Docker isn't available:

```bash
# Setup gateway
cd apps/gateway
bun run setup
bun run validate-config
bun run start

# Setup relay (in another terminal)
cd apps/relay
bun run setup
bun run validate-config  
bun run start
```

## Detailed Configuration

### Gateway Configuration

The gateway handles OHTTP decryption and RPC forwarding.

#### Required Configuration

```bash
# Generate secure seed
bun apps/gateway/scripts/generate-keys.ts

# Copy example config
cp apps/gateway/env.example apps/gateway/.env
```

Edit `apps/gateway/.env`:

```env
# REQUIRED: Secure HPKE seed (keep secret!)
HPKE_SEED=your-generated-secure-seed-here

# REQUIRED: Allowed RPC endpoints
ALLOWED_TARGETS=https://mainnet.infura.io/v3/YOUR_KEY,https://eth.llamarpc.com

# Server port
GATEWAY_PORT=8788

# Security settings
REQUIRE_TLS_UPSTREAM=true
ENABLE_REPLAY_PROTECTION=true
LOG_INNER_CONTENT=false
```

#### Security Best Practices

1. **HPKE Seed Security**
   - Generate cryptographically secure seeds
   - Never commit seeds to version control
   - Rotate periodically (requires client updates)
   - Store securely (consider HSM for production)

2. **Target Allowlist**
   - Only include trusted RPC endpoints
   - Use HTTPS endpoints only
   - Regularly audit allowed targets

3. **Header Filtering**
   - Restrict to essential headers only
   - Avoid headers that could enable tracking

### Relay Configuration

The relay provides CORS and forwards encrypted requests.

#### Required Configuration

```bash
# Setup relay
cd apps/relay
bun run setup
```

Edit `apps/relay/.env`:

```env
# REQUIRED: Gateway URL
GATEWAY_URL=https://your-gateway-domain.com/gateway

# REQUIRED: Allowed origins
ALLOWED_ORIGINS=https://your-app.com,https://localhost:3000

# Server port  
RELAY_PORT=8787

# Security limits
RATE_LIMIT_RPM=60
MAX_BODY_BYTES=1048576
```

#### Security Best Practices

1. **CORS Configuration**
   - Specify exact origins (avoid wildcards)
   - Use HTTPS origins in production
   - Regularly audit allowed origins

2. **Rate Limiting**
   - Set appropriate limits for your use case
   - Monitor and adjust based on usage
   - Consider IP-based and per-origin limits

## Deployment Options

### Docker Compose (Production Ready)

Complete infrastructure with networking and health checks:

```bash
# Setup environment
cp docker.env.example .env
# Edit .env with your configuration

# Generate secure keys
bun apps/gateway/scripts/generate-keys.ts
# Add generated seed to .env as GATEWAY_HPKE_SEED

# Deploy
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f gateway
```

#### Docker Security Features

- Non-root user execution
- Read-only containers
- Security profiles applied
- Health monitoring
- Resource limits
- Network isolation

### Kubernetes Deployment

For large-scale deployments:

```yaml
# k8s-gateway.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ohttp-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ohttp-gateway
  template:
    metadata:
      labels:
        app: ohttp-gateway
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
      containers:
      - name: gateway
        image: ohttp-gateway:latest
        ports:
        - containerPort: 8788
        env:
        - name: HPKE_SEED
          valueFrom:
            secretKeyRef:
              name: ohttp-secrets
              key: hpke-seed
        resources:
          limits:
            memory: "512Mi"
            cpu: "500m"
          requests:
            memory: "256Mi" 
            cpu: "250m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8788
          initialDelaySeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8788
          initialDelaySeconds: 5
```

### Native Systemd Service

For traditional server deployments:

```ini
# /etc/systemd/system/ohttp-gateway.service
[Unit]
Description=OHTTP Gateway Server
After=network.target

[Service]
Type=simple
User=ohttp
Group=ohttp
WorkingDirectory=/opt/ohttp-gateway
ExecStart=/usr/local/bin/bun src/index.ts
Restart=always
RestartSec=10
Environment=NODE_ENV=production

# Security
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/ohttp-gateway/logs

[Install]
WantedBy=multi-user.target
```

## Monitoring and Operations

### Health Checks

Both services provide health endpoints:

```bash
# Gateway health
curl http://localhost:8788/health

# Relay health  
curl http://localhost:8787/health
```

### Metrics Collection

Basic metrics are available:

```bash
# Gateway metrics
curl http://localhost:8788/metrics

# Relay metrics included in health endpoint
curl http://localhost:8787/health
```

### Log Management

Configure appropriate log levels:

```env
# Development
LOG_LEVEL=debug

# Production
LOG_LEVEL=info

# Never enable in production!
LOG_INNER_CONTENT=false
```

### Key Rotation

Gateway key rotation process:

1. Generate new seed: `bun apps/gateway/scripts/generate-keys.ts`
2. Update configuration with new seed
3. Restart gateway service
4. Update client configurations
5. Monitor for errors

## Security Considerations

### Network Architecture

Deploy relay and gateway in different environments:

```
[Client] → [Relay Provider A] → [Gateway Provider B] → [RPC Provider C]
```

This ensures no single entity can correlate IP addresses with request content.

### TLS Configuration

Always use TLS in production:

```env
# Gateway
REQUIRE_TLS_UPSTREAM=true

# Relay  
GATEWAY_URL=https://gateway.example.com/gateway
ALLOWED_ORIGINS=https://app.example.com
```

### Firewall Rules

Restrict network access:

```bash
# Gateway (internal only)
iptables -A INPUT -p tcp --dport 8788 -s 10.0.0.0/8 -j ACCEPT
iptables -A INPUT -p tcp --dport 8788 -j DROP

# Relay (public access)
iptables -A INPUT -p tcp --dport 8787 -j ACCEPT
```

### Rate Limiting

Implement multiple layers:

1. **Application Level**: Built-in rate limiting
2. **Reverse Proxy**: nginx/Apache rate limits
3. **Network Level**: iptables/fail2ban
4. **CDN Level**: Cloudflare rate limiting

## Troubleshooting

### Common Issues

1. **Gateway won't start**
   ```bash
   # Check configuration
   cd apps/gateway
   bun run validate-config
   
   # Check HPKE seed
   bun scripts/generate-keys.ts validate YOUR_SEED
   ```

2. **Relay can't reach gateway**
   ```bash
   # Test connectivity
   curl http://gateway:8788/health
   
   # Check Docker networking
   docker network ls
   docker network inspect ohttp-rpc_ohttp-network
   ```

3. **CORS errors**
   ```bash
   # Check allowed origins
   cd apps/relay
   bun run validate-config
   
   # Test preflight
   curl -X OPTIONS -H "Origin: https://yourapp.com" http://localhost:8787/relay
   ```

### Debug Mode

Enable debug logging:

```env
LOG_LEVEL=debug
```

View detailed logs:

```bash
# Docker
docker-compose logs -f gateway relay

# Native
tail -f apps/gateway/logs/gateway.log
tail -f apps/relay/logs/relay.log
```

## Production Checklist

Before going live:

- [ ] Generate secure HPKE seed
- [ ] Configure allowed targets/origins
- [ ] Enable TLS everywhere
- [ ] Set up monitoring
- [ ] Configure log rotation
- [ ] Test key rotation process
- [ ] Implement backup strategy
- [ ] Document incident response
- [ ] Security audit configuration
- [ ] Load test infrastructure

## Support

For deployment issues:

1. Check configuration: `bun run validate-config`
2. Review logs for errors
3. Test connectivity between components
4. Verify firewall/network settings
5. Check resource limits and scaling

Remember: The security of the OHTTP system depends on proper deployment and configuration. Take time to understand and implement security best practices.
