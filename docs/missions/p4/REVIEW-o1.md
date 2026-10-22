# Review: p4, order o1 (light mode, effort pin, steps line)

Reviewer: rev.r1. Branch `order/p4/o1` at 65cda9b (two commits on `feature/NO-JIRA-p4` 4602d27), diff
`feature/NO-JIRA-p4...order/p4/o1`: `hooks/dispatch.ts`, `hooks/plan.ts`, `hooks/view.ts`, `tests/*`
(dispatch, read-state, pane, panel.node, mock-p1) and one line in `docs/missions/p4/plan.md`.
`claude --version`: 2.1.308. Judged against the plan (o1, with its two addenda and compare.md's effort
pin), not the builder's notes. The orchestrator's ruling stands: a role the plan names no effort for is
pinned at the shown default (`high`).

Depth: `dispatch.ts` is the mod's high-risk surface, so I read its diff line by line and every caller of
what changed; `plan.ts` and `view.ts` likewise. I ran the rules, did not only read them (below).

## What I did

- **Read** the full diff of `hooks/` and the new tests. Callers of the changed `claudeArgv`/`argv`
  (`newSession`, `newWindow`), of `rule()` and of `reviewerBrief()` are all in `dispatch.ts`; each passes
  the new `effort` argument. `readPlan`'s new `light` parameter has one caller.
