# Testing Instructions

These instructions are safe for judges and contributors. They use local mock
mode by default and do not require real Qwen credentials, Alibaba Cloud access,
or a live remote endpoint.

## Local Testing

Use Node.js 22 or newer.

```bash
npm ci
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
  `HANDOFFBASE_DASHBOARD_CLIENT_MODE=mock` only for fixture-only mock mode. The
  dashboard listens on `http://localhost:3001`, leaving port `3000` for MCP.

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

`npm run dev:server` and `npm run start:server` automatically pass `.env.local`
to Node when the file exists. When it does not exist, they use the current shell
or cloud environment without failing. The launcher never prints values.

If `HANDOFFBASE_AUTH_MODE=api_key` is also used for the dashboard, configure a
server-only `HANDOFFBASE_DASHBOARD_SESSION_SECRET` of at least 32 characters.
The dashboard uses it to sign an HttpOnly session cookie after API-key sign-in;
never commit or expose the secret through `NEXT_PUBLIC_*`.

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

The dashboard uses the same `STORE_MODE` and `DATABASE_URL`. Its signed caller
session derives tenant/user identity from the HandoffBase API-key mapping;
optional server-only `HANDOFFBASE_DASHBOARD_*` values only narrow that grant.

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

The judging backend is live on Alibaba Cloud International ECS in Singapore:

```text
Origin: https://47-236-247-69.sslip.io
MCP:    https://47-236-247-69.sslip.io/mcp
Health: https://47-236-247-69.sslip.io/health
```

The service is API-key protected. Put a temporary HandoffBase judge token in
the private Devpost testing-instructions field before submission. Do not put
the token in public copy, screenshots, tracked files, or the demo video.

Judges can validate the remote MCP service from a checkout of the public
repository:

```bash
EXPECTED_AUTH_MODE=api_key \
EXPECTED_PROVIDER_MODE=qwen \
EXPECTED_STORE_MODE=postgres \
EXPECTED_EMBEDDING_MODE=qwen \
MCP_ENDPOINT=https://47-236-247-69.sslip.io/mcp \
MCP_AUTH_TOKEN=<temporary-handoffbase-demo-key> \
npm run mcp:validate-remote
```

Do not use the legacy `alibaba-demo` profile for this deployment; that profile
expects the released China proof's in-memory store. The explicit assertions
above cover the current Postgres and Qwen-embedding runtime. Omit them only for
mode discovery. Every run checks the exact current nine-tool manifest.

The remote validator also checks:

- `/health`
- `/ready` returns HTTP 200 for live store/provider dependencies
- MCP `tools/list`
- authenticated `memory_recall`
- authenticated Qwen-backed `memory_remember`

The store readiness check runs on every request. Qwen readiness uses a live
one-token probe and the deployed runtime caches successful readiness for one
hour so polling cannot repeatedly consume model quota. `/ready` requires the
same HandoffBase token; unauthenticated requests return HTTP 401. Use
`MCP_SKIP_READINESS=1` only for a legacy deployment that does not expose
`/ready`; it does not skip the current tool-manifest checks.

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

The current Singapore deployment uses:

```text
authMode=api_key
providerMode=qwen
storeMode=postgres
embeddingMode=qwen
```

Strict remote validation passed through the public HTTPS hostname. It returned
the exact nine-tool manifest, a recall trace, and two persisted Qwen-created
pending candidates. An exact memory remained after the application container
was restarted, and Postgres contained memory, trace, and embedding rows. See
[`docs/deployment/alibaba-cloud-proof.md`](../deployment/alibaba-cloud-proof.md)
for the dated, non-secret evidence.

The released 2026-07-07 Beijing proof used `storeMode=in-memory` over HTTP and
is preserved only as historical evidence. It is not the endpoint or runtime
judges should test.

## Secret Rules

- Never commit `.env.*` files.
- Never paste Qwen, DashScope, HandoffBase, cloud, database, cookie, or auth
  header values into tracked files.
- Use placeholders in docs and public commands.
- Keep temporary HandoffBase demo keys separate from Qwen provider keys.
- Rotate or delete temporary demo access after judging.
