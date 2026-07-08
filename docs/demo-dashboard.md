# HandoffBase Memory Vault Demo

This guide is for recording the local dashboard demo. It uses the mock/default dashboard mode and does not require Qwen credentials, API keys, the Alibaba ECS endpoint, auth, or a database.

## Run Locally

Install dependencies if needed:

```bash
npm install
```

Start the dashboard:

```bash
npm run dashboard:dev
```

Open the local URL printed by Next.js, usually:

```text
http://localhost:3000
```

Build verification:

```bash
npm run test:dashboard
npm run dashboard:build
```

Run the aggregate check when there is enough time:

```bash
npm run check
```

## Recording Path

1. Open **HandoffBase Memory Vault** and show the status strip.
2. In **Memory Vault**, search for `opportunity` and select the user preference memory.
3. Show the canonical memory text, scope, source, validity reason, and audit events.
4. Open **Memory Trace** and select the opportunity-ranking trace.
5. Show the context pack, used memories, ignored memory, excluded superseded memory, and reasons.
6. Open **Pending Review** and show the Qwen-extracted candidate memories.
7. Approve one candidate, then invalidate or delete another if the recording needs a governance action.
8. Open **Resolve Memory Conflicts** and show the candidate memory versus existing prize-money memory, conflict type, severity, and recommended action.

## Demo Data Story

The seeded dashboard data follows the AI Opportunity Scout scenario:

- User preference: prioritize credentials, founder network, and startup resources over prize money alone.
- Procedure: verify deadline, timezone, eligibility region, and official rules before recommending an event.
- Failure memory: avoid recommending events when official rules exclude the user's region.
- Conflict: supersede an older prize-money preference with the newer founder-network and credentials preference.

## Safety Notes

- The dashboard uses the mock client by default.
- Do not connect this demo to the deployed ECS backend.
- Do not add auth, database wiring, or remote endpoint configuration for this recording.
- Keep secrets only in ignored local or cloud secret configuration.
