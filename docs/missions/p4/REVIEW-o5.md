# Review: p4, order o5 (README, ROADMAP outcome, RECORD, plugin.json)

Reviewer: rev.r1. Branch `order/p4/o5` at 18b7528 (one commit on `feature/NO-JIRA-p4` ea29038): `README.md`
(+167/-17), `ROADMAP.md` (+40), `docs/missions/p4/RECORD.md` (new), `.claude-plugin/plugin.json` (0.5.0).
Judged against the plan's order o5 ("every tool, file and number named in the docs exists in `hooks/`,
`skills/` or `docs/missions/p4/`") and its "Scope change" (the acceptance run deferred, nothing claimed as
run), not against the builder's notes. `claude --version`: 2.1.308.

Depth: docs only; the proof is the claims, so I read all of the README and the new ROADMAP and RECORD text
and checked each claim that names a tool, a field, a rule, a flag, a number or an event against the code, the
review files, the plan and the forge.

## What I did

- **`./check.sh` on the o5 branch** (fresh engine types still laid in my worktree): exit 0, 88 plugin tests
  pass, 7 panel tests pass, walkthrough holds, `claude plugin validate .` passes on the 0.5.0 manifest,
  **`tsc: clean`**.
- **Tools, rules, flags.** The four tool names and their `mcp__troupe__…` spellings; the two hard rules plus
  light mode's third; the refusal list (plan problems, unknown order, model list, id characters, live window,
  foreign `troupe-<mission>` session, not in tmux); role windows' flags and the permission-mode list
  (`default, manual, acceptEdits, plan, auto, dontAsk, bypassPermissions`, one argument, no flag when
  unreadable, bypass passed like any other); effort defaults (a role named without an effort and every role of
  a plan with no `roles` block get `high`; a role a `roles` block leaves out gets no flag); the brief's
  location and the typed sentence; which files the mod copies back (not `REVIEW.md` or `SLIM.md`):
  all match `dispatch.ts`, `plan.ts` and the skill.
- **Light mode.** Serial by dependency layer then plan order, the last order's review as the final review
  with the base commit and `git diff <base>..<branch>`, the header saying `light`, the steps line leaving out
  Slim, Cut and Final review, "MR OK?" once every order is reviewed: matches `dispatch.ts`, `view.ts`
  (header `light`, `plan` field `light (n)`) and `plan.ts`.
- **Metrics.** Every field the README lists is in `metrics.ts`'s sheet (`mode`, `mission_branch`,
  `base_commit`, `base_commit_from`, `mr_ready_commit`, `claude_version`, the `orders` fields, `review_rounds`,
  `fix_rounds`, `refused_dispatches`, `time`, `tokens` per role with `model_effective` / `effort_effective`,
  `coordination_share`, `quality.diff_size` and `diff_size_from`, `rework`, `subagents`, `prices`, `nulls`);
  the nulls it names are the ones the code nulls; the call-at-teardown order and the "before any fetch" rule
  are the skill's.
- **The skill's eight steps** against `SKILL.md` and the references: the same sequence and gates.
- **The deferral.** The README, ROADMAP and RECORD all say the acceptance run was deferred and none claims it
  ran. The issue exists: `glab issue view 3 -R AI/troupe` shows "Phase 3 acceptance run and the three-arm
  comparison", open, carrying the deferral text and the run's description.
- **RECORD against the review files and the queue.** The verdicts and finding counts for o1, o2, o2-2, o3,
  o3-2 and o1-mode are as in the reports; the fixes it names (the effort sentence in three places, the
  pathspec on both git calls, `roleOfSubagent`, `base_commit_from`) are what the fix branches did; the seat
  assignments (dev.b1 built o1 and the o4 set-up, dev.b2 o2, o3, the o1-mode follow-up and o5) match who sent
  each hand-back; the kit follow-ups (a)–(d) are the ones the o2 builder listed.

