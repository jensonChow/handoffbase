# Security Policy

HandoffBase is a memory-infrastructure MVP. It is designed so that agent memory
is auditable, editable, and deletable, and so that secrets never enter durable
memory or the repository. We take reports about that boundary seriously.

## Supported Versions

The project is pre-1.0 and moves on `main`. Security fixes are applied to the
`main` branch; there is no separate long-term support branch yet.

| Version | Supported |
| --- | --- |
| `main` (0.1.x) | ✅ |
| older tags | ❌ |

## Reporting a Vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**
   ([direct link](https://github.com/jensonChow/handoffbase/security/advisories/new)).
3. Describe the issue, the affected mode
   (`authMode` / `providerMode` / `storeMode` if relevant), reproduction steps,
   and impact.

We will acknowledge the report, investigate, and coordinate a fix and disclosure
timeline with you. Please give us a reasonable window to remediate before any
public disclosure.

## What to Report

Examples of in-scope issues:

- A path that writes secrets (API keys, tokens, cookies, database URLs, auth
  headers) into persistent memory, traces, events, or benchmark artifacts.
- An authentication or caller-scope bypass in the MCP server or dashboard —
  reading or mutating memory outside the authenticated caller's grant.
- A non-loopback deployment that serves memory with auth disabled outside the
  explicit isolated-demo override.
- Injection or sanitizer bypass that lets untrusted content become a durable
  procedure memory without review.

## Handling of Secrets

- Never commit `.env.*` files, keys, tokens, cookies, database URLs, or auth
  headers. A tracked-file secret scan runs in CI (`npm run check:tracked-secrets`).
- Keep Qwen/DashScope keys, HandoffBase API keys, dashboard session secrets, and
  cloud credentials in local or cloud secret configuration only.
- The default local and CI paths are credential-free (in-memory store, mock
  provider), so contributors do not need real secrets to develop or test.

## Deployment Note

The default runtime is in-memory with no external dependencies. A production
deployment should add TLS, hardened authentication, durable storage, monitoring,
backups, and rate limiting before handling real user data. The current public
proof endpoints are demonstration deployments, not hardened production services.
