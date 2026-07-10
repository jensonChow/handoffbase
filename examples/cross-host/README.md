# Cross-host continuity over real HTTP/MCP

This example proves behavior through the same public boundary an MCP host uses. A real Express Streamable HTTP server binds to an ephemeral loopback port, and three official MCP SDK clients communicate with it using explicit fixture API-key authentication.

The deterministic scenario shows:

- Host B has no matching memory before Host A writes.
- Host A writes one active user preference and one active Project Alpha procedure.
- Host B, with the same authenticated user and Project Alpha scope but a different host identity, bootstraps and recalls both memories.
- Host C has an API key restricted to Project Beta. It can receive the user-scoped preference, but Project Beta recall cannot discover the Project Alpha procedure and an explicit Project Alpha request is denied.
- Host B inspects the final context-pack trace and its linked retrieval trace.
- Host B invalidates the procedure; its later context and final trace no longer use that memory, while the linked retrieval trace explains the lifecycle exclusion.

No `.env` file, Qwen call, remote endpoint, Postgres instance, cloud service, or fixed external port is used. The in-process runtime is explicitly constructed with `InMemoryMemoryStore`, `MockMemoryProvider`, and fixture-only API keys.

## Run the automated proof

Build the existing TypeScript packages, then run the nested E2E test explicitly:

```bash
npm run build --workspace @handoffbase/memory-core
npm run build:server
node --test test/e2e/cross-host-http.test.mjs
```

The current root `test:server` glob covers only `test/*.test.mjs`, so it does not discover `test/e2e/*.test.mjs`. The integration branch can add the explicit E2E command to the root test/CI chain when package-script ownership is available.

## Run the human-readable demo

After the same build commands:

```bash
node scripts/e2e/cross-host-demo.mjs
```

The demo prints only safe counts, statuses, generated memory/event/trace IDs, and boolean proof summaries. It never prints fixture API keys or full memory content.

For the persistence replay and required server-restart checkpoint, see [the cross-host E2E workstream note](../../docs/workstreams/cross-host-e2e.md).
