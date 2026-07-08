# Recording Shot List

This checklist supports the main demo video, the Alibaba Cloud proof video, and
optional short clips or B-roll.

## Browser Tabs To Prepare

- `README.md`: tagline, product shape, implemented surface, limitations.
- `docs/architecture.md`: MCP host boundary, Qwen provider boundary, store
  boundary, trace and conflict governance.
- `docs/demo-dashboard.md`: local Memory Vault recording path.
- `docs/deployment/alibaba-cloud-proof.md`: non-secret Alibaba ECS proof.
- `docs/hackathon-resource-support.md`: current cost posture and stopped ECS
  status.
- Local HandoffBase Memory Vault dashboard.
- Alibaba Cloud ECS console only for the proof video, with private account,
  payment, UID, phone, coupon/voucher, and secret values hidden.

Do not open `.env.*` files in the editor, terminal, browser, or file explorer.

## Terminal Commands To Prepare

Local, credential-free commands:

```bash
npm run demo:flow
npm run demo:jsonrpc
npm run eval:memory
npm run dashboard:dev
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- memory_remember examples/http/payloads/memory-remember-preferences.json
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- continuity_bootstrap examples/http/payloads/continuity-bootstrap-opportunity-scout.json
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

Trace inspection command with a placeholder trace id:

```bash
TRACE_ID=<trace-id-from-memory_recall>
printf '{ "trace_id": "%s" }\n' "$TRACE_ID" > /tmp/handoffbase-memory-trace.json
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- memory_trace /tmp/handoffbase-memory-trace.json
```

Remote proof commands to show only with placeholders:

```bash
MCP_ENDPOINT=<deployed-mcp-url>
MCP_AUTH_TOKEN=<redacted>
curl -s <deployed-health-url>
MCP_ENDPOINT=<deployed-mcp-url> MCP_AUTH_TOKEN=<redacted> npm run mcp:validate-remote
```

Syntax-only check for the remote validator:

```bash
node --check scripts/validate-remote-mcp.mjs
```

## Main Demo Shot List

1. README tagline: "Open memory handoff for AI agents."
2. Architecture diagram: hosts connect through Remote Streamable HTTP MCP.
3. Qwen provider boundary: `QwenMemoryProvider` behind
   `MemoryReasoningProvider`.
4. AI Opportunity Scout demo flow, Session 1: user teaches durable preferences
   and verification procedure.
5. Terminal: `npm run demo:flow` or local `memory_remember`.
6. AI Opportunity Scout demo flow, Session 2: new session recalls preferences.
7. Terminal: `continuity_bootstrap` and `memory_recall` local commands.
8. Memory Vault dashboard: vault entry for Opportunity Scout user preference.
9. Memory Trace: used, ignored, and excluded memories with reasons.
10. Pending Review: Qwen-extracted candidate memory and lifecycle actions.
11. Resolve Memory Conflicts: candidate versus existing memory, conflict type,
    severity, and recommended action.
12. Deployment proof doc: `/health` evidence with `providerMode=qwen`.
13. Wrap: different agents behave like the same long-term collaborator.

## Alibaba Proof Shot List

1. Alibaba Cloud ECS console: show ECS context only, with private account and
   billing details hidden.
2. If stopped, show instance stopped/economical stop posture and say it is paused
   for cost control.
3. `docs/deployment/alibaba-cloud-proof.md`: Deployment section.
4. Proof doc: Runtime Env Summary, without any secret values.
5. Proof doc: Health Evidence with `authMode=api_key`,
   `providerMode=qwen`, and `storeMode=in-memory`.
6. Terminal: placeholder `/health` command after restart and revalidation.
7. Terminal: placeholder remote validator command.
8. Output callouts: tools/list, `memory_recall`, Qwen-backed
   `memory_remember`.
9. Proof doc: Known Limitations, especially in-memory store and public HTTP.

## Optional Short Clips And B-Roll

- Memory Vault search for `opportunity`.
- Trace view scrolling through context pack, used memories, ignored memories,
  and excluded memories.
- Pending review card showing a Qwen-extracted candidate memory.
- Conflict review card showing candidate memory beside existing memory.
- `npm run eval:memory` passing the deterministic Opportunity Scout eval pack.
- README MCP tool table.
- `docs/comparison.md` positioning: MCP-native handoff layer, not a full agent
  runtime.
- `docs/evals.md` local eval framing: benchmark-aware, not official benchmark
  claims.

## What Not To Show

- `.env.*` files, including `.env.hackathon.local`.
- Real `QWEN_API_KEY`, `DASHSCOPE_API_KEY`, `HANDOFFBASE_API_KEY`,
  `MCP_AUTH_TOKEN`, `DATABASE_URL`, or `POSTGRES_URL` values.
- Cloud access keys, cookies, bearer tokens, auth headers, SSH private keys, or
  shell history containing secrets.
- Alibaba UID, phone number, account id, billing ledger, payment method, invoice,
  coupon/voucher code, or card details.
- Gmail inbox contents or participant private details.
- Any command output that includes real endpoint auth headers.
- Any claim that the live endpoint is online while the ECS instance is stopped.

## Emergency Redaction Checklist

- Stop recording immediately if a secret, UID, phone number, payment detail, or
  coupon/voucher code appears.
- Trim the exposed segment from the recording.
- Blur account identity, billing panels, terminal prompt history, and browser
  autofill suggestions.
- Re-record the shot using placeholder commands.
- Rotate any key or token that may have been visible.
- Rewatch the final export at normal speed and 0.5x speed before uploading.

## Final Upload Checklist

- Public YouTube, Vimeo, Youku, or other accepted video link is available.
- Main demo is about 3 minutes.
- Alibaba proof clip is 45-90 seconds.
- No real secret, auth token, UID, phone number, coupon/voucher code, or payment
  detail is visible.
- `.env.*` files never appear.
- Audio is clear and the terminal text is readable.
- The video does not claim production durability, TLS, domain routing, or a live
  endpoint unless those were actually revalidated.
- The Alibaba proof says ECS may be paused for cost control and must be
  revalidated after restart.
