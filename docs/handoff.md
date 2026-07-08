# Current Handoff

Updated: 2026-07-08T07:18:18Z

## Completed This Session

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
- Latest committed resource-support state: `34aa863 docs: record hackathon resource support status`.
- At the start of this memory refresh, `main` was ahead of `origin/main` by 3
  commits:
  - `34aa863 docs: record hackathon resource support status`
  - `c505e08 docs: record qwen voucher application path`
  - `489fab0 docs: record hackathon resource support status`
- This handoff refresh should be committed on `main` and pushed to
  `origin/main`. A separate merge is not needed while the work is already on
  `main`.

## Open Risks

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
and docs/handoff.md first.

Continue from main after the resource-support and memory-refresh commits.
Preserve the MCP tool names, resource URIs, prompt names, Alibaba deployment
proof, current live storeMode=in-memory truth, and secret-handling rules.

Priorities:
1. Check GitHub Actions after the pushed commits.
2. Watch for the Qwen Cloud / Alibaba Cloud coupon activation email. If pending
   near the deadline, contact global.hackathon@alibaba-inc.com with UID and
   phone entered directly by the user.
3. Re-run remote `/health` and `npm run mcp:validate-remote` only if safe
   `MCP_ENDPOINT` and `MCP_AUTH_TOKEN` are present in the shell environment.
4. Keep all Qwen, HandoffBase, Alibaba, Gmail, UID, phone, coupon/voucher, and
   payment values in ignored local env, cloud secret configuration, or browser
   forms only; never commit `.env.*` files or print secrets.
5. Before adding Postgres runtime mode, verify target Alibaba PostgreSQL
   pgvector support and wire `STORE_MODE=postgres` deliberately.
6. Stop or release the pay-as-you-go ECS instance after the approved demo
   window.
```
