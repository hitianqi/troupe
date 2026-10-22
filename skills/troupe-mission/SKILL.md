---
name: troupe-mission
description: Run a software mission from one Claude Code session, with this session as the orchestrator. It turns a brief into a plan.md split into orders and gets the human's approval in the /troupe dialog. Builders do the orders in role windows (troupe_dispatch), each in its own worktree and in parallel where the orders are independent. Each order is reviewed as it lands, then the result is slimmed and reviewed across orders. The mission branch goes through the MR and merged gates to teardown, which records metrics.json. Use it whenever the user wants a multi-step change planned and carried out by builder and reviewer agents, says "mission", "run this as a mission", "plan it into orders", "dispatch the orders", "/troupe", or asks to approve, build, review, land or tear down a mission under docs/missions/. Not for a one-file fix the session can just make, and not for changing the troupe mod itself.
---

# Mission

You are the orchestrator. You turn the human's brief into a plan, run its
orders through builders and a reviewer, own the mission branch, and stop at
three human gates. You do not write the orders' code yourself.

The steps run in this order. Each one is described below, and each role has
its full duty in `references/`: read `orchestrator.md` now. Builders and
reviewers get `builder.md` and `reviewer.md` in their briefs; troupe pastes
them into a role window's brief itself. `templates/` means the plugin's
templates folder, next to its `skills/` folder; `scripts/` is in this
skill's folder. A builder or reviewer runs in another worktree and cannot
resolve these, so a brief you write names every reference, template and
script by its absolute path.

1. **Brief**: what the human wants, why, and what counts as done.
2. **Plan**: `docs/missions/<mission>/plan.md` on the mission branch, split
   into orders.
3. **Gate: plan OK?** The human approves the plan in the `/troupe` dialog.
4. **Build**: dispatch the orders by dependency layer; each order is
   reviewed as it lands, then you merge it onto the mission branch.
5. **Slim** (full mode): the reviewer lists what can go; a builder makes the
   cuts in one round.
6. **Final review** (full mode): once, across orders, on the integrated branch.
7. **Fix rounds**: one fix and one re-review per review, then you rule.
8. **Gate: MR OK?** The human approves opening the MR.
9. **Open the MR** after the human's yes.
10. **Gate: merged?** The human says it is merged.
11. **Teardown**: confirm with the forge, record `metrics.json`, then clear
    the mission's windows, worktrees and branches.

**Light mode**: one or two orders. They run one after the other, by
dependency layer and then as `plan.md` lists them; there is no slim and no
separate final review, and the review of the order that runs last is also
the final review of the whole mission. Three orders or more is full mode.
troupe decides the same way (two orders or fewer is light): the pane leaves
out Slim, Cut and Final review, and `troupe_dispatch` refuses a light
mission's second order until the first is merged, whatever `depends_on`
says.

## The tools troupe gives you

The troupe mod, loaded in this session, adds the pane or panel, the
`/troupe` command and four tools:

- **`troupe_dispatch {mission, order, role}`** opens one Claude window for
  an order (`role: builder`, the default) or for its review
  (`role: reviewer`). The window opens in the tmux session
  `troupe-<mission>` on this session's tmux server, in a worktree of its own
  beside the repository. The builder's worktree is `../<repo>-<mission>-<id>`
  on branch `order/<mission>/<id>`, cut from the mission branch. The
  reviewer's is `../<repo>-<mission>-review-<id>`, detached at that branch,
  or at `order/<mission>/<id>-fix` once that branch exists. The window runs
  `claude --model <model> --effort <effort>`: the order's `model` for a
  builder, the reviewer role's for a reviewer, and the effort of its role in
  `roles` (`high` when the plan names none). troupe writes the brief (the
  role reference included) into the repository's git folder and pastes one
  sentence naming it. troupe refuses a dispatch, with a reason you read, when:
  - the mission or order is not a plain name (letters, digits, `_`, `-`),
    or the order is not in the plan;
  - the plan has problems;
  - the order's or the reviewer role's model is not one a window runs
    (`opus`, `sonnet`, `haiku`, `fable`);
  - there is no approval record that holds for `plan.md` as it is now;
  - there is no mission branch, or it does not hold that same `plan.md`;
  - an order it depends on is not merged onto the mission branch;
  - in light mode, the order before it is not merged yet;
  - for a review, the order is not built yet;
  - the session is not inside tmux;
  - the window is already open, or a tmux session `troupe-<mission>` exists
    that troupe did not open;
  - git cannot add the worktree, or tmux cannot open the window.
- **`troupe_status {mission}`** lists the role windows: order, role, running
  or gone, and whether the brief was sent.
