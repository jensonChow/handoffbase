# Hackathon Resource Support

Last verified: 2026-07-19 (post-submission cost audit)

This file records non-secret resource-support status for the Global AI
Hackathon Series with Qwen Cloud. Do not add UID, phone number, API keys,
coupon codes, voucher codes, account IDs, payment details, cloud access
credentials, auth headers, database URLs, or invoice details here.

## Current Event Requirements And Deployment Status

- Submission deadline: July 20, 2026 at 2:00 PM Pacific time.
- Judging ends: August 11, 2026 at 2:00 PM Pacific time, which is August 12 at
  05:00 in Singapore.
- The project must use Qwen models on Qwen Cloud. The MemoryAgent track requires
  persistent memory, preferences, and cross-session recall.
- The project must remain available to the sponsor, administrator, and judges
  free of charge and without testing restrictions through the end of judging.
  A private HandoffBase access token may be supplied in Devpost testing
  instructions; the Qwen provider key must remain backend-only.
- Devpost requires a public/open-source repository and license, an architecture
  diagram, a public demo video under three minutes, working demo access, and a
  link to a code file that demonstrates Alibaba Cloud services or APIs.
- Current deployment: live on Alibaba Cloud International ECS in Singapore at
  `https://47-236-247-69.sslip.io/mcp`.
- Current runtime proof: `authMode=api_key`, `providerMode=qwen`,
  `storeMode=postgres`, and `embeddingMode=qwen`.
- Durable-memory proof: the strict remote validator persisted two Qwen-created
  candidate memories; an exact memory remained after application restart; the
  database contains memory, trace, and embedding rows.
- Availability coverage: the prepaid ECS subscription expires on 2026-08-13 at
  08:59:59 Singapore time, more than one day after the judging window ends.
  Documented expiry behavior: the instance stops at expiration (endpoint
  offline) with disk data retained for 15 days before release, so the grace
  period protects data, not uptime. If the judging schedule is extended,
  renew before 2026-08-13; coupons are documented as applicable to ECS
  renewals subject to the coupon's scope and validity.
- Coupon posture: the ECS checkout used less than USD 22 of the USD 40 event
  coupon and charged no real money. Auto-renewal is disabled, and no paid cloud
  add-on was created for this deployment.
- Model cost controls: Alibaba Model Studio **Free Quota Only** is enabled for
  the exact deployed rows `qwen-plus-2025-09-11` and `text-embedding-v4`.
  Calls stop rather than becoming paid inference when either quota is exhausted.
  After final validation, 984,060 generation tokens and 999,628 embedding
  tokens remained; both quotas expire on 2026-10-11.
- Current cost plan (post-submission): keep the credentialed LongMemEval benchmark disabled
  through judging, monitor coupon and quota status, and do not add managed
  databases, snapshots, load balancers, paid security products, marketplace
  images, or traffic-billed networking.
- Canonical deployment proof: `docs/deployment/alibaba-cloud-proof.md`.
- Reproducible deployment bundle: `deploy/alibaba/`.

The official rules are the source of truth for the event requirements:
`https://qwencloud-hackathon.devpost.com/rules`.

## Historical 2026-07-08 China-Station Snapshot

The sections below preserve the earlier resource investigation and released
China-station deployment for audit history. They are not the current billing,
quota, endpoint, or availability state. The Beijing ECS instance was released
on 2026-07-12, so its stopped-instance relaunch advice must not be applied to
the live Singapore deployment.

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

- Status: submitted; verification is in progress. Gmail received a Qwen Cloud /
  Alibaba Cloud confirmation email with subject "Coupon Request Received -
  Verification in Progress". The email says the coupon form was submitted,
  registration verification is in progress, and activation typically takes 1-2
  business days. Private phone and company/institution values were entered
  directly in Chrome by the user and are not recorded here.
- Application URL:
  `https://www.qwencloud.com/challenge/hackathon/voucher-application`.
- Deadline: July 9, 2026 at 10:00 AM PST, per the live Devpost deadline update.
- If pending, support contact: `global.hackathon@alibaba-inc.com`.
- Next action:
  - Wait for the Qwen Cloud coupon activation confirmation email.
  - Check coupon status in Qwen Cloud benefits if activation is not visible
    after the expected review window.
  - If the request remains pending and urgent near the deadline, contact
    `global.hackathon@alibaba-inc.com`; the user should enter UID and phone
    number directly in email or the browser, not in chat or tracked files.
  - Do not print, save, or commit any voucher code if one becomes available.

## Alibaba Cloud Cost Guardrails

- ECS status: stopped in `cn-beijing` using economical stop mode, matching the
  existing ECS + Docker demo path documented in
  `docs/deployment/alibaba-cloud-proof.md`.
- Pay-as-you-go status: the ECS detail page showed pay-as-you-go billing.
- Instance shape: 2 vCPU / 2 GiB.
- Public networking: the stopped instance currently shows no public IP. The last
  running public endpoint is documented in the deployment proof, but it must be
  rechecked after restart because the IP may change.
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
- Stop/release recommendation: keep the ECS instance stopped until it is needed
  for demo/submission proof. Revalidate the endpoint before final submission
  after restart, then stop or release it after the approved hackathon window to
  avoid ongoing pay-as-you-go spend.

## Cost Runway Check

