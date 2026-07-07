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

## Credentialed Validation State

As of 2026-07-07, a dedicated Model Studio key labeled `handoffbase-hackathon-dev` was created for local hackathon validation and stored only in ignored `.env.hackathon.local` with local HandoffBase API key material. Do not commit or print the key; rotate or delete it after the hackathon.

The local Qwen configuration uses `qwen-plus` and the Beijing OpenAI-compatible base URL for the observed workspace. Exact non-secret setup metadata and validation evidence belong in `docs/dev-materials-checklist.md`.

Manual live validation passed on 2026-07-07: the compiled server started with `.env.hackathon.local`, `/health` reported `providerMode: "qwen"` and `authMode: "api_key"`, and an authenticated `memory_remember` MCP call returned two pending candidate memories from Qwen. Keep CI on the credential-free mock path.

## Alibaba Cloud Deployment

Hackathon backend should run on Alibaba Cloud and include visible code-level proof of Alibaba Cloud service/API usage. Storage can be Postgres/pgvector as long as deployment proof is clear.

For the first demo deployment, prefer ECS + Docker because the server is a long-running Node.js HTTP service with a production Dockerfile. Keep Postgres/RDS optional until paid provisioning is approved, pgvector support is verified for the selected service/version, and runtime store selection is wired.
