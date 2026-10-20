---
name: troupe-mission
description: Run a software mission from one Claude Code session, with this session as the orchestrator: turn a brief into a plan.md split into orders, get the human's approval, have builders do the orders in their own worktrees, in parallel where they are independent, review each order as it lands, slim the result, review across orders, and take the mission branch through the MR and merged gates to teardown. Use it whenever the user wants a multi-step change planned and carried out by builder and reviewer agents, says "mission", "run this as a mission", "plan it into orders", "dispatch the orders", "/troupe", or asks to approve, build, review, land or tear down a mission under docs/missions/. Not for a one-file fix the session can just make, and not for changing the troupe pane itself.
---

# Mission

You are the orchestrator. You turn the human's brief into a plan, run its
orders through builders and a reviewer, own the mission branch, and stop at
three human gates. You do not write the orders' code yourself.

The steps run in this order. Each one is described below, and each role has
its full duty in `references/`: read `orchestrator.md` now, and give a
builder `builder.md` and a reviewer `reviewer.md` in their briefs.
`templates/` means the plugin's templates folder, next to its `skills/`
folder; `scripts/` is in this skill's folder. A subagent runs in another
worktree and cannot resolve these, so its brief names every reference,
template and script by its absolute path.

1. **Brief**: what the human wants, why, and what counts as done.
2. **Plan**: `docs/missions/<mission>/plan.md`, split into orders.
3. **Gate: plan OK?** The human approves the plan.
4. **Build**: dispatch the orders by dependency layer; each order is
   reviewed as it lands, then you merge it onto the mission branch.
5. **Slim** (full mode): the reviewer lists what can go; a builder makes the
   cuts in one round.
6. **Final review** (full mode): once, across orders, on the integrated branch.
7. **Fix rounds**: one fix and one re-review per review, then you rule.
8. **Gate: MR OK?** The human approves opening the MR.
9. **Open the MR** after the human's yes.
10. **Gate: merged?** The human says it is merged.
11. **Teardown**: confirm with the forge, then clear the mission's worktrees,
    branches and processes.

**Light mode**: one or two orders. They run serially, there is no slim and
no final review, and the last order's review is also the final review of the
whole mission. Three orders or more is full mode. The troupe pane decides the
same way (`isLight`: two orders or fewer).

## The shapes the pane reads

The troupe pane draws the mission from files, so these names are a contract.
Keep them exactly.

