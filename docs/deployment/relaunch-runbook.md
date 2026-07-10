# Alibaba ECS Relaunch Runbook

Last updated: 2026-07-08T16:39:10Z

This runbook describes how to bring the stopped Alibaba Cloud ECS demo back
online, validate it, keep it available only as long as needed, and stop or
release it safely later. It is intentionally non-secret: do not add API keys,
auth tokens, cloud credentials, cookies, UID, phone number, coupon/voucher
codes, payment data, database URLs, auth headers, or `.env.*` contents.

The ECS instance is currently stopped for cost control. Do not claim the public
endpoint is online until the instance has been restarted and revalidated.

## Current Known Deployment Facts

- Alibaba Cloud service: ECS.
- Region: `cn-beijing` / North China 2 (Beijing).
- Instance ID: `i-2ze79rc2xe68zx1xeahu`.
- Deployment shape: single ECS instance running Docker.
- Last running public endpoint from proof: `http://123.56.244.157`.
- Last running MCP endpoint from proof: `http://123.56.244.157/mcp`.
- The public IP may change after restart because the stopped console state no
  longer showed the previous public IP.
- Source commit used for the proof image: `b565210`.
- Docker image tag from proof: `handoffbase:b565210-20260707T160422Z`.
- Runtime store: `in-memory`.
- Provider: Qwen when the ECS environment is configured correctly.
- Auth: HandoffBase API key supplied through ECS environment configuration.
- Runtime secret location: root-owned ECS env file consumed by Docker
  `--env-file`; values are not recorded in this repo.

## What Is Intentionally Not In Repo

- Qwen API key or DashScope API key.
- HandoffBase API key or MCP auth token.
- Qwen workspace-specific base URL if it exposes private workspace metadata.
- ECS env file contents or secret-bearing shell commands.
- Alibaba Cloud credentials, cookies, auth headers, account IDs, UID, phone
  number, coupon/voucher codes, or payment data.
- Database URLs such as `DATABASE_URL` or `POSTGRES_URL`.

## Before Restart

- Confirm the user still wants to run pay-as-you-go ECS for the demo window.
- Confirm the current budget and expected availability window.
- Confirm coupon/free-quota status if the demo may receive real usage.
- Confirm no additional resources are being created.
- Confirm the restart is for the existing ECS + Docker deployment, not a new
  paid service.
- Confirm no secrets will be pasted into docs, chat, screenshots, or command
  logs.

## Restart Checklist

1. Start the existing ECS instance from the Alibaba Cloud console.
2. Verify the instance is still in `cn-beijing` and note the current public IP.
3. Access the host through Workbench or another approved shell method.
4. Check Docker without printing env values:

   ```sh
   docker --version
   systemctl status docker
   docker ps -a
   ```

5. If the HandoffBase container still exists, start it:

   ```sh
   docker start <container-name>
   ```

6. If the container was removed, recreate it from the documented image/source
   commit and the existing ECS env file. Do not print the env file.
7. If the image was removed, rebuild or rerun from the documented source commit
   and image tag path in `docs/deployment/alibaba-cloud-proof.md`.
8. Ensure the root-owned ECS env file exists and is loaded by Docker
   `--env-file`; verify only key names or Docker status, never values.
9. Confirm HTTP port 80 is reachable and no extra paid networking resource was
   added.

## Validation Checklist

Check health first:

```sh
curl -sS http://<public-ip>/health
curl -sS http://<public-ip>/ready
```

Expected non-secret health fields:

```json
{
  "authMode": "api_key",
  "providerMode": "qwen",
  "storeMode": "in-memory"
}
```

Then run the remote MCP validator with the endpoint and token supplied only
through the shell environment:

```sh
MCP_VALIDATION_PROFILE=alibaba-demo MCP_ENDPOINT=http://<public-ip>/mcp MCP_AUTH_TOKEN=<redacted> npm run mcp:validate-remote
```

`/health` proves liveness; `/ready` probes the configured dependencies and must
return HTTP 200. The store check runs every time. In Qwen mode the first
provider check uses one token, then the result is cached for five minutes so
polling cannot repeatedly consume model quota.

Verify:

- `tools/list` returns the registered memory tools.
- `memory_recall` returns memories and a trace id.
- `memory_remember` exercises the Qwen-backed provider path and returns
  candidate memories.

If `/health` reports `providerMode=mock`, inspect Qwen/DashScope env key names,
model, timeout, and base URL on ECS without printing secret values. If auth
fails, inspect HandoffBase auth env key names and container env loading without
printing the API key.

## Recording And Submission Checklist

- Record the main product demo after the restarted endpoint is validated.
- Record the Alibaba backend proof video with `/health`, MCP validation, and the
  ECS + Docker shape visible without exposing secrets.
- Update Devpost testing instructions with the current endpoint only after
  revalidation.
- Do not show API keys, bearer tokens, auth headers, Qwen workspace metadata,
  ECS env file contents, UID, phone, coupon/voucher codes, payment data, or
  browser cookies.
- If judges need live access, provide a temporary HandoffBase demo token only in
  private testing instructions, not in the public repo.

## Availability Strategy

- Before the July 20 submission deadline: if cost is a concern, restart a few
  days before submission, record proof, submit, and keep the public status
  honest.
- During judging: if official rules require endpoint availability, keep the
  endpoint online through the required judging window if budget allows.
- If the endpoint is stopped during any submission or judging period, say
  clearly that the live endpoint may be offline and rely on proof video/docs for
  historical validation.
- After the judging or demo window, stop or release ECS according to explicit
  user approval.

## Stop Or Release Checklist

1. Confirm proof has already been recorded and uploaded where needed.
2. Stop the HandoffBase container if the app should stop before the host:

   ```sh
   docker stop <container-name>
   ```

3. Stop ECS if preserving the instance for later restart.
4. Release ECS only if permanent teardown is explicitly approved.
5. Check whether disk, IP, bandwidth, snapshot, or attached-resource charges may
   remain.
6. Rotate or delete any temporary HandoffBase demo token shared with judges.
7. Rotate or delete the dedicated Qwen key after the hackathon if no longer
   needed.

## Troubleshooting

- Docker Hub timeout: the proof deployment needed an alternate registry mirror
  for the `node:22-slim` base image while keeping the repo Dockerfile unchanged.
- Public IP changed: recheck the ECS console after restart and update validation
  commands before recording or sharing the endpoint.
- HTTP port blocked: check the security group and container port mapping without
  opening extra application ports.
- `authMode` mismatch: check HandoffBase auth env names and Docker env loading
  without printing key values.
- `providerMode` mismatch: check Qwen/DashScope env names, model, timeout, and
  base URL without printing secret values.
- Qwen free quota exhausted: stop model calls, check the free-quota guardrail,
  and ask the user before enabling any paid usage.
- CORS errors: not relevant for CLI MCP validation; validate with `/health` and
  the Streamable HTTP MCP client first.
- In-memory store reset: expected after container restart because the current
  runtime store is `in-memory`.

## Related Docs

- `docs/deployment/alibaba-cloud-proof.md`
- `docs/cloud-cost-runbook.md`
- `docs/hackathon-resource-support.md`
- `docs/dev-materials-checklist.md`
- `docs/handoff.md`
