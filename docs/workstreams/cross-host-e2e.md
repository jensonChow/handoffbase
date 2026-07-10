# Cross-host HTTP/MCP E2E workstream

## What this branch proves

`test/e2e/cross-host-http.test.mjs` and `scripts/e2e/cross-host-demo.mjs` share one scenario runner. All memory behavior crosses the real Express Streamable HTTP transport through official MCP SDK clients; the runner only constructs the injected service and never calls a service or store method directly.

The default proof is intentionally credential-free and deterministic:

- explicit API-key auth options with synthetic fixture values;
- `InMemoryMemoryStore`;
- `MockMemoryProvider`;
- `seedDemoMemories: false`;
- `127.0.0.1` with port `0`;
- no environment-file reads, network services, Qwen calls, or cloud resources.

The runner validates the JSON-RPC authentication error envelope, the current
nine-tool surface (including `memory_feedback` and `memory_resolve_conflict`), MCP tool
text/structured response parity, Host B context packs, storage-scope filtering
plus API-key project authorization for Host C, raw context/retrieval trace
contents, `memory_trace` explanations, and lifecycle invalidation. Host C's
fixture key is restricted to Project Beta, and an attempted Project Alpha
recall must return an MCP tool error without leaking the procedure id or text.

Run the automated proof or its human-readable counterpart with:

```bash
npm run e2e:cross-host
npm run demo:cross-host
```

## Postgres replay with a real restart

The integrated server now provides a transactional `pg` adapter and selects
`PostgresMemoryStore` with `STORE_MODE=postgres` plus `DATABASE_URL`; schema
application remains explicit through `npm run db:migrate`. The same environment
values select the dashboard's shared Postgres backend; its authenticated caller
session supplies tenant/user identity from the HandoffBase API-key mapping.

The cross-host CI gate intentionally remains in-memory so it is deterministic,
credential-free, and independent of Docker. The optional
`npm run test:postgres:integration` case uses `TEST_DATABASE_URL` and skips when
none is supplied. `npm run test:postgres:restart` is the disposable local
restart harness for Docker-capable machines. Docker was unavailable during the
current integration, so the restart harness has not been executed here and no
Postgres restart pass is claimed.

Keep every Postgres replay local or CI-disposable, retain the mock provider and
explicit test auth, use a dedicated test database, and never point migration or
restart commands at a shared or production database.
