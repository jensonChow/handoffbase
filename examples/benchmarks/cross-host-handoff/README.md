# Cross-Host Handoff Fixtures

This directory contains HandoffBase-specific benchmark-inspired fixtures for
cross-host memory handoff. They are not an external benchmark, not a leaderboard
adapter, and not an official score.

The fixtures focus on the core HandoffBase product claim: Host A can capture a
governed memory, Host B can receive the allowed memory through bootstrap or
recall, and Host C in a different scope must not receive project- or
agent-profile-specific memory it is not allowed to use.

All data is synthetic and public-safe. The cases do not include real people,
credentials, account ids, endpoint secrets, public IPs, private project details,
or cloud resources. They have no Qwen or cloud dependency and are executed by
the deterministic local benchmark runner.

## Files

- [`cases.json`](cases.json): synthetic cross-host handoff cases.

## Story

The fixture family follows a Host A -> Host B -> Host C isolation story:

1. Host A captures or reflects durable memory into HandoffBase.
2. Host B starts a later session or task and receives the scoped context through
   `continuity_bootstrap` or `memory_recall`.
3. Host C uses a different project or agent profile and must not receive
   out-of-scope memory.
4. Trace ids and used-memory ids make the handoff inspectable.
5. `memory_forget` invalidates memory so later cross-host recall stops using it.

`npm run bench:memory` executes each case through both `no-memory` and
`handoffbase-memory-context`. Fixture-defined expected misses for no-memory are
score outcomes, while expectation conformance keeps the regression harness
green. Results should be reported only as the deterministic benchmark-inspired
local subset described in
[`../../../docs/benchmarks.md`](../../../docs/benchmarks.md).