## Act on

1. **The README still says two things the code no longer does.**
   - `README.md:85` (Approving the plan): the Change words go to the conversation as `Tianqi asks: <words>;
     edit <mission folder>/plan.md, then /troupe again`. o3 (merged) changed the prompt to `Change asked in
     the plan dialog: <words>; edit <dir>/plan.md, then /troupe again` (`hooks/approval.ts:106`, and the test),
     because the old text named a person.
   - `README.md:316` (Known limits, "A globally installed troupe loads in role windows too"): "troupe starts
     them with `claude --model <model>` only." Role windows now start with `--model`, `--effort` and
     `--permission-mode` (`dispatch.ts` `claudeArgv`), and the README's own "What role windows are" says so
     at `:153`: the two paragraphs contradict each other. The point of the limit stands (`--bare` is still not
     passed), so the sentence only needs the flags corrected.
   Repro: `grep -n 'Tianqi asks\|claude --model' README.md` against `grep -n 'Change asked in\|permission-mode'
   hooks/approval.ts hooks/dispatch.ts`. Siblings looked for: every `Tianqi` in README, ROADMAP and RECORD
   (README:85 is the only one that quotes a prompt; ROADMAP and RECORD name Tianqi only as the decision-maker,
   which is the record's job), every statement of what a window is started with (`:153` correct, `:316`
   stale), every mention of the Change dialog (README:80–90 only).
2. **"`tsc` was skipped" is wrong for the mission, in two places.** `ROADMAP.md:109` ("tsc was skipped: no
   engine types laid in the worktree") and `docs/missions/p4/RECORD.md:39` ("`tsc` skipped (no engine types laid
   in the worktree)") say the mission's integrated build was not type-checked. It was: the orchestrator ran
   `./check.sh` with tsc clean on the integrated branch (types laid there), and I ran it with fresh types on
   o1, o3, o3-fix, o1-mode and again now on o5: `tsc: clean`, 88 plugin tests, 7 panel tests. Only o5's
   builder's own worktree had no types. As written the record understates what was verified, and ROADMAP is
   where a later phase will look. Repro: lay the types (`claude --plugin-dir .` once in this folder) and run
   `./check.sh`: ends `tsc: clean`. Siblings: the two sentences above are the only ones; README's "Checking
   it" states the skip as a general rule of the script (types needed), which is accurate. The fix is the
   truth in both: tsc clean on the integrated branch.

## Consider

None.

## Noted

1. **Two o4 set-up findings in RECORD are taken from the orchestrator's brief, not from a file in the repo**
   (the pane showing an older landed mission before the new plan exists; the global effort setting being
   `xhigh`), as is the `settings.local.json` `defaultMode` detail. The builder's hand-back says so; I did
   not re-derive them, and nothing in the record depends on them.
2. **ROADMAP's evidence line is honest about what ran for real:** "run only against a fake git and tmux in
   tests; `troupe_metrics` was also read against real transcripts in the reviews". True: my o3 reviews ran the
   reader on real transcripts (two of them, with an independent count) and the price table against its
   source.
3. **The README is long and several of its sections are older than this mission** (the pane and in-session
   pane sections); I read them for stale claims only where this mission changed behaviour (the approval
   prompt, role-window flags, light mode, steps line), which is where Act-on 1 came from.

## Dismissed

- "ROADMAP/RECORD claim the acceptance run happened": they do not; each says deferred, with the issue link.
- "`plugin.json` description is too long": it validates, and carries the pinning, light mode and metrics.
- "RECORD lists the o1-mode review as no findings": it says "no Act-on finding and no Consider", which is
  exact (the report has Noted items).

## What I could not verify

Whether the acceptance run's recipe in issue #3 works (it is not run, by design). The seat assignments rest
on who sent each hand-back, which I checked for o1, o1-mode, o3 and o5.

## Verdict

FAIL: 2 Act-on findings
