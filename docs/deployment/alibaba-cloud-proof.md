# Alibaba Cloud Deployment Proof

Status: **live Alibaba Cloud International validation passed on 2026-07-13.**

This file records non-secret proof for the HandoffBase Alibaba Cloud
deployment. It intentionally omits API keys, authorization headers, database
URLs, cloud access credentials, account identifiers, coupon codes, and payment
details.

## Current International Deployment

### Deployment

- Alibaba Cloud service: ECS
- Station and region: Alibaba Cloud International, Singapore
- Availability zone: Singapore Zone A
- Instance ID: `i-t4neg1sj9bowdymjfkrx`
- Instance shape: 2 vCPU, 4 GiB memory, 40 GiB system disk
- Operating system and architecture: Ubuntu 24.04, x86_64
- Billing posture: one prepaid subscription covered at checkout by the
  hackathon coupon; auto-renewal is disabled
- Subscription expiry: 2026-08-13 08:59:59 Singapore time, after the judging
  window ends
- Public origin: `https://47-236-247-69.sslip.io`
- MCP endpoint: `https://47-236-247-69.sslip.io/mcp`
- Health endpoint: `https://47-236-247-69.sslip.io/health`
- Source commit: `90c517ac4e2fa5d855f70d61735c45c6a99c1efb`
- Source archive SHA-256:
  `f683f2eb8b1e4fca470df63141137686368dc3aaaa2ef4d043bc7a41295825e5`
- Deployed Compose SHA-256:
  `ae83cf8988c6393b88b141a0452a5a7ca18af563dda64ef10eade48d74803e73`
- Validator overlay SHA-256:
  `e0c725cd69d2411b9e434fc8e661c9409f0b096de724a6142658738a6bb2ec6d`
- Production image: `handoffbase:90c517a`
- Runtime stack: HandoffBase, Postgres 16 with pgvector, and Caddy HTTPS
- Runtime configuration: root-owned mode-0600 ECS environment file outside
  the checkout and Docker build context

The deployment uses the reviewed, secret-free local configuration in
[`deploy/alibaba/`](../../deploy/alibaba/). Only Caddy publishes ports 80 and
443. HandoffBase and Postgres remain on private Docker networks; application
port 3000 and database port 5432 are not opened in the ECS security group. The
directory remains uncommitted until owner review and therefore is not yet a
public Devpost code proof.

### Runtime Summary

- `authMode=api_key`
- `providerMode=qwen`
- `storeMode=postgres`
- `embeddingMode=qwen`
- Qwen generation model: `qwen-plus-2025-09-11`
- Qwen embedding model: `text-embedding-v4`
- Qwen API base: Alibaba Cloud International DashScope compatible endpoint
- MCP transport: Remote Streamable HTTP over HTTPS

The Qwen provider key is backend-only. Judges receive a separate temporary
HandoffBase access token through the private Devpost testing instructions, not
through tracked files or public submission copy.

### Health And Access Evidence

An outside-in request to the public HTTPS hostname returned:

```json
{
  "ok": true,
  "name": "handoffbase-mcp-server",
  "version": "0.1.0",
  "transport": "streamable-http",
  "mcpPath": "/mcp",
  "authMode": "api_key",
  "providerMode": "qwen",
  "storeMode": "postgres",
  "embeddingMode": "qwen"
}
```

The unauthenticated `/ready` route returned HTTP 401 with
`readiness_auth_required`, proving that dependency readiness is not exposed
without the HandoffBase access token.

### Strict Remote MCP Validation

The final validator was run through the public HTTPS hostname with the token
supplied only through the operator environment. It asserted all four runtime
modes rather than using the legacy in-memory validator profile:

```sh
EXPECTED_AUTH_MODE=api_key \
EXPECTED_PROVIDER_MODE=qwen \
EXPECTED_STORE_MODE=postgres \
EXPECTED_EMBEDDING_MODE=qwen \
MCP_ENDPOINT=https://47-236-247-69.sslip.io/mcp \
MCP_AUTH_TOKEN=<redacted> \
npm run mcp:validate-remote
```

Safe final output summary:

- validator exit code: 0
- `tools/list`: exact nine-tool manifest returned
- authenticated readiness: passed
- `memory_recall`: returned a trace id
- Qwen-backed `memory_remember`: returned two candidate memories
- persisted candidates: two
- candidate statuses: `pending`

This proves that the deployed operation exercised the Qwen reasoning path and
returned persisted pending candidates with ids instead of an empty,
rejected-only, or id-less provider response.

### Postgres Persistence And Backup Evidence