- **`./check.sh` with tsc** (engine types copied from the o1 worktree into `.claude-plugin/`, `npm ci` for
  `typescript` in my worktree; both gitignored). Run 1: exit 1, one pane test failed ('the pane leaves
  "Plan OK?" once an approval record holds…', the known timing flake, load 5–6). Run 2: exit 0 up to the
  end of the tests (80 plugin tests, 7 panel tests, walkthrough "all checks hold"), then it stopped at
  "tsc missing" because my worktree had no `node_modules`. `npm ci`, then `tsc -p .`: **clean**.
- **Mutation, to see the tests bite.** Removed the `isLight(plan.orders) &&` guard of the serial rule:
  5 tests fail, among them "a full mission's independent orders are both dispatched at once". Made every
  light review "final" (dropped the last-order test): "the review of a light mission's last order…" fails.
  Both restored (worktree clean apart from my reports).
- **The light steps in the view**, driven through `detail()` for a 3-order mission at Final review and a
  2-order one at MR OK?, at widths 30, 40, 60 and 120 (script in my scratch). Result below.

## Behaviour against the plan

- **Serial rule.** `rule()` refuses a builder dispatch while an order before it in `serialOf`
  (dependency layer, then plan order) is not merged, only when `isLight(plan.orders)`: one or two orders.
  A mission of three or more is untouched (the mutation shows the test for it bites); a light mission's
  first order has nothing before it; reviews return earlier in `rule()` and are not serialised. A plan
  with a cycle or an unknown dependency never gets here (its `problems` refuse first), so `indexOf`
  cannot be -1. The refusal names the order that is waited for, the base branch and "whatever
  depends_on says". Matches the plan.
- **The light last-order brief.** `finalDuty` fires only for a light mission's last order in `serialOf`
  (`m.order` is the plan's own object, so the `!==` identity holds), names the base commit (merge-base of
  the mission branch with `origin/HEAD`, else `main`, else `master`, skipping the mission branch itself),
  gives `git diff <base>..<branch>`, asks for every done-when one by one, and says there is no slim and no
  other final review. With no base found it says so and tells the reviewer to run `git merge-base`.
  The first order's review and a full mission's carry none of it. A re-review (the `-fix` branch) gets the
  same duty. In a serial light mission the last order's branch is cut after the first merged, so the diff
  from the base covers both orders.
- **argv per role.** `claude --model <m> --effort <e>`: a builder gets the order's model and the builder
  role's effort, a reviewer the reviewer role's model and effort. The model is checked against `MODELS`
  in `rule()` and the effort against `EFFORTS` through `readPlan`'s problems, both before they reach
  tmux, so nothing unchecked goes into the command. `claude --help` lists `--effort <level> (low, medium,
  high, xhigh, max)`, the same set. The dispatch answers (all three) say what was pinned.
- **Reviewer's skills** are in the review brief like the builder's.
- **Steps line.** `stepsOf` drops Intent and `main` always, and Slim, Cut and Final review for a light
  mission; the pane and troupe-panel share `detail()`, so both show it; the light mission reaches
  "MR OK?" (`stepOf` unchanged, now tested). `graph.ts` draws only the gates and needed no change.
  The Phase 1 view golden gained the line (3 lines added, 2 removed); `tests/mock-p1.ts` was added to
  `touches` in the same commit, as the rules ask.

## Act on

None.

## Consider

1. **The steps line loses its colours where a wrap lands on a label.** `stepsField` colours each step by
   looking the whole label up after splitting the wrapped text on ` → `; `wrap()` breaks at any space, so
   a label cut in two (`Order` / `review`, `◆` / `MR OK?`) or followed by its arrow (`Order review →`)
   is not found and is painted dim, whatever its state. The step the mission is at is the one that
   matters, and it goes dim when it sits at a wrap edge.
   Repro: render `detail(m, 60)` for a 2-order mission at "MR OK?": the current step comes out as `◆` and
   `MR OK?` on two lines, both `dim`, no `warn`/bold; at width 40 `Order` / `review` are `dim` though
   done. At 120 the arrow trails `◆ Merged? →` and the same happens to it. Widths of 30–60 are the
   panel's normal range (it takes half the window, at least 30 columns). The text itself is right and
   the header still names the current step, so this is a look, not a lost fact. Fix shape: wrap the steps
   as tokens (a step and its arrow stay whole) and paint each token. Siblings: every step label with a
   space (`Plan OK?`, `Order review`, `Final review`, `MR OK?`, `Open MR`) and every gate marker.
2. **The base commit is a guess at the default branch.** `baseCommitOf` uses the merge-base with
   `origin/HEAD` / `main` / `master`. For a mission cut from another branch (`develop`, a release branch)
   that commit is older than the mission's real base, so the last review is told to read more than the
   mission's own diff. The skill defines the base as the merge-base with the branch the mission was cut
   from, which only the orchestrator knows. Not blocking (the acceptance run branches from `main`; the
   brief says how the base was found, so a reviewer can tell); one line in the skill, or the
   orchestrator naming the base branch in the review, would close it.

## Noted

1. **Effort when the plan names none (the ruling).** Builder and reviewer always get `--effort high`
   unless a `roles` block leaves the role out altogether, in which case `effortOf` answers `''` and the
   flag is dropped (the same for the model). Consistent with the ruling and with what the pane shows
   (a role missing from the block is not shown).
2. **A `research` order never gets an `<id>: ` merge commit**, so in a light mission the serial rule
   would wait on it forever (the existing `depends_on` check has the same property). The skill's merge
   step is about code orders; no light research mission is planned. Worth a line if one ever is.
3. **The commit changes `plan.md`** (`tests/mock-p1.ts` joins `touches`). Merging it voids the approval
   record, so the orchestrator must have the plan approved again before the next dispatch (o3 and o4
   are still to go).
4. **`./check.sh` is flaky under load**, as the builder and the orchestrator say: one pane test failed
   once in two runs here.
5. **Not driven live**: the serial refusal and the final-review brief are checked by unit tests against
   a fake git and tmux (and by my mutations); the acceptance run (o4) is their first real use.

## Dismissed

- "A light rule that is too wide would refuse a full mission's parallel orders" (the plan's own risk):
  checked, the guard is `isLight`, and removing it fails the full-mission test.
- "`stepsOf` hides steps the pane still needs": `STEPS` and `stepOf` are unchanged; only the new line
  filters, and the header and graph read `STEPS` directly.
- "Effort injected into the tmux command": it passes `EFFORTS` through `readPlan` first; a bad value
  makes the plan refuse before dispatch.

## What I could not verify

Nothing needs the human's eye beyond Consider 1 (a colour at a wrap edge, checked by rendering). The
live behaviour of both light rules waits for o4.

## Verdict

PASS
