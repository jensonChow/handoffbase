# Benchmark Results

HandoffBase has a deterministic, benchmark-inspired local comparative
regression suite. It is public-safe, credential-free, network-free, and runs
synthetic fixtures through executable baseline adapters.

```bash
npm run bench:memory
```

Last local run recorded here: 2026-07-10.

## Result Boundary

Two results are reported separately:

- Observed pass: whether a baseline satisfied a case's common behavior oracle.
  This feeds the comparative score and delta.
- Expectation conformance: whether that observed result matched the fixture's
  explicit per-baseline expectation. This controls regression health together
  with fixture and executor errors.

A memory-dependent no-memory miss is an expected score outcome, not a harness
failure. Per-metric figures are metric-tagged case counts: the current suite
applies each case's observed pass to every metric tag on that case. They are not
independently adjudicated sub-scores.

## Harness Result

The validated local run executed 34 baseline/case pairs across 17 fixtures:

- Expectation conformance: 34/34.
- Execution errors: 0.
- Fixture errors: 0.
- Harness result: pass.

## Per-Baseline Results

| Baseline | Observed case passes | Expectation conformance | Coverage |
| --- | ---: | ---: | --- |
| `no-memory` | 0/17 | 17/17 | Full local suite |
| `handoffbase-memory-context` | 17/17 | 17/17 | Full local suite |

The HandoffBase path remains 17/17:

| Family | Passed | Total |
| --- | ---: | ---: |
| `conflicts` | 5 | 5 |
| `cross-host-handoff` | 6 | 6 |
| `long-memory` | 6 | 6 |

Conflict-governance cases execute both baselines. No-memory produces no
candidate or governance state and therefore records the expected miss; the
suite does not invent a conflict-resolution result.

## Per-Metric-Tagged Case Results

| Metric | No-memory | HandoffBase |
| --- | ---: | ---: |
| `answer_correct` | 0/3 | 3/3 |
| `conflict_action_correct` | 0/5 | 5/5 |
| `conflict_created` | 0/3 | 3/3 |
| `evidence_precision_at_k` | 0/5 | 5/5 |
| `evidence_recall_at_k` | 0/2 | 2/2 |
| `excluded_memory_correct` | 0/1 | 1/1 |
| `forget_correct` | 0/2 | 2/2 |
| `scope_isolation_correct` | 0/6 | 6/6 |
| `token_budget_respected` | 0/1 | 1/1 |
| `trace_id_present` | 0/8 | 8/8 |
| `update_correct` | 0/1 | 1/1 |
| `used_memory_correct` | 0/6 | 6/6 |

## HandoffBase Delta Over No-Memory

The paired comparison covers exactly 17 shared cases and 43 shared
metric-tagged case cells:

| Comparison | No-memory | HandoffBase | Delta |
| --- | ---: | ---: | ---: |
| Observed case passes | 0/17 | 17/17 | +17 passes, +100 percentage points |
| Observed metric-tagged case passes | 0/43 | 43/43 | +43 passes, +100 percentage points |

The no-memory executor is intentionally capability-free: it emits no durable
memory, recalled context, trace, forget state, or conflict-governance output.
Every shared fixture's full common oracle requires at least one positive memory
or trace behavior, so no-memory records 0/17 full-case passes while still
matching all 17 fixture expectations.

## Machine-Readable Output

Run the script directly for JSON-only stdout; the npm wrapper prints build
banners before invoking the runner.

```bash
node scripts/run-memory-benchmarks.mjs --json
```

Schema version `1` includes implemented baselines, per-execution observed and
expected outcomes, harness errors, per-baseline family and metric-tagged totals,
comparison coverage, and the paired delta. It omits timestamps, durations,
absolute paths, and generated trace or conflict ids so repeated runs over the
same inputs are byte-for-byte deterministic.

## Non-Claims

The `handoffbase-memory-context` 17/17 result is a deterministic local
governance/regression result over synthetic fixtures, `MockMemoryProvider`, and
the in-memory HandoffBase path. It is not an official LongMemEval, MemConflict,
Mem2ActBench, LongMemEval-V2, MemEvoBench, LifeBench, or other leaderboard
score. It is not a Qwen model-quality score.

`raw-history` and `naive-vector-rag` are clean registry extension points, but no
executor ran for either baseline and no result is reported for them.

The command does not read `.env.*`, call Qwen or DashScope, call a remote MCP
endpoint, restart ECS, use a database URL, or require paid cloud resources.
