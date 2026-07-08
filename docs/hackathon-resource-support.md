# Hackathon Resource Support

Last verified: 2026-07-08T04:45:39Z

This file records non-secret resource-support status for the Global AI
Hackathon Series with Qwen Cloud. Do not add UID, phone number, API keys,
coupon codes, voucher codes, account IDs, payment details, cloud access
credentials, auth headers, database URLs, or invoice details here.

## Summary

- Submission deadline: July 20, 2026 at 2:00 PM PST, per the live Devpost
  update. The Devpost schedule also shows July 21, 2026 at 5:00 AM GMT+8.
- Coupon/voucher request deadline: July 9, 2026 at 10:00 AM PST. Devpost says
  this deadline was not extended.
- Qwen Free Tier: public Qwen Cloud docs and Devpost confirm 1,000,000 free
  tokens with no approval, no payment method, and no waiting. The authenticated
  Alibaba Model Studio console shows `qwen-plus-2025-07-28` with
  1,000,000 / 1,000,000 free tokens remaining.
- Coupon/voucher status: not found in the visible Alibaba billing card/coupon
  page, and no submitted/pending/approved status was visible in the checked
  public hackathon pages or billing console surfaces.
- Alibaba Cloud deployment cost posture: the existing ECS demo is running as
  pay-as-you-go in `cn-beijing`. No additional paid service was intentionally
  created during this check.
- Current recommendation: continue using Qwen free quota with the stop-when-free
  guardrail enabled for the deployed `qwen-plus` path; do not add paid cloud
  services; stop or release the pay-as-you-go ECS instance after the approved
  demo/submission window.

## Qwen Cloud Free Tier

- Status: active/available in Alibaba Cloud Model Studio / Bailian for the
  region used by the deployment. The separate Qwen Cloud international Free
  Tier page at `home.qwencloud.com/benefits` still required its own login, so
  account-specific status was not confirmed there.
- Quota: `qwen-plus-2025-07-28` showed 1,000,000 / 1,000,000 free tokens
  remaining.
- Model coverage: the free-quota table includes Qwen LLM rows, including the
  `qwen-plus` model version relevant to the HandoffBase deployment path.
- Free-quota-only / spend control: enabled for `qwen-plus-2025-07-28` on
  2026-07-08. Other visible model rows were not changed.
- Expiration: `qwen-plus-2025-07-28` free quota showed expiration on
  2026/10/06.
- Notes:
  - Qwen Cloud docs say free quota offsets real-time model inference only.
  - Qwen Cloud docs say free quota does not offset fine-tuning, model
    deployment, custom models, or batch calls.
  - The console description says free-quota-only stops calls after quota
    exhaustion with `AllocationQuota.FreeTierOnly` to avoid charges beyond the
    free quota.

## Coupon / Voucher

- Status: unknown / not found in visible console surfaces.
- Deadline: July 9, 2026 at 10:00 AM PST, per the live Devpost deadline update.
- If pending, support contact: `global.hackathon@alibaba-inc.com`.
- Next action:
  - If a voucher request was already submitted and is still pending, contact the
    support address before the deadline. The user should enter UID and phone
    number directly in email or the browser, not in chat or tracked files.
  - If a request was not submitted and the form is still open, submit it before
    the deadline with the user entering private identifiers directly.
  - Do not print, save, or commit any voucher code if one becomes available.

## Alibaba Cloud Cost Guardrails

- ECS status: running in `cn-beijing`, matching the existing ECS + Docker demo
  path documented in `docs/deployment/alibaba-cloud-proof.md`.
- Pay-as-you-go status: the ECS detail page showed pay-as-you-go billing.
- Instance shape: 2 vCPU / 2 GiB.
- Public networking: a public IP and security group are present for the demo;
  the public endpoint is already documented in the deployment proof.
- Unexpected paid resources:
  - No RDS/PolarDB, ACK cluster, load balancer, NAT Gateway, OSS bucket, Log
    Service project, or paid Container Registry Enterprise instance was visible
    in the read-only console sweep.
  - Some product pages showed only authorization prompts or navigation shells,
    so this is a best-effort console check, not a full Resource Center
    inventory.
  - Resource Center was not enabled because doing so would create a RAM service
    role, even though the console says enabling Resource Center itself is free.
- Budget alert: not created. Budget management was visible in the billing
  console, but the relevant surfaces were behind the Resource Center
  authorization prompt. Create a 70 RMB or 80 RMB alert only after the user
  approves enabling the required free Resource Center role and any notification
  details.
- Stop/release recommendation: keep the ECS instance running only while needed
  for demo/submission proof. Revalidate the endpoint before final submission if
  it is stopped and restarted, then stop or release it after the approved
  hackathon window to avoid ongoing pay-as-you-go spend.

## Actions Taken

- Read local non-secret deployment and operations docs.
- Checked live Devpost overview, schedule, resources, and updates pages.
- Checked Qwen Cloud free-quota documentation.
- Checked Alibaba Model Studio / Bailian free-quota console.
- Enabled free-quota-only / stop-when-free-quota-runs-out for
  `qwen-plus-2025-07-28`.
- Checked Alibaba billing card/coupon and budget-management surfaces.
- Checked ECS detail for the existing deployment instance.
- Ran a read-only sweep of common paid-service consoles named in the objective.

## Actions Requiring User Approval

- Entering UID, phone number, or other private participant details for voucher
  support or request submission.
- Submitting a new voucher/coupon request if the form is still open.
- Redeeming any approved coupon/voucher code.
- Enabling Alibaba Resource Center if a full resource inventory or budget alert
  setup is desired.
- Creating or changing budget notifications.
- Stopping, releasing, resizing, or otherwise modifying the ECS instance.
- Adding payment methods, enabling autopay, upgrading billing plans, or creating
  any paid cloud resource.

## Official Sources Checked

- Devpost overview: `https://qwencloud-hackathon.devpost.com/`
- Devpost schedule: `https://qwencloud-hackathon.devpost.com/details/dates`
- Devpost resources: `https://qwencloud-hackathon.devpost.com/resources`
- Devpost deadline update:
  `https://qwencloud-hackathon.devpost.com/updates/45184-more-time-to-build-submission-deadline-extended-to-july-20`
- Devpost Free Tier update:
  `https://qwencloud-hackathon.devpost.com/updates/44970-don-t-wait-on-credits-start-building-now-with-the-free-tier`
- Qwen Cloud free-quota docs:
  `https://docs.qwencloud.com/resources/free-quota`
- Alibaba Model Studio / Bailian console:
  `https://bailian.console.aliyun.com/`
- Alibaba Cloud billing/cost console:
  `https://billing-cost.console.aliyun.com/`
- Alibaba Cloud ECS console:
  `https://ecs.console.aliyun.com/`
