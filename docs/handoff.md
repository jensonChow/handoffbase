# Current Handoff

Updated: 2026-07-08T03:26:49Z

## Completed This Session

- Integrated the HandoffBase open-source/star-readiness batch directly on
  `main` because the requested branch refs were not present locally or on
  `origin`.
- Added MIT `LICENSE`.
- Rewrote `README.md` around the public tagline:
  `Open memory handoff for AI agents.`
- Added public architecture, comparison, memory lifecycle, eval, and dashboard
  demo docs:
  - `docs/architecture.md`
  - `docs/assets/architecture.mmd`
  - `docs/comparison.md`
  - `docs/memory-lifecycle.md`
  - `docs/evals.md`
  - `docs/demo-dashboard.md`
- Added practical examples:
  - `examples/README.md`
  - `examples/mcp/*`
  - `examples/http/README.md`
  - `examples/quickstart/*`
  - `examples/evals/opportunity-scout-memory-eval.json`
- Added deterministic local eval runner `scripts/run-memory-eval.mjs` and
  exposed it as `npm run eval:memory`.
- Polished dashboard demo copy and conflict metadata so the local Memory Vault
  shows HandoffBase branding, Qwen-extracted pending candidates, trace
  metadata, candidate/existing conflict comparison, severity, conflict type,
  and recommended action.
- Refreshed durable memory files for the star-readiness state:
  `memory/product.md`, `memory/architecture.md`, `memory/operations.md`, and
  `memory/decisions.md`.
- Preserved the current deployment proof and did not change MCP names,
  resource URIs, prompt names, cloud resources, dashboard remote wiring, or
  Postgres runtime selection.

## Verification

- Current branch before commit: `main`.
- Base commit before this star-readiness commit: `d244d3d`.
- `npm run eval:memory`: passed, 8/8 eval cases.
- `npm run test:dashboard`: passed, 2/2 tests.
- `npm run dashboard:build`: passed.
- `node --check scripts/validate-remote-mcp.mjs`: passed.
- `node --check scripts/run-memory-eval.mjs`: passed.
- `npm run check`: passed. Smoke registered 7 tools, 9 resources, and 4
  prompts; memory-core 28/28, auth 5/5, server 1/1, dashboard 2/2.
- `git diff --check`: passed.
- Required tracked-file public-readiness scans found only intentional
  placeholder or redacted values:
  `<your-qwen-api-key>`, `<your-dashscope-api-key>`,
  `<your-handoffbase-api-key>`, and `<redacted>`.
- Additional working-tree scan over untracked new files found only the same
  placeholders/redacted examples.
- `.env.hackathon.local` remains covered by `.gitignore` rule `.env.*`.
- Tracked env-like files remain only `.env.example`.

## Git State

- This handoff is prepared for a star-readiness commit and push on `main`.
- No target branches named `codex/license-and-examples`,
  `codex/architecture-and-comparison-docs`, `codex/memory-eval-pack`,
  `codex/dashboard-demo-polish`, or `codex/readme-star-polish` were available
  locally or on `origin`; no real Git merge of those branch refs occurred.
- After committing, verify exact commit and push state with:
  - `git log -1 --oneline`
  - `git status --short --branch`

## Open Risks

- Default live/runtime store remains in-memory. `PostgresMemoryStore` exists
  and is tested, but server runtime selection for `STORE_MODE=postgres` and
  `DATABASE_URL` / `POSTGRES_URL` is still future work.
- The live endpoint remains plain HTTP on the ECS public IP. No domain, TLS
  certificate, load balancer, or managed gateway is configured.
- The dashboard remains a local governance prototype; it is not wired to the
  Alibaba ECS endpoint and should not hardcode remote tokens/endpoints.
- The eval pack is deterministic and local. It is not an official LoCoMo,
  LongMemEval, Mem2ActBench, MemBench, MemEvoBench, or LifeBench score.
- GitHub Actions should be checked from the GitHub UI after push.
- Alibaba ECS should be revalidated before demo/submission if restarted, then
  stopped or released after the approved hackathon demo window.

## Next Session Prompt

```text
Read agent.md, memory/README.md, memory/product.md, memory/architecture.md,
memory/qwen-cloud.md, memory/operations.md, memory/decisions.md,
docs/dev-materials-checklist.md, and docs/handoff.md first.

Continue from main after the star-readiness commit. Preserve the MCP tool names,
resource URIs, prompt names, Alibaba deployment proof, and current live
storeMode=in-memory truth.

Priorities:
1. Check GitHub Actions after the pushed commit.
2. Re-run remote `/health` and `npm run mcp:validate-remote` only if safe
   `MCP_ENDPOINT` and `MCP_AUTH_TOKEN` are present in the shell environment.
3. Keep all Qwen and HandoffBase auth values in ignored local env or cloud
   secret configuration; never commit `.env.*` files or print secrets.
4. Before adding Postgres runtime mode, verify target Alibaba PostgreSQL
   pgvector support and wire `STORE_MODE=postgres` deliberately.
5. Stop or release the pay-as-you-go ECS instance after the approved demo
   window.
```
