# Benchmark Fixture Schema Notes

Benchmark fixtures are JSON files named `cases.json` under one family directory:

```text
examples/benchmarks/long-memory/cases.json
examples/benchmarks/conflicts/cases.json
examples/benchmarks/cross-host-handoff/cases.json
```

Each fixture file has this top-level shape:

```json
{
  "family": "long-memory",
  "description": "Synthetic benchmark-inspired long memory cases.",
  "fixedNow": "2026-07-09T00:00:00.000Z",
  "defaultScope": {
    "tenantId": "bench-tenant",
    "userId": "bench-user",
    "projectId": "bench-project",
    "agentProfileId": "bench-agent"
  },
  "cases": [
    {
      "id": "case-id",
      "name": "Human-readable name",
      "metrics": ["answer_correct", "trace_id_present"],
      "seedMemories": [],
      "steps": []
    }
  ]
}
```

`family` must match the parent directory and must be one of:

- `long-memory`
- `conflicts`
- `cross-host-handoff`

`defaultScope` uses memory-core field names:

- `tenantId`
- `userId`
- `agentProfileId`
- `projectId`
- `hostId`
- `sessionId`
- `toolId`

Step-level `scope` or `scopes` may use either camel-case memory-core fields or MCP-style snake-case fields such as `tenant_id` and `project_id`.

## Seed Memories

Each case can seed memory records before running steps. Top-level `seedMemories` are also supported and run before case-level seeds.

Supported seed fields:

- `id`
- `type`
- `canonicalText`
- `status`
- `confidence`
- `importance`
- `sourceKind`
- `scope`
- `metadata`
- `validFrom`
- `validUntil`
- `supersedes`

Enums are validated from the current `packages/memory-core/src/types.ts` build. For conflicts, the current supported types are `contradiction`, `supersedes`, `duplicate`, `scope_overlap`, and `none`. Recommended actions are `accept`, `ignore`, `merge`, `supersede`, `supersede_existing`, `ask_user`, `keep_both`, and `reject`.

## Steps

### `recall`

Calls `memory_recall` through `ContinuityMemoryService`.

```json
{
  "op": "recall",
  "query": "What should be remembered?",
  "types": ["user_preference"],
  "limit": 5,
  "tokenBudget": 500,
  "scopes": {},
  "expect": {
    "memoryIdsPresent": ["memory-id"],
    "memoryIdsAbsent": ["stale-memory-id"],
    "contextIncludes": ["expected public-safe fragment"],
    "contextExcludes": ["excluded public-safe fragment"],
    "traceIdPresent": true,
    "traceUsedMemoryIds": ["memory-id"],
    "traceIgnoredMemoryIds": []
  }
}
```

### `bootstrap`

Calls `continuity_bootstrap` with a host, session, task hint, token budget, and scoped project or agent profile.

```json
{
  "op": "bootstrap",
  "host": "codex",
  "sessionId": "session-2",
  "taskHint": "Start with continuity memory.",
  "tokenBudget": 500,
  "scope": {},
  "expect": {
    "contextIncludes": ["expected public-safe fragment"],
    "contextExcludes": ["excluded public-safe fragment"],
    "traceIdPresent": true,
    "traceUsedMemoryIds": ["memory-id"]
  }
}
```

### `forget`

Calls `memory_forget`.

```json
{
  "op": "forget",
  "memoryId": "memory-id",
  "mode": "invalidate",
  "reason": "Synthetic benchmark forget case.",
  "expect": {
    "status": "invalidated"
  }
}
```

### `conflictRemember`

Calls `memory_remember` with a fixture-backed deterministic conflict provider. This lets a case assert conflict governance without Qwen or network access.

```json
{
  "op": "conflictRemember",
  "source": "user_correction",
  "content": "new preference text",
  "approvalMode": "pending",
  "candidate": {
    "type": "user_preference",
    "canonicalText": "new preference text",
    "status": "pending"
  },
  "conflict": {
    "existingMemoryId": "old-memory-id",
    "conflictType": "contradiction",
    "recommendedAction": "supersede",
    "severity": "high"
  },
  "expect": {
    "candidateStatus": "pending",
    "openConflictCount": 1,
    "conflictType": "contradiction",
    "recommendedAction": "supersede",
    "vaultConflictsCount": 1
  }
}
```

Fixture text should remain synthetic and public-safe. Do not put real credentials, endpoint tokens, user identifiers, payment details, coupon or voucher values, or private account material in benchmark fixtures.
