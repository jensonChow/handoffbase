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
- Power semantic recall via embeddings (`QwenEmbeddingProvider`, default `text-embedding-v4` @ 1536 dims) so Qwen drives retrieval, not only extraction. Default off; enabled by credentials or `HANDOFFBASE_EMBEDDINGS=mock`. See [[architecture]] Semantic Recall.

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

截至 2026-07-10，adapter 之外新增了 QA scorer（`benchmarks/longmemeval/scorer.mjs` + `npm run bench:longmemeval:score`）和一键对比 orchestrator（`compare.mjs` + `npm run bench:longmemeval:compare`）。scorer 忠实复刻 LongMemEval 各 question-type + abstention 的 correctness prompt，judge 支持 `deterministic`（CI/离线）、`qwen`（默认 qwen-max）和 `openai`（默认 gpt-4o，`OPENAI_API_KEY`，用于匹配官方 evaluator 模型以便和 Zep/Mem0 公布数字对比）。所有 scoring artifact 标 `official_qa_evaluator: false`——是独立复刻，不是官方 GPT-4o evaluator。

仍然：没有下载 official LongMemEval dataset、没有运行 full credentialed Qwen adapter、没有跑真正的 headline benchmark，因此没有任何 real score（fake-fetch/deterministic 之外的一切都要 owner 提供 dataset + key 才能跑）。成本速查（sourced，`BENCHMARK-COST.md`）：LongMemEval-S = 500 题、每题约 115k tokens；full 500×3 backend 约 $7（去掉 full-context ceiling）到 $30（含 ceiling），gpt-4o judge 只加约 $0.01/question；free 1M Qwen tokens 只覆盖约 1.7%，所以 full run 不可能免费；真正约束是 wall-clock（约 26k 次 API 调用）。推荐：stratified ~100–150 子集先验证，headline 用 Config B（reader=qwen + embeddings=qwen + judge=gpt-4o），ceiling 只在子集上跑。

## Credentialed Validation State

As of 2026-07-13, the live Alibaba Cloud International deployment uses a
dedicated backend-only Model Studio key restricted to the ECS public IP and the
exact models `qwen-plus-2025-09-11` and `text-embedding-v4`. The key exists only
in the root-owned mode-0600 ECS runtime env file; do not commit or print it.

Strict public-HTTPS validation passed with `providerMode=qwen`,
`embeddingMode=qwen`, two persisted pending candidates with ids, and matching
Postgres embedding rows. Keep CI and local `npm run check` on credential-free
mock/deterministic paths.

## Hackathon Resource Support

The international event coupon covered the prepaid ECS order at no real-money
cost. Model Studio Stop-on-Exhaust is enabled for both exact deployed model
rows, and after final validation both stayed within the free quota. Do not
record account identifiers, coupon codes, quota counts, or credentials in the
repository.

## Station Pivot — International (2026-07-12)

The hackathon's platform is the Alibaba Cloud **international** station: "Qwen
Cloud" = Model Studio intl, docs at `docs.qwencloud.com`, API base
`https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (verified against the
event's resources page). Keys are NOT interchangeable between stations; the
event voucher lives on the intl account and was later activated and applied to
the prepaid ECS order.

Consequences executed 2026-07-12:

- The repo's default DashScope base URL is now the **international** endpoint
  in `QwenMemoryProvider`, `QwenEmbeddingProvider`, the `/ready` probe, the
  LongMemEval local runtime, `.env.example`, and the deployment checklist.
  `QWEN_BASE_URL`/`DASHSCOPE_BASE_URL` still override; a China-station
  (Bailian) key now requires explicitly setting
  `https://dashscope.aliyuncs.com/compatible-mode/v1`.
- The dedicated China-station dev key (`handoffbase-hackathon-dev`, Beijing
  workspace) and the China free-tier quota (1M tokens, exp 2026/10/06) do NOT
  work against / carry over to the intl endpoint. A fresh restricted
  international key was created and deployed on 2026-07-13; the old Bailian key
  should still be deleted/rotated if that cleanup has not already happened.

## Alibaba Cloud Deployment

Hackathon backend runs on Alibaba Cloud and includes visible proof of Alibaba Cloud service/API usage.

**Historical (RELEASED):** the first demo deployment used the minimal ECS +
Docker path in `cn-beijing` (image `handoffbase:b565210-20260707T160422Z`,
endpoint `http://123.56.244.157/mcp`). Live remote validation passed
2026-07-07 (`providerMode: "qwen"`, `authMode: "api_key"`,
`storeMode: "in-memory"`, `tools/list`, authenticated `memory_recall`,
Qwen-backed `memory_remember`). **The owner RELEASED that instance on
2026-07-12** — endpoint, disk, and env file are gone.
`docs/deployment/alibaba-cloud-proof.md` and `relaunch-runbook.md` carry
SUPERSEDED banners and are retained as honest history.

**Current (validated 2026-07-13):** the backend runs on one prepaid Singapore
ECS instance with Caddy HTTPS, `storeMode=postgres`, Qwen reasoning,
Qwen embeddings, and a root-owned runtime env file. Postgres/pgvector runs in a
private Docker network on the same ECS host; no managed RDS/PolarDB service was
provisioned. Strict HTTPS validation passed the nine-tool manifest and
persistent-candidate checks, and an exact memory survived an app restart.
