# Current Handoff

Updated: 2026-07-09T15:36:53Z

## Completed Recently

- Integrated the deterministic memory benchmark subset work:
  - `scripts/run-memory-benchmarks.mjs`
  - `examples/benchmarks/`
  - `docs/benchmarks.md`
  - `docs/benchmark-results.md`
  - `npm run bench:memory`
- Verified the deterministic benchmark subset passed locally: 17/17 cases.
- Refreshed memory operations notes for benchmark subset expectations.
- Integrated Devpost-facing submission materials:
  - `docs/submission/devpost-copy.md`
  - `docs/submission/testing-instructions.md`
  - `docs/submission/submission-checklist.md`
  - `docs/submission/main-demo-video-script.md`
  - `docs/submission/alibaba-proof-video-script.md`
  - `docs/submission/recording-shot-list.md`
  - `docs/submission/architecture-for-devpost.md`
- Updated architecture submission assets:
  - `docs/architecture.md`
  - `docs/assets/architecture.mmd`
- Added `docs/deployment/relaunch-runbook.md` as the safe restart,
  validation, recording, availability, and stop/release checklist for the
  stopped Alibaba Cloud ECS + Docker demo.
- Linked the relaunch runbook from `docs/cloud-cost-runbook.md`,
  `docs/deployment/alibaba-cloud-proof.md`, and
  `docs/hackathon-resource-support.md`.
- Clarified that the Alibaba Cloud deployment proof is historical live
  validation from 2026-07-07T16:26:43Z, not a current-online claim while ECS is
  stopped or before the endpoint is revalidated.
- Confirmed the documented ECS instance was stopped in `cn-beijing` using
  economical stop mode / savings stop mode after explicit user approval in the
  prior cloud-cost session.
- No release, resize, paid-service enablement, coupon redemption, payment
  method, autopay, or new paid cloud resource was performed.

## Benchmark Results

`npm run bench:memory` passed all synthetic deterministic benchmark-inspired
fixtures:

- Total cases: 17.
- Passed: 17.
- Failed: 0.

Per-family pass counts:

- `conflicts`: 5/5.
- `cross-host-handoff`: 6/6.
- `long-memory`: 6/6.

Per-metric pass counts:

- `answer_correct`: 3/3.
- `conflict_action_correct`: 5/5.
- `conflict_created`: 3/3.
- `evidence_precision_at_k`: 5/5.
- `evidence_recall_at_k`: 2/2.
- `excluded_memory_correct`: 1/1.
- `forget_correct`: 2/2.
- `scope_isolation_correct`: 7/7.
- `token_budget_respected`: 1/1.
- `trace_id_present`: 8/8.
- `update_correct`: 2/2.
- `used_memory_correct`: 6/6.

These are deterministic benchmark-inspired local results. They are not official
LongMemEval, MemConflict, Mem2ActBench, LongMemEval-V2, MemEvoBench, LifeBench,
or other leaderboard scores.

## Validation Snapshot

- `npm run check`: passed after benchmark integration, including typecheck,
  build, smoke registration, memory-core tests, auth tests, server tests, and
  dashboard tests.
- `npm run eval:memory`: passed 8/8 deterministic memory eval cases after
  benchmark integration.
- `npm run bench:memory`: passed 17/17 deterministic benchmark cases.
- `node --check scripts/run-memory-benchmarks.mjs`: passed in the benchmark
  integration session.
- Markdown relative-link check and tracked-file secret/public scan passed in
  the benchmark integration session.

## Current Product State

- HandoffBase remains a functional open-source memory infrastructure MVP, not a
  production SaaS product.
- The current live/runtime proof remains `storeMode=in-memory`; Postgres
  runtime wiring remains future work.
- The Alibaba ECS proof remains historical deployment proof and may be stopped
  for cost control. Do not claim a currently live endpoint without restart and
  revalidation under explicit approval.
- The benchmark subset is local, deterministic, public-safe, credential-free,
  network-free, and synthetic. It does not read `.env.*`, call Qwen or
  DashScope, call a remote MCP endpoint, restart ECS, use database URLs, or
  require paid cloud resources.

## Cloud And Cost State

- The stopped ECS instance may still bill for retained disk/resources while
  compute is paused by economical stop mode.
- The prior public endpoint is not available while stopped, and the public IP
  may change after restart.
- Account-level balance and exact ECS bill detail were not visible in the prior
  console check because billing pages stayed on loading skeletons.
- Bailian fee overview showed total model-platform spend `¥0`.
- `qwen-plus-2025-07-28` showed 1,000,000 / 1,000,000 free tokens remaining
  with free-quota-only / stop-when-free-quota-runs-out enabled in the prior
  check.
- Alibaba Resource Center was not enabled, so the paid-resource sweep was a
  best-effort console check rather than a full Resource Center inventory.

## Open Risks

- GitHub Actions should be checked after the pushed branch or any future PR.
- The deterministic subset proves local service behavior over synthetic
  fixtures only; public materials must not claim official benchmark scores.
- The subset does not add Qwen-backed manual benchmark mode or external
  benchmark dataset adapters.
- Durable runtime storage, TLS/domain/load balancer/monitoring, and production
  SaaS operations remain future work.
- ECS restart, current public IP confirmation, `/health`, and remote MCP
  validation still require explicit approval and safe shell-provided secrets.
- Coupon/voucher activation may still require a later browser or email check.
  Do not print, save, or commit any coupon/voucher code if one becomes
  available.
- If final submission validation needs a live endpoint, restart the ECS
  instance around July 17-18, recheck the public IP, and revalidate using
  `docs/deployment/relaunch-runbook.md`.

## Next Session Prompt

```text
Read agent.md, memory/README.md, memory/product.md, memory/architecture.md,
memory/qwen-cloud.md, memory/operations.md, memory/decisions.md,
docs/handoff.md, README.md, docs/effect.md, docs/benchmarks.md,
docs/product-completeness.md, docs/product-workflows.md, docs/evals.md,
docs/dev-materials-checklist.md, docs/hackathon-resource-support.md,
docs/deployment/relaunch-runbook.md, scripts/run-memory-eval.mjs,
scripts/run-memory-benchmarks.mjs, package.json, and
packages/memory-core/src/types.ts first.

Preserve MCP tool names, resource URIs, prompt names, runtime behavior,
Postgres runtime wiring, repository visibility, cloud state, and secret-handling
rules.

Do not read `.env.*`, restart ECS, trigger cloud cost, run remote validation, or
claim official benchmark scores unless explicitly asked and safe secrets are
already supplied through the shell or cloud secret configuration.
```