- **`troupe_close {mission, window}`** closes one window (`o1`, or
  `review-o1`), or with no `window` the whole role session. Worktrees stay.
- **`troupe_metrics {mission}`** writes `docs/missions/<mission>/metrics.json`
  at teardown, before anything is removed (step 11).

A builder hands back by writing `DONE-<id>.md` in its worktree's mission
folder; a reviewer by writing its report there. troupe copies both into
your mission folder every 2 s, for the mission the pane shows (the newest
`plan.md`, or the one `/troupe <mission>` names).

`troupe_dispatch` takes an order's build and its review. The other jobs
(an order's fixer, the slim pass and its cuts, the final review and its
fixer) go to Agent subagents, as in steps 5–7. If the session is not inside
tmux, troupe refuses every dispatch and says so; if the troupe tools are not
offered at all, the mod is not loaded. Either way, run the orders as Agent
subagents too, as `references/orchestrator.md` ("Without role windows")
describes, and tell the human once why.

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
- The approval record is `APPROVAL.json` beside `plan.md`; only the
  `/troupe` dialog writes it.
- A built order has `DONE-<id>.md` in the mission folder.
- Reviews are files in the mission folder: `REVIEW-<id>.md` for an order
  review, `REVIEW-<id>-<n>.md` for its `n`th review (the re-review is
  `REVIEW-<id>-2.md`), `SLIM.md` for the slim list and `REVIEW.md` for the
  final review (its re-review `REVIEW-2.md`). An order with a
  `REVIEW-<id>…` file counts as reviewed, whatever its verdict, and stays
  reviewed while it is being fixed.
- The mission branch is a local branch named for the mission: it ends in
  `/<mission>` or `-<mission>`, or is the mission's name, such as
  `mission/p4` or `feature/p4`. It does not start with `order/`.
- An order is merged when the mission branch has a commit whose subject
  starts with `<id>: `. Only order merges get that subject.
- An Agent subagent working on an order (its fixer, or its builder without
  role windows) has a description that starts with `<id>:`, such as
  `o2: fix the parser`. Only they do: the pane counts an agent with that
  prefix as the order running. Give reviewer and slim agents descriptions
  that do not start with an id, such as `review o2` or `slim pass`.
- From these the pane infers the step: plan problems hold it at Plan, all
  orders planned at "Plan OK?" until the approval holds, a planned or
  running order at Build, a built but unreviewed one at Order review. Once
  every order is reviewed, a light mission is at "MR OK?"; a full one is at
  Slim, at Cut once `SLIM.md` exists, at Final review once the mission
  branch holds `SLIM.md`, and at "MR OK?" once `REVIEW.md` exists.

The pane shows the mission whose `plan.md` changed last, or the one
`/troupe <mission>` names; editing another mission's `plan.md` while this
one runs moves the pane, and troupe's copying of results, to it.

## 1. Brief

Find out who wants the outcome, what it is for, what counts as done, and
what is deliberately out of scope. Read the code the brief touches. A
question the code cannot answer becomes a decision in the plan, asked at
the plan gate; only a question that blocks writing the plan at all is asked
now.

## 2. Plan

Create the mission branch from the base branch, named by the project's
conventions (else `mission/<mission>`), in the checkout this session runs
in: the pane reads the mission folder there, and you merge there. If that
checkout has uncommitted work (`git switch -c` would carry it onto the
branch), ask the human before switching. Copy `templates/plan.md` to
`docs/missions/<mission>/plan.md` and fill it in.

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
  `reviewer: [skills]` keeps the defaults. A role window's brief lists its
  role's skills; the pane flags a skill the session does not list. A role
  window runs at its role's `effort` (`claude --effort`), and a builder
  window at its order's `model`.
- **A project's verify skill.** If the project has a `verify-<app>` skill
  (it launches and drives the app), name it in the builder's and the
  reviewer's `skills`; `builder.md` and `reviewer.md` tell them to load it.
  Without one, leave it out: they work the launch out from the project's
  docs, and the reviewer records how.
- A mission that changes how something looks has a done-when criterion that
  the human has seen it and approved it (screenshots or a link). The
  reviewer checks behaviour; only the human judges the look.
- If another mission is under way on the same repository, compare its
  `touches` with yours and say in the plan which lands first.
- Settle the plan before the gate. Any later change to `plan.md`, yours or
  an order's, voids the approval, and the next dispatch waits until the
  human approves again.

**Check the plan before the gate.** The rules: no duplicate or missing id,
`kind` is `code` or `research`, a code order has `touches` and `why`, every
`depends_on` names a known order, no dependency cycle, and overlapping
`touches` are joined by `depends_on`. The pane's header says "plan checks
clean" or lists the problems; without the pane, check the rules by reading
the block. The plan does not go to the human with a problem left.
**Commit `plan.md` on the mission branch**: troupe dispatches only a plan
the mission branch holds.

