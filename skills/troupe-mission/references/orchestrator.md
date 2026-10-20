# Orchestrator

You are the session the human talks to. You turn the brief into a plan, run
the orders, and own the mission branch. You do not write the orders' code.
`SKILL.md` gives the steps; this file gives the duties that need more than a
line there.

## Plan

- Read the brief and the code it touches before you split anything.
- Split by coupling, declare `touches`, join overlaps with `depends_on`,
  give each order a `model`, and check the plan's rules before the gate
  (`SKILL.md`, step 2).
- What the code cannot answer goes into the plan as a decision for the
  human, asked at the plan gate.

## Dispatch

- An order is ready when everything it depends on is merged. Send each
  ready order to a builder (`SKILL.md`, step 4). Orders with no dependency
  between them run in parallel; do not hold file locks while builders run.
- A builder's worktree comes from the session's HEAD, so keep the session on
  the mission branch while you dispatch, with `plan.md` committed there.
- Each builder, fixer and cutter works on its own branch (`SKILL.md`,
  step 4) and hands it back; you squash-merge it.
- An order's `model` is the builder subagent's model. Never switch a model
  with `/model`, yours or anyone's: Claude Code saves it as the human's
  default for every new session.

## Merge

You are the only writer of the mission branch. When a builder hands back an
order:

1. Check the order's diff against its `touches`:
   `git diff --name-only <mission branch>...order/<mission>/<id>`. Every
   changed file must sit under a declared path (a directory with a trailing
   `/` covers everything under it); `plan.md` itself is allowed. A file
   outside fails the merge: send it back, or accept a `plan.md` change made
   in the same commit and decide whether it creates a new dependency.
2. Send the order branch to a reviewer for an order review. Act-on findings
   go to a fixer, whose `order/<mission>/<id>-fix` branch starts from the
   order branch; the re-review and the merge then take the fix branch. When
   the human says they will test something by hand, the review still reads
   the diff but does not drive the app for what they will test.
3. Squash-merge the order's last reviewed branch onto the mission branch as
   one commit named after the order, with its review report.
4. Dispatch any orders that just became ready.

## Slim, final review and fix (full mode)

- After the last merge, a reviewer runs the slim pass with the mission's
  base commit. Its CUT entries go to a builder for one round of cuts on
  `order/<mission>/slim`, which you squash-merge; no cuts goes straight
  through.
- Then a reviewer runs the final review on the mission branch.
- A failed final review goes to a fixer with the findings, not a
  diagnosis; it works on `order/<mission>/fix` from the mission branch's
  tip. Squash-merge that branch, then review again.
- **Two reviews, then you rule.** No third review. For an order: merge it,
  or hold it and tell the human. After the final review: open Act-on
  findings go into the MR question, each with your recommendation.

In light mode the reviewer of the last order also reviews the whole mission
(`SKILL.md`, step 6). If the plan grows to three orders or more, it is a
full mission: say so at the plan gate.

## Land

The mission lands as one MR. The review reports and any README update are
on the mission branch before you ask. Pushing, opening or merging needs the
human's yes. After the yes, push and open the MR per the project's
conventions, then give the human the MR link at the merged gate.

## Teardown

Runs after the human says it is merged. It clears the mission from the
machine so the next one starts clean.

1. Ask the forge (`glab mr view <branch>`, `gh pr view <branch>`, or the
   project's equivalent) and go on only if it says merged.
2. `git worktree list`: remove every worktree of this mission (the
   builders', the fixers' and the reviewers') with `git worktree remove`,
   never `--force`. A worktree with uncommitted changes other than review
   reports already in the MR keeps its worktree; name it in the report.
3. Delete the mission's local branches: every `order/<mission>/…` branch,
   the branches the engine cut its worktrees on that are left behind (a
   fixer's, after `git switch -c`), and the mission branch. They were
   squash-merged, so `git branch -d` refuses them; use `-D`, but only
   for this mission's branches, and keep the mission branch if its tip
   differs from the MR's head commit.
4. Fetch with prune, then fast-forward the base branch in the checkout if
   it is on that branch and clean. Any other local change: leave it and say
   so.
5. Stop anything started for this mission that still runs (dev servers,
   app instances), and only those. Delete the mission's scratch folder.

`docs/missions/<mission>/` is in the repository and stays. End with the list
of what was removed and what was kept, and why.

## Standing rules

- Status comes from side effects: commits, report files, the agents'
  completion notices. Do not interrupt a builder to ask how it is going.
- If the project keeps a decision log, record a decision or a finding that
  future work needs there, in the change that made it.
