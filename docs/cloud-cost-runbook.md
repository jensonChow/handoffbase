# Cloud Cost Runbook

Last checked: 2026-07-08T10:05:41Z

This runbook records the safe cost-control path for the Alibaba Cloud ECS demo.
Do not add API keys, auth tokens, cookies, UID, phone number, account IDs,
payment details, invoice details, coupon/voucher codes, or `.env.*` contents.

## Current Cost Posture

- Deployment: single Alibaba Cloud ECS instance running Docker; the live app is
  paused because the ECS instance is now stopped.
- Region: `cn-beijing` / North China 2 (Beijing).
- Instance ID: `i-2ze79rc2xe68zx1xeahu`.
- Instance status: stopped in economical stop mode.
- Billing mode: pay-as-you-go.
- Instance shape: `ecs.e-c1m1.large`, 2 vCPU / 2 GiB.
- Public endpoint: unavailable while stopped. The last running public endpoint
  was `http://123.56.244.157`; the console now shows no public IP, so the IP may
  change when the instance is started again.
- Public bandwidth: 5 Mbps peak, traffic billing. No demo traffic should accrue
  while the instance is stopped.
- System disk: 40 GiB ESSD Entry cloud disk.
- Snapshot service: not opened in the current console check; no active snapshot
  resource was found.
- Qwen model path: `qwen-plus-2025-07-28` has 1,000,000 / 1,000,000 free
  tokens remaining and free-quota-only / stop-when-free-quota-runs-out enabled.
- Bailian fee overview: total model-platform spend showed `¥0`.
- Relaunch procedure: use `docs/deployment/relaunch-runbook.md` before starting
  the stopped ECS instance for submission or judging validation.

The billing/cost pages did not render account-level balance or ECS bill details
in Chrome during this check; they stayed on loading skeletons. The runway
estimate therefore uses the visible ECS resource shape and a conservative
planning range rather than exact billing ledger values.

## Runway Estimate

- Balance bucket: about 100 RMB deposited; exact current balance was not
  visible.
- Current spend bucket: likely less than 5 RMB since the ECS instance was
  created on 2026-07-07 at 23:24 China time.
- Pre-stop planning burn rate: about 0.17-0.21 RMB/hour, or about 4-5 RMB/day,
  for the running 2 vCPU / 2 GiB pay-as-you-go ECS instance plus system disk.
  Traffic was expected to be negligible for the demo unless the endpoint received
  real load.
- Current paused burn rate: lower than the running estimate. Economical stop mode
  pauses compute and memory billing, while the system disk and any retained
  attached resources continue billing.
- Days from the 2026-07-08 check:
  - July 20 submission date: about 12 days.
  - August 4 judging end: about 27 days.
  - August 7 winner announcement: about 30 days.
- Estimated cost from 2026-07-08:
  - To July 20: about 48-60 RMB.
  - To August 4: about 108-135 RMB.
  - To August 7: about 120-150 RMB.

Decision taken: after explicit user approval, stop the ECS instance now in
economical stop mode and restart it around July 17-18 for final submission
validation. Keeping it online until July 20 was probably affordable from a
100 RMB deposit, but keeping it online through August 4 or August 7 was likely
tight without more budget or a lower-cost plan.

## Stop Result

- Stop timestamp: 2026-07-08T10:05:41Z.
- Stop action: ECS instance stopped; instance was not released.
- Stop mode: economical stop mode / savings stop mode.
- Console status after stop: `已停止` / stopped, with `节省停机模式` shown.
- Billing behavior shown in the stop dialog: compute resources, memory, image
  license fees, and fixed-bandwidth fixed public IP charges pause where
  applicable; system disks, data disks, and fixed-bandwidth EIP resources continue
  billing.
- Current public endpoint status: unavailable. The console no longer shows the
  previous public IP, so recheck the public IP after restart before validating or
  publishing the endpoint.

## Before Stopping

Revalidate the demo and record only non-secret facts:

```sh
curl -sS http://123.56.244.157/health
MCP_VALIDATION_PROFILE=alibaba-demo MCP_ENDPOINT=http://123.56.244.157/mcp MCP_AUTH_TOKEN=<redacted> npm run mcp:validate-remote
```

Record:

- ECS instance ID: `i-2ze79rc2xe68zx1xeahu`.
- Region: `cn-beijing`.
- Docker image tag: `handoffbase:b565210-20260707T160422Z`.
- Container name: record from ECS host without logging env values.
- Env file path location: root-owned ECS env file consumed by Docker
  `--env-file`; never record values.
- Public endpoint: `http://123.56.244.157`.

## Stop Options

- Stop container only: useful to stop the app, but it does not stop ECS compute
  billing while the instance remains running.
- Stop ECS instance: requires explicit user approval. Prefer graceful stop.
  For pay-as-you-go VPC instances, Alibaba Cloud offers standard mode and
  economical mode:
  - Standard mode retains resources and billing continues.
  - Economical mode stops billing for vCPU/memory and releases compute
    resources. System/data disks continue billing, and a static public IP may be
    released and change on restart.
- Release ECS instance: permanent teardown. Do this only if the user explicitly
  chooses permanent release after backing up proof materials and confirming that
  the public demo is no longer needed.

## Costs That May Continue After Stop

- System disk and any data disks.
- Snapshots, if created later.
- EIP public bandwidth, if converted to or attached as an Elastic IP.
- Other attached resources such as load balancers, NAT gateways, managed
  databases, log services, or storage buckets if created later.

The current console check did not show an active EIP conversion, snapshot
service, RDS/PolarDB, ACK, load balancer, NAT gateway, OSS bucket, Log Service
project, paid Container Registry Enterprise instance, WAF, API Gateway, or
Function Compute workload.

## Restart Steps

Use `docs/deployment/relaunch-runbook.md` as the detailed restart, validation,
recording, availability, and teardown checklist. The short version is:

1. Start the ECS instance in `cn-beijing`.
2. Check the new public IP. The instance is currently stopped without a public IP
   shown, so do not assume `123.56.244.157` still works.
3. SSH or use Workbench without printing secrets.
4. Start the Docker container with the root-owned env file:

   ```sh
   docker start <container-name>
   ```

5. Revalidate:

   ```sh
   curl -sS http://<public-ip>/health
   MCP_VALIDATION_PROFILE=alibaba-demo MCP_ENDPOINT=http://<public-ip>/mcp MCP_AUTH_TOKEN=<redacted> npm run mcp:validate-remote
   ```

6. Update `docs/deployment/alibaba-cloud-proof.md` only if the public endpoint
   or proof timestamp changes.

## Timeline

- The ECS instance is currently stopped in economical stop mode for cost savings.
  Restart around July 17-18, then revalidate before submission using
  `docs/deployment/relaunch-runbook.md`.
- Keep the service online through submission and any required judging window if
  budget allows.
- If the demo is submitted before July 20, avoid extended downtime during
  judging unless availability is not required or the user explicitly accepts
  that risk.
- Stop or release the ECS instance after the approved hackathon demo window.

## Secret Rules

- Keep env values only in ignored local `.env.*` files or cloud/ECS secret
  configuration.
- Never copy secrets into docs, chat, screenshots, videos, shell history, or Git.
- Do not print API keys, auth tokens, payment details, UID, phone number,
  coupon/voucher codes, invoice identifiers, or account identifiers.

## References

- Alibaba Cloud ECS stop billing behavior:
  https://www.alibabacloud.com/help/en/ecs/user-guide/stop-an-instance
- Qwen Cloud free quota behavior:
  https://docs.qwencloud.com/resources/free-quota
