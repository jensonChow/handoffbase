# Qwen Cloud Memory

## Hackathon Requirement

Qwen Cloud must be central to the Track 1 submission. It should power memory reasoning, not appear as a side integration.

## Required Qwen-Driven Functions

- Extract durable memories from conversations, run summaries, and tool logs.
- Classify memory type, scope, importance, and validity.
- Detect conflicts between new and existing memories.
- Build token-budgeted context packs.
- Reflect on completed agent runs.
- Explain why memories were used or ignored.

## Long-Term Constraint

The product is Qwen-first for the hackathon but provider-agnostic long term. Qwen must sit behind `QwenMemoryProvider`, not inside the memory core.

## Current Implementation

`packages/memory-core/src/reasoning` defines the provider boundary and includes:

- `MemoryReasoningProvider`
- `QwenMemoryProvider`
- `MockMemoryProvider`
- provider prompts
- structured-output parser/validator

Local runs use `MockMemoryProvider` unless `QWEN_API_KEY` or `DASHSCOPE_API_KEY` is set. Qwen requests use the DashScope OpenAI-compatible chat completions endpoint by default and request JSON object output.

Provider input is sanitized before Qwen prompt construction. The sanitizer redacts sensitive keys and credential-like strings, truncates oversized arrays/objects/strings, handles circular structures, and prevents raw tool logs or headers from leaking into Qwen prompts.

CI and local `npm run check` must pass without Qwen credentials. The GitHub Actions workflow clears `QWEN_API_KEY` and `DASHSCOPE_API_KEY`, so any test that exercises provider behavior must use mock responses or `MockMemoryProvider` unless explicitly marked as a manual credentialed check.

## Alibaba Cloud Deployment

Hackathon backend should run on Alibaba Cloud and include visible code-level proof of Alibaba Cloud service/API usage. Storage can be Postgres/pgvector as long as deployment proof is clear.
