# Cloud Cost Runbook

Last checked: 2026-07-08T08:35:51Z

This runbook records the safe cost-control path for the Alibaba Cloud ECS demo.
Do not add API keys, auth tokens, cookies, UID, phone number, account IDs,
payment details, invoice details, coupon/voucher codes, or `.env.*` contents.

## Current Cost Posture

- Deployment: single Alibaba Cloud ECS instance running Docker.
- Region: `cn-beijing` / North China 2 (Beijing).
- Instance ID: `i-2ze79rc2xe68zx1xeahu`.
- Instance status: running.
- Billing mode: pay-as-you-go.
- Instance shape: `ecs.e-c1m1.large`, 2 vCPU / 2 GiB.
- Public endpoint: `http://123.56.244.157`.
- Public bandwidth: 5 Mbps peak, traffic billing.
- System disk: 40 GiB ESSD Entry cloud disk.
- Snapshot service: not opened in the current console check; no active snapshot
  resource was found.
- Qwen model path: `qwen-plus-2025-07-28` has 1,000,000 / 1,000,000 free
  tokens remaining and free-quota-only / stop-when-free-quota-runs-out enabled.
- Bailian fee overview: total model-platform spend showed `¥0`.

The billing/cost pages did not render account-level balance or ECS bill details
in Chrome during this check; they stayed on loading skeletons. The runway
estimate therefore uses the visible ECS resource shape and a conservative
planning range rather than exact billing ledger values.

## Runway Estimate

- Balance bucket: about 100 RMB deposited; exact current balance was not
  visible.
- Current spend bucket: likely less than 5 RMB since the ECS instance was
  created on 2026-07-07 at 23:24 China time.
- Planning burn rate: about 0.17-0.21 RMB/hour, or about 4-5 RMB/day, for the
  running 2 vCPU / 2 GiB pay-as-you-go ECS instance plus system disk. Traffic is
  expected to be negligible for the demo unless the endpoint receives real load.
- Days from the 2026-07-08 check:
  - July 20 submission date: about 12 days.
  - August 4 judging end: about 27 days.
  - August 7 winner announcement: about 30 days.
- Estimated cost from 2026-07-08:
  - To July 20: about 48-60 RMB.
  - To August 4: about 108-135 RMB.
  - To August 7: about 120-150 RMB.

Recommendation: if the project has not been submitted and live availability is
not needed today, ask before stopping the ECS instance now and restart it around
July 17-18 for final submission validation. Keeping it online until July 20 is
probably affordable from a 100 RMB deposit, but keeping it online through August
4 or August 7 is likely tight without more budget or a lower-cost plan.

## Before Stopping

Revalidate the demo and record only non-secret facts:

```sh
curl -sS http://123.56.244.157/health
MCP_ENDPOINT=http://123.56.244.157/mcp MCP_AUTH_TOKEN=<redacted> npm run mcp:validate-remote
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

1. Start the ECS instance in `cn-beijing`.
2. Check whether the public IP stayed `123.56.244.157` or changed.
3. SSH or use Workbench without printing secrets.
4. Start the Docker container with the root-owned env file:

   ```sh
   docker start <container-name>
   ```

5. Revalidate:

   ```sh
   curl -sS http://<public-ip>/health
   MCP_ENDPOINT=http://<public-ip>/mcp MCP_AUTH_TOKEN=<redacted> npm run mcp:validate-remote
   ```

6. Update `docs/deployment/alibaba-cloud-proof.md` only if the public endpoint
   or proof timestamp changes.

## Timeline

- If cost savings matter before submission, stop after explicit approval and
  restart around July 17-18.
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
