# Testing Instructions

These instructions are safe for judges and contributors. They use local mock
mode by default and do not require real Qwen credentials, Alibaba Cloud access,
or a live remote endpoint.

## Local Testing

Use Node.js 22 or newer.

```bash
npm install
npm run check
npm run eval:memory
npm run bench:memory
npm run bench:longmemeval:tiny
npm run e2e:cross-host
npm run test:dashboard
npm run dashboard:build
npm run dashboard:dev
```

What each command covers:

- `npm run check` runs the CI-parity validation path: typecheck, build, MCP
  registration smoke, memory-core/auth/runtime/server/dashboard tests, the
  local eval, comparative benchmark, LongMemEval tiny fixture, real HTTP/MCP
  cross-host E2E, Markdown relative-link check, and tracked-file secret scan.
- `npm run eval:memory` runs the deterministic AI Opportunity Scout memory eval
  pack. It uses local modules, the in-memory store, and a deterministic provider
  path. It does not call Qwen or a remote endpoint.
- `npm run bench:memory` compares the same 17 synthetic cases under no-memory
  and HandoffBase. The recorded result is 0/17 versus 17/17 with 34/34
  expectation conformance; it is not an official benchmark score.
- `npm run bench:longmemeval:tiny` exercises the cleaned-format adapter across
  three backends with a synthetic fixture, mock provider, deterministic reader,
  and network disabled. It does not invoke an official evaluator.
- `npm run e2e:cross-host` uses official MCP SDK clients against a real local
  Streamable HTTP server to prove auth, host handoff, scope isolation, trace
  linkage, and forgetting.
- `npm run test:dashboard` and `npm run dashboard:build` verify the server-backed
  dashboard path.
- `npm run dashboard:dev` starts the HandoffBase Memory Vault dashboard
  using same-origin server APIs and a seeded in-memory backend by default. Set
  `HANDOFFBASE_DASHBOARD_CLIENT_MODE=mock` only for fixture-only mock mode.

These commands need no Qwen key, database, Docker daemon, remote endpoint, or
cloud resource.

## Qwen-Backed Local Mode

Local development works without Qwen credentials. To test the Qwen-backed path
with your own key, create a local ignored env file:

```bash
cp .env.example .env.local
```

Then set one backend provider key in `.env.local` or in your shell:

- `QWEN_API_KEY`
- `DASHSCOPE_API_KEY`

Do not commit `.env.*` files. Do not share Qwen keys with judges, MCP hosts, or
public docs. Qwen and DashScope credentials stay on the backend only.

## Postgres Runtime And Migration

The default remains credential-free `STORE_MODE=in-memory`. For an isolated
Postgres environment, apply the migration explicitly before starting either the
MCP runtime or the dashboard:

```bash
DATABASE_URL=<postgres-url> npm run db:migrate
STORE_MODE=postgres DATABASE_URL=<postgres-url> npm run dev:server
```

The dashboard uses the same `STORE_MODE` and `DATABASE_URL`; Postgres mode also
requires private server-side `HANDOFFBASE_DASHBOARD_TENANT_ID` and
`HANDOFFBASE_DASHBOARD_USER_ID` scope values.

`TEST_DATABASE_URL=<dedicated-test-database-url> npm run test:postgres:integration`
runs the optional database integration case. Without that variable, the case
skips. On a Docker-capable machine, `npm run test:postgres:restart` runs the
disposable restart harness. Docker was unavailable in the integration
environment, so that harness has not been reported as passed.

## Later Full LongMemEval Run

The official cleaned dataset must be obtained separately and kept outside the
repository. After reviewing credentials, quota, cost, timeout, dataset version,
and evaluator configuration, securely export `QWEN_API_KEY` or
`DASHSCOPE_API_KEY` in the shell and run:

```bash
QWEN_MODEL=qwen-plus npm run bench:longmemeval -- \
  --dataset /absolute/path/to/longmemeval_s_cleaned.json \
  --output-dir /absolute/path/to/longmemeval-qwen-results \
  --backend handoffbase \
  --reader qwen \
  --memory-provider qwen
```

The npm command builds the required packages. It produces hypotheses and
internal retrieval evidence but does not invoke the official LongMemEval QA
evaluator. Run that evaluator separately under pinned upstream instructions
before reporting a score. No official dataset was downloaded, no full
credentialed run was completed, and no official score exists yet.

## Remote Deployment Testing

The Alibaba Cloud ECS endpoint may be paused to control pay-as-you-go cost. Do
not assume the public endpoint is online until it has been restarted and
revalidated.

Once the deployment is reactivated, judges can validate the remote MCP service
with temporary HandoffBase access credentials:

```bash
MCP_ENDPOINT=<deployed-mcp-url>
MCP_AUTH_TOKEN=<temporary-handoffbase-demo-key>
npm run mcp:validate-remote
```

The remote validator checks:

- `/health`
- MCP `tools/list`
- authenticated `memory_recall`
- authenticated Qwen-backed `memory_remember`

The Qwen API key is never shared with judges. The HandoffBase API key is
separate from the Qwen key; it only protects the HandoffBase MCP endpoint and
can be rotated after testing. Do not include a real endpoint auth token in
tracked files, screenshots, or public comments.

The redacted deployment proof lives in
[`docs/deployment/alibaba-cloud-proof.md`](../deployment/alibaba-cloud-proof.md).
It records non-secret evidence for the Alibaba Cloud ECS + Docker deployment,
including `/health`, MCP discovery, `memory_recall`, and Qwen-backed
`memory_remember`.

## Current Runtime Truth

The deployment proof uses:

```text
authMode=api_key
providerMode=qwen
storeMode=in-memory
```

That means the historical proof is Qwen-backed and API-key protected, but its
runtime store is the in-memory demo store. The integrated code now has explicit
Postgres runtime selection and migration, but that path has not been deployed
to Alibaba Cloud or validated as production storage.

## Secret Rules

- Never commit `.env.*` files.
- Never paste Qwen, DashScope, HandoffBase, cloud, database, cookie, or auth
  header values into tracked files.
- Use placeholders in docs and public commands.
- Keep temporary HandoffBase demo keys separate from Qwen provider keys.
- Rotate or delete temporary demo access after judging.
