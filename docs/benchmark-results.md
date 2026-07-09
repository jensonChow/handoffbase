# Benchmark Results

The first deterministic memory benchmark runner exists:

```bash
npm run bench:memory
```

Current status:

- The runner is local, credential-free, network-free, and CI-safe by default.
- It uses local builds of `@handoffbase/memory-core` and `ContinuityMemoryService`.
- It supports fixture families under `examples/benchmarks/*/cases.json`.
- Benchmark fixtures will be integrated separately.
- No official benchmark results or scores are published yet.

Until fixture integration and exact validation output exist, public materials should keep using the current boundary from [benchmarks.md](benchmarks.md): HandoffBase is benchmark-aware and now has a deterministic benchmark runner, but it does not claim official LongMemEval, MemConflict, Mem2ActBench, LongMemEval-V2, MemEvoBench, LifeBench, or other leaderboard results.

After fixtures are added, update this file with:

- commit SHA and date,
- fixture families and case counts,
- `npm run bench:memory` output,
- aggregate pass counts,
- per-family pass counts,
- per-metric pass counts,
- known limitations and non-claims.
