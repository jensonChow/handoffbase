# LongMemEval adapter

This directory contains an adapter for the official cleaned LongMemEval JSON
shape. It does not download, cache, or vendor the benchmark, and it never loads
an `.env` file. Pass a local dataset file explicitly with `--dataset`.

The schema follows the official
[LongMemEval dataset format](https://github.com/xiaowu0162/LongMemEval#-dataset-format):
aligned `haystack_session_ids`, `haystack_dates`, and `haystack_sessions`, plus
`answer_session_ids` for evidence. The adapter accepts the official timestamp
format (`YYYY/MM/DD (Mon) HH:MM`) and RFC 3339. It permits extra fields and
non-string JSON answers, but never passes the gold answer or `has_answer`
labels to a reader or memory provider.

## Reader and memory-provider modes

The two runtime choices are explicit and independent:

- `--reader deterministic|qwen` controls final answer generation.
- `--memory-provider mock|qwen` controls HandoffBase extraction, conflict
  detection, and context-pack reasoning when `--backend handoffbase` is used.
- `--embeddings off|mock|qwen` controls semantic recall. `qwen` embeds memories
  and queries with a Qwen/DashScope embedding model (default `text-embedding-v4`
  at 1536 dims) so `memory_recall` ranks by cosine similarity; `mock` uses the
  deterministic offline embedding provider; `off` (default) keeps lexical recall.
  Applies only to `--backend handoffbase`.

The defaults are `--reader deterministic --memory-provider mock --embeddings
off`. Those defaults do not inspect Qwen/DashScope environment values and are the
only modes used by the tiny-fixture CI tests. `--memory-provider qwen` and
`--embeddings` other than `off` are rejected unless the backend is `handoffbase`.

Run the CI-sized matrix with:

```sh
npm run bench:longmemeval:tiny
```

That command runs the synthetic tiny fixture through `no-memory`,
`raw-history`, and `handoffbase`, disables network access, uses the
deterministic reader and mock HandoffBase provider, verifies that no official
evaluator result is present, and removes its temporary outputs.

Qwen mode uses the repository's existing environment conventions:

- credential: `QWEN_API_KEY`, then `DASHSCOPE_API_KEY`;
- base URL: `QWEN_BASE_URL`, then `DASHSCOPE_BASE_URL`, otherwise the public
  DashScope OpenAI-compatible base URL;
- model: `QWEN_MODEL`, then `DASHSCOPE_MODEL`, otherwise `qwen-plus`;
- timeout: optional `QWEN_TIMEOUT_MS`.

Credentials and base URLs are not written to adapter artifacts. Errors omit
response bodies and credential values. Supply credentials through the process
environment; do not put them in commands, output directories, or tracked
files.

## Deterministic local run

The no-memory and raw-history modes need only Node.js:

```sh
node scripts/benchmarks/longmemeval-run.mjs \
  --dataset /local/path/longmemeval_s_cleaned.json \
  --output-dir /tmp/handoffbase-longmemeval-raw \
  --backend raw-history \
  --reader deterministic \
  --limit 5
```

The default local HandoffBase mode uses `ContinuityMemoryService`, an in-memory
store, and an explicitly constructed `MockMemoryProvider`. It never selects
Qwen merely because credentials happen to exist in the shell. Build the
existing packages first:

```sh
npm run build --workspace @handoffbase/memory-core
npm run build:server
node scripts/benchmarks/longmemeval-run.mjs \
  --dataset benchmarks/longmemeval/fixtures/tiny-longmemeval.json \
  --output-dir /tmp/handoffbase-longmemeval-local \
  --backend handoffbase \
  --reader deterministic \
  --memory-provider mock
```

Supported controls are `--limit`, exact `--question-id`, `--output-dir`,
`--resume`, `--backend no-memory|raw-history|handoffbase`,
`--reader deterministic|qwen`, and `--memory-provider mock|qwen`. A fresh run
will not overwrite existing adapter artifacts. Resume uses the canonical state
file to skip completed questions and rematerialize JSONL files without
duplicate lines. It rejects a changed dataset digest, commit, backend, reader
mode/model, memory-provider mode/boundary label, retrieval limit, token budget,
or question selection instead of mixing incompatible records.

## Later credentialed Qwen run

First build the local packages and securely export either `QWEN_API_KEY` or
`DASHSCOPE_API_KEY` in the current shell. Do not place the credential in the
command itself. The later full adapter run against an already downloaded local
official cleaned dataset is:

```sh
npm run build --workspace @handoffbase/memory-core
npm run build:server
QWEN_MODEL=qwen-plus npm run bench:longmemeval -- \
  --dataset /absolute/path/to/longmemeval_s_cleaned.json \
  --output-dir /absolute/path/to/longmemeval-qwen-results \
  --backend handoffbase \
  --reader qwen \
  --memory-provider qwen
```

This mode uses the Qwen chat-completions reader and the existing
`QwenMemoryProvider` inside the local `ContinuityMemoryService`. The storage
boundary remains isolated in-memory storage for each adapter process; this is
not a durable Postgres benchmark mode. Both Qwen roles can make many model
requests, so a full official dataset run requires an intentional credential,
quota, cost, and timeout review before execution.

## Scoring hypotheses into a QA accuracy

`hypotheses.jsonl` on its own is not a score. `scripts/benchmarks/longmemeval-score.mjs`
turns it into a QA-accuracy number by judging each hypothesis against the gold
answer. It reimplements LongMemEval's per-question-type correctness prompts
(including the abstention variant), but it is an **independent reimplementation,
not the official GPT-4o evaluator**, and every artifact says so
(`official_qa_evaluator: false`).

Two judge modes:

- `--judge deterministic` (default): credential-free, network-free. A coarse
  substring/abstention proxy for CI and quick local checks — not a quality
  metric.
- `--judge qwen`: uses the `QWEN_`/`DASHSCOPE_` conventions with a judge model
  (default `qwen-max`, override with `QWEN_JUDGE_MODEL`) to reproduce the
  official yes/no correctness check in spirit.

```sh
node scripts/benchmarks/longmemeval-score.mjs \
  --dataset /absolute/path/to/longmemeval_s.json \
  --hypotheses /absolute/path/to/results/hypotheses.jsonl \
  --output /absolute/path/to/results/scoring.json \
  --judge qwen --judge-model qwen-max
```

`scoring.json` reports overall accuracy, per-question-type accuracy, and a
separate answered-vs-abstention split, alongside the judge label, dataset digest,
and the `official_qa_evaluator: false` flag. Report it as "a stratified subset
scored by a Qwen judge," never as the official LongMemEval leaderboard number.

## One command: the comparison table

`scripts/benchmarks/longmemeval-compare.mjs` runs every backend over the same
dataset selection, scores each with one judge, and writes a ready-to-review
`comparison.md` (overall + per-question-type table) under `--output-dir`. It
never writes into a tracked doc — review the numbers before publishing them.

```sh
# Deterministic, credential-free smoke over the tiny fixture:
npm run bench:longmemeval:compare -- \
  --dataset benchmarks/longmemeval/fixtures/tiny-longmemeval.json \
  --output-dir /tmp/handoffbase-lme-compare --embeddings mock

# Real, Qwen-in-the-loop run over a downloaded subset (export the key first):
npm run bench:longmemeval:compare -- \
  --dataset /abs/path/longmemeval_s.json --output-dir /abs/path/results \
  --reader qwen --embeddings qwen --judge qwen --judge-model qwen-max --limit 50
```

`--backends` (default `no-memory,handoffbase,raw-history`) restricts the set.
Use `--limit 5` to calibrate cost before a larger run.

## End-to-end real run (owner checklist)

1. Download the official LongMemEval-S dataset locally (see the upstream repo);
   pass its path with `--dataset`. Nothing here downloads or vendors it.
2. Build once: `npm run build --workspace @handoffbase/memory-core && npm run build:server`.
3. Export `DASHSCOPE_API_KEY` (or `QWEN_API_KEY`) in the shell — never in the command.
4. For a stratified subset (`--limit N`, or curate a subset file), run three
   backends into separate output dirs to get a floor, our system, and a
   full-context ceiling:
   - `--backend no-memory --reader qwen` (floor),
   - `--backend handoffbase --reader qwen --embeddings qwen` (HandoffBase; Qwen
     drives recall embeddings, and add `--memory-provider qwen` to also drive
     extraction),
   - `--backend raw-history --reader qwen` (full-context ceiling).
5. Score each `hypotheses.jsonl` with `--judge qwen`.
6. Compare the overall/per-type accuracies. Cost scales with question count and
   history length; a ~50-question subset with the Qwen reader plus a Qwen judge
   is on the order of ~1M tokens — start small (`--limit 5`) to calibrate before
   a larger run, and watch the Qwen free-tier quota.

## Outputs

- `hypotheses.jsonl`: official evaluator input. Every line has exactly
  `question_id` and `hypothesis`.
- `scoring.json` (from the scoring step): judge-scored QA accuracy, explicitly
  labeled `official_qa_evaluator: false`.
- `retrieval-evidence.jsonl`: HandoffBase-internal retrieval/evidence details,
  including pre-context-pack retrieved session ids, best-effort
  reader-context session ids, gold evidence ids, trace presence, and internal
  retrieval metrics. Credited aggregate metrics are explicitly labeled as
  pre-context-pack `memory_recall` metrics; they do not imply that every
  candidate survived the provider's context budget.
- `run-metadata.json`: commit, backend, reader model label, dataset basename and
  digest, explicit reader/provider modes, timing, and reader/memory token
  counters.
- `summary.json`: aggregate internal retrieval metrics. It explicitly records
  that the official QA evaluator was not run.
- `.longmemeval-run-state.json`: canonical resume state. It contains no raw
  histories, prompts, environment values, or credentials.

The adapter (`longmemeval-run.mjs`) itself never calculates a score; it only
emits `hypotheses.jsonl` plus internal retrieval metrics. Scoring is a separate,
explicit step (`longmemeval-score.mjs`, above). That scorer's judge — even in
`--judge qwen` mode — is an independent reimplementation and is **not** the
official LongMemEval GPT-4o evaluator. To claim an official score, run the
pinned upstream evaluator separately and record its dataset version, evaluator
model, configuration, and output. Internal evidence metrics are not a QA score.

## Injectable boundaries

`runLongMemEval` accepts a reader with:

```js
{
  mode: "custom-reader-mode",
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
`providerMode`, `supportsIdempotency: true`,
`memory_remember(input, adapterContext)`, and `memory_recall(input)`. The first
argument matches the MCP tool inputs.
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

- The bundled default reader is a deterministic extractive test reader, not a
  benchmark-quality reader or judge. The Qwen reader path is opt-in and records
  its configured model label, but it has not been run on the full official
  dataset in this repository.
- The local HandoffBase boundary is in-memory and process-local.
- The current MCP `memory_remember` input has no idempotency/upsert field.
  Output resume is idempotent, and the adapter supplies a deterministic key to
  the injected wrapper, but a future durable remote wrapper must implement
  deduplication to guarantee exactly-once writes across a crash between a
  remote write and the local checkpoint.
- Official QA evaluation is intentionally separate. The included scorer
  (`longmemeval-score.mjs`) produces a judge-scored accuracy that is explicitly
  labeled `official_qa_evaluator: false`; it has not been run on the full
  official dataset in this repository, and no score in these outputs is an
  official LongMemEval result.

The fixture under `fixtures/` is tiny synthetic data used only by tests. It is
not copied from LongMemEval and must not be presented as benchmark evidence.
