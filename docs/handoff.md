# Current Handoff

Updated: 2026-07-14 (video-prep verification; rendered architecture assets;
submission-pack currency pass; benchmark plan defined but not yet executed)

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
- Never run any credentialed benchmark through the deployed key or the two
  demo model rows: even a 5-question calibration (~1.2M tokens) would exhaust
  the generation row and kill the judge endpoint. The sanctioned path, if the
  owner proceeds, is a separate benchmark-only key on different model rows
  (`QWEN_MODEL=qwen-plus` unpinned, `QWEN_EMBEDDING_MODEL=text-embedding-v3`),
  with owner-approved cost. Owner picks (scale / judge / dataset download) are
  still pending; the dataset source is verified (Hugging Face
  `xiaowu0162/longmemeval-cleaned`, `longmemeval_s_cleaned.json`, 277 MB). The
  local `npm run check` benchmark paths remain deterministic/mock and spend no
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

All previously reviewed work is committed and pushed to `main` (HEAD
`661b3c2`). Repository visibility changes remain owner-only.

Uncommitted working set from 2026-07-14, awaiting owner review/"go":

- New rendered architecture assets `docs/assets/architecture.svg` and
  `docs/assets/architecture.png` (1920x1080, hand-drawn to match
  `architecture.mmd` and the dashboard's amber style; Devpost-upload ready).
- `README.md` and `docs/submission/architecture-for-devpost.md` point to the
  rendered assets (mermaid stays the source of truth).
- `docs/submission/submission-checklist.md` names the rendered assets.
- Untracked `.claude/launch.json` (local dashboard-preview convenience; no
  secrets; keep untracked or gitignore).

Same-day engine strengthening (also uncommitted, gates re-run green after):

- One recall ranking everywhere: the in-memory store now uses the exact
  Postgres formula (shared `retentionScore` prior + shared `lexicalRecallScore`
  + clamped semantic term + `compareRecallRank` tiebreakers), closing three of
  the four parity gaps documented on 2026-07-11.
- Feedback-informed reinforcement: helpful/unhelpful feedback shifts recall
  ranking and capacity eviction through one bounded term (0.15/net, cap ±4),
  aggregated at read time — no migration, no contract change.
- Context packs suppress exact-duplicate lines (normalized rendered line)
  before they consume budget, with a distinct trace reason.
- A pre-merge adversarial review (lens-diverse workflow → skeptic verify)
  confirmed 7 defects, all fixed before commit: the pack dedup was downgraded
  from fuzzy Jaccard to exact-match after it was shown to silently drop facts
  differing only by a number or a negation; Postgres keyword matching moved
  from `LIKE` to `position()` (the `_` LIKE-wildcard diverged from the
  in-memory `includes` twin); the recall ORDER BY gained an `m.id asc`
  tiebreaker to match `compareRecallRank`; plus test and docstring fixes.
- Details and rationale in `memory/decisions.md` under 2026-07-14; +15
  regression tests (memory-core 57→66, service 39→41).

The full gate set passed on this working tree on 2026-07-14: `npm run check`
(CI parity, includes eval, comparative benchmark, tiny LongMemEval matrix,
cross-host E2E, link and tracked-secret gates) and `npm run dashboard:build` —
both re-run green after the engine changes. The deployed Singapore image
predates these engine changes (they are repo-side only); redeploying before
judging is optional and NOT required for the validated live demo.

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
4. Records and uploads the public demo video under three minutes, with no
   judge token visible in any frame. The architecture diagram is now rendered
   (`docs/assets/architecture.png`) and ready for the Devpost upload. All
   on-camera commands and all five dashboard views were verified working on
   2026-07-14; recording setup is `npm run start:server` plus
   `npm run dashboard:dev`. An optional Claude Design animated intro (scenes
   1-2 open the video, scene 3 closes it) is mid-build and paused at that
   tool's session limit; the full generation prompt is preserved in the
   2026-07-14 session transcript.
5. Rechecks endpoint health and both model quotas immediately before submission
   and recording.

`sslip.io` currently resolves and the issued TLS certificate covers the judging
window. Moving to a dedicated DuckDNS hostname is an optional reliability
improvement, not a current event-compliance blocker.

## Next Session Prompt

Committed state is HEAD `661b3c2` with the repo-public gate cleared. The
2026-07-14 working set (rendered architecture assets + doc pointers +
checklist currency) is uncommitted but fully gate-verified (`npm run check`
and `npm run dashboard:build` green) — review and commit it first. Then the
remaining owner-only work before the Jul 20 2:00pm PDT close: flip the
repository public (re-run CI for the badge, enable Push Protection), rotate
the retired China key, record the sub-three-minute demo video (script and
shot list verified; recording setup is `npm run start:server` +
`npm run dashboard:dev`; resume the paused Claude Design animated intro if
its session limit has reset, else use the static diagram open), and submit
the Devpost form (Track 1; upload `docs/assets/architecture.png`; links to
`deploy/alibaba/compose.yaml` and the Qwen provider file; judge token only in
the private field). The credentialed LongMemEval run stays parked on three
owner picks (scale / judge / dataset download) and a benchmark-only key on
separate model rows — never the deployed key or demo rows. Do not enable paid
inference, auto-renewal, or additional Alibaba services without explicit
owner approval.
