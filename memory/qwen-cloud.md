# Qwen Cloud Memory

## Hackathon Requirement

Qwen Cloud must be central to the Track 1 submission. It should power memory reasoning, not appear as a side integration.

## Required Qwen-Driven Functions

- Extract durable memories from conversations, run summaries, and tool logs.
- Classify memory type, scope, importance, and validity.
- Detect conflicts between new and existing memories.
- Build token-budgeted context packs.
- Reflect on completed agent runs.
- Explain why memories were used or ignored.

## Long-Term Constraint

The product is Qwen-first for the hackathon but provider-agnostic long term. Qwen must sit behind `QwenMemoryProvider`, not inside the memory core.

## Current Implementation

`packages/memory-core/src/reasoning` defines the provider boundary and includes:

- `MemoryReasoningProvider`
- `QwenMemoryProvider`
- `MockMemoryProvider`
- provider prompts
- structured-output parser/validator

Local runs use `MockMemoryProvider` unless `QWEN_API_KEY` or `DASHSCOPE_API_KEY` is set. Qwen requests use the DashScope OpenAI-compatible chat completions endpoint by default and request JSON object output.

Provider input is sanitized before Qwen prompt construction. The sanitizer redacts sensitive keys and credential-like strings, truncates oversized arrays/objects/strings, handles circular structures, and prevents raw tool logs or headers from leaking into Qwen prompts.

CI and local `npm run check` must pass without Qwen credentials. The GitHub Actions workflow clears `QWEN_API_KEY` and `DASHSCOPE_API_KEY`, so any test that exercises provider behavior must use mock responses or `MockMemoryProvider` unless explicitly marked as a manual credentialed check.

`benchmarks/longmemeval` 现在提供显式 opt-in 的 `--reader qwen` 和 `--memory-provider qwen`。它复用现有 Qwen/DashScope env conventions，但不会加载 `.env.*`、不会把 credential/base URL 写入 artifacts，并且 errors 不回显 response body 或 credential。默认与 CI tiny fixture 固定使用 deterministic reader + mock provider，即使 shell 中存在 Qwen key 也不会自动切换。

截至 2026-07-10，只完成了 fake-fetch/config coverage 和 tiny deterministic matrix；没有下载 official LongMemEval dataset、没有运行 full credentialed Qwen adapter、没有调用 official paid judge，因此没有 official LongMemEval score。

## Credentialed Validation State

As of 2026-07-07, a dedicated Model Studio key labeled `handoffbase-hackathon-dev` was created for local hackathon validation and stored only in ignored `.env.hackathon.local` with local HandoffBase API key material. Do not commit or print the key; rotate or delete it after the hackathon.

The local Qwen configuration uses `qwen-plus` and a Beijing OpenAI-compatible base URL stored locally only. Workspace-specific IDs and API hosts are intentionally not committed; public docs should use a placeholder pattern such as `https://{WORKSPACE_ID}.{REGION}.maas.aliyuncs.com/compatible-mode/v1`.

Manual live validation passed on 2026-07-07: the compiled server started with `.env.hackathon.local`, `/health` reported `providerMode: "qwen"` and `authMode: "api_key"`, and an authenticated `memory_remember` MCP call returned two pending candidate memories from Qwen. Keep CI on the credential-free mock path.

## Hackathon Resource Support

As of 2026-07-08, Qwen Free Tier is active/available for the deployment's
Alibaba Model Studio / Bailian path. The console showed
`qwen-plus-2025-07-28` with 1,000,000 / 1,000,000 free tokens remaining,
expiration 2026/10/06, and free-quota-only / stop-when-free-quota-runs-out
enabled for that model row.

The Qwen Cloud / Alibaba Cloud coupon request has been submitted and is pending
registration verification. Gmail received the confirmation email with subject
"Coupon Request Received - Verification in Progress"; it says activation
typically takes 1-2 business days. Do not record UID, phone number, Gmail
address, coupon/voucher code, or account identifiers in this repository.

If the request remains pending and urgent near the coupon deadline, contact
`global.hackathon@alibaba-inc.com`; the user should enter UID and phone number
directly in email or the browser. If an approved voucher or coupon code becomes
available, ask before redeeming it and do not print, save, or commit the code.

## Alibaba Cloud Deployment

Hackathon backend runs on Alibaba Cloud and includes visible proof of Alibaba Cloud service/API usage.

The first demo deployment uses the approved minimal ECS + Docker path in `cn-beijing`: a single pay-as-you-go ECS instance running Docker image `handoffbase:b565210-20260707T160422Z` with public endpoint `http://123.56.244.157` and MCP endpoint `http://123.56.244.157/mcp`.

Runtime secrets are configured only through the ECS Docker env file and are not committed. `/health` reports `providerMode: "qwen"`, `authMode: "api_key"`, and `storeMode: "in-memory"`. Live remote validation passed for `tools/list`, authenticated `memory_recall`, and Qwen-backed `memory_remember`.

As of 2026-07-08, the ECS instance is stopped in economical stop mode for cost control and the prior public IP may change on restart. Treat `docs/deployment/alibaba-cloud-proof.md` as historical validation evidence, not a current-online guarantee. Use `docs/deployment/relaunch-runbook.md` to restart and revalidate before recording, submission, or judging if a live endpoint is required.

Keep Postgres/RDS optional until pgvector support is verified for the selected service/version and additional paid provisioning is explicitly approved. Runtime store selection is now implemented in code, but no Alibaba Postgres/RDS instance has been provisioned or validated.
