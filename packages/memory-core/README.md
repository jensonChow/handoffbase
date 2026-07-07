# Memory Core

`@handoffbase/memory-core` contains the provider-agnostic memory domain for the MCP layer:

- TypeScript models for memories, runs, traces, events, embeddings, scopes, and lifecycle status.
- Structured validation for memory records and memory events.
- Lifecycle helpers for active, pending, expired, superseded, and deleted memories.
- Event builders for add, update, delete, supersede, and recall operations.
- A minimal `MemoryStore` interface plus `InMemoryMemoryStore` for local development and tests.
- A plain SQL migration for Postgres + pgvector.
- Sensitive-data rejection for obvious passwords, tokens, cookies, private keys, and common API keys.

## Decisions

- The core package does not call Qwen or any model provider. Reasoning providers sit behind `MemoryReasoningProvider`.
- No ORM is introduced yet. The first persistence artifact is `migrations/0001_memory_core.sql`; a Drizzle or Prisma adapter can implement `MemoryStore` later without changing the domain.
- Raw source is optional and capped. The default durable object is canonical memory text, not a full raw chat log.
- Recall only returns `active` memories that are inside their validity window and not superseded or deleted.

## Local Usage

```ts
import { InMemoryMemoryStore } from "@handoffbase/memory-core";

const store = new InMemoryMemoryStore();

await store.addMemory({
  scope: { tenantId: "tenant_1", userId: "user_1" },
  type: "procedure",
  canonicalText: "Before recommending events, verify deadline, eligibility, and timezone.",
  sourceKind: "user_correction"
});
```

Run checks from the repo root:

```sh
npm install
npm test
```
