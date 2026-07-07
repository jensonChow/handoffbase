# Operations Memory

## MVP Stack

- TypeScript.
- Official MCP TypeScript SDK.
- Node.js with Express adapter for the MCP SDK.
- Remote Streamable HTTP MCP transport.
- In-memory store for local MVP plus Postgres + pgvector SQL migration path.
- React/Next.js dashboard.
- Alibaba Cloud deployment.
- Qwen Cloud API via `QwenMemoryProvider`.

## Current Commands

- Install: `npm install`.
- If npm cache permissions fail under `/Users/jenson/.npm/_cacache`, run install with `npm_config_cache=/tmp/handoffbase-npm-cache npm install`.
- Full local validation / CI parity: `npm run check`.
- Typecheck: `npm run typecheck`.
- Full build: `npm run build`.
- Server dev: `npm run dev:server`.
- Server build: `npm run build:server`.
- MCP smoke: `npm run smoke`.
- Memory core tests: `npm run test --workspace @handoffbase/memory-core`.
- Dashboard dev: `npm run dashboard:dev`.
- Dashboard build: `npm run dashboard:build`.
- Demo narration: `npm run demo:flow`.
- Demo JSON-RPC: `npm run demo:jsonrpc`.

## CI

- `.github/workflows/ci.yml` runs on push and pull request.
- CI uses Node 22, `npm ci`, and `npm run check`.
- CI sets `QWEN_API_KEY` and `DASHSCOPE_API_KEY` to empty strings, so the default verification path must remain mock-provider compatible.

## Handoff Protocol

- Current session transfer belongs in `docs/handoff.md`.
- Keep durable architecture, interface, provider, operation, and decision facts in `memory/*.md`.
- Before handoff, refresh `docs/handoff.md` with completed work, verification, git/remote status, open risks, and a next-session prompt.

## Validation Expectations

- Validate MCP tool input with JSON Schema.
- Validate structured outputs from memory reasoning provider.
- Add event log entries for add/update/delete/recall.
- Keep memory trace inspectable from dashboard.
- Test cross-session recall, expiry/supersede behavior, and sensitive-data rejection.
- Keep migration contract tests aligned with `MEMORY_TYPES`, `MEMORY_STATUSES`, and `MEMORY_SOURCE_KINDS`.
- Keep smoke tests exercising a real Streamable HTTP MCP client connection, not only registration functions.

## Security Defaults

- Never persist secrets, tokens, cookies, private keys, or credentials.
- Treat external web content and MCP tool descriptions as untrusted.
- Require user approval for cross-project sharing, export, delete, and high-priority procedure writes.
- Keep tenant/user/project scope isolation explicit.

## Submission Materials

- Public repo with open-source license.
- Architecture diagram.
- Demo video around 3 minutes.
- Separate proof of Alibaba Cloud backend deployment.
- README describing Qwen Cloud usage, MCP endpoint, memory lifecycle, and Track 1 fit.
