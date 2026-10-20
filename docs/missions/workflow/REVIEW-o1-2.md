# Re-review: workflow, order o1 (the mission workflow as a skill)

Second and last review of `order/workflow/o1`, now at b9e320c (one fix commit
on ec6a082), by rev.r1. Report only. Previous report: `REVIEW-o1.md`.
Claude Code 2.1.304.

## What I did

- Read the fix diff (ec6a082..b9e320c): 4 files, all under
  `skills/troupe-mission/`; `templates/` untouched. `git diff --name-only
  5761d26 b9e320c` still shows only `skills/`, the three templates and the
  plan, so o1 stays inside its `touches`.
- Re-ran `claude plugin validate .`: passes. `./check.sh`: exit 0, 22 pass,
  0 fail, tsc skipped as before.
- Re-ran the personal-terms grep over `skills/` and `templates/`: no match
  (the credit line does not hit the pattern list either).
- Rehearsed the branch rules exactly as the text now says them, in a scratch
  repo (removed afterwards): plan committed on the mission branch; builder
  worktree from HEAD, `git branch -m order/m/o1`, commit; fixer worktree from
  HEAD, `git switch -c order/m/o1-fix order/m/o1`, commit; reviewer worktree
  `git checkout --detach order/m/o1-fix`; squash-merge of the fix branch onto
  the mission branch; teardown with `-D`.

## Previous Act-on findings

**A1: addressed** (fixer or cutter could not follow builder.md).
SKILL §4 now has the rule "Every builder gets its own branch, and only you
merge", and each case names its branch and start point: `order/<m>/<id>` for
the order, `order/<m>/<id>-fix` from the order branch with `git switch -c`,
`order/<m>/slim` and `order/<m>/fix` from the mission tip. The orchestrator
squash-merges the last reviewed branch. Siblings I named are done: SKILL §5
and §7, `orchestrator.md` (Dispatch, Merge items 2 and 3, the slim and
final-fix bullets, teardown step 3), `builder.md` (intro, step 2, slim cuts,
fixing) and `reviewer.md` (checks out the branch the brief names, `-fix` on a
re-review).

On the point you asked about, **the text as written works**, and the form is
better than the rehearsal's `checkout`. `git switch -c order/m/o1-fix
order/m/o1` runs in the fixer's worktree even though `order/m/o1` is checked
out in the builder's: the output was "Switched to a new branch", the tree held
the order's file and `plan.md`, the fix committed on top of the order commit.
The reviewer's detached checkout of the fix branch worked while the fixer's
worktree still held it. The squash-merge of the fix branch carried build and fix
as one commit. The engine's leftover `worktree-agent-<id>` branch from the
fixer exists after `switch -c`, and teardown step 3 now deletes it (checked:
`git branch -D` removed it, nothing else was left). Plain `checkout
order/m/o1` in the fixer's worktree is refused (my first report's repro), so
the skill is right not to use it.

**A2: addressed** (plan.md not committed before dispatch).
SKILL §4 says to commit plan.md on the mission branch before the first
dispatch and again after any change; `orchestrator.md` Dispatch repeats it;
the builder brief gives the plan's path inside the builder's own worktree and
`builder.md` step 1 reads it there. In the rehearsal the builder's and the
fixer's worktrees both held `plan.md`.

## Previous Consider items

- **C1 (absolute paths): done.** SKILL intro says briefs name every
  reference, template and script by absolute path, `templates/` is "next to
  its `skills/` folder", and `reviewer.md` runs the slim script "by the
  absolute path your brief gives".
- **C3 (which plan the pane follows): done.** One paragraph under "The shapes
  the pane reads"; it matches `newestMission` and `setTarget`.
- **C2 (reviewer writes outside its worktree): left for o2**, as the
  orchestrator asked. Still open, still not blocking.

## New findings (from the fix itself)

### Consider

- **The diff check still names the pre-fix branch.** SKILL §4 ("As each order
  lands") and `orchestrator.md` Merge item 1 run `git diff --name-only <mission
  branch>...order/<mission>/<id>`. After a fix round the thing that merges is
  `order/<mission>/<id>-fix`, so a file the fixer adds outside `touches` is not
  checked. In the rehearsal the diff on `order/m/o1-fix` shows the whole order
  plus the fix, so pointing the command at the last reviewed branch is enough.
  One phrase: "the order's last reviewed branch". Sibling checked: the merge
  item 3 and the §4 Merge bullet already say "last reviewed branch".
- **Wording tension in builder.md step 2.** "Never check out ... another
  builder's branch" sits next to the fixer's `git switch -c ... order/<m>/<id>`,
  which starts from another builder's branch. It works and the fixing section
  says so, but a fixer reading step 2 first may hesitate. Optional:
  "never check out" → "never work on".

### Noted

- Nothing else broke. The new lines keep the pane contract: the `<id>:`
  description stays on order builds and the order fix only, and the final-review
  fixer and the slim cutter have none, so `stateOf` is unaffected. The
  fixer's order stays "reviewed" during a fix (the pane limit already noted
  for RECORD).
- `templates/` is unchanged by the fix and still has no structural change from
  5761d26.
- Not verified: a fresh agent following the new rules end to end (o2's
  walkthrough), and the engine's real `isolation: "worktree"` branch names
  with these renames (taken from FEASIBILITY Q6, not run).

## Dismissed

- Nothing new to dismiss.

## Verdict

PASS