- Checked timestamp: 2026-07-08T10:05:41Z.
- Billing visibility: account-level balance and ECS bill-detail pages did not
  render in Chrome during this check; they stayed on loading skeletons. The
  estimate below uses the visible ECS resource shape plus conservative planning
  assumptions rather than exact billing ledger values.
- Balance bucket: about 100 RMB deposited; exact current balance was not
  visible.
- Current spend bucket: likely less than 5 RMB since the ECS instance was
  created on 2026-07-07 at 23:24 China time.
- Estimated burn before stop: about 0.17-0.21 RMB/hour, or about 4-5 RMB/day,
  for the running 2 vCPU / 2 GiB pay-as-you-go ECS instance plus 40 GiB system
  disk. Traffic was expected to be negligible for the demo unless the endpoint
  received real load.
- Estimated burn after stop: lower than the running estimate. Economical stop
  mode pauses compute and memory billing, while system disk and any retained
  attached resources continue billing.
- Runway from the 2026-07-08 check date:
  - July 20 submission date: about 12 days, estimated 48-60 RMB.
  - August 4 judging end: about 27 days, estimated 108-135 RMB.
  - August 7 winner announcement: about 30 days, estimated 120-150 RMB.
- Recommendation: keep ECS stopped until closer to submission, restart around
  July 17-18, then revalidate before final submission. The previous running
  estimate was likely enough to keep the demo online until July 20 but tight for
  August 4 or August 7 without more budget.
- Qwen guardrail: `qwen-plus-2025-07-28` shows 1,000,000 / 1,000,000 free
  tokens remaining and free-quota-only / stop-when-free-quota-runs-out enabled.
- Qwen paid usage: Bailian fee overview showed total model-platform spend `¥0`.
- Unexpected paid resources: no active RDS/PolarDB, ACK, load balancer, NAT
  Gateway, Elastic IP conversion, OSS bucket, Log Service project, paid
  Container Registry Enterprise instance, WAF, API Gateway, Function Compute
  workload, or snapshot service was found in the best-effort console sweep.
  Some pages only showed Resource Center or product authorization/open-service
  prompts, so this is still not a full Resource Center inventory.
- Stop/release action taken: after explicit user approval, ECS was stopped in
  economical stop mode on 2026-07-08T10:05:41Z. The instance was not released,
  resized, or converted to another paid service. The console showed `已停止` and
  `节省停机模式`; the previous public IP was no longer shown after stop.
- Safe runbook: see `docs/cloud-cost-runbook.md`.

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
- Rechecked cost runway for the running ECS demo. Billing pages stayed on
  loading skeletons, so the decision uses ECS resource posture plus a
  conservative 4-5 RMB/day planning estimate.
- Checked Bailian fee overview; total model-platform spend showed `¥0`.
- Checked the ECS snapshot page; snapshot service was not opened and no active
  snapshot resource was found.
- Created `docs/cloud-cost-runbook.md` with the safe stop/restart procedure and
  cost-continuation caveats.
- After explicit user approval, stopped the pay-as-you-go ECS instance in
  economical stop mode without releasing it.
- Found the Qwen Cloud voucher application endpoint from a Devpost discussion
  and verified that the URL redirects to Qwen Cloud SSO login.
- Rechecked the logged-in Qwen Cloud application page and confirmed the form is
  reachable but not yet filled or submitted.
- Opened Devpost account settings and confirmed Chrome was redirected to the
  Devpost login page, so account profile details were not available yet.
- Rechecked the preserved Devpost tab and confirmed it was still on the
  Devpost login page, so no account profile fields were available to transfer.
- Searched non-secret local files and public search results for a Devpost
  project/profile link; no reliable Devpost account or submission profile was
  found.
- After user login, read Devpost account/profile/preference settings and filled
  the Qwen form with Devpost-confirmed name, registered email, and
  role/specialty, without recording the private values.
- Rechecked the completed Qwen form after the user entered the remaining
  private fields directly in Chrome; all required fields were filled, the
  confirmation checkbox was checked, and the submit button was enabled.
- After explicit user confirmation, clicked Submit on the Qwen Cloud form. The
  request did not reach a confirmed submitted or pending state because the page
  displayed phone-number validation text.
- After the user corrected the submission directly in Chrome, Gmail received a
  Qwen Cloud / Alibaba Cloud confirmation email showing the coupon form was
  submitted and registration verification is in progress.

## Actions Requiring User Approval

- Entering UID, phone number, or other private participant details for voucher
  support or request submission.
- Contacting hackathon support with UID/phone if the coupon request remains
  pending and urgent.
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
- Devpost voucher discussion:
  `https://qwencloud-hackathon.devpost.com/forum_topics/44161-has-anyone-received-the-40-voucher-yet-how-long-does-approval-take`
- Qwen Cloud voucher application endpoint:
  `https://www.qwencloud.com/challenge/hackathon/voucher-application`
- Qwen Cloud free-quota docs:
  `https://docs.qwencloud.com/resources/free-quota`
- Alibaba Model Studio / Bailian console:
  `https://bailian.console.aliyun.com/`
- Alibaba Cloud billing/cost console:
  `https://billing-cost.console.aliyun.com/`
- Alibaba Cloud ECS console:
  `https://ecs.console.aliyun.com/`