## 3. Gate: plan OK?

Tell the human, in one short message, what they are approving in plain
words, your recommendation, any decision the plan needs from them, each
order's `model`, and the plan's path. No step names, ids or logs; the one
command in it is the one they type. Ask them to type `/troupe <mission>` and
answer the dialog:
**Approve** accepts the plan as written, your recommendations included;
**Change** takes their words, which come back to you as a prompt. A
different answer to a decision is a Change.

- Approve writes `APPROVAL.json` (the plan's hash and the time) beside
  `plan.md`. Commit it on the mission branch alone; `plan.md` must not
  change with it.
- A Change sends you back to step 2: edit the plan, check it, commit it,
  and ask again in a new message. The next `/troupe` raises the dialog
  again.
- A dismissed dialog, or one left unanswered, approves nothing.

Without the troupe mod, ask the same question in chat and go on only on a
clear yes. Dispatch then runs as Agent subagents (above).

## 4. Build

The mission's base commit is where its branch left the base branch
(`git merge-base <base branch> <mission branch>`); the slim pass and a light
mission's last review need it.

**Every builder gets its own branch, and only you merge.** A builder works
on `order/<mission>/<id>`. An order's fixer works on
`order/<mission>/<id>-fix`, started from the order branch. The cutter works
on `order/<mission>/slim`, and the final review's fixer on
`order/<mission>/fix`. Each commits there and hands the branch back; you
squash-merge it onto the mission branch as one commit. A branch can be
checked out in one worktree only, so no builder works on the mission branch
or on another builder's branch.

- An order is **ready** when every order it depends on is merged; in light
  mode, when the order before it is merged. Dispatch every ready order at
  once with `troupe_dispatch {mission, order}`: one window each, so
  independent orders build at the same time. Read each answer. A refusal
  names its reason: fix it, don't retry as is. An answer that says the
  brief was not sent, or is still in the window's input box, needs the
  human to press Enter or type the sentence it gives in that window: tell
  them which window.
- **The role windows are the human's to watch.** Permission prompts, a
  builder's question and the trust dialog of an untrusted folder wait
  there. Tell the human once where they are: the tmux session
  `troupe-<mission>` on this session's tmux server
  (`tmux switch-client -t troupe-<mission>` from inside tmux;
  `tmux attach -t troupe-<mission>` from another terminal, with the same
  `-L` or `-S` as this session's server if it has one).
- **Wait without polling.** Nothing wakes you when a window finishes, so
  arm a wait for each result as you dispatch it: one background Bash
  command that ends when the file appears, with a bound, such as
  `timeout 7200 bash -c 'until [ -f <file> ]; do sleep 15; done'`. The
  harness wakes you when it exits. The files are
  `<worktree>/docs/missions/<mission>/DONE-<id>.md` for a builder and
  `<review worktree>/docs/missions/<mission>/REVIEW-<id>.md` (a re-review:
  `REVIEW-<id>-2.md`) for a reviewer; the dispatch answer names the
  worktree. A wait that times out: check `troupe_status` and tell the human
  which window to look at.
- **As each order lands**, read its `DONE-<id>.md`. If troupe has not
  copied it into your mission folder (the pane shows another mission), copy
  it. Check the order's diff against its `touches`, on its last branch
  (`order/<mission>/<id>-fix` after a fix round, else
  `order/<mission>/<id>`):
  `git diff --name-only <mission branch>...<that branch>`. A file outside
  them fails the merge, unless the same commit updated `touches` in
  `plan.md`; then decide whether the new file creates a dependency, and
  know that merging it voids the approval (step 2).
- **Order review**: `troupe_dispatch {mission, order, role: "reviewer"}`.
  troupe gives the reviewer the branch, the plan, `templates/REVIEW.md` and
  the report's name. In light mode, the review brief of the order that runs
  last also says that this review is the mission's final review and gives
  the base commit.
  The report lands in the reviewer's worktree and is copied into your
  mission folder like `DONE-<id>.md`. A PASS goes to the merge. Act-on
  findings go to a fixer (step 7).
- **Merge**: you are the only writer of the mission branch. Squash-merge the
  order's last reviewed branch as one commit named after the order
  (`<id>: <what it does>`, the subject troupe reads as merged). Commit the
  order's `DONE-<id>.md` and report copies (`REVIEW-<id>*.md`) with it.
  If the merge changed `plan.md`, ask the human to approve again
  (`/troupe <mission>`, one line on why) before the next dispatch. Then
  dispatch whatever just became ready; troupe cuts its worktree from the
  updated mission branch.
- Leave a finished window open; close one with `troupe_close` only to
  dispatch into it again (a re-review). Teardown closes the rest.

## 5. Slim (full mode)

After the last order is merged, a reviewer runs the slim pass
(`templates/SLIM.md`) against the mission's base commit: an Agent subagent
in the background, with `isolation: "worktree"` (cut from the session's
HEAD, so keep the session on the mission branch), the reviewer role's
model, a description such as `slim pass`, and `references/reviewer.md`,
`templates/SLIM.md` and `scripts/slim_numbers.sh` by absolute path. It
writes `SLIM.md` in its own worktree, untracked, and hands back the
absolute path. The harness refuses its writes into your checkout, and the
engine keeps its worktree because of the file. Copy it into the mission
folder. Its CUT entries go to a builder subagent (`references/builder.md`)
for one round of cuts on `order/<mission>/slim`, which you squash-merge
with `SLIM.md`. With no CUT entries, commit `SLIM.md` alone and go straight
on. There is no second slim round.

An Agent subagent's report path is known before it hands back, from the
agent id in the Agent call's result:

    <checkout>/.claude/worktrees/agent-<agent id>/docs/missions/<mission>/<file>

Once the file is there, read it and move on; do not wait for the agent to
finish after it.

## 6. Final review (full mode)

A reviewer subagent, not one of the builders, runs the final review of
`templates/REVIEW.md` on the integrated mission branch, the same way as the
slim pass (a description such as `final review`): every done-when
criterion, driven in its own instance, and the problems across orders. The
cuts are reviewed with everything else. It writes `REVIEW.md` in its own
worktree; copy it into the mission folder and commit it with the fix's
merge, or alone when the review passes.

In light mode there is no separate final review: the review of the order
that runs last also reads the whole mission diff against the base and drives
every done-when criterion, and says so in its report.

## 7. Fix rounds

A review with Act-on findings goes to a fixer: an Agent subagent in the
background with `isolation: "worktree"`, the order's `model`,
`references/builder.md`, the findings (not a diagnosis), the absolute path
of the report, the branch to start from and the one to use (step 4). An
order's fixer has the description `<id>: fix …` and starts its branch with
`git switch -c order/<mission>/<id>-fix order/<mission>/<id>`. The final
review's fixer has a description with no id, and its worktree already holds
the mission branch's tip, on a branch it renames to `order/<mission>/fix`.

- **An order's re-review**: close its review window
  (`troupe_close {mission, window: "review-<id>"}`), then dispatch the
  reviewer again. troupe reopens the reviewer's worktree on the fix branch
  and names the report `REVIEW-<id>-2.md`; you merge the fix branch after
  it.
- **The final review's re-review**: squash-merge the fix branch, then a
  reviewer subagent reviews the mission branch again, with the previous
  report's absolute path, and writes `REVIEW-2.md`.

**Two reviews, then you rule**: an order review and the final review each
get one fix round and one re-review, never a third review. For an order
still failing, merge it or hold it and tell the human why. Act-on findings
still open after the final review go into the MR question, each with your
recommendation, for the human to decide.

## 8. Gate: MR OK?

Check that every report and done copy (`DONE-*.md`, `REVIEW*.md`,
`SLIM.md`) and `APPROVAL.json` are committed on the mission branch, so the
record lands with the plan (commit any that is left). Update the README
there if the mission changed what it describes. Then ask the human one
question: what the MR delivers, any Act-on finding still open with your
recommendation, and the branch. Nothing is pushed, opened or merged before
a yes. A "change it" sends you to the fix loop or the plan.

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
human, and stop. Then, before anything is removed, call
**`troupe_metrics {mission}`**. It writes
`docs/missions/<mission>/metrics.json`: the orders and their models, the
review rounds, the refused dispatches, wall times and cost where troupe can
know them, `null` with a reason where it cannot. It answers the file's path
and a one-line summary. It reads the order branches, the role windows and
the mission folder, so it runs first. Without the tool, say that no metrics
were recorded. Then follow the teardown in `references/orchestrator.md` and
end with a report of what was removed and what was kept, and why, with the
metrics summary and the file's path.

## Telling the human

The human hears from you at the three gates, and whenever something blocks
the mission: a refused push, a permission refusal, a question the code
cannot answer, a role window waiting on them, an order held after its
second review, a plan change that needs approval again. Write in their
language, short, in plain words, with your recommendation. A reply they
give answers the question it was about; do not start a new one to answer
it.

Credit: adapted from a personal multi-agent mission kit; the review
questions in `SLIM.md` are from deslop-GPT, the builder's minimum-change
order from ponytail.
