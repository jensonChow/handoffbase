# Submission Checklist

Use this checklist before final Devpost submission and before any judging-window
remote validation.

## Repository Readiness

- [ ] Public repo check: make the repository public only after explicit user
  approval, or confirm the repository is otherwise shareable with judges.
- [ ] Repo URL check: add the final public repository URL to Devpost after
  visibility changes.
- [ ] LICENSE check: MIT license is present.
- [ ] GitHub Actions check: confirm the latest `CI` workflow run is green after
  pushing the final integration commit.
- [ ] README check: README clearly states the project purpose, Qwen usage, MCP
  surface, local commands, limitations, and current in-memory runtime truth.
- [ ] Architecture diagram check: `docs/assets/architecture.mmd` and
  architecture docs are present and accurate.
- [ ] Devpost architecture check: add the architecture diagram or rendered
  diagram asset to Devpost.
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
- [ ] Memory Vault dashboard demo path check:
  `docs/demo-dashboard.md` matches the recorded demo flow.

## Validation

- [ ] Local validation: `npm run check`.
- [ ] Memory eval validation: `npm run eval:memory`.
- [ ] Local smoke validation: `npm run smoke`.
- [ ] Dashboard build validation: `npm run dashboard:build`.
- [ ] Dashboard test validation: `npm run test:dashboard`.
- [ ] Remote validator script syntax: `node --check scripts/validate-remote-mcp.mjs`.
- [ ] Final remote validator check after ECS restart:
  `MCP_VALIDATION_PROFILE=alibaba-demo MCP_ENDPOINT=<deployed-mcp-url> MCP_AUTH_TOKEN=<temporary-handoffbase-demo-key> npm run mcp:validate-remote`.
- [ ] Final secret scan check: tracked files contain no real API keys, auth
  tokens, database URLs, cookies, cloud credentials, UID, phone number,
  coupon/voucher codes, payment data, or auth headers.

## Alibaba Cloud And Qwen

- [ ] ECS restart/revalidation check: restart the stopped ECS demo only for the
  approved submission or judging window, then revalidate `/health` and remote
  MCP.
- [ ] ECS endpoint check: confirm the current public IP or deployment URL after
  restart, because the previous IP may change after economical stop mode.
- [ ] ECS stop/release after judging window: stop or release the pay-as-you-go
  ECS instance after the approved demo window.
- [ ] Coupon/voucher status check: record only non-secret status, never a real
  coupon or voucher code.
- [ ] Qwen free quota / free-quota-only check: verify the relevant `qwen-plus`
  row still has free quota and stop-when-free-quota-runs-out enabled.
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
- [ ] Copy says runtime proof uses `storeMode=in-memory`.
- [ ] Copy does not claim benchmark scores.
- [ ] Copy does not claim the ECS endpoint is currently online while stopped.
- [ ] Copy distinguishes HandoffBase from ordinary RAG, Mem0, Zep, Letta, and
  LangMem without claiming universal superiority.
- [ ] Copy explains governed lifecycle, traces, pending review, and conflict
  records.
