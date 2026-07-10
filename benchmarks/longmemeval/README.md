# LongMemEval adapter

This directory contains a credential-free adapter for the official cleaned
LongMemEval JSON shape. It does not download, cache, or vendor the benchmark.
Pass a local dataset file explicitly with `--dataset`.

The schema follows the official
[LongMemEval dataset format](https://github.com/xiaowu0162/LongMemEval#-dataset-format):
aligned `haystack_session_ids`, `haystack_dates`, and `haystack_sessions`, plus
`answer_session_ids` for evidence. The adapter accepts the official timestamp
format (`YYYY/MM/DD (Mon) HH:MM`) and RFC 3339. It permits extra fields and
non-string JSON answers, but never passes the gold answer or `has_answer`
labels to a reader or memory provider.

## Local run

The no-memory and raw-history modes need only Node.js:

```sh
node scripts/benchmarks/longmemeval-run.mjs \
  --dataset /local/path/longmemeval_s_cleaned.json \
  --output-dir /tmp/handoffbase-longmemeval-raw \
  --backend raw-history \
  --limit 5
```

The local HandoffBase mode uses `ContinuityMemoryService`, an in-memory store,
and an explicitly constructed `MockMemoryProvider`. It never selects Qwen from
shell credentials. Build the existing packages first:

```sh
npm run build --workspace @handoffbase/memory-core
npm run build:server
node scripts/benchmarks/longmemeval-run.mjs \
  --dataset benchmarks/longmemeval/fixtures/tiny-longmemeval.json \
  --output-dir /tmp/handoffbase-longmemeval-local \
  --backend handoffbase
```

Supported controls are `--limit`, exact `--question-id`, `--output-dir`,
`--resume`, and `--backend no-memory|raw-history|handoffbase`. A fresh run will
not overwrite existing adapter artifacts. Resume uses the canonical state file
to skip completed questions and rematerialize JSONL files without duplicate
lines. It rejects a changed dataset digest, commit, backend, reader/boundary
label, retrieval limit, token budget, or question selection instead of mixing
incompatible records.

## Outputs

- `hypotheses.jsonl`: official evaluator input. Every line has exactly
  `question_id` and `hypothesis`.
- `retrieval-evidence.jsonl`: HandoffBase-internal retrieval/evidence details,
  including pre-context-pack retrieved session ids, best-effort
  reader-context session ids, gold evidence ids, trace presence, and internal
  retrieval metrics. Credited aggregate metrics are explicitly labeled as
  pre-context-pack `memory_recall` metrics; they do not imply that every
  candidate survived the provider's context budget.
- `run-metadata.json`: commit, backend, reader model label, dataset basename and
  digest, timing, and reader/memory token counters.
- `summary.json`: aggregate internal retrieval metrics. It explicitly records
  that the official QA evaluator was not run.
- `.longmemeval-run-state.json`: canonical resume state. It contains no raw
  histories, prompts, environment values, or credentials.

Only `hypotheses.jsonl` should be passed to the official LongMemEval QA
evaluator. Internal evidence metrics are not an official QA score.

## Injectable boundaries

`runLongMemEval` accepts a reader with:

```js
{
  modelLabel: "reader-model-label",
  async generate({ question, context }) {
    return {
      hypothesis: "...",
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        counting: "reported"
      }
    };
  }
}
```

The `question` object contains only the question text and date. It intentionally
omits `question_id`, `question_type`, the gold answer, and evidence ids so the
reader cannot exploit `_abs` or other evaluator metadata.

The HandoffBase backend accepts a labeled tool-semantic boundary with
`supportsIdempotency: true`, `memory_remember(input, adapterContext)`, and
`memory_recall(input)`. The first argument matches the MCP tool inputs.
`adapterContext` adds a deterministic idempotency key and an opaque session
reference. A durable wrapper must deduplicate that key before forwarding
`memory_remember`; `adapterContext` itself must not be forwarded as an MCP
input.

Every benchmark question receives deterministic, unique tenant, user, and
project scopes derived from the run fingerprint. Sessions share that question
scope so project-level recall can see them, while different commits, boundary
labels, or retrieval settings cannot reuse stale durable memory. Official
session ids are mapped outside the reader/provider text to avoid leaking the
official `answer_...` naming convention.

## Current limitations

- The bundled reader is a deterministic extractive test reader, not Qwen and
  not a benchmark-quality judge. A later credentialed integration should inject
  a Qwen reader and label its exact model/version.
- The local HandoffBase boundary is in-memory and process-local.
- The current MCP `memory_remember` input has no idempotency/upsert field.
  Output resume is idempotent, and the adapter supplies a deterministic key to
  the injected wrapper, but a future durable remote wrapper must implement
  deduplication to guarantee exactly-once writes across a crash between a
  remote write and the local checkpoint.
- Official QA evaluation is intentionally out of scope here because it requires
  a credentialed evaluator. No score in these outputs is an official
  LongMemEval result.

The fixture under `fixtures/` is tiny synthetic data used only by tests. It is
not copied from LongMemEval and must not be presented as benchmark evidence.
