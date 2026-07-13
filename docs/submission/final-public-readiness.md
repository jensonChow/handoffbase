# Final Public Readiness

Last updated: 2026-07-13

Scope: public-readiness checklist reconciled with the integrated Product Proof
code and the live Singapore deployment completed in this session. Secret values
are intentionally omitted.

## Go/No-Go Snapshot

| Area | Decision | Notes |
| --- | --- | --- |
| Tracked repository safety | Go | Final tracked-file scans found only safe placeholders, public URLs, and safety-instruction wording. |
| Public repository visibility | User action needed | The repository still needs to be made public by the owner. Do not make it public from this task. |
| Devpost assets | Nearly ready | Copy, testing instructions, architecture notes, checklist, video scripts, and benchmark docs are in the repo; final public repo URL and uploaded video links still need to be filled. |
| Live backend proof | Go | The Alibaba Cloud International Singapore endpoint passed HTTPS health, authenticated readiness, strict MCP validation, and Postgres restart persistence proof on 2026-07-13. |
| Production readiness | No-go | This is a runnable MVP and deployment proof, not a durable production SaaS service. |

## Repository Visibility Checklist

- [ ] Make the GitHub repository public only after explicit user approval.
- [x] `LICENSE` is present and uses MIT.
- [x] `README.md` describes the MVP, Qwen usage, MCP surface, architecture,
  examples, eval pack, benchmark subset, deployment proof, and limitations.
- [x] `.gitignore` ignores `.env` and `.env.*`, while allowing
  `.env.example`.
- [x] `.dockerignore` excludes `.env` and `.env.*`, while allowing
  `.env.example`.
- [x] `.env.example` is the only tracked env-like file. It contains template
  values, blank key fields, and a fake local `dev-key` mapping.

## Required Devpost Assets Checklist

- [ ] Public repo URL: add the final public GitHub URL after repository
  visibility is changed. Expected repository: `jensonChow/handoffbase`.
- [ ] License visibility: `LICENSE` is present locally; confirm it is visibly
  linked from the public GitHub repository page after publication.
- [x] Track selection: Qwen Cloud Hackathon Track 1 / MemoryAgent.
- [x] Devpost copy: `docs/submission/devpost-copy.md`.
- [x] Testing instructions: `docs/submission/testing-instructions.md`.
- [x] Submission checklist: `docs/submission/submission-checklist.md`.
- [x] Architecture diagram: `docs/assets/architecture.mmd`, also summarized in
  `README.md`, `docs/architecture.md`, and
  `docs/submission/architecture-for-devpost.md`.
- [x] Main demo video script: `docs/submission/main-demo-video-script.md`.
- [x] Alibaba proof video script:
  `docs/submission/alibaba-proof-video-script.md`.
- [x] Recording shot list: `docs/submission/recording-shot-list.md`.
- [x] Alibaba proof doc link: `docs/deployment/alibaba-cloud-proof.md`.
- [ ] Devpost Alibaba code-file links: after publication, add direct public
  GitHub blob links to `deploy/alibaba/compose.yaml` and
  `packages/memory-core/src/reasoning/providers/qwen.ts`.
- [x] Relaunch runbook: `docs/deployment/relaunch-runbook.md`.
- [x] Benchmark documentation: `docs/benchmarks.md` and
  `docs/benchmark-results.md`.
- [ ] Main demo video link: `TODO`.
- [ ] Alibaba proof video link: `TODO`.

## Current Validation Evidence

The local gate and live deployment proof were rerun for the 2026-07-13
Singapore deployment session.

| Check | Result |
| --- | --- |
| `npm run check` | Passed in full after the deployment implementation; includes build, tests, deterministic eval/benchmarks, cross-host E2E, Markdown links, and tracked-secret scan. |
| `npm run eval:memory` | Passed 10/10 deterministic memory eval cases without Qwen credentials or a remote endpoint. |
| `npm run bench:memory` | Passed 17/17 deterministic benchmark-inspired local cases. |
| `npm run smoke` | Passed with 9 tools, 9 resources, and 4 prompts. |
| `npm run dashboard:build` | Passed. |
| `npm run test:dashboard` | Passed 33/33 dashboard tests. |
| `node --check scripts/validate-remote-mcp.mjs` | Passed. |
| Remote validator | Passed through the public HTTPS endpoint with explicit `api_key` / `qwen` / `postgres` / `qwen` mode assertions and two persisted pending candidates. |

Do not run `npm run mcp:validate-remote` unless `MCP_ENDPOINT` and
`MCP_AUTH_TOKEN` are already supplied safely through the shell environment.
Never print token values.

## Secret Scan Checklist

Final integration scans were run on the uncommitted review diff.

Expected safe outcomes:

- Tracked env-like files are limited to `.env.example`.
- `.env.hackathon.local` remains ignored by `.gitignore` rule `.env.*`.
- No tracked `.env.hackathon.local`, `.env.local`, `.env.production`,
  `.env.development`, or `.env.test` files were found.
- Qwen, DashScope, HandoffBase, MCP token, database URL, local workstation path,
  and workspace id scans found no real secret values.
- Qwen/HandoffBase/MCP token matches are documented placeholders such as
  `<backend-secret-only>`, `<temporary-demo-key>`, `<redacted>`,
  `<public-ip>`, `<container-name>`, and
  `<temporary-handoffbase-demo-key>`.
- Coupon/voucher matches are public URLs or status wording only.
- `UID` and `phone` matches are safety instructions or non-secret status
  wording only.

## Cloud Checklist

- [x] Singapore subscription ECS is live and prepaid through judging.
- [x] `GET /health`, authenticated `GET /ready`, and strict remote MCP
  validation passed through the public HTTPS hostname.
- [x] Postgres restart persistence passed; the server-side archive passed
  `pg_restore --list`, and the off-server copy matched SHA-256
  `753688b3beb45550dd0c03febf2a437ddaa80114c4ed7431f258c792f7f64aae`.
- [x] Auto-renewal is disabled and both deployed Model Studio rows have Free
  Quota Only enabled.
- [ ] Recheck health and quota immediately before submission and recording.
- [ ] Release or allow ECS to expire after judging and rotate temporary keys.
- [ ] Do not provision additional paid cloud services without explicit approval.

## Known Limitations

- The live Alibaba Cloud proof uses `storeMode=postgres` and
  `embeddingMode=qwen`; the local default remains in-memory.
- Postgres and Caddy state reside on one ECS host. A verified logical backup was
  copied off ECS, but there is no managed multi-zone database or backup service.
- The public endpoint uses Caddy HTTPS with a free `sslip.io` hostname, not a
  custom domain, load balancer, or managed gateway.
- The Memory Vault uses same-origin server APIs by default and can share the MCP
  Postgres database, but it is not a production admin console.
- The local comparison and LongMemEval tiny fixture are deterministic and
  synthetic. No full credentialed official run or official score exists.

## Final Go/No-Go Decision Fields

- Public source safety: Go.
- Public repository visibility: user action required.
- Devpost submission readiness: go after public repo URL and video links are
  filled.
- Live endpoint readiness: go as of the dated 2026-07-13 validation; recheck
  immediately before submission.
- Production SaaS readiness: no-go.
- Final approver:
- Final decision date:
