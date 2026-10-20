# Walkthrough: a sample mission through `troupe-mission`

A written run, not a live one. The mission `idcheck` is made up: "the plan
check flags an order id that is not `oN`", two orders in this repo. I had only
the skill (`skills/troupe-mission/`) and its references to go on. Each step
names the skill part it follows; **Gap n** marks where the skill was
ambiguous or could not be followed, and the last section lists them with what
changed. Hashes and agent ids are placeholders. `<repo>` is the troupe
checkout the session runs in (here it is also the plugin's folder), and
`<scratch>` is the project's scratch folder.

Fixtures: `sample/plan.md`, `sample/REVIEW-o1.md`, `sample/REVIEW-o1-2.md`,
`sample/REVIEW-o2.md`. They stand for what `docs/missions/idcheck/` holds at
the MR gate. The check reads them with the pane's own reader:

```
node --import ./docs/missions/workflow/register.mjs --experimental-transform-types --no-warnings docs/missions/workflow/check-sample.mjs [folder]
```

Run from the repo root (the `--import` path is relative to the cwd; the
fixtures are found from the check file). `folder` defaults to `sample/`.

## 1. Brief (SKILL §1)

The human says: "The pane never complains about an order called `step-2`, and
then it never shows as reviewed. Make the plan check say so." I read
`hooks/plan.ts` (`checkPlan`) and `hooks/read-state.ts` (`stateOf` matches
`REVIEW-<id>.md`). Done: `o01` is flagged, `o1` and `o10` are not, the
template stays clean, the README names the rule. Out of scope: old plans,
drawing. Nothing blocks writing the plan, so I ask nothing yet.

## 2. Plan (SKILL §2)

I copy `templates/plan.md` to `docs/missions/idcheck/plan.md` and fill it in:
`sample/plan.md`. Two orders. o1 owns `hooks/plan.ts` (the reader is a hub file)
and `tests/read-state.test.ts`; o1 is `opus`. o2 writes the README line and a
test that the template obeys the rule; `tests/read-state.test.ts` is in both,
so o2 has `depends_on: [o1]`; o2 is `sonnet`. Check before the gate: with no
pane open I check the rules by reading. **Gap 1**: the skill gives no command
for that; `check-sample.mjs` runs `readPlan` and is the mechanical version.

## 3. Gate: plan OK? (SKILL §3)

My question to the human, in their language, no ids or commands:

> I plan to make the plan check flag order ids that are not `o1`, `o2`, …,
> in two steps: first the check itself (the stronger model), then the README
> line and a test that the plan template obeys the rule (the faster model).
> I recommend it as is. Nothing else needs your decision. The plan is
> `docs/missions/idcheck/plan.md`. OK to start?

The human says "yes".

## 4. Build (SKILL §4)

- The checkout is `<repo>`, on `main`. The only
  untracked file is `docs/missions/idcheck/`. **Gap 2**: the skill said to ask
  the human about "uncommitted work"; that would have asked about the plan
  itself. Fixed in the text (the mission folder is excepted).
- `git switch -c feature/NO-JIRA-idcheck` (the project's convention), then
  `git merge-base main HEAD` gives the base commit `a1b2c3d`. **Gap 3**: the
  skill used "the mission's base commit" without saying where it comes from;
  fixed.
- `git add docs/missions/idcheck/plan.md && git commit -m "Add the idcheck plan"`
  (commit the plan before the first dispatch, SKILL §4).
- Layers: `[o1]`, `[o2]` (the check shows `o1 > o2`). Light mode (two
  orders): one at a time, no slim, no final review (SKILL intro, §5, §6).

### Dispatch o1 (SKILL §4, Dispatch)

Agent tool: `description: "o1: flag order ids that are not oN"`, `model: opus`
(o1's `model`), `isolation: "worktree"`, `run_in_background: true`. **Gap 4**:
"the builder role's `effort` where the tool takes it": the tool takes an
`effort` argument but its own text says to set it only when instructions ask;
the skill does ask, so I would pass `high`. Not changed, left for the dispatch
tool of Phase 3.

The brief:

- the goal: "checkPlan reports an order id that does not match oN", and why;
- the order id `o1`, and the plan inside your worktree:
  `docs/missions/idcheck/plan.md` (read `goal`, `why`, `touches`, `risks`,
  `proof`);
- the mission branch `feature/NO-JIRA-idcheck`; rename your branch to
  `order/idcheck/o1` (`git branch -m`);
- read `<repo>/skills/troupe-mission/references/builder.md`;
- the role's skills: none;
- done: `proof` of the plan, and `./check.sh` passes; hand back the branch,
  what changed, what you verified, what you did not.

### o1 lands: the touches check (SKILL §4, "As each order lands")

The builder hands back `order/idcheck/o1`.
`git diff --name-only feature/NO-JIRA-idcheck...order/idcheck/o1` lists
`hooks/plan.ts` and `tests/read-state.test.ts`: both declared. It passes.

### Order review of o1, which fails (SKILL §4 Order review, §7)

Agent: `description: "review o1"` (no `o1:` prefix), `model: sonnet`,
`isolation: "worktree"`, background. The brief: read
`<repo>/skills/troupe-mission/references/reviewer.md`
and `<repo>/templates/REVIEW.md`; check out
`order/idcheck/o1` detached; the plan is in your worktree; write the report as
`REVIEW-o1.md` in your worktree's `docs/missions/idcheck/`, untracked, and hand
back its absolute path.

It hands back `<repo>/.claude/worktrees/agent-<agent id>/docs/missions/idcheck/REVIEW-o1.md`,
verdict `FAIL: 1 Act-on finding` (`sample/REVIEW-o1.md`: `/^o\d$/` flags
`o10`). I read it there and copy it to
`<repo>/docs/missions/idcheck/REVIEW-o1.md`. The pane
now shows o1 as reviewed, although it failed (a limit of the reader, see
RECORD).

**C2.** The skill as first written told the reviewer to write into my
checkout. Gap 5; the evidence is below, and the text is fixed to what is
described here.

### Fix round for o1 (SKILL §7, `builder.md` "Fixing review findings")

Agent: `description: "o1: fix the o1 review findings"`, `model: opus`,
`isolation: "worktree"`, background. The brief gives the findings (A1 as
written, not a diagnosis), says to start with
`git switch -c order/idcheck/o1-fix order/idcheck/o1`, to fix at the root,
and to hand back that branch. The order branch is checked out in the first
builder's worktree; `switch -c` creates a new branch from it, which git
allows (`builder.md` step 2 no longer reads as forbidding it: **Gap 6**,
fixed). It hands back `order/idcheck/o1-fix`: the pattern is now
`/^o[1-9]\d*$/`, with a test for `o10`.

Diff check on the order's last reviewed branch (the fixed wording, **Gap 7**):
`git diff --name-only feature/NO-JIRA-idcheck...order/idcheck/o1-fix` lists
the same two files. Passes.

Re-review: `description: "review o1 again"`, `model: sonnet`. The brief names
the branch `order/idcheck/o1-fix`, the previous report's absolute path
(`<repo>/docs/missions/idcheck/REVIEW-o1.md`;
**Gap 8**: the skill did not say how the re-reviewer gets it; fixed), and the
file `REVIEW-o1-2.md`. Verdict `PASS` (`sample/REVIEW-o1-2.md`). Two reviews
done, so no third (SKILL §7). I copy the report to the mission folder.

### Merge o1 (SKILL §4 Merge)

```
git merge --squash order/idcheck/o1-fix
git add docs/missions/idcheck/REVIEW-o1.md docs/missions/idcheck/REVIEW-o1-2.md
git commit -m "o1: flag order ids that are not oN"
```

One commit, with both report copies. o2 is now ready: its worktree is cut
from the updated mission branch.

### Dispatch o2 (SKILL §4, Dispatch)

Agent tool: `description: "o2: pin the plan template to the id rule and name
it in the README"`, `model: sonnet` (o2's `model`), `isolation: "worktree"`,
`run_in_background: true`. The session is on the mission branch after o1's
merge, so the worktree holds o1's change and the plan.

The brief:

- the goal: "The README names the rule, and a test pins the plan template to
  it", and why;
- the order id `o2`, and the plan inside your worktree:
  `docs/missions/idcheck/plan.md` (read `goal`, `why`, `touches`, `risks`,
  `proof`);
- the mission branch `feature/NO-JIRA-idcheck`; rename your branch to
  `order/idcheck/o2` (`git branch -m`);
- read `<repo>/skills/troupe-mission/references/builder.md`;
- the role's skills: none;
- done: `proof` of the plan (the new test fails when the template's second
  id is renamed to `o02`), and `./check.sh` passes; hand back the branch,
  what changed, what you verified, what you did not.

It hands back `order/idcheck/o2`. The diff check
`git diff --name-only feature/NO-JIRA-idcheck...order/idcheck/o2` lists
`README.md`, `templates/plan.md` and `tests/read-state.test.ts`: all
declared. Passes.

### Order review of o2, also the final review (SKILL §4 Order review, §6)

Agent: `description: "review o2"` (no `o2:` prefix), `model: sonnet`,
`isolation: "worktree"`, background. The brief:

- read `<repo>/skills/troupe-mission/references/reviewer.md` and
  `<repo>/templates/REVIEW.md`;
- check out `order/idcheck/o2` detached; the plan is in your worktree;
- this is the last order of a light mission, so the review is also the
  final review: read the whole mission diff against the base commit
  `a1b2c3d` (`git diff a1b2c3d order/idcheck/o2`), drive every done-when
  criterion, and say in the report that it is both;
- write the report as `REVIEW-o2.md` in your worktree's
  `docs/missions/idcheck/`, untracked, and hand back its absolute path.

**Gap 9**: the skill said the last review reads the whole mission diff
against the base but never put the base commit in the brief; fixed. It
reports `PASS` (`sample/REVIEW-o2.md`). I copy it in and merge as for o1:
`git merge --squash order/idcheck/o2`, `git add .../REVIEW-o2.md`,
`git commit -m "o2: pin the plan template to the id rule"`.

The mission folder now holds the sample's files. The check (which stands for
the pane) prints:

```
ok   readPlan gives no problems: none
ok   two orders: 2: o1, o2
ok   layersOf: o1 first, o2 after it, nothing stuck: o1 > o2
ok   isLight: 2 orders
ok   stateOf o1 is reviewed: reviewed; REVIEW files: REVIEW-o1-2.md, REVIEW-o1.md
ok   stateOf o2 is reviewed: reviewed; REVIEW files: REVIEW-o2.md
ok   stepOf gives "MR OK?": MR OK?
all checks hold
```

## 5. Gate: MR OK? (SKILL §8)

All report copies are committed already (§8 now says to check, not to move
them). The README line came with o2. No Act-on finding is open. My question:

> The plan check now flags order ids that are not `o1`, `o2`, …; the README
> says so. Both steps were reviewed; the first needed one fix and passed the
> second review. Nothing is left open. OK to open a merge request from
> `feature/NO-JIRA-idcheck` into `main`?

The human says "yes".

## 6. Open the MR (SKILL §9)

`git push -u origin feature/NO-JIRA-idcheck`, then `glab mr create` against
`main` with the mission's goal as the description. If the push were refused, I
would tell the human what was refused and stop.

## 7. Gate: merged? (SKILL §10)

I give the human the MR link and ask them to say when it is merged. They
merge it, and say so.

## 8. Teardown (SKILL §11, `orchestrator.md` Teardown)

1. `glab mr view feature/NO-JIRA-idcheck --output json` says `merged`.
2. `git worktree list` shows the two builders', the fixer's and the three
   reviewers' worktrees under `.claude/worktrees/`. Each reviewer's holds its
   untracked report, so `git worktree remove` would refuse it. I delete the
   report copies there (each is committed on the mission branch), then
   `git worktree remove <path>` for every one, never `--force`.
3. Delete the branches with `git branch -D`: `order/idcheck/o1`,
   `order/idcheck/o1-fix`, `order/idcheck/o2`, the leftover
   `worktree-agent-<id>` branches of the fixer and the reviewers (**Gap 10**:
   the skill named the fixer's only; fixed to name a reviewer's too), and
   `feature/NO-JIRA-idcheck` (its tip is the MR's head commit).
4. `git fetch --prune`; fast-forward `main`; stop nothing (no server was
   started); delete the scratch folder.

`docs/missions/idcheck/` stays. Report: what was removed, what was kept.

## C2: the reviewer cannot write into the orchestrator's checkout

Seen on Claude Code 2.1.304, in auto mode, with two haiku subagents started
with `isolation: "worktree"` (summarised in `RECORD.md`). A write to the
session checkout's `docs/missions/…/REVIEW-probe.md` was refused by the
harness, not by a permission prompt: "This agent is isolated in the worktree
<repo>/.claude/worktrees/agent-<id>. Edit the
worktree copy of this file instead of the shared-checkout path." A write into
the agent's own worktree, untracked, succeeded; the engine then kept the
worktree because of that file, and `git worktree remove` refused it until the
file was deleted. So the skill now says: the reviewer writes in its own
worktree and hands back the path; the orchestrator copies the report into its
mission folder and commits it with the merge; teardown deletes the copies in
the reviewer worktrees first, without `--force`. A write outside any repo
(scratch) also succeeded in auto mode; whether other modes prompt was not
tried.

## The check failing once

A copy of `sample/` with o2's `depends_on` removed (the two orders still
overlap on `tests/read-state.test.ts`):

```
rm -rf <scratch>/broken && cp -r docs/missions/workflow/sample <scratch>/broken && sed -i 's/depends_on: \[o1\]/depends_on: []/' <scratch>/broken/plan.md && node --import ./docs/missions/workflow/register.mjs --experimental-transform-types --no-warnings docs/missions/workflow/check-sample.mjs <scratch>/broken
```

```
folder: <scratch>/broken
FAIL readPlan gives no problems: o1 and o2 overlap (tests/read-state.test.ts ~ tests/read-state.test.ts) but neither depends on the other
ok   two orders: 2: o1, o2
FAIL layersOf: o1 first, o2 after it, nothing stuck: o1+o2
ok   isLight: 2 orders
ok   stateOf o1 is reviewed: reviewed; REVIEW files: REVIEW-o1-2.md, REVIEW-o1.md
ok   stateOf o2 is reviewed: reviewed; REVIEW files: REVIEW-o2.md
FAIL stepOf gives "MR OK?": Plan
3 checks failed
```

Exit status 1. The check on `sample/` exits 0 with the output shown above.

## Where the skill could not be followed

Fixed in `skills/troupe-mission/` unless it says otherwise.

| Gap | What | Result |
| --- | --- | --- |
| 1 | No command for the plan check without the pane | Left. The rules are checked by reading; a plan-check command is Phase 3 |
| 2 | "Uncommitted work" in the checkout includes the plan itself | §4 excepts the mission folder |
| 3 | "The mission's base commit" had no source | §4 gives `git merge-base <base> HEAD` |
| 4 | `effort` on the Agent tool: the skill asks, the tool says set it only when asked | Left, for the dispatch tool |
| 5 (C2) | The reviewer was told to write into the orchestrator's checkout; the harness refuses | §4, §5, §6, §8, `reviewer.md`, `orchestrator.md` Merge, Slim and Teardown rewritten |
| 6 | `builder.md` step 2 "never check out another builder's branch" next to the fixer's `git switch -c` | Reworded: no branch another worktree holds; a new branch from one is fine |
| 7 | The touches check named the order branch, not the fix branch | §4 and `orchestrator.md` Merge item 1 name the last reviewed branch |
| 8 | A re-reviewer had no way to get the previous report | §7 and `reviewer.md`: the brief gives its absolute path. A probe confirmed a worktree agent can read a file in the session checkout by absolute path (auto mode) |
| 9 | The last order's light-mode review needs the base commit; the brief never gave it | §4 Order review: the brief gives it |
| 10 | Teardown named a fixer's leftover `worktree-agent-<id>` branch only | Reviewers' too, and how to find the name |