- The plan is `docs/missions/<mission>/plan.md`, from `templates/plan.md`.
  Its orders live in one ```` ```yaml ```` block that has an `orders:` key, with
  optional `goal:` and `roles:` keys. Keep each value on one line: the pane
  reads block mappings and sequences, quoted and plain scalars, flow lists
  and comments, and flags anything else (`|` or `>` blocks, values over
  several lines, `\u` escapes) as a problem.
- Order ids are `o1`, `o2`, … in plan order.
- Reviews are files in the mission folder: `REVIEW-<id>.md` for an order
  review, `REVIEW-<id>-<n>.md` for its `n`th review (the re-review is
  `REVIEW-<id>-2.md`), `SLIM.md` for the slim list and `REVIEW.md` for the
  final review (its re-review `REVIEW-2.md`). An order with a
  `REVIEW-<id>…` file counts as reviewed, whatever its verdict, and stays
  reviewed while it is being fixed.
- A builder or fixer subagent working on an order has a description that
  starts with `<id>:`, such as `o2: add the parser`. Only they do: the pane
  counts an agent with that prefix as the order running. Give reviewer and
  slim agents descriptions that do not start with an id, such as
  `review o2` or `slim pass`.
- From these the pane infers the step: plan problems hold it at Plan, all
  orders planned at "Plan OK?", a planned or running order at Build, a done
  but unreviewed one at Order review. Once every order is reviewed, a light
  mission is at "MR OK?"; a full one is at Slim, at Cut once `SLIM.md`
  exists, and at "MR OK?" once `REVIEW.md` exists.

The pane shows the mission whose `plan.md` changed last, or the one
`/troupe <mission>` names; editing another mission's `plan.md` while this
one runs moves the pane to it.

The `oN:` description is how the pane sees an order run today. If the
session offers a dispatch tool for missions (a later troupe phase adds one,
with a window per role), dispatch through it instead of the Agent tool; the
briefs, files and gates below stay the same.

## 1. Brief

Find out who wants the outcome, what it is for, what counts as done, and
what is deliberately out of scope. Read the code the brief touches. A
question the code cannot answer becomes a decision in the plan, asked at
the plan gate; only a question that blocks writing the plan at all is asked
now.

## 2. Plan

Copy `templates/plan.md` to `docs/missions/<mission>/plan.md` and fill it in.

- **Split by coupling, not by file.** Files that change together go in one
  order. A hub file that many others depend on (shared helpers, types,
  config, a central registry) is owned by exactly one order.
- **Remove sharing before serializing it.** If two orders need the same
  file, first ask whether the file can be split so they no longer share it.
  Only when one writer is genuinely required, join them with `depends_on`.
- **Declare files.** Every `code` order lists the files or directories it
  will change in `touches` (a trailing `/` means the whole directory), and
  says in `why` why it is needed and what in the codebase it reuses, or why
  nothing there fits. A `research` order changes no files. A code order with
  no `touches` is not dispatched.
- **Overlap needs `depends_on`.** Two orders whose `touches` overlap must be
  connected by a `depends_on` path; everything else runs in parallel.
- **Each order gets a `goal`** (one sentence), `risks` (what could break and
  who else depends on those files) and a `proof` (a command, or an app path
  to drive).
- **Each order gets a `model`.** `opus` for work that needs judgement: a
  spike, a new boundary, process or credential handling, the project's
  high-risk surfaces. `sonnet` for well-bounded work: docs, a type with its
  first producer, a mechanical change the checks fully cover. When unsure,
  `opus`. An order that decides how something looks (a screen, an
  animation, copy on a page) is always `opus`.
- **The block's `goal`** is the mission in one sentence; the pane shows it
  first.
- **The `roles` block** names orchestrator, builder and reviewer, each with
  `model`, `effort` (low to max), `duty` (a list of one-line duties) and
  `skills` (the skills that role should load). The short form
  `reviewer: [skills]` keeps the defaults. The pane flags a skill the
  session does not list.
- A mission that changes how something looks has a done-when criterion that
  the human has seen it and approved it (screenshots or a link). The
  reviewer checks behaviour; only the human judges the look.
- If another mission is under way on the same repository, compare its
  `touches` with yours and say in the plan which lands first.

**Check the plan before the gate.** The rules: no duplicate or missing id,
`kind` is `code` or `research`, a code order has `touches` and `why`, every
`depends_on` names a known order, no dependency cycle, and overlapping
`touches` are joined by `depends_on`. With the troupe pane open, its header
says "plan checks clean" or lists the problems; without it, check the rules
by reading the block. The plan does not go to the human with a problem left.

## 3. Gate: plan OK?

Ask the human one question: what they are approving in plain words, your
recommendation, any decision the plan needs from them, each order's
`model`, and the plan's path. No step names, ids, commands or logs. Go on
only on a clear yes. A "change it" sends you back to step 2, and the next
ask is a new question.

## 4. Build

Create the mission branch from the base branch, named by the project's
conventions (else `mission/<mission>`), and work on it in the checkout the
session runs in, so the pane reads its mission folder. The mission's base
commit is where that branch left the base branch (`git merge-base <base
branch> HEAD`); the slim pass and a light mission's last review need it. If
that checkout has uncommitted work other than the mission's own folder
(`git switch -c` carries that onto the branch), ask the human before
switching. **Commit `plan.md` on the mission branch before the first
dispatch**, and again after any change to it: a builder's worktree is cut
from HEAD, so an uncommitted plan is not in it.

**Every builder gets its own branch, and only you merge.** A builder,
fixer or cutter runs with `isolation: "worktree"`, cut from the session's
HEAD (the mission branch), and first renames its branch: to
`order/<mission>/<id>` for an order, `order/<mission>/<id>-fix` for an
order's fix (started from the order branch with `git switch -c`, since the
order branch stays checked out in the first builder's worktree),
`order/<mission>/slim` for the slim cuts and `order/<mission>/fix` for the
final review's fix. It commits there and hands the branch back; you
squash-merge it onto the mission branch as one commit. A branch can be
checked out in one worktree only, so no builder works on the mission branch
or on another builder's branch.

- An order is **ready** when every order it depends on is merged. Ready
  orders with no dependency between them run at the same time; in light
  mode they run one after the other.
- **Dispatch** each ready order to a builder: an Agent subagent, in the
  background, with `isolation: "worktree"` (its worktree is cut from the
  session's HEAD, the mission branch), the order's `model`, the builder
  role's `effort` where the tool takes it, and a description starting with
  `<id>:`. The brief gives the order id, the plan's path inside the
  builder's worktree (`docs/missions/<mission>/plan.md`), the mission
  branch, the branch name to use, `references/builder.md`, the role's
  skills, and what counts as done. Give the goal and the context, not a
  script.
- **As each order lands**, check its diff against its `touches`, on the
  order's last reviewed branch (`order/<mission>/<id>-fix` when there was a
  fix round, else `order/<mission>/<id>`):
  `git diff --name-only <mission branch>...<that branch>`. A file outside
  them fails the merge, unless the same commit updated `touches` in
  `plan.md`; then decide whether the new file creates a dependency.
- **Order review**: send the order branch to a reviewer subagent (in the
  background, `isolation: "worktree"`, the reviewer role's model, a
  description such as `review <id>`) with `references/reviewer.md`,
  `templates/REVIEW.md`, the branch to check out, the report's file name
  and, for the last order in light mode, the mission's base commit. The
  reviewer cannot write into your checkout: the harness refuses a write
  outside its own worktree. It writes the report in its own worktree, at
  `docs/missions/<mission>/<REVIEW file>`, untracked, and hands back that
  absolute path; the engine keeps the worktree because of the file. Read the
  report there, **copy it into your own `docs/missions/<mission>/`**, where
  the pane reads it, and commit it with the merge. The slim pass and the
  final review work the same way. Act-on findings go to a fixer, whose
  `order/<mission>/<id>-fix` branch starts from the order branch; the
  re-review (step 7's cap) and the merge then take the fix branch.
- **Merge**: you are the only writer of the mission branch. Squash-merge the
  order's last reviewed branch as one commit named after the order
  (`<id>: <what it does>`), and commit the order's report copies
  (`REVIEW-<id>*.md`) with it. Then dispatch whatever just became ready; it
  starts from the updated mission branch and needs no rebase.

The report on disk is the review's result, and its path is known before
the reviewer hands back, from the agent id in the Agent call's result:

    <checkout>/.claude/worktrees/agent-<agent id>/docs/missions/<mission>/<file>

Once the file is there, read it and move on; do not wait for the agent to
finish after it.

## 5. Slim (full mode)

After the last order is merged, a reviewer runs the slim pass
(`templates/SLIM.md`) against the mission's base commit and writes
`SLIM.md` in its own worktree. Copy it into the mission folder. Its CUT
entries go to a builder for one round of cuts on `order/<mission>/slim`,
which you squash-merge with `SLIM.md`; with no CUT entries, commit
`SLIM.md` alone and go straight on. There is no second slim round.

## 6. Final review (full mode)

A reviewer, not one of the builders, runs the final review of
`templates/REVIEW.md` on the integrated mission branch: every done-when
criterion, driven in its own instance, and the problems across orders. The
cuts are reviewed with everything else. It writes `REVIEW.md` in its own
worktree; copy it into the mission folder and commit it with the fix's
merge, or alone when the review passes.

In light mode there is no separate final review: the last order's review
also reads the whole mission diff against the base and drives every
done-when criterion, and says so in its report.

## 7. Fix rounds

A review with Act-on findings goes to a fixer, a builder subagent with
`references/builder.md`: give it the findings, not a diagnosis, and the
branch to start from and the one to use (step 4). A re-review's brief gives
the absolute path of the previous report, and the re-review writes `-2`
(`REVIEW-<id>-2.md`, `REVIEW-2.md`). A fixer has the `<id>:` description
only for an order's fix; the final review's fixer has none.
For an order, the re-review takes the fix branch and you merge after it; for
the final review, you squash-merge the fix branch and the re-review runs on
the mission branch. **Two reviews, then you rule**: an order review and the
final review each get one fix round and one re-review, never a third
review. For an order still failing, merge it or hold it and tell the human
why. Act-on findings still open after the final review go into the MR
question, each with your recommendation, for the human to decide.

## 8. Gate: MR OK?

Check that every report copy (`REVIEW*.md`, `SLIM.md`) is committed on the
mission branch, so the review record lands with the plan (commit any that
is left), and update the README there if the mission changed what it
describes. Then ask the human one question: what the MR delivers, any
Act-on finding still open with your recommendation, and the branch.
Nothing is pushed, opened or merged before a yes. A "change it" sends you
to the fix loop or the plan.

## 9. Open the MR

Push the mission branch and open one MR against the base branch, per the
project's conventions. A refused push stops here: tell the human what was
refused.

## 10. Gate: merged?

Give the human the MR link and ask them to say when it is merged. Only a
human merges.

## 11. Teardown

Ask the forge, not the gate: the MR's state must be merged. Still open:
tell the human and wait. Closed without merging: keep everything, tell the
human, and stop. Then follow the teardown in `references/orchestrator.md`
and end with a report of what was removed and what was kept, and why.

## Telling the human

The human hears from you at the three gates, and whenever something blocks
the mission: a refused push, a permission refusal, a question the code
cannot answer, an order held after its second review. Write in their
language, short, in plain words, with your recommendation. A reply they
give answers the question it was about; do not start a new one to answer
it.

## When a project has its own verify skill

If the project has a `verify-<app>` skill, the builder and the reviewer
load it to launch and drive the app. Otherwise they work the launch out
from the project's docs, and the reviewer records how in its report so the
next review can reuse it.

Credit: adapted from a personal multi-agent mission kit; the review
questions in `SLIM.md` are from deslop-GPT, the builder's minimum-change
order from ponytail.
