# Memory Evals

HandoffBase is benchmark-aware, not benchmark-complete. The repository now has
a comparative deterministic subset and a cleaned-format LongMemEval adapter,
but it does not vendor the official dataset and does not claim an official
benchmark score.

The included eval pack is a small hackathon-oriented regression check. It is designed to be reproducible, credential-free, and network-free by default so contributors can verify memory behavior without Qwen credentials, Alibaba Cloud endpoint access, or paid API calls.

## Benchmark Landscape

Modern long-term memory evaluations tend to test these capability families:

- Long-term conversational memory: whether an agent remembers durable user facts and preferences over later turns or sessions.
- Multi-session recall: whether memory persists across separate interactions and can be retrieved for a new task.
- Temporal updates: whether newer facts, corrections, invalidations, and superseding behavior change what the agent should use.
- Active memory use in tool tasks: whether retrieved memories change concrete task behavior instead of only being restated.
- Memory safety, contamination, and conflict handling: whether unreliable, contradictory, stale, or sensitive information is rejected, held for review, ignored, or invalidated.
- Traceability and governance: whether users and operators can inspect which memories were selected, ignored, updated, forgotten, or held as conflicts.

Relevant benchmark categories include:

- LoCoMo / long conversational memory: long-horizon dialogue recall and consistency.
- LongMemEval / multi-session recall and updates: memory use across sessions, with updates and changed facts.
- LongMemEval-V2 / agent workflow and environment memory: memory use inside longer agent workflows and changing environments.
- Mem2ActBench / active memory use: whether an agent applies memory while acting, not just while answering.
- MemBench / factual and reflective memory: factual recall plus reflective or learned memory.
- MemEvoBench / memory mis-evolution and contamination: whether memories drift, conflict, or become polluted by bad inputs.

HandoffBase currently targets the underlying system surfaces these benchmarks stress: typed memories, lifecycle statuses, recall traces, token-budgeted context packs, conflict records, forget/invalidation behavior, and a provider boundary that can use either Qwen or a deterministic mock provider.

## Local Hackathon Eval Pack

The local pack lives in:

- `examples/evals/opportunity-scout-memory-eval.json`
- `scripts/run-memory-eval.mjs`

Run it with:

```bash
npm run eval:memory
```

The runner uses `InMemoryMemoryStore`, `ContinuityMemoryService`, and a deterministic provider path. It does not start the MCP server, call a remote MCP endpoint, read `.env.*`, or call Qwen. It compiles the local service and memory-core package first so the eval exercises the same runtime modules used by the server.

The pack covers the AI Opportunity Scout story:

| Case | Capability checked |
| --- | --- |
| `preference-recall` | User preference recall for opportunity ranking criteria |
| `procedure-recall` | Procedure recall before ranking hackathons |
| `failure-recall` | Failure memory recall for eligibility mistakes |
| `bootstrap-trace` | Multi-session bootstrap returns a trace that can be inspected |
| `token-budget-ignored` | Tight token budget produces ignored memories |
| `remember-candidate` | `memory_remember` creates a candidate memory without credentials |
| `controlled-conflict` | A deterministic conflict path creates a pending candidate and open conflict |
| `forget-invalidation` | `memory_forget` invalidates a stale memory and recall stops using it |

This is a regression and demo-readiness eval, not a replacement for LoCoMo,
LongMemEval, LongMemEval-V2, Mem2ActBench, MemBench, MemEvoBench, or LifeBench.
Full official reporting still requires the external dataset, benchmark-specific
scoring/evaluator, contamination controls, and cost planning.

## Integrated Product-Proof Gates

The eval pack is complemented by three deterministic gates:

```bash
npm run bench:memory
npm run bench:longmemeval:tiny
npm run e2e:cross-host
```

- `bench:memory` executes 17 shared synthetic cases with both no-memory and
  HandoffBase baselines. The recorded result is HandoffBase 17/17 versus
  no-memory 0/17 with 34/34 expectation conformance.
- `bench:longmemeval:tiny` runs a synthetic cleaned-format fixture across
  no-memory, raw-history, and HandoffBase with network disabled and explicitly
  verifies that no official evaluator score is present.
- `e2e:cross-host` starts a real loopback Streamable HTTP MCP server and uses
  official MCP SDK clients to prove auth, Host A→Host B continuity, project
  isolation, trace linkage, and forgetting.

These remain credential-free, in-memory product regressions. They do not read
`.env.*`, call Qwen, download a benchmark, or invoke a paid judge.

## LongMemEval Adapter Boundary

`npm run bench:longmemeval -- ...` accepts an explicitly supplied local cleaned
LongMemEval JSON file and supports deterministic or Qwen reader modes plus mock
or Qwen HandoffBase memory-provider modes. It emits official-evaluator input
but does not install or invoke the official evaluator. See the
[adapter guide](../benchmarks/longmemeval/README.md).

For this integration, no official dataset was downloaded, no full credentialed
run was completed, and no official LongMemEval QA score exists.

## Reading Results

The script prints one pass/fail line per case, followed by a compact summary. A failure exits nonzero and includes the assertion that failed. A passing run means the local memory primitives still support the benchmark-style capabilities represented by the fixture.

Do not report the output as an official benchmark score. The correct framing is:

> HandoffBase includes a small deterministic eval pack that maps core memory surfaces to modern long-term memory benchmark capabilities.

## Public and Secret Safety

The eval pack intentionally stores only synthetic demo memories. It must remain safe for public repositories:

- No real API keys, auth headers, cookies, database URLs, or cloud credentials.
- No live endpoint URL dependency.
- No paid model call dependency.
- No full benchmark dataset vendoring.
- No raw user chat log persistence.

If a future eval needs credentialed or networked validation, keep it as a separate manual command and document the required environment variables without recording their values.
