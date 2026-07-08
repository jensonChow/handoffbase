# Current Handoff

Updated: 2026-07-08T16:39:10Z

## Completed This Session

- Added `docs/deployment/relaunch-runbook.md` as the safe restart,
  validation, recording, availability, and stop/release checklist for the
  stopped Alibaba Cloud ECS + Docker demo.
- Linked the relaunch runbook from `docs/cloud-cost-runbook.md`,
  `docs/deployment/alibaba-cloud-proof.md`, and
  `docs/hackathon-resource-support.md`.
- Clarified that the Alibaba Cloud deployment proof is historical live
  validation from 2026-07-07T16:26:43Z, not a current-online claim while ECS is
  stopped or before the endpoint is revalidated.
- Rechecked the Alibaba Cloud cost runway for the deployed HandoffBase ECS demo,
  then stopped the ECS instance after explicit user approval.
- Confirmed the documented ECS instance is now stopped in `cn-beijing` using
  economical stop mode / savings stop mode. It remains pay-as-you-go on
  `ecs.e-c1m1.large` with 2 vCPU / 2 GiB and a 40 GiB ESSD Entry system disk.
- Confirmed the instance was not released. The console showed `已停止` and
  `节省停机模式` after the stop action.
- The previous public endpoint is no longer available while stopped. The console
  no longer shows the prior public IP, so recheck the IP after restart.
- Billing/cost pages did not render account-level balance or ECS bill details
  in Chrome; they stayed on loading skeletons. The current decision therefore
  uses visible ECS resource posture plus a conservative 4-5 RMB/day planning
  estimate.
- Confirmed Bailian fee overview showed total model-platform spend `¥0`.
- Confirmed `qwen-plus-2025-07-28` still had 1,000,000 / 1,000,000 free tokens
  remaining and free-quota-only / stop-when-free-quota-runs-out enabled.
- Checked the ECS snapshot page; snapshot service was not opened and no active
  snapshot resource was found.
- Ran a read-only best-effort sweep for common paid resources. No active
  RDS/PolarDB, ACK, load balancer, NAT Gateway, Elastic IP conversion, OSS
  bucket, Log Service project, paid Container Registry Enterprise instance,
  WAF, API Gateway, Function Compute workload, or snapshot service was found.
  Some pages only showed Resource Center or product authorization/open-service
  prompts, so this is not a full Resource Center inventory.
- Updated `docs/cloud-cost-runbook.md` and
  `docs/hackathon-resource-support.md` with the actual stop result: stop now in
  economical stop mode, keep the instance, restart around July 17-18, then
  revalidate before final submission.
- No release, resize, paid-service enablement, coupon redemption, payment method,
  autopay, or new paid cloud resource was performed.

## Prior Completed Work

- Completed the resource-support objective for the Global AI Hackathon Series
  with Qwen Cloud without touching application code.
- Confirmed the live Devpost submission deadline remains July 20, 2026 at
  2:00 PM PST, while the coupon/voucher request deadline remains July 9, 2026
  at 10:00 AM PST.
- Confirmed Qwen Free Tier availability from public Qwen Cloud docs and the
  authenticated Alibaba Model Studio / Bailian console.
- Confirmed `qwen-plus-2025-07-28` had 1,000,000 / 1,000,000 free tokens
  remaining and enabled free-quota-only / stop-when-free-quota-runs-out for
  that model row.
- Found the Qwen Cloud voucher application path, used Devpost-confirmed
  profile fields where available, and had the user enter required private
  participant fields directly in Chrome.
- After explicit user confirmation, submitted the Qwen Cloud voucher form. The
  first attempt showed phone validation; the user corrected and submitted the
  form directly in Chrome.
- Checked Gmail read-only after submission and found the Qwen Cloud / Alibaba
  Cloud confirmation email with subject "Coupon Request Received - Verification
  in Progress". The email says the coupon form was submitted and registration
  verification is in progress, usually taking 1-2 business days.
- Checked Alibaba Cloud billing/cost and ECS surfaces without exposing payment
  details. The existing demo ECS is pay-as-you-go in `cn-beijing`; no
  additional paid cloud resource was intentionally created during the check.
- Recorded the non-secret results in `docs/hackathon-resource-support.md` and
  kept UID, phone number, Gmail address, coupon/voucher code, API keys, auth
  tokens, database URLs, account ids, and payment details out of tracked files.
- Ran the `memory-refresh` audit and refreshed this handoff plus the relevant
  long-term Qwen/operations memory so the repo matches the resource-support
  result.

## Verification

- Alibaba Cloud ECS console: instance `i-2ze79rc2xe68zx1xeahu` showed `已停止`
  and `节省停机模式`; no release action was taken.
- `git diff --check`: passed for this ECS stop documentation update.
- `node --check scripts/validate-remote-mcp.mjs`: passed.
- `npm run check`: passed for this ECS stop documentation update. Smoke
  registered 7 tools, 9 resources, and 4 prompts; memory-core 28/28, auth 5/5,
  server 1/1, and dashboard 2/2 passed.
- Tracked-file scans for Qwen/DashScope/HandoffBase keys and database URLs found
  no real secret values. The MCP token scan matched only documented
  `<redacted>` placeholders. Coupon/voucher scans matched public URLs and status
  wording only, not coupon or voucher codes.
