# HandoffBase Memory Vault Demo

This guide is for recording the local dashboard demo. The browser uses
same-origin HTTP API routes by default. With the default
`STORE_MODE=in-memory`, those routes use a server-side in-memory store seeded
with demo data and require no Qwen credentials, API keys, Alibaba endpoint, or
database. Mock mode is now an explicit fixture-only option.

## Run Locally

Install dependencies if needed:

```bash
npm ci
```

Start the dashboard:

```bash
npm run dashboard:dev
```

Open the local URL printed by Next.js, usually:

```text
http://localhost:3001
```

If macOS reports `EMFILE: too many open files` or the dev watcher temporarily
returns 404, use the polling fallback:

```bash
WATCHPACK_POLLING=true npm run dashboard:dev
```

This keeps local auth-disabled demo behavior and avoids switching to production
mode just to work around a watcher limit.

The MCP server keeps its default port `3000`, so both processes can run at the
same time. In the default in-memory modes they still use separate process-local
stores: the dashboard shows its own seeded fixture through the Next.js API, not
the MCP server's in-memory records.

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
6. In **Feedback loop**, choose **Unhelpful**, enter an observable reason and a
   durable correction, then submit. Show the persisted feedback, pending
   correction id, and **Copy runnable draft** control without displaying private
   or identifying data.
7. Open **Pending Review** and show the Qwen-extracted and user-correction
   candidate memories.
8. Approve one candidate, then invalidate or hard-delete another if the
   recording needs a governance action. Use **Audit / Deletes** to show that a
   safe deletion tombstone remains after the memory disappears.
9. Open **Resolve Memory Conflicts**, compare the candidate with the existing
   prize-money memory, select one of the six actions, enter the required audit
   reason (and merged text for **Merge**), then resolve the conflict.

## Demo Data Story

The seeded dashboard data follows the AI Opportunity Scout scenario:

- User preference: prioritize credentials, founder network, and startup resources over prize money alone.
- Procedure: verify deadline, timezone, eligibility region, and official rules before recommending an event.
- Failure memory: avoid recommending events when official rules exclude the user's region.
- Conflict: supersede an older prize-money preference with the newer founder-network and credentials preference.

## Safety Notes

- The default local demo uses same-origin HTTP plus a server-side in-memory
  backend; mock mode must be selected explicitly.
- The dashboard's in-memory backend is separate from the MCP server's in-memory
  backend. Use shared Postgres mode when both processes must see the same data.
- Local `HANDOFFBASE_AUTH_MODE=disabled` opens the seeded demo without sign-in.
  With `HANDOFFBASE_AUTH_MODE=api_key`, the dashboard exchanges a HandoffBase
  API key for a signed HttpOnly cookie and requires the server-only
  `HANDOFFBASE_DASHBOARD_SESSION_SECRET` to contain at least 32 characters.
- Do not connect this demo to the deployed ECS backend.
- For a fixture-only recording, keep auth disabled and do not add database or
  remote-endpoint configuration. For an authentication walkthrough, use only a
  synthetic local API-key mapping and never display the key.
- Keep secrets only in ignored local or cloud secret configuration.

## Shared Postgres Mode

For a private local/operator setup, the dashboard and MCP runtime can point at
the same migrated database:

```bash
DATABASE_URL=<postgres-url> npm run db:migrate
STORE_MODE=postgres \
DATABASE_URL=<postgres-url> \
npm run dashboard:dev
```

The signed dashboard session derives tenant/user identity from the authenticated
HandoffBase API-key mapping. Optional server-only hierarchical view filters are
`HANDOFFBASE_DASHBOARD_TENANT_ID`, `HANDOFFBASE_DASHBOARD_USER_ID`,
`HANDOFFBASE_DASHBOARD_AGENT_PROFILE_ID`,
`HANDOFFBASE_DASHBOARD_PROJECT_ID`, and
`HANDOFFBASE_DASHBOARD_HOST_ID`. Postgres mode disables demo seeding and reports
`shared_persistent_store`. These values include globally scoped records plus
records matching the configured dimension and exclude other dimension values;
they only narrow the authenticated caller view and do not establish identity.
Keep them server-only and do not replace
them with `NEXT_PUBLIC_*` variables. This is a runtime path, not evidence of a
production database deployment.
