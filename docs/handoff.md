# Current Handoff

Updated: 2026-07-07T13:59:02Z

## Completed This Session

- Refreshed tracked docs for possible public release / hackathon submission.
- Redacted Alibaba Model Studio workspace-specific identifiers and API host
  values from tracked docs while preserving the generic OpenAI-compatible base
  URL pattern.
- Replaced local absolute path references, stale branch/commit state, and a
  specific GitHub Actions run URL with public-safe wording.
- Kept `.env.hackathon.local` documented only as ignored local secret storage;
  it must never be committed or printed.
- Left application code and product behavior unchanged.

## Verification

- Current branch: `main`.
- Current HEAD: `23e7f7a`.
- `npm run check`: passed on 2026-07-07T13:59:02Z.
- Tracked-file public-readiness scan: passed on 2026-07-07T13:59:02Z. The only
  remaining matches are intentional placeholder `maas.aliyuncs.com` host
  patterns in public setup docs.
- Tracked env-like files: only `.env.example`.
- GitHub Actions workflow `CI` uses Node 22, `npm ci`, and `npm run check`;
  check the GitHub Actions tab for the latest remote status before submission.
- `.env.hackathon.local` is covered by `.gitignore` rule `.env.*` and must
  remain untracked.

## Git State

- Branch: `main`.
- HEAD: `23e7f7a`.
- This docs-only public-readiness pass is intentionally uncommitted.
- No secret env files should be staged. Verify with `git status --short` and a
  tracked-file public-readiness scan before any push.

## Open Risks

- Default runtime store remains in-memory. `PostgresMemoryStore` exists and is
  tested, but server runtime selection for `STORE_MODE=postgres` and
  `DATABASE_URL` / `POSTGRES_URL` is still future work.
- Postgres/pgvector support was not verified from an official Alibaba target
  service/version document during this session. Confirm before provisioning.
- No Alibaba Cloud compute, public endpoint, registry, load balancer, domain,
  certificate, or database was created.
- Docker cannot be validated on this workstation until Docker is installed or a
  remote/container build target is used.
- The dedicated Model Studio API key should be rotated or deleted after the
  hackathon.
- Workspace-specific Alibaba Model Studio IDs, API hosts, and deployment URLs
  should stay in ignored local env or cloud secret configuration only.

## Next Session Prompt

```text
Read agent.md, memory/README.md, memory/qwen-cloud.md, memory/operations.md,
memory/decisions.md, docs/dev-materials-checklist.md, and docs/handoff.md first.

Continue from main at HEAD 23e7f7a.

Priorities:
1. If deployment is approved, deploy the Docker-ready Remote Streamable HTTP
   server to Alibaba Cloud, preferably ECS + Docker for the first demo.
2. Keep all Qwen and HandoffBase auth values in cloud secret/env configuration;
   never commit `.env.*` files or print secret values.
3. Capture redacted proof for `/health`, MCP initialize/tools-list, an
   authenticated MCP tool call, and a Qwen-backed memory operation.
4. Before adding Postgres, verify pgvector support for the selected Alibaba
   PostgreSQL service/version and wire runtime `STORE_MODE=postgres`.
5. Rotate or delete the local `handoffbase-hackathon-dev` Model Studio key after
   the hackathon.
6. Before public release, recheck GitHub Actions and rerun the tracked-file
   public-readiness scan.
```
