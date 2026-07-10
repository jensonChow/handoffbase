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

The runner validates the JSON-RPC authentication error envelope, MCP tool text/structured response parity, Host B context packs, storage-scope filtering plus API-key project authorization for Host C, raw context/retrieval trace contents, `memory_trace` explanations, and lifecycle invalidation. Host C's fixture key is restricted to Project Beta, and an attempted Project Alpha recall must return an MCP tool error without leaking the procedure id or text.

## Postgres replay with a real restart

This branch does not claim Postgres durability. The current runtime does not select Postgres from server configuration, and the repository does not yet provide a production SQL client adapter. `PostgresMemoryStore` accepts an explicit `SqlQueryClient`, whose `transaction()` implementation is required for atomic memory writes.

When the integration branch owns that adapter and test wiring, replay the same behavior in an isolated disposable database as follows:

1. Create a unique schema or database for the run and apply `packages/memory-core/migrations/0001_memory_core.sql`.
2. Create SQL client 1 with both `query()` and `transaction()`, then inject `new PostgresMemoryStore(sqlClient1)` and `new MockMemoryProvider()` into `ContinuityMemoryService` with demo seeding disabled.
3. Start server instance 1 on loopback port `0` with the same explicit fixture auth shape. Run only the baseline and Host A remember phase through the official Host A/B SDK clients, and save the generated memory IDs.
4. Close every SDK client, fully close server instance 1, and close SQL client 1. This shutdown is the required persistence boundary; do not reuse the service or store object.
5. Create SQL client 2, a new `PostgresMemoryStore`, a new service, and server instance 2 against the same isolated database. Use a newly connected Host B client to bootstrap and recall the Host A memories, then run the Host C isolation and trace assertions.
6. Invalidate the project procedure through MCP. For stronger lifecycle proof, stop instance 2 and start a third fresh server/store/client set before the final Host B recall; assert that the invalidation and linked retrieval-trace explanation survive.
7. Remove the isolated schema/database and close all clients. Use unique tenant/project suffixes if cleanup cannot be guaranteed after a failed run.

Keep the Postgres replay local or CI-disposable, retain the mock provider and explicit in-test auth, and never point it at a shared or production database. Adding a database driver, runtime store selection, root package scripts, and CI wiring belongs to the integration branch, not this owned-file workstream.
