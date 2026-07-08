# Dashboard Demo

The Memory Vault dashboard is a local governance prototype for the HandoffBase hackathon video. It makes the memory layer visible without connecting to the deployed Alibaba ECS backend.

## Run

```bash
npm run dashboard:dev
```

The dashboard uses the mock client by default:

```text
NEXT_PUBLIC_HANDOFFBASE_DASHBOARD_CLIENT=mock
```

To exercise the local Next.js API routes instead of the in-browser mock client:

```bash
NEXT_PUBLIC_HANDOFFBASE_DASHBOARD_CLIENT=http npm run dashboard:dev
```

Build verification:

```bash
npm run dashboard:build
npm run test:dashboard
```

## Demo Story

The seeded data follows the AI Opportunity Scout story:

- the user prioritizes credentials, founder network, and startup resources over prize money alone;
- the agent must verify deadline, timezone, eligibility region, and official rules before recommending a hackathon;
- a failure memory prevents recommending events whose official rules exclude the user's region;
- a conflict shows older prize-money prioritization versus newer network/credentials preference.

## Views To Record

- Vault: active and pending memories with scope, type, confidence, importance, and lifecycle status.
- Pending: Qwen/agent-extracted candidate memories awaiting user approval.
- Trace: used, ignored, and excluded memories plus the compact context pack.
- Conflicts: candidate versus existing memory, conflict type, severity, and recommended action.

## Safety Notes

The dashboard should not hardcode remote endpoints, auth tokens, Qwen keys, database URLs, or cloud credentials. It is safe to record in mock/default mode.
