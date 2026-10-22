# Slim: p4, light mode, the skill, metrics (Phase 3)

Slim pass over the integrated mission branch `feature/NO-JIRA-p4` at e3d0774 (all orders merged: o1, the
o1-mode follow-up, o2, o3, o5; o4 deferred to issue #3), against the mission's base commit c0d784b. Done by
an Opus subagent in a fresh context from `templates/SLIM.md` and the numbers below; I wrote its list here.
`claude --version`: 2.1.308.

Numbers (`slim_numbers.sh`): 8 new duplicate blocks, 82 lines (all in tests); no touched file over 1,000
lines.

**6 CUT entries.**

## CUT

**CUT 1: one owner for the mission's base commit.** `hooks/dispatch.ts` `baseCommitOf` (about 10 lines) and
the inline block in `hooks/metrics.ts` `gather` ("The base: where the mission branch left…", about 13 lines)
do the same thing: the merge-base of the mission branch with origin's HEAD, else `main`, else `master`. They
ask git differently: dispatch uses `symbolic-ref --short refs/remotes/origin/HEAD`, metrics uses `rev-parse
--abbrev-ref origin/HEAD`. Merge them into one helper, e.g. `baseOf(git, missionBranch) → {commit, branch} |
undefined`, in `mission.ts` beside `gitFacts` (which needs `mission.ts` added to the slim order's touches in
`plan.md`) or in `metrics.ts` beside `slugOf`, which dispatch already imports. Keep dispatch's `symbolic-ref`
call. README "Known limits" names this as one rule, so the light final-review brief and `metrics.json` must
not be able to disagree.
*Why it is safe:* each copy has one caller (`finalDuty`, `gather`). The dispatch test asserts the exact calls
`['git','-C',ROOT,'symbolic-ref','--short','refs/remotes/origin/HEAD']` and then `merge-base main
feature/NO-JIRA-demo`, and the helper keeps that sequence. The metrics test's fake answers exit 1 for
`symbolic-ref` and `BASE` for `merge-base`, so `base_commit` stays `BASE` and `base_commit_from` still says
"with main". Dispatch's `{commit, branch}` maps onto metrics' `baseCommit` / `baseFrom`; the `missing.base`
message stays in `gather`.
*Proof:* `./check.sh` with tsc, in particular the dispatch test "the review of a light mission's last order is
also its final review…" and the first metrics test.

**CUT 2: one owner for "this session's transcript".** `hooks/dispatch.ts` `ownPermissionMode` and
`hooks/metrics.ts` `gather` both build the same path: `CLAUDE_CONFIG_DIR` or `$HOME/.claude`, then
`/projects/<slugOf(cwd|root)>/<session id>.jsonl`. Export one `ownTranscript($, extraPlaces = [])` from
`metrics.ts` returning `{path, text, folder}`. `ownPermissionMode` then shrinks to `const own = await
ownTranscript($); return own ? lastPermissionMode(own.text) : ''`, and `gather` uses it with `[root]`,
keeping `folder` for the `subagents/` read. dispatch then imports `ownTranscript` instead of `slugOf`. About
8–10 fewer lines, and one place follows Claude Code's transcript layout when it changes.
*Why it is safe:* the only callers are `dispatch()` (through `ownPermissionMode`) and `gather`. Both test
fakes serve `/home/t/.claude/projects/-work-repo/S1.jsonl` with `HOME=/home/t`, session id `S1`, cwd
`/work/repo`, and the lookup order (cwd, then root, then gather's git root) is unchanged. Keep dispatch's
`.catch` on `env.get`.
*Proof:* `./check.sh`, in particular "a role window runs this session's permission mode…" and the two
metrics sheet tests.

**CUT 3: `tests/dispatch.test.ts`, the test "a full mission's independent orders are both dispatched at once"
(jscpd 275-280 = 591-596).** Delete it (8 lines).
*Why it is safe:* the older test "a second order opens a window in the same role session…" already
dispatches VALID's o1 and o3 (a three-order mission, o3 with `depends_on: []`, nothing merged) and asserts
both "Dispatched". That covers o1's proof item "a three-order mission's independent orders still both
allowed". No done-when item names this test.
*Proof:* `./check.sh`. The older test still asserts `Dispatched o1 …` and `Dispatched o3 …`.

**CUT 4: `tests/dispatch.test.ts`, the dead `originHead` scaffolding.** Remove the `World.originHead` field and
its doc line, the `symbolic-ref` handler line in the git fake, and `originHead: 'origin/main'` in "a full
mission's order review is never the final review".
*Why it is safe:* only that full-mission test sets `originHead`, and there `finalDuty` returns before git is
asked, so the value is never read. Without the handler, `symbolic-ref` falls through to the fake's default
`ran('', 1, 'unexpected git call')`; `ok()` treats that as no answer, exactly like the current 128, so the
light test's expected calls (`symbolic-ref`, then `merge-base main …`) are unchanged.
*Proof:* `./check.sh`. The light final-review test's `toEqual` on the symbolic-ref and merge-base calls still
passes.

**CUT 5: `hooks/metrics.ts` `sheetOf`, the top-level `fix_rounds`.** It is the same `fixRounds` value as
`rework.fix_rounds`; compare.md lists `fix_rounds` under "Rework and friction", and the plan's done-when asks
for review rounds, not a top-level fix count. Drop the top-level field. `summaryOf` reads `(sheet.rework as {
fix_rounds: number }).fix_rounds`, `tests/metrics.test.ts:157` checks `sheet.rework.fix_rounds`, and
README.md:260 drops `fix_rounds` from that line (line 269 already lists it under `rework`). Per-order
`orders[].fix_rounds` stays.
*Why it is safe:* the only readers are `summaryOf`, that one test line and the README. No `metrics.json`
exists yet (the acceptance run was deferred). A person comparing arms reads the value once, where compare.md
puts it.
*Proof:* `./check.sh`. The first metrics test still checks the summary's "1 fix round(s)".

**CUT 6: README.md, the bullet "Role windows exist only for an order's build and its review; the other jobs
are Agent subagents (see "The skill")"** at the end of "Dispatching the orders". README says it twice more:
in "The skill" ("`troupe_dispatch` takes an order's build and its review. Agent subagents take what it does
not…") and in "Known limits" ("Role windows exist only for an order's build and review…"). Delete this first
copy (2 lines).
*Why it is safe:* prose only. The done-when ("README describes … the skill") is met by "The skill" section.
*Proof:* read the README's "Dispatching the orders", "The skill" and "Known limits" together.

## Stays

- **jscpd `tests/mock-p1.ts:6-35 = 63-92`.** Generated goldens (DOCKED and VIEW_30, "regenerate only on
  purpose") from an older mission; this mission added one `steps:` line to each.
- **jscpd `tests/approval.test.ts:45-56 = tests/metrics.test.ts:94-105`.** The fs.read/fs.write engine fake.
  Each test file keeps its own fake (the repo's convention); a shared one would touch four older test files
  without making any shorter to read.
- **jscpd `tests/dispatch.test.ts:184-191 = tests/metrics.test.ts:119-126`.** The end of `world()` plus the
  `start` helper. Same reason: per-file fake.
- **jscpd `tests/dispatch.test.ts:96-102 = tests/metrics.test.ts:86-91`.** The fs.list fake; dispatch's also
  handles links and mtimes. Same reason.
- **jscpd `tests/dispatch.test.ts:122-128 = tests/split.test.ts:44-50`.** session.usage, agent.list and
  env.get boilerplate. Same reason.
- **jscpd `tests/approval.test.ts:34-39 = tests/metrics.test.ts:75-80`.** register and ui boilerplate. Same
  reason.
- **jscpd `tests/dispatch.test.ts:91-96 = tests/metrics.test.ts:78-83`.** session.start, cwd, root and id
  boilerplate. Same reason.
- **The rest of `hooks/metrics.ts` and its sheet.** Each field maps to compare.md's Metrics or the plan's
  done-when. The `*_from` notes, `prices` and `subagents` are the provenance a person needs before trusting a
  cross-arm number, and the README documents them.
- **`readTranscript`'s fallback regexes (`HOOK`, `CLASSIFIER`, `DECLINED`)** for transcripts with no
  permission decision: a boundary in a format that moves, and the metrics fixture's hook refusal (no
  decision) depends on them.
- **`PRICES`, `priceOf`, `PRICES_SOURCE`.** compare.md's `cost_usd` asks for cache read and write priced
  apart, and tests cover them.
- **`lastPermissionMode` and the `PERMISSION_MODES` allow-list.** Validation at the boundary between the
  transcript and tmux argv.
- **`dispatch.ts` `serialOf`, `finalDuty`, `effortOf`, the light refusal in `rule()`, the reviewer brief's
  skills line.** Done-when items, each tested.
- **`plan.ts` `stepsOf` and `view.ts` `stepsField`.** The done-when requires the pane to name the light
  steps; the split-and-retone in `stepsField` is needed because `field` wraps the text before painting it.
- **`plan.ts` `LIGHT_REVIEWER_DUTY` and `roleOf(…, light)`.** The pane's ROLES detail reads the duty; without
  them a light plan would show "Runs the final review across the orders". The read-state test covers it.
- **`register.tsx` (3 lines of wiring) and `approval.ts` (one prompt string).** Minimal.
- **The `MISSIONS` and `NAME` constants and the local `run` in `metrics.ts`.** Each hooks module keeps its
  own (read-state and dispatch already do); one-liners.
- **The new tests in `pane.test.tsx`, `panel.node.mjs` and `read-state.test.ts`.** The done-when says
  `claude plugin test` covers the pane and the panel, and the panel is a separate program; the `labels` lines
  in read-state overlap the pane test but are 3 lines next to unique `stepOf` and duty checks.
- **The skill prose (SKILL.md, references/).** Light mode is restated at the step a reader jumps to; the
  SKILL.md / orchestrator.md overlap is the pre-existing two-file shape; "Without role windows" is new and
  needed.
- **`templates/plan.md` and `templates/REVIEW.md`.** Small, accurate additions the skill relies on.
- **README "Light mode", "The skill", "Metrics" and ROADMAP's Phase 3 outcome.** Done-when items.

## Notes for the orchestrator (not cuts)

- `skills/troupe-mission/SKILL.md:48-49` says the mod adds "three tools" and lists dispatch, status and
  close; `troupe_metrics` is the fourth (the README says four). I checked the line: it is as the subagent
  says. A one-word fix, in prose the final review will otherwise meet.
- The origin/HEAD branch of the base lookup is tested nowhere: no test has `origin/HEAD` resolve, in dispatch
  or in metrics. After CUT 4 nothing pretends to test it. If CUT 1 lands, one test of the shared helper with
  origin/HEAD set would cover both callers.
- Without CUT 1, dispatch and metrics ask git for origin's HEAD in two different ways; if they ever
  disagreed, the light final-review brief and `metrics.json` would name different base commits.
