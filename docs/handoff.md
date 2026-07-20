# Current Handoff

Updated: 2026-07-19 (SUBMITTED; post-submission audit passed; cost audit
folded in)

## Outcome

HandoffBase is **submitted** to the Global AI Hackathon Series with Qwen
Cloud, Track 1: MemoryAgent (submitted 2026-07-19, ahead of the Jul 20
2:00pm PDT close).

- Demo video (public, 2:30): <https://www.youtube.com/watch?v=urIx8_8kzlM>
- Journey thread (Blog Post Prize field):
  <https://x.com/jensonchowzzx/status/2078848695530143909>
- Repository: public, MIT, secret scanning + push protection enabled.
- Devpost: Track 1, architecture image, Alibaba code links, honest AI-tools
  disclosure (Qwen Cloud first; Claude Code, Codex, Claude Design,
  ElevenLabs listed), judge token only in the private testing field.

The demo video is a fully animated product film with voiceover and burned
captions; its title card and the Devpost copy disclose that visuals are
animated while every command, output, and data point shown comes from the
real deployed system. The narration and captions were generated from the
repository's own validated outputs.

## Live Deployment (unchanged, judged)

- Endpoint: `https://47-236-247-69.sslip.io/mcp` (health: `/health`).
- Runtime truth: `authMode=api_key`, `providerMode=qwen`,
  `storeMode=postgres`, `embeddingMode=qwen`; models pinned to
  `qwen-plus-2025-09-11` + `text-embedding-v4`.
- Quotas (console-verified 2026-07-19): 984,060 generation and 999,628
  embedding tokens remaining, both expire 2026-10-11, Free-Quota-Only
  (stop-on-exhaust) ON for both rows — exhaustion rejects calls
  (`AllocationQuota.FreeTierOnly`) and can never bill.
- ECS: prepaid subscription ends 2026-08-13 08:59:59 SGT, auto-renewal OFF.
  Documented post-expiry behavior: instance STOPS at expiry (demo offline),
  disk data retained 15 days, released day 16. The grace period protects
  data, not uptime — **if the judging schedule extends, renew BEFORE
  Aug 13**. Coupons are documented as applicable to ECS renewals and Model
  Studio pay-as-you-go, subject to the coupon's scope/validity.
- Total real-money spend to date: $0. Model Studio July spend: $0.

## Post-Submission Audit (2026-07-19)

Agent-run audit 20/21 PASS + one independent close: YouTube video Public,
X thread public with working links, all Devpost fields verified (including
non-empty private token field), all public repo surfaces 200, CI badge
green. The single FAIL (health URL `ERR_BLOCKED_BY_CLIENT`) was an
ad-blocker in the auditing browser profile — endpoint verified healthy
directly. Note: IP-pattern `sslip.io` hostnames can trip aggressive
ad-blockers; a DuckDNS alternate hostname remains an optional resilience
add. The Alibaba Billing console pages (coupon balance/expiry, lifetime
spend, orders) failed to render in that same profile (loading skeletons,
embedded-frame error) — retry in an extension-free profile around Jul 27;
prior sweeps (Jul 8/13) showed no other billable resources and zero spend.

## Judging Window Ops (Jul 28 – Aug 11)

- Do NOT touch the deployed box, key, model rows, or quota toggles.
- Auto-renewal stays OFF; renew manually before Aug 13 only if judging
  dates shift.
- ~Jul 27 pre-judging check: console quota rows (balances +
  stop-on-exhaust ON), `/health`, video plays, badge renders, and the
  Billing-console retry (coupon expiry is the one unread number).
- Respond promptly to judge comments on Devpost.

## Post-Judging Checklist

- Rotate/delete the temporary HandoffBase judge token.
- Rotate/delete the retired China-station Bailian key (safe any time now;
  hand-done, in the China console — never the live international key).
- ECS lapses Aug 13 (no action needed).
- Options afterward: CockroachDB × AWS agentic-memory hackathon (deadline
  Aug 18; ~1-day `STORE_MODE=cockroach` adapter; this repo qualifies as
  created in-window), credentialed LongMemEval subset (quota lives to
  Oct 11; plan in the owner's runbook), LongMemEval-V2 adapter as a future
  flagship eval.

## Repository State

`main` is even with origin; all submission work is committed. The untracked
`demo-take.sh` in the repo root is a local auto-play recording aid kept as
a fallback for a future real-footage video; it is deliberately not tracked.

## Next Session Prompt

HandoffBase is submitted and audited (video, thread, Devpost, repo all
verified public and correct). The deployment must stay untouched through
judging (Jul 28–Aug 11). Near-term work is operational only: the Jul 27
pre-judging check (quotas, health, video, badge, Billing-console retry for
the coupon expiry), responding to judge questions, and the renew-before-
Aug-13 rule if the schedule moves. After judging: rotate the judge token
and the retired China key, then choose between the CockroachDB × AWS event
(Aug 18) and the LongMemEval subset run. Do not enable paid inference,
auto-renewal, or new cloud resources without explicit owner approval.
