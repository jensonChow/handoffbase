# Current Handoff

Updated: 2026-07-13 (second update: reviewed diff committed and pushed;
public-surface scrub; pre-public security confirm; full-history gitleaks CI)

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

## Repository State

All reviewed work is committed and pushed to `main`; the worktree is clean.
Commits after the deployment: `ee518db` (deploy kit + stricter remote
validator), `12fd8be` (proof + submission-pack docs), `a183d2e` (public-surface
scrub — removed the raw live endpoint and the coupon/quota/instance specifics
from the README and durable memory, keeping the endpoint in the proof and
testing docs where judges need it), and `50c9410` (full-history gitleaks
secret-scan CI job + `.gitleaks.toml` / `.gitleaksignore`). HEAD is `50c9410`.
Repository visibility changes remain owner-only.

Pre-public gate is cleared: a full-history gitleaks scan reports no leaks (the
only hits are synthetic test fixtures and one non-credential retired-China
workspace id, allowlisted); the public surface is scrubbed; and a read-only
security check of the live box passed (security group exposes only 80/443, SSH
is restricted, ports 3000/5432 are not public, and `/ready` + MCP POST reject
unauthenticated calls).

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

1. Flips the GitHub repository to public (the pre-public gate is cleared), then
   re-runs CI so the README badge goes green and enables GitHub Push Protection.
2. Rotates/revokes the retired China Bailian Qwen key, which fully neutralizes
   the one non-credential workspace id left in git history.
3. Adds links in Devpost to `deploy/alibaba/compose.yaml` and the Qwen provider
   code, with a temporary HandoffBase judge token only in Devpost's private
   testing instructions.
4. Renders/uploads the architecture diagram and a public demo video under three
   minutes, with no judge token visible in any frame.
5. Rechecks endpoint health and both model quotas immediately before submission
   and recording.

`sslip.io` currently resolves and the issued TLS certificate covers the judging
window. Moving to a dedicated DuckDNS hostname is an optional reliability
improvement, not a current event-compliance blocker.

## Next Session Prompt

The reviewed deployment, proof, submission pack, public-surface scrub, and
full-history gitleaks CI are committed and pushed (HEAD `50c9410`); the
repo-public gate is cleared (history-clean + surface-scrubbed + box-locked).
What remains is owner-only, all before the Jul 20 2:00pm PDT submission close:
flip the repository public (then re-run CI for the badge and enable Push
Protection), rotate the retired China key, record the sub-three-minute public
demo video and export the architecture diagram, and submit the Devpost form
(Track 1; links to `deploy/alibaba/compose.yaml` and the Qwen provider file;
judge token only in the private field). Do not enable paid inference,
auto-renewal, or additional Alibaba services, and do not run the credentialed
LongMemEval benchmark through judging.