After the strict validator wrote a memory, the application container was
restarted. The exact memory id
`dd2b6907-9d27-465e-8b36-d5056baa3ff2` remained present after restart.

Final database evidence after validation:

- memories: 9
- traces: 16
- embeddings: 9
- compressed `pg_dump`: 94,425 bytes
- `pg_restore --list`: exit code 0
- backup SHA-256:
  `753688b3beb45550dd0c03febf2a437ddaa80114c4ed7431f258c792f7f64aae`
- the backup was copied off ECS and stored locally with mode 0600

This is deployment proof for durable cross-restart storage on the single ECS
host. It is not a claim of multi-zone database availability or a managed backup
service.

### Cost And Model Guardrails

- ECS is prepaid through the judging window and auto-renewal is disabled.
- Fixed 1 Mbps bandwidth is prepaid with the instance; no traffic-billed public
  IP, load balancer, managed database, snapshot service, or paid security
  add-on was provisioned for this deployment.
- Alibaba Model Studio **Free Quota Only** is enabled on the exact deployed
  generation and embedding model rows. Calls stop instead of moving to paid
  inference when either free quota is exhausted.
- After final validation, 984,060 of 1,000,000 generation tokens and 999,628 of
  1,000,000 embedding tokens remained. Both free quotas expire on 2026-10-11.
- The dedicated model key is limited to the ECS public IP and to
  `qwen-plus-2025-09-11` plus `text-embedding-v4`.
- The credentialed LongMemEval benchmark is deliberately deferred while the
  judging endpoint is protected by the free-quota-only guardrail.

Alibaba Cloud budget alerts are notifications, not a guaranteed account-wide
hard spending cap. The enforceable controls for this deployment are prepaid
ECS with auto-renewal off plus Free Quota Only on both deployed model rows.

### Current Boundaries

- The live judge surface is the authenticated MCP backend; the Memory Vault
  dashboard is intentionally not hosted on this ECS instance.
- The HTTPS hostname uses `sslip.io`, not a custom product domain.
- Postgres and Caddy state are on the single ECS instance. The verified logical
  backup was copied off ECS, but there is no managed high-availability database
  or managed backup service.
- The service is a hackathon judging deployment and runnable infrastructure
  MVP, not a production SaaS availability claim.
- After publication, Devpost should link directly to
  [`deploy/alibaba/compose.yaml`](../../deploy/alibaba/compose.yaml) for the ECS
  deployment bundle and
  [`QwenMemoryProvider`](../../packages/memory-core/src/reasoning/providers/qwen.ts)
  for the Alibaba Cloud International DashScope API integration.

## Historical China-Station Proof (Released)

The remainder of this file preserves the first deployment proof for audit
history. That China-station ECS instance was released on 2026-07-12, and its
HTTP endpoint no longer exists. It must not be used in current testing
instructions or described as the live judging deployment.

### Historical Deployment

- Alibaba Cloud service used: ECS
- Region: `cn-beijing` / North China 2 (Beijing)
- Instance ID: `i-2ze79rc2xe68zx1xeahu`
- Deployment shape: single ECS instance running Docker
- Historical public endpoint: `http://123.56.244.157`
- Historical MCP endpoint: `http://123.56.244.157/mcp`
- Source commit: `b565210`
- Image tag: `handoffbase:b565210-20260707T160422Z`
- Build source: Git archive of the tracked repository source at `b565210`
- Runtime secret location: root-owned ECS environment file loaded into Docker
  with `--env-file`; values are not recorded here

### Historical Runtime Summary

- `authMode=api_key`
- `providerMode=qwen`
- `storeMode=in-memory`
- `QWEN_MODEL=qwen-plus`

### Historical Health Evidence

Validated with `GET /health` on 2026-07-07T16:25:23Z:

```json
{
  "ok": true,
  "name": "handoffbase-mcp-server",
  "version": "0.1.0",
  "transport": "streamable-http",
  "mcpPath": "/mcp",
  "authMode": "api_key",
  "providerMode": "qwen",
  "storeMode": "in-memory"
}
```

### Historical MCP Validation Summary

- `tools/list`: the then-current seven-tool manifest returned
- `memory_recall`: returned five memories and a trace id
- `memory_remember`: returned two candidate memories with status `pending`

### Historical Limitations

- The runtime store was process-local and in-memory.
- The endpoint used public HTTP on an ECS IP address.
- No database, TLS certificate, domain, load balancer, or managed gateway was
  part of that first proof.
- The proof timestamp was 2026-07-07T16:26:43Z; it does not establish current
  availability.
