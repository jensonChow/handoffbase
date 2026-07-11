# Contributing to HandoffBase

Thanks for your interest in HandoffBase. It is an MCP-native, cross-session and
cross-host memory-handoff layer for AI agents. This guide describes how to set up
the project, the checks your change must pass, and the conventions that keep the
codebase honest and reproducible.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ground Rules

A few principles are load-bearing for this project. Please keep them intact:

- **The default path is credential-free.** Local development and CI run on
  `InMemoryMemoryStore` and `MockMemoryProvider`. `npm run check` must pass with
  no Qwen/DashScope credentials, no database, no Docker, and no network access.
  Never add a required key, service, or network call to that path.
- **Claims stay honest.** Do not describe deterministic or synthetic results as
  official benchmark scores. Every benchmark artifact is labeled
  `official_qa_evaluator: false`. The comparative local result is
  HandoffBase 17/17 vs no-memory 0/17 — that is regression evidence, not a
  leaderboard number. If you cannot demonstrate a claim from code in the repo,
  do not put it in the docs.
- **Secrets never enter the repo.** No `.env.*` files, keys, tokens, cookies,
  database URLs, or auth headers in tracked files or commit history. A tracked
  secret scan runs in CI (`npm run check:tracked-secrets`).
- **The MCP surface is a contract.** The server exposes exactly 9 tools,
  9 `memory://` resources, and 4 prompts. `npm run mcp:validate-remote` asserts
  the nine-tool manifest. Changing that surface is a deliberate design decision,
  not an incidental edit — update the tests, the docs, and `memory/mcp-interface.md`
  together.

## Prerequisites

- Node.js **22 or newer** (`node --version`).
- npm (bundled with Node).
- No database or cloud credentials are required for the default workflow.

## Setup

```bash
git clone https://github.com/jensonChow/handoffbase.git
cd handoffbase
npm ci
npm run check
```

`npm run check` is the CI-parity gate. It typechecks, builds the server and all
workspaces, and runs the deterministic unit/integration suites, the MCP
registration smoke test, the local eval and comparative benchmark, the
LongMemEval tiny fixture, the real HTTP/MCP cross-host E2E, the Markdown
relative-link check, and the tracked-file secret scan. If it passes locally with
a clean environment, it will pass in CI.

Run the local server and dashboard:

```bash
npm run dev:server        # MCP server at http://127.0.0.1:3000/mcp
npm run dashboard:dev     # Memory Vault at http://127.0.0.1:3001
```

## Project Layout

```text
src/                     # Remote Streamable HTTP MCP server + services
packages/memory-core/    # @handoffbase/memory-core: records, lifecycle, providers, store
apps/dashboard/          # @handoffbase/dashboard: Next.js Memory Vault
benchmarks/              # LongMemEval adapter + scorer
scripts/                 # runnable dev, eval, benchmark, and validation scripts
examples/                # MCP host configs, HTTP payloads, quickstarts
docs/                    # architecture, benchmarks, deployment, submission material
memory/                  # durable project memory (see agent.md)
```

## Working On A Change

1. **Branch off `main`.** Use a short, descriptive branch name.
2. **Keep the diff scoped.** One concern per PR. Unrelated cleanups belong in
   their own change.
3. **Add or update tests.** New behavior needs a deterministic test on the
   credential-free path. Bug fixes should include a regression test.
4. **Run the gate.** `npm run check` must pass before you open the PR.
5. **Update the docs and memory.** If you change product direction, architecture,
   the MCP interface, deployment, or an important trade-off, update the matching
   `memory/*.md` file (see `agent.md` for the split) and any affected `docs/`.

### Useful commands

```bash
npm run typecheck               # types only, no test run
npm run test                    # memory-core, auth, runtime, server, dashboard units
npm run smoke                   # MCP registration smoke test
npm run eval:memory             # deterministic local memory eval pack
npm run bench:memory            # 17-case comparative local benchmark
npm run bench:longmemeval:tiny  # synthetic three-backend adapter gate
npm run e2e:cross-host          # real Express/HTTP/MCP cross-host continuity
npm run check:markdown-links    # relative-link check for Markdown docs
npm run check:tracked-secrets   # scan tracked files for secret material
```

## Commit And PR Conventions

- **Conventional Commits.** Format the subject as
  `type(scope): summary`, e.g. `feat(bench): add LongMemEval scorer`,
  `fix(dashboard): bind global fetch`, `docs: refresh handoff`. Common types:
  `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
- **Explain the why.** The PR description should state the problem, the approach,
  and how you verified it. Paste the relevant `npm run check` output or the
  specific gate you ran.
- **No secrets, no generated artifacts.** Do not commit `.env.*`, `dist/` churn
  unrelated to your change, benchmark output directories, or downloaded datasets.
- **Keep honesty caveats.** If your change touches benchmark, deployment, or
  effect claims, preserve the existing "not an official score / not production /
  historical proof" framing.

## Reporting Bugs And Requesting Features

Use the GitHub issue templates. For bugs, include your Node version, the exact
command, the mode (`storeMode`/`providerMode`/`authMode` if relevant), and the
full output. For security issues, do **not** open a public issue — see
[SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
