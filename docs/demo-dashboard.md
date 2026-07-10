# HandoffBase Memory Vault Demo

This guide is for recording the local dashboard demo. The browser uses
same-origin HTTP API routes by default. With the default
`STORE_MODE=in-memory`, those routes use a server-side in-memory store seeded
with demo data and require no Qwen credentials, API keys, Alibaba endpoint, or
database. Mock mode is now an explicit fixture-only option.

## Run Locally

Install dependencies if needed:

```bash
npm install
```

Start the dashboard:

```bash
npm run dashboard:dev
```

Open the local URL printed by Next.js, usually:

```text
http://localhost:3000
```

The status strip should report `server_in_memory`. To bypass the server API and
use the isolated browser fixture client instead:

```bash
HANDOFFBASE_DASHBOARD_CLIENT_MODE=mock npm run dashboard:dev
```

That explicit mode reports `mock_demo`.

Build verification:

```bash
npm run test:dashboard
npm run dashboard:build
```

Run the aggregate check when there is enough time:

```bash
npm run check
```

## Recording Path

1. Open **HandoffBase Memory Vault** and show the status strip.
2. In **Memory Vault**, search for `opportunity` and select the user preference memory.
3. Show the canonical memory text, scope, source, validity reason, and audit events.
4. Open **Memory Trace** and select the opportunity-ranking trace.
5. Show the context pack, used memories, ignored memory, excluded superseded memory, and reasons.
6. Open **Pending Review** and show the Qwen-extracted candidate memories.
7. Approve one candidate, then invalidate or delete another if the recording needs a governance action.
8. Open **Resolve Memory Conflicts** and show the candidate memory versus existing prize-money memory, conflict type, severity, and recommended action.

## Demo Data Story

The seeded dashboard data follows the AI Opportunity Scout scenario:

- User preference: prioritize credentials, founder network, and startup resources over prize money alone.
- Procedure: verify deadline, timezone, eligibility region, and official rules before recommending an event.
- Failure memory: avoid recommending events when official rules exclude the user's region.
- Conflict: supersede an older prize-money preference with the newer founder-network and credentials preference.

## Safety Notes

- The default local demo uses same-origin HTTP plus a server-side in-memory
  backend; mock mode must be selected explicitly.
- Do not connect this demo to the deployed ECS backend.
- Do not add auth, database wiring, or remote endpoint configuration for this recording.
- Keep secrets only in ignored local or cloud secret configuration.

## Shared Postgres Mode

For a private local/operator setup, the dashboard and MCP runtime can point at
the same migrated database:

```bash
DATABASE_URL=<postgres-url> npm run db:migrate
STORE_MODE=postgres \
DATABASE_URL=<postgres-url> \
HANDOFFBASE_DASHBOARD_TENANT_ID=<tenant-id> \
HANDOFFBASE_DASHBOARD_USER_ID=<user-id> \
npm run dashboard:dev
```

Optional server-only filters are
`HANDOFFBASE_DASHBOARD_AGENT_PROFILE_ID`,
`HANDOFFBASE_DASHBOARD_PROJECT_ID`, and
`HANDOFFBASE_DASHBOARD_HOST_ID`. Postgres mode disables demo seeding and reports
`shared_persistent_store`. The tenant and user values are required and must
remain private; do not replace them with `NEXT_PUBLIC_*` variables. This is a
runtime path, not evidence of a production database deployment.
