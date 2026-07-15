# Submission Checklist

Use this checklist before final Devpost submission and before any judging-window
remote validation.

## Repository Readiness

- [ ] Public repo check: after explicit owner approval, make the repository
  publicly accessible as required by the event rules.
- [ ] Repo URL check: add the final public repository URL to Devpost after
  visibility changes.
- [ ] LICENSE check: MIT `LICENSE` is present and visibly linked on the public
  GitHub repository page.
- [ ] GitHub Actions check: confirm the latest `CI` workflow run is green after
  pushing the final integration commit.
- [ ] README check: README clearly distinguishes the credential-free in-memory
  local default from the live Postgres/Qwen deployment.
- [ ] Architecture diagram check: `docs/assets/architecture.mmd` (source) and
  the rendered `docs/assets/architecture.svg` / `architecture.png` are present,
  accurate, and consistent with each other.
- [ ] Devpost architecture check: upload `docs/assets/architecture.png`
  (1920x1080) as the Devpost architecture diagram asset.
- [ ] Devpost track check: submission is entered under Track 1: MemoryAgent.
- [ ] Testing instructions check: `docs/submission/testing-instructions.md`
  includes local, Qwen-backed, and remote testing paths.

## Media And Proof

- [ ] Demo video link placeholder:
  `<add-devpost-demo-video-link-before-submission>`.
- [ ] Alibaba proof video link placeholder:
  `<add-alibaba-cloud-proof-video-link-before-submission>`.
- [ ] Alibaba Cloud deployment proof check:
  `docs/deployment/alibaba-cloud-proof.md` is current and redacted.
- [ ] Devpost Alibaba code-file links: after publishing, paste direct public
  GitHub blob links to `deploy/alibaba/compose.yaml` and
  `packages/memory-core/src/reasoning/providers/qwen.ts`.
- [ ] Memory Vault dashboard demo path check:
  `docs/demo-dashboard.md` matches the recorded demo flow.

## Validation

- [ ] Local validation: `npm run check`.
- [ ] Memory eval validation: `npm run eval:memory`.
- [ ] Local smoke validation: `npm run smoke`.
- [ ] Dashboard build validation: `npm run dashboard:build`.
- [ ] Dashboard test validation: `npm run test:dashboard`.
- [ ] Remote validator script syntax: `node --check scripts/validate-remote-mcp.mjs`.
- [x] Final remote validator check: strict mode assertions passed through
  `https://47-236-247-69.sslip.io/mcp` with two persisted candidates.
- [ ] Final secret scan check: tracked files contain no real API keys, auth
  tokens, database URLs, cookies, cloud credentials, UID, phone number,
  coupon/voucher codes, payment data, or auth headers.

## Alibaba Cloud And Qwen

- [x] ECS deployment/revalidation check: the Singapore subscription deployment
  passed `/health`, authenticated readiness, and strict remote MCP validation.
- [x] ECS endpoint check: current judge endpoint is
  `https://47-236-247-69.sslip.io/mcp`.
- [ ] ECS release after judging window: release or allow the non-renewing
  subscription to expire after the approved judging window.
- [ ] Coupon/voucher status check: record only non-secret status, never a real
  coupon or voucher code.
- [ ] Qwen free quota / Free Quota Only check: verify both exact rows
  `qwen-plus-2025-09-11` and `text-embedding-v4` still have quota and
  Stop-on-Exhaust enabled.
- [ ] Private testing key check: if judges need live access, share only a
  temporary HandoffBase API key in a private Devpost testing field.
- [ ] Qwen secret check: do not share the Qwen API key or DashScope API key with
  judges or in public submission materials.
- [ ] Cost monitoring check: monitor ECS and Qwen usage while the demo is
  available.
- [ ] Post-judging cleanup check: stop or release ECS after the approved window
  and rotate or delete temporary HandoffBase tokens and the Qwen development
  key after the hackathon.

## Copy Review

- [ ] Devpost copy uses project name `HandoffBase`.
- [ ] One-liner is `Open memory handoff for AI agents.`
- [ ] Copy says Qwen backs reasoning-heavy memory operations.
- [ ] Copy says Alibaba Cloud ECS deployment proof exists.
- [ ] Copy says the live proof uses `storeMode=postgres` and
  `embeddingMode=qwen`, while local development defaults to in-memory.
- [ ] Copy does not claim benchmark scores.
- [ ] Copy limits availability claims to the dated live validation and judging
  window.
- [ ] Copy distinguishes HandoffBase from ordinary RAG, Mem0, Zep, Letta, and
  LangMem without claiming universal superiority.
- [ ] Copy explains governed lifecycle, traces, pending review, and conflict
  records.
