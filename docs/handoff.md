# Current Handoff

Updated: 2026-07-08T03:59:43Z

## Completed This Session

- Reconciled the five star-readiness source worktrees into `main`:
  - `codex/open-source-examples`
  - `codex/architecture-positioning-docs`
  - `codex/memory-eval-pack`
  - `codex/dashboard-memory-governance-demo`
  - `codex/readme-open-source-readiness`
- Preserved the stronger worktree content instead of the earlier condensed
  partial integration on `main`.
- Kept MIT `LICENSE`.
- Rewrote and repaired `README.md` around the public tagline:
  `Open memory handoff for AI agents.`
- Restored public architecture, comparison, memory lifecycle, eval, and
  dashboard demo docs from the source worktrees:
  - `docs/architecture.md`
  - `docs/assets/architecture.mmd`
  - `docs/comparison.md`
  - `docs/memory-lifecycle.md`
  - `docs/evals.md`
  - `docs/demo-dashboard.md`
- Restored practical examples from the examples worktree:
  - `examples/README.md`
  - `examples/mcp/*`
  - `examples/http/README.md`
  - `examples/quickstart/*`
  - `examples/evals/opportunity-scout-memory-eval.json`
- Restored the deterministic local eval runner `scripts/run-memory-eval.mjs`;
  kept the safer root `npm run eval:memory` wrapper that builds memory-core
  before running the eval.
- Restored dashboard polish so the local Memory Vault shows HandoffBase
  branding, Qwen-extracted pending candidates, trace metadata,
  candidate/existing conflict comparison, severity, conflict type, and
  recommended action.
- Preserved the current deployment proof and did not change MCP names,
  resource URIs, prompt names, cloud resources, dashboard remote wiring, or
  Postgres runtime selection.

## Verification

- `npm run eval:memory`: passed, 8/8 eval cases.
- `npm run test:dashboard`: passed, 2/2 tests.
- `npm run dashboard:build`: passed.
- `node --check scripts/validate-remote-mcp.mjs`: passed.
- `node --check scripts/run-memory-eval.mjs`: passed.
- `npm run check`: passed. Smoke registered 7 tools, 9 resources, and 4
  prompts; memory-core 28/28, auth 5/5, server 1/1, dashboard 2/2.
- `git diff --check`: passed.
- Required tracked-file public-readiness scans found only intentional
  redacted placeholder values: `MCP_AUTH_TOKEN=<redacted>`.
  The `/Users/` scan matched only the documentation line naming that scan.
- `.env.hackathon.local` remains covered by `.gitignore` rule `.env.*`.
- Tracked env-like files remain only `.env.example`.

## Git State

- Current branch: `main`.
- The objective branch names mapped to local worktree branches as follows:
  - `codex/license-and-examples` -> `codex/open-source-examples`
  - `codex/architecture-and-comparison-docs` -> `codex/architecture-positioning-docs`
  - `codex/memory-eval-pack` -> `codex/memory-eval-pack`
  - `codex/dashboard-demo-polish` -> `codex/dashboard-memory-governance-demo`
  - `codex/readme-star-polish` -> `codex/readme-open-source-readiness`
- Before pushing, verify exact commit and push state with:
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
