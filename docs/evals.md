# Memory Eval Pack

HandoffBase is benchmark-aware, not benchmark-complete.

Modern long-term memory work evaluates capabilities such as:

- long-term conversational memory,
- multi-session recall,
- temporal updates,
- active memory use in tool tasks,
- memory safety, contamination, and conflict handling,
- traceability and governance.

Benchmark families often discussed in this area include LoCoMo for long conversational memory, LongMemEval for multi-session recall and updates, LongMemEval-V2 for agent workflow and environment memory, Mem2ActBench for active memory use, MemBench for factual and reflective memory, MemEvoBench for memory mis-evolution and contamination, and LifeBench-style evaluations for long-running personal context.

This repository does not claim official scores on those benchmarks. It includes a small deterministic hackathon eval pack that maps the AI Opportunity Scout demo to core memory capabilities without requiring Qwen credentials, paid model calls, external benchmark datasets, or the Alibaba Cloud endpoint.

## Local Eval

Run:

```bash
npm run eval:memory
```

The script builds `@handoffbase/memory-core`, loads [examples/evals/opportunity-scout-memory-eval.json](../examples/evals/opportunity-scout-memory-eval.json), and runs deterministic checks against `InMemoryMemoryStore` and `MockMemoryProvider`.

## Covered Cases

The pack covers:

1. user preference recall,
2. procedure recall,
3. failure memory recall,
4. trace id creation after recall,
5. tight token budget causing ignored memories,
6. `memory_remember`-style extraction producing candidate memories,
7. conflict record creation for an older prize-money preference,
8. `memory_forget`-style invalidation behavior.

## What It Is Not

The eval pack is not:

- a replacement for full LoCoMo, LongMemEval, Mem2ActBench, MemBench, MemEvoBench, or LifeBench runs,
- a benchmark leaderboard claim,
- a Qwen quality measurement,
- a remote deployment validation.

It is a reproducible local sanity check that HandoffBase's memory model supports the main capability classes the project claims.
