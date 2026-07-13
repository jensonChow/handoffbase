# Current Handoff

Updated: 2026-07-13

## Outcome

HandoffBase is live on Alibaba Cloud International in Singapore; the current
endpoint is recorded in `docs/deployment/alibaba-cloud-proof.md`. The
deployment uses Caddy HTTPS, API-key authentication, Qwen reasoning and
embeddings, and Postgres/pgvector. The Memory Vault dashboard is intentionally
not hosted on the judging ECS.

Runtime truth:

- `authMode=api_key`
- `providerMode=qwen`
- `storeMode=postgres`
- `embeddingMode=qwen`
- generation: `qwen-plus-2025-09-11`
- embeddings: `text-embedding-v4`
- source base commit: `90c517ac4e2fa5d855f70d61735c45c6a99c1efb`

The first Beijing deployment was released on 2026-07-12. Its HTTP endpoint,
in-memory runtime, and relaunch instructions are historical only.

## Cloud And Cost State

- ECS: Singapore Zone A, Ubuntu 24.04 x86_64, 2 vCPU, 4 GiB RAM, 40 GiB system
  disk, prepaid fixed 1 Mbps bandwidth (instance id in the proof file).
- The subscription runs past the end of the judging window, with auto-renewal
  disabled, and was covered by the event coupon at no real-money cost.
- No managed database, snapshot service, load balancer, paid security product,
  marketplace image, or traffic-billed public networking was added.
- Model Studio Stop-on-Exhaust is enabled on both deployed model rows, keeping
  the deployment within the free quota.
- The dedicated Qwen key is limited to the ECS public IP and the two deployed
  model ids. Do not broaden the model scope or disable Stop-on-Exhaust.
- Do not run the credentialed LongMemEval benchmark through judging; the local
  `npm run check` benchmark paths are deterministic/mock and do not spend model
  quota.

## Live Proof

- Outside-in `/health` passed and reported all four expected modes.
- Unauthenticated `/ready` returned HTTP 401 `readiness_auth_required`.
- The strict HTTPS MCP validator passed with exit code 0, the exact nine-tool
  manifest, a recall trace, and two persisted non-rejected candidate memories
  with ids and `pending` status.
- Memory `dd2b6907-9d27-465e-8b36-d5056baa3ff2` remained after the app
  container restarted; final counts were 9 memories, 16 traces, and 9
  embeddings.
- A compressed Postgres backup passed `pg_restore --list`, was copied off ECS,
  and is stored locally at
  `artifacts/deployment/handoffbase-2026-07-13.dump` with mode 0600. SHA-256:
  `753688b3beb45550dd0c03febf2a437ddaa80114c4ed7431f258c792f7f64aae`.

The canonical non-secret record is
`docs/deployment/alibaba-cloud-proof.md`. Deployment files are in
`deploy/alibaba/`.

## Local Worktree State

The deployment bundle, hardened remote validator, tests, and current submission
docs are modified or untracked locally. They have not been committed or pushed.
Do not commit, push, or change repository visibility without explicit owner
approval.

Validation completed after the implementation:

- `npm run check` passed in full.
- `npm run test:onboarding` passed 11/11.
- `node --check scripts/validate-remote-mcp.mjs` passed.
- `git diff --check`, Markdown-link checking, and tracked-secret scanning passed.
- The latest validator overlay SHA-256 on ECS is
  `e0c725cd69d2411b9e434fc8e661c9409f0b096de724a6142658738a6bb2ec6d`.

Local Docker is not installed, so Compose syntax was validated on the ECS host,
not with a local `docker compose config` run.

## Event Readiness

The live backend now fits the Qwen Cloud MemoryAgent requirement: Qwen is used
for memory reasoning and embeddings, and Postgres proves persistent,
cross-restart memory. The subscription and free model quotas extend beyond the
judging window.

Submission is not complete until the owner:

1. Reviews and publishes the local deployment/proof changes to the public
   repository.
2. Adds links in Devpost to `deploy/alibaba/compose.yaml` and the Qwen provider
   code.
3. Places a temporary HandoffBase judge token only in Devpost's private testing
   instructions.
4. Renders/uploads the architecture diagram and a public demo video under three
   minutes.
5. Rechecks endpoint health and both model quotas immediately before submission
   and recording.

`sslip.io` currently resolves and the issued TLS certificate covers the judging
window. Moving to a dedicated DuckDNS hostname is an optional reliability
improvement, not a current event-compliance blocker.

## Next Session Prompt

Review the uncommitted Alibaba deployment and submission-proof diff. Keep all
credentials private. If approved, commit and push the exact reviewed files,
confirm the GitHub repository is public, then finish the Devpost code links,
private judge-token instructions, architecture asset, and video links. Do not
enable paid inference, auto-renewal, or additional Alibaba services.