- `git diff --check`: passed for this cost-runway docs update.
- `npm run check`: passed for this cost-runway docs update. Smoke registered 7
  tools, 9 resources, and 4 prompts; memory-core 28/28, auth 5/5, server 1/1,
  and dashboard 2/2 passed.
- `node --check scripts/validate-remote-mcp.mjs`: passed.
- Tracked-file scans for Qwen/DashScope/HandoffBase keys and database URLs found
  no real secret values. The MCP token scan matched only documented
  `<redacted>` placeholders. Coupon/voucher scans matched public URLs and status
  wording only, not coupon or voucher codes.
- `.env.hackathon.local` remains covered by `.gitignore` rule `.env.*`; only
  `.env.example` is tracked.
- `python3 /Users/jenson/.codex/skills/memory-refresh/scripts/audit_project_memory.py /Users/jenson/Desktop/AI\ Event\ 2026/HandoffBase`: passed/read-only audit.
- `git diff --check`: passed after this memory refresh.
- `npm run check`: passed after this memory refresh. Smoke registered 7 tools,
  9 resources, and 4 prompts; memory-core 28/28, auth 5/5, server 1/1, and
  dashboard 2/2 passed.
- Tracked env-style secret scan only found intentional `<redacted>`
  placeholders in documentation. Private resource-support scan matched only
  safety instructions, public repository naming, and no real key, token,
  database URL, coupon/voucher code, UID, phone number, or Gmail address.
- `.env.hackathon.local` remains covered by `.gitignore` rule `.env.*`; do not
  print or commit its contents.

## Git State

- Current branch: `main`.
- Latest committed cost-runway state before this ECS stop update:
  `163337d docs: record cloud cost runway`.
- This ECS stop documentation update should be committed on `main`. Do not push
  unless explicitly instructed.

## Open Risks

- Account-level balance and exact ECS bill detail were not visible because the
  billing pages stayed on loading skeletons. Recheck Billing/Cost Management
  later or after the next billing update for exact spend.
- ECS compute is currently paused by economical stop mode, but the system disk
  and any retained attached resources continue billing.
- The stopped ECS instance currently has no public IP shown in the console. The
  prior public endpoint may change on restart, so update validation commands and
  public proof material only after rechecking the restarted IP.
- Restart the ECS instance around July 17-18 if final submission validation needs
  a live endpoint. Use `docs/deployment/relaunch-runbook.md`, recheck the public
  IP, then revalidate `/health` and remote MCP after restart.
- Coupon/voucher activation is still pending registration verification. Watch
  for the Qwen Cloud / Alibaba Cloud activation email or check Qwen Cloud
  benefits after the expected 1-2 business day review window.
- If the coupon request remains pending and urgent near the deadline, contact
  `global.hackathon@alibaba-inc.com`; the user should enter UID and phone
  number directly in email or the browser, not in chat or tracked files.
- Do not print, save, or commit any approved coupon/voucher code if one becomes
  available. Ask before redeeming it.
- Alibaba Resource Center was not enabled, so the paid-resource sweep is a
  best-effort console check rather than a full Resource Center inventory.
- Budget alerts were not created because the relevant surface requires the
  Resource Center authorization flow. Enable the free role and create a 70 RMB
  or 80 RMB alert only after user approval.
- Default live/runtime store remains in-memory. `PostgresMemoryStore` exists
  and is tested, but server runtime selection for `STORE_MODE=postgres` and
  `DATABASE_URL` / `POSTGRES_URL` is still future work.
- The live endpoint remains plain HTTP on the ECS public IP. No domain, TLS
  certificate, load balancer, or managed gateway is configured.
- GitHub Actions should be checked from the GitHub UI after pushing.
- Alibaba ECS should be revalidated before demo/submission if restarted, then
  stopped or released after the approved hackathon demo window.

## Next Session Prompt

```text
Read memory/README.md, memory/product.md, memory/architecture.md,
memory/qwen-cloud.md, memory/operations.md, memory/decisions.md,
docs/dev-materials-checklist.md, docs/hackathon-resource-support.md,
docs/deployment/relaunch-runbook.md, and docs/handoff.md first.

Continue from main after the resource-support and memory-refresh commits.
Preserve the MCP tool names, resource URIs, prompt names, Alibaba deployment
proof, current live storeMode=in-memory truth, and secret-handling rules.

Priorities:
1. Check GitHub Actions after the pushed commits.
2. Watch for the Qwen Cloud / Alibaba Cloud coupon activation email. If pending
   near the deadline, contact global.hackathon@alibaba-inc.com with UID and
   phone entered directly by the user.
3. ECS is currently stopped in economical stop mode. Restart around July 17-18,
   recheck the public IP, and revalidate before submission using
   docs/deployment/relaunch-runbook.md.
4. Re-run remote `/health` and `npm run mcp:validate-remote` only if safe
   `MCP_ENDPOINT` and `MCP_AUTH_TOKEN` are present in the shell environment.
5. Keep all Qwen, HandoffBase, Alibaba, Gmail, UID, phone, coupon/voucher, and
   payment values in ignored local env, cloud secret configuration, or browser
   forms only; never commit `.env.*` files or print secrets.
6. Before adding Postgres runtime mode, verify target Alibaba PostgreSQL
   pgvector support and wire `STORE_MODE=postgres` deliberately.
7. Stop or release the pay-as-you-go ECS instance after the approved demo
   window.
```
