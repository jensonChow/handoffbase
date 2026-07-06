# Operations Memory

## MVP Stack

- TypeScript.
- Official MCP TypeScript SDK.
- Node.js with Fastify or Hono.
- Remote Streamable HTTP MCP transport.
- Postgres + pgvector.
- Drizzle or Prisma.
- React/Next.js dashboard.
- Alibaba Cloud deployment.
- Qwen Cloud API via `QwenMemoryProvider`.

## Validation Expectations

- Validate MCP tool input with JSON Schema.
- Validate structured outputs from memory reasoning provider.
- Add event log entries for add/update/delete/recall.
- Keep memory trace inspectable from dashboard.
- Test cross-session recall, expiry/supersede behavior, and sensitive-data rejection.

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
