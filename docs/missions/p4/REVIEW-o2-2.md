# Re-review: p4, order o2 (the troupe-mission skill and templates)

Reviewer: rev.r1. Branch `order/p4/o2-fix` at 76adfb9 (one commit on `order/p4/o2` abf2149; 3 files:
`SKILL.md`, `references/orchestrator.md`, `templates/plan.md`). Previous report: `REVIEW-o2.md`. Checked
against o1's branch `order/p4/o1` at 65cda9b (`claudeArgv`, `effortOf`, `serialOf`, `finalDuty`, the
reviewer brief). `claude --version`: 2.1.308.

## The previous Act-on finding

1. **Effort "shown, not passed": addressed.**
   - `SKILL.md`, the `troupe_dispatch` paragraph: the window runs `claude --model <model> --effort
     <effort>`: the order's `model` for a builder, the reviewer role's for a reviewer, the role's
     `effort` from `roles`. o1's `claudeArgv(model, effort)` does exactly this, with `effortOf` reading
     the role's effort.
   - `SKILL.md`, the `roles` bullet: the "not passed" sentence is gone; it now says a role window runs at
     its role's `effort` and a builder window at its order's `model`. It also says the brief lists the
     role's skills; o1's reviewer brief does now list the reviewer's (`dispatch.ts:295`, `:302`).
   - `templates/plan.md`, the model paragraph: `claude --model <model> --effort <the builder role's
     effort>`.
   - Siblings I looked for again: `grep -n -i effort` over `skills/` and `templates/`, `references/*.md`,
     `templates/REVIEW.md`, `templates/SLIM.md`: no other statement of what a window runs.

## The three Considers

1. **"Last order": addressed.** Light mode is now "by dependency layer and then as `plan.md` lists them",
   and the review of "the order that runs last" is the final review, in the light-mode paragraph, step
   4, step 6 and `orchestrator.md`. That is `serialOf` (`layersOf(...).layers.flat()`) and `finalDuty`'s
   `serialOf(...).at(-1)` in o1.
2. **Refusal list: addressed.** The list now has the bad mission or order name or an order missing from
   the plan, the unrunnable model (opus, sonnet, haiku, fable), no mission branch, the session not in
   tmux, a `troupe-<mission>` session troupe did not open, and git or tmux failing to open the worktree
   or window. Each is a refusal in the code, and "the other order" is now "the order before it", as o1
   words it.
3. **Leftovers: addressed.** The undefined "scratch folder" became "delete any scratch files you made for
   it outside the repository"; the branch example is `feature/p4`; the gate's message says "the one
   command in it is the one they type". `grep -riE 'tianqi|prover|openrig|kit\b|NO-JIRA|scratch'` over
   `skills/` and `templates/` finds only that new scratch sentence and the credit line
   ("a personal multi-agent mission kit"), both fine.

## Nothing else broke

The fix touches only prose. Diff read in full: no file name, tool name, path or contract shape changed;
the pane's shapes section is untouched apart from the branch example. `./check.sh`: exit 0 (tsc skipped,
no types laid; same as before). The unfilled `templates/plan.md` through `check-sample.mjs`: no plan
problems, two orders, o1 > o2, `isLight`; the three stateOf/stepOf lines fail as expected with no REVIEW
files.

## Noted

1. **"`high` when the plan names none" is true for a role named without an effort, or a plan with no
   `roles` block, not for a `roles` block that leaves a role out.** o1's `effortOf` then answers `''` and
   the `--effort` flag is left out (the window runs claude's own default); the model follows the same rule.
   Narrow, and the skill's own template lists all three roles, so no change asked.

## Dismissed

- "The `--effort` flag may not exist on the installed claude": plan says `claude --effort` exists on
  2.1.308; not o2's to check.

## What I could not verify

Not driven: a live mission with this skill (o4), and o1's code, which is not merged (I read its diff
for the claims above).

## Verdict

PASS
