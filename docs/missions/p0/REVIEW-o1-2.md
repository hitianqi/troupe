# Re-review: p0 — order o1, fix round 1 (also the final review of feature/p0)

Reviewed `ef86bee` (one commit on `adef1bd`; `docs/FEASIBILITY.md` +13/-1,
`tests/guard.test.ts` +18). `claude --version`: 2.1.304 (Claude Code). Scope as
set by the orchestrator: confirm the Act-on and consider (a), check.sh green,
(c) listed for Phase 2; (b) moot (squash-merge). No new scope.

## Act-on findings of REVIEW-o1.md

1. **The deny test does not prove the guard — addressed.**
   `tests/guard.test.ts` sends an Agent call with no `description`, so the hook
   throws, and expects the Agent tool not to run and the result to contain
   "guard failed". I ran it: with the `.catch` it passes (2 pass / 0 fail); with
   the `.catch` removed in a scratch copy (deleted) it fails, `Expected: 0,
   Received: 1`, while `deny.test.ts` still passes. FEASIBILITY Q3 now states
   this with the engine's "hook was skipped" text and the conclusion that a
   gating hook needs the guard to fail closed.

## Consider

- (a) Roadmap change named — **addressed.** Recommendation line 2 now says
  Phase 1's "Done when" should change from "from 110 columns" to "144 columns
  when it opens by itself, 110 once the person opened it with `/troupe`".
  (ROADMAP.md itself is not edited; the brief asked the recommendation to name
  it, which it does.)
- (c) Pane rows never rendered — **listed** in the Phase 2 verify-live list.
- (b) Missing trailer on `b281c9f` — moot, squash-merge.

## Checks

- `./check.sh` at `ef86bee`: exit 0 (validate passes, 2 tests pass, `tsc:
  clean`).
- Repo vs dev-mods copy: `diff -r --exclude=types --exclude=node_modules
  --exclude=.git` lists only repo-only files; `tests/guard.test.ts` is in both.
- The fix touches no mod code, only the test and the doc; nothing ignored
  committed (`git diff adef1bd ef86bee --stat` lists two files).

## Still open

Nothing for this mission. The four manual-acceptance items of REVIEW-o1.md
stand by ruling (person-opened pane at 76 columns, pane at 144+ columns, Q4
round trip, `skill.prompt` behind `cc-plugin-sec-default`); they and the
`mcp__troupe__probe` hook without `.catch` and the possible stacking of the
`$.clock.every` timer are leftovers for FEASIBILITY.md / Phase 2.

## Verdict

PASS, 4 items for manual acceptance
