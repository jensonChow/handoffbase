## Summary

What does this change and why? Link any related issue.

## Approach

Briefly, how you implemented it. Call out anything that touches the MCP surface,
the memory lifecycle, storage/provider selection, or deployment.

## Verification

How you confirmed it works. Paste the relevant gate output.

- [ ] `npm run check` passes locally (credential-free: no Qwen key, DB, Docker,
      or network).
- [ ] Added or updated deterministic tests for the change.
- [ ] Updated affected `docs/` and `memory/*.md` (see `agent.md` for the split).

## Honesty checklist

- [ ] No secrets, `.env.*`, or downloaded datasets committed.
- [ ] No deterministic/synthetic result described as an official benchmark score;
      artifacts remain labeled `official_qa_evaluator: false`.
- [ ] Existing "not production / historical proof / not an official score"
      caveats are preserved.

## Notes

Anything reviewers should know.
