# Alibaba Cloud Proof Video Script

Target runtime: 45-90 seconds.

Purpose: show that HandoffBase has a real Alibaba Cloud ECS + Docker deployment
proof with Qwen-backed MCP memory operations, while keeping secrets and billing
details out of the recording.

The prepaid Singapore ECS instance is intended to remain online through judging
and has auto-renewal disabled. Recheck `/health` immediately before recording;
do not claim availability beyond the dated proof.

## Safe Placeholders

Use the public endpoint literally, but keep every credential as a placeholder:

```text
MCP_ENDPOINT=https://47-236-247-69.sslip.io/mcp
MCP_AUTH_TOKEN=<redacted>
QWEN_API_KEY=<backend-secret-only>
HANDOFFBASE_API_KEY=<temporary-demo-key>
```

Never show real Qwen keys, HandoffBase API keys, MCP auth tokens, cloud access
keys, cookies, database URLs, UID, phone number, coupon/voucher codes, payment
details, or auth headers.

## 0:00-0:10 Deployment Context

Visuals:

- Alibaba Cloud ECS console, with account identity, billing, UID, phone, and
  payment details hidden.
- Show only safe deployment context: ECS, region, instance status, and Docker
  server if visible without secrets.

Voiceover:

> HandoffBase is live on Alibaba Cloud International ECS in Singapore: a
> Dockerized Remote Streamable HTTP MCP server with Caddy HTTPS and
> Postgres/pgvector persistence.

## 0:10-0:25 Non-Secret Proof Doc

Visuals:

- Open `docs/deployment/alibaba-cloud-proof.md`.
- Show Current International Deployment, Runtime Summary, Health And Access
  Evidence, and Strict Remote MCP Validation sections.

Voiceover:

> The proof document records only non-secret evidence: ECS, Docker image shape,
> runtime modes, and validation results. Runtime secrets stayed in cloud secret
> configuration and are not committed.

Callouts:

- `authMode=api_key`
- `providerMode=qwen`
- `storeMode=postgres`
- `embeddingMode=qwen`
- `memory_recall`
- Qwen-backed `memory_remember`

## 0:25-0:55 Live Revalidation

Visuals:

- Terminal at repo root.
- Show placeholder variables, not real values.

Commands to show:

```bash
MCP_ENDPOINT=https://47-236-247-69.sslip.io/mcp
MCP_AUTH_TOKEN=<redacted>
curl -s https://47-236-247-69.sslip.io/health
EXPECTED_AUTH_MODE=api_key EXPECTED_PROVIDER_MODE=qwen EXPECTED_STORE_MODE=postgres EXPECTED_EMBEDDING_MODE=qwen MCP_ENDPOINT=https://47-236-247-69.sslip.io/mcp MCP_AUTH_TOKEN=<redacted> npm run mcp:validate-remote
```

Expected safe output to point at:

- `/health` returns `ok: true`.
- `/ready` returns HTTP 200 and only dependency status metadata.
- `/health` reports `authMode: "api_key"`.
- `/health` reports `providerMode: "qwen"`.
- `/health` reports `storeMode: "postgres"`.
- `/health` reports `embeddingMode: "qwen"`.
- `tools/list` returns the memory tools.
- `memory_recall` returns memories and a trace id.
- `memory_remember` returns pending candidate memories.

Voiceover:

> `/health` proves the service is running with API-key auth, Qwen reasoning,
> Qwen embeddings, and Postgres storage. The remote validator then checks MCP
> discovery, recall traces, and persisted Qwen-backed memory creation through
> the public HTTPS endpoint.

## 0:55-1:15 Why It Matters

Visuals:

- Return to architecture diagram or README.
- Highlight Qwen provider boundary and MCP server.

Voiceover:

> Qwen is not a decorative integration here. It powers extraction, classification,
> conflict detection, context packing, reflection, and trace explanations behind
> the `QwenMemoryProvider`. MCP remains the public interface, so different hosts
> can use the same memory layer without adopting a new agent runtime.

## 1:15-1:30 Close

Visuals:

- End on `docs/deployment/alibaba-cloud-proof.md` Current Boundaries.

Voiceover:

> This is a deployment proof, not a production SaaS claim. Postgres and Caddy
> run on one ECS host, and the service uses a free HTTPS hostname rather than a
> managed multi-zone database, custom domain, or fully monitored platform.

Final note to include in description:

```text
Live Singapore ECS deployment validated on 2026-07-13. Recheck the public
health endpoint before recording; access credentials are supplied privately.
```
