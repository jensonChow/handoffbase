# Alibaba Cloud Proof Video Script

Target runtime: 45-90 seconds.

Purpose: show that HandoffBase has a real Alibaba Cloud ECS + Docker deployment
proof with Qwen-backed MCP memory operations, while keeping secrets and billing
details out of the recording.

The ECS instance may be stopped between submission-prep windows to control cost.
Do not claim the endpoint is currently online unless it has been restarted and
revalidated for the recording.

## Safe Placeholders

Use only placeholders in commands shown on screen:

```text
MCP_ENDPOINT=<deployed-mcp-url>
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

> HandoffBase has a deployment proof on Alibaba Cloud ECS: a Dockerized Remote
> Streamable HTTP MCP server for memory handoff.

If the instance is stopped:

> The instance is paused between validation windows to control pay-as-you-go
> cost. For final proof, restart it, recheck the public endpoint, and rerun the
> validator.

## 0:10-0:25 Non-Secret Proof Doc

Visuals:

- Open `docs/deployment/alibaba-cloud-proof.md`.
- Show Deployment, Runtime Env Summary, Health Evidence, and MCP Validation
  Summary sections.

Voiceover:

> The proof document records only non-secret evidence: ECS, Docker image shape,
> runtime modes, and validation results. Runtime secrets stayed in cloud secret
> configuration and are not committed.

Callouts:

- `authMode=api_key`
- `providerMode=qwen`
- `storeMode=in-memory`
- `memory_recall`
- Qwen-backed `memory_remember`

## 0:25-0:55 Live Revalidation When Restarted

Visuals:

- Terminal at repo root.
- Show placeholder variables, not real values.

Commands to show:

```bash
MCP_ENDPOINT=<deployed-mcp-url>
MCP_AUTH_TOKEN=<redacted>
curl -s <deployed-health-url>
curl -s <deployed-ready-url>
MCP_VALIDATION_PROFILE=alibaba-demo MCP_ENDPOINT=<deployed-mcp-url> MCP_AUTH_TOKEN=<redacted> npm run mcp:validate-remote
```

Expected safe output to point at:

- `/health` returns `ok: true`.
- `/ready` returns HTTP 200 and only dependency status metadata.
- `/health` reports `authMode: "api_key"`.
- `/health` reports `providerMode: "qwen"`.
- `/health` reports `storeMode: "in-memory"`.
- `tools/list` returns the memory tools.
- `memory_recall` returns memories and a trace id.
- `memory_remember` returns pending candidate memories.

Voiceover:

> When the ECS instance is restarted, `/health` proves the server is running in
> Qwen provider mode with API-key auth. The remote validator then checks MCP
> discovery, memory recall, and Qwen-backed memory creation through the deployed
> endpoint.

If recording from previously captured proof only:

> This proof was previously validated and recorded in the repository. Because
> the instance is currently stopped for cost control, the endpoint must be
> revalidated after restart before submission if live output is required.

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

- End on `docs/deployment/alibaba-cloud-proof.md` Known Limitations.

Voiceover:

> This is a deployment proof, not a production SaaS claim. The live proof uses an
> in-memory store and public HTTP on an ECS instance. Durable storage, TLS, a
> domain, monitoring, and managed production hardening remain future work.

Final note to include in description:

```text
ECS may be paused between validation windows for cost control. Revalidate the
public endpoint after restart before final submission.
```
