# Current Handoff

Updated: 2026-07-08T00:30:31Z

## Completed This Session

- Refreshed tracked docs for possible public release / hackathon submission.
- Redacted Alibaba Model Studio workspace-specific identifiers and API host
  values from tracked docs while preserving the generic OpenAI-compatible base
  URL pattern.
- Replaced local absolute path references, stale branch/commit state, and a
  specific GitHub Actions run URL with public-safe wording.
- Kept `.env.hackathon.local` documented only as ignored local secret storage;
  it must never be committed or printed.
- Added `docs/deployment/alibaba-cloud-proof.md` as a pending, redacted proof
  template. It explicitly does not claim deployment until live ECS validation
  passes.
- Added `npm run mcp:validate-remote` for live endpoint proof. It checks
  `/health`, MCP `tools/list`, authenticated `memory_recall`, and Qwen-backed
  `memory_remember` while taking the auth token only from the shell environment.
- Provisioned the approved minimal Alibaba Cloud ECS + Docker deployment in
  `cn-beijing` without adding Postgres, load balancers, domains, certificates,
  container registries, or other paid resources beyond the ECS path.
- Built and ran Docker image `handoffbase:b565210-20260707T160422Z` on ECS
  instance `i-2ze79rc2xe68zx1xeahu`.
- Configured runtime secrets only through the root-owned ECS env file consumed
  by Docker `--env-file`; no secret values are recorded in tracked files.
- Validated the public endpoint `http://123.56.244.157`, including `/health`,
  MCP `tools/list`, authenticated `memory_recall`, and Qwen-backed
  `memory_remember`.
- Updated `docs/deployment/alibaba-cloud-proof.md` with redacted live proof.
- Refreshed memory files for the deployed ECS + Docker state and prepared this
  update for commit/push on `main`.
- Left application product behavior unchanged.

## Verification

- Current branch: `main`.
- Deployment image source commit: `b565210`.
- `node --check scripts/validate-remote-mcp.mjs`: passed on 2026-07-07T14:36:36Z.
- `npm run check`: passed on 2026-07-07T14:36:36Z after adding the remote validator and proof template.
- `npm run check`: passed on 2026-07-07T16:29Z after live proof and handoff documentation updates.
- `memory-refresh` audit: passed on 2026-07-08T00:30Z; repo uses `agent.md`
  plus `memory/*.md` and `docs/handoff.md`.
- `GET http://123.56.244.157/health`: passed on 2026-07-07T16:25:23Z and
  reported `authMode: "api_key"`, `providerMode: "qwen"`, and
  `storeMode: "in-memory"`.
- `npm run mcp:validate-remote`: passed against
  `http://123.56.244.157/mcp` on 2026-07-07T16:26Z with the auth token supplied
  only from the shell environment.
- Remote MCP validation returned 7 tools, `memory_recall` returned 5 memories
  and a trace id, and `memory_remember` returned 2 pending candidate memories.
- Tracked-file public-readiness scan: passed on 2026-07-07T14:36:36Z. The only
  remaining matches are intentional placeholder `maas.aliyuncs.com` host
  patterns in public setup docs.
- Changed-file secret scan for the proof template and remote validator passed on
  2026-07-07T14:36:36Z.
- Tracked env-like files: only `.env.example`.
- GitHub Actions workflow `CI` uses Node 22, `npm ci`, and `npm run check`;
  check the GitHub Actions tab for the latest remote status before submission.
- `.env.hackathon.local` is covered by `.gitignore` rule `.env.*` and must
  remain untracked.

## Git State

- Branch: `main`.
- Deployment image source: `b565210`.
- This handoff is part of the deployment proof commit on `main`; verify the
  exact commit with `git log -1 --oneline`.
- No secret env files should be staged. Verify with `git status --short` and a
  tracked-file public-readiness scan before any push.

## Open Risks

- Default runtime store remains in-memory. `PostgresMemoryStore` exists and is
  tested, but server runtime selection for `STORE_MODE=postgres` and
  `DATABASE_URL` / `POSTGRES_URL` is still future work.
- Postgres/pgvector support was not verified from an official Alibaba target
  service/version document during this session. Confirm before provisioning.
- The live endpoint is plain HTTP on the ECS public IP. No domain, TLS
  certificate, load balancer, or managed gateway is configured.
- The ECS instance is pay-as-you-go and should be stopped or released after the
  hackathon demo window.
- Direct workstation SSH to the public IP did not provide a usable interactive
  path during deployment; Alibaba Cloud Workbench was used for shell access.
- Docker Hub base-image pull timed out from ECS, so the `node:22-slim` base
  image was pre-tagged on the ECS host from an alternate registry mirror while
  keeping the repository Dockerfile unchanged.
- The dedicated Model Studio API key should be rotated or deleted after the
  hackathon.
- Workspace-specific Alibaba Model Studio IDs, API hosts, and deployment URLs
  should stay in ignored local env or cloud secret configuration only.

## Next Session Prompt

```text
Read agent.md, memory/README.md, memory/qwen-cloud.md, memory/operations.md,
memory/decisions.md, docs/dev-materials-checklist.md, and docs/handoff.md first.

Continue from `main` after the Alibaba Cloud deployment proof commit. The
running ECS image was built from source commit `b565210`.

Priorities:
1. Keep all Qwen and HandoffBase auth values in cloud secret/env configuration;
   never commit `.env.*` files or print secret values.
2. Re-run `GET http://123.56.244.157/health` and
   `npm run mcp:validate-remote` before demo/submission if the ECS instance has
   been restarted.
3. Monitor ECS pay-as-you-go usage and stop/release the instance after the
   approved hackathon demo window.
4. Before adding Postgres, verify pgvector support for the selected Alibaba
   PostgreSQL service/version and wire runtime `STORE_MODE=postgres`.
5. Rotate or delete the local `handoffbase-hackathon-dev` Model Studio key after
   the hackathon.
6. Before public release, recheck GitHub Actions and rerun the tracked-file
   public-readiness scan.
```
