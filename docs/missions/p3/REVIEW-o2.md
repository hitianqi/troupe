# Order review: p3 / o2

Reviewer rev.r1 (Sonnet 5.5). Order branch `order/p3/o2` at f275250 (one
commit), against the mission branch `feature/NO-JIRA-p3` (9610612). Judged
against `docs/missions/p3/plan.md`, o2's goal, risks and proof, and against my
own o1 review (Consider 1 and 2, Noted 1). `claude --version`: 2.1.306
(Claude Code), tmux 3.4.

Diff scope: 10 files. `bin/troupe-panel` is outside o2's declared touches as
the plan stood; the plan gained that line in the same commit
(`docs/missions/p3/plan.md`) and orch.lead accepted it. Nothing else
undeclared. `tests/mock-p1.ts`, `tests/mock.test.ts`, `tests/panel.node.mjs`
and `check.sh` are untouched: no golden moved.

## How I checked

- `./check.sh` in my worktree: exit 0, `tsc: clean`, 57 plugin tests pass, 0
  fail; `node --test tests/panel.node.mjs` 5/5; the workflow walkthrough
  holds. (`tsc` first failed on `troupe_close` with the types I had copied from
  o1's load: the engine lays the tool names it saw when it loaded the mod, so
  the types must come from a load of o2's tree. With the types dev.b1's o2
  worktree laid, it is clean. Not a defect.)
- Read all of `hooks/dispatch.ts` and the diffs of `mission.ts`, `plan.ts`,
  `read-state.ts`, `bin/troupe-panel`; the tests' titles against the plan's
  proof list.
- Re-ran the dry run: `docs/missions/p3/dry-run/run.sh` from a copy outside
  the repo (so its `output.txt` did not touch the tracked one), on my own
  scratch repo and `env -u TMUX -u TMUX_PANE` tmux server under
  `~/scratch/troupe/rev/`: **15/15 PASS**, the server gone at the end.
- Then probed what the dry run does not, in a second scratch repo and
  server (two missions, `sample` and `big`, an orchestrator `claude
  --plugin-dir <my worktree> --model haiku` asked in plain sentences; role
  windows on my own login, opus and sonnet). Nothing on OpenRig's tmux
  server, nothing against the troupe checkout. Server killed and `rev/`
  deleted afterwards.
- Reuse: `git init`, copy `docs/missions/workflow/sample/plan.md` to
  `docs/missions/<name>/plan.md`, commit it, branch `feature/NO-JIRA-<name>`,
  write `APPROVAL.json` as `sha256sum plan.md` by hand (o3's dialog is not in
  this tree), then drive the tools through the orchestrator.

## What I observed

| Case | Result |
| --- | --- |
| Dry run, all 15 checks | PASS. |
| Real builder in o1's window | Read the brief and **wrote `DONE-o1.md` in its worktree on its own**, as the new brief says (1.7 KB, an honest "not buildable in this scratch repo"). The dry run had written the marker by hand; this is the first time a real builder did. |
| `DONE-o1.md` copy route | Copied into the mission folder on the 2 s poll, with no `/troupe` run, for the **newest or `/troupe`-targeted mission only** (see Consider 3). |
| Reviewer dispatch | Refused with no branch and with no marker (unit tests; and the dry run's order); with both, opened `review-o1` in `troupe-sample`, worktree `<repo>-sample-review-o1` detached at `order/sample/o1`, sonnet; the reviewer read the brief and wrote `REVIEW-o1.md` in its own worktree, which was copied into the mission folder. |
| Re-review | After `troupe_close review-o1` and a new `order/sample/o1-fix` branch with a commit, dispatch took the `-fix` branch, named the report `REVIEW-o1-2.md`, and the reviewer wrote and returned it. (Consider 2: the checkout was not moved by the mod.) |
| `troupe_close` for one window, for the session | Closed the one window by its kept id; with no window it killed `troupe-<mission>`. When I killed the session and created **another session of the same name** (`troupe-sample:foreign`), `troupe_close` with no window did not touch it. |
| Gone window reopened (o1 Consider 1) | `tmux kill-window` on o1: `troupe_status` said `gone`; `troupe_dispatch o1` opened a new window in the **same worktree**, no git error. |
| Gone session reopened | `tmux kill-session troupe-big`: dispatch opened the session again in the existing worktree; `troupe_status` listed it `open`, `o1 running`. |
| Committed-plan refusal (o1 Consider 2) | With `plan.md` edited and re-approved but not committed: `the approved plan.md is not what feature/NO-JIRA-sample holds: commit it on the mission branch, then dispatch. Nothing was dispatched.` With a **338 KB plan** committed and approved the dispatch went through, so a large plan is not cut short by the command's output limit. |
| The keep race (o1 Noted 1) | Read the code: `keepWindow` merges one window into the record at the moment of the write. The unit test interleaves three dispatches. Not reproduced live (I did not need to: the earlier parallel runs were already clean). |
| The two leftovers | A fix round stays `reviewed` (test pins it; the state function is unchanged for REVIEW files, the new `done` marker sits after it). `stepOf` reaches `Final review` only with SLIM.md in the folder **and** committed on the mission branch (one `git log -1 -- SLIM.md`, asked only when the file is there); the walkthrough and the panel's goldens did not move. |

## Act on

None.

## Consider

1. **A builder that commits its `DONE-<id>.md` makes the merge abort.** The
   mod keeps a copy of the marker untracked in the orchestrator's
   `docs/missions/<m>/`. I committed the marker on the order branch (what
   `git add -A` does) and ran `git merge --no-ff order/sample/o1-fix` in the
   orchestrator's checkout: `error: The following untracked working tree files
   would be overwritten by merge: docs/missions/sample/DONE-o1.md … Aborting`.
   The brief tells the builder not to commit it, and the hand-back says "a
   committed marker just lands with the merge, which is harmless"; it does not,
   and the copy comes back within 2 s if the orchestrator deletes it while the
   window is kept (it must `rm` and merge in one command, or `troupe_close` the
   window first). Cheapest fix: copy the marker only if the destination is
   missing and the worktree's file is untracked, or name it as ignored in the
   brief and in `.gitignore`; at least say in the orchestrator-facing text that
   a committed marker needs the copy removed first. Siblings: `REVIEW-<id>*.md`
   has the same shape if a reviewer commits its report (the reviewer brief says
   leave it untracked).
2. **A reused reviewer worktree is not moved to the branch it is told it
   is on.** After the re-review dispatch the worktree still stood at the first
   review's commit (`abaa025`) while the brief said "detached at
   order/sample/o1-fix". It reached the fix only because the reviewer ran `git
   checkout --detach` itself, as `reviewer.md` tells it to (reflog shows the
   checkout). A reviewer that trusts the brief would review the old code.
   `worktreeFor` returns early when git already lists the path; for a reviewer
   it could run `git -C <path> checkout --detach <branch>` there. The builder
   side has the same shape: a reused builder worktree is not checked for the
   branch the brief names (in my run it sat on `order/sample/o1-fix` while the
   brief said `order/sample/o1`); only the sentence is wrong.
3. **Results are collected for one mission only: the one shown.** `refresh`
   calls `collectResults` for the newest mission (by `plan.md` mtime) or the
   `/troupe`-targeted one. With `sample` and `big` both dispatched, `big`'s
   marker was copied and `sample`'s real marker stayed in its worktree until I
   ran `/troupe sample`. A reviewer dispatch for the other mission is then
   refused `not built yet (no DONE-o1.md in …)` with the marker sitting in the
   worktree. With one mission in flight (this rig) it does not bite. A
   `collectResults` over every mission that has a kept role session would
   close it (`roles` knows them).
4. **The copy overwrites a mission-folder file whenever the texts differ.** I
   replaced the collected `REVIEW-o1.md` in the orchestrator's checkout with
   one line of my own; within 6 s the reviewer window's text was back. While a
   window is kept (it is kept after it has gone) an orchestrator's edit of a
   report, or a report it committed from another source, is reverted on
   every poll. Copying only when the destination is missing or older would
   keep the route as is and lose nothing.
5. **The copy follows a symlink.** A `DONE-o1.md` that is a symlink in the
   builder's worktree is read through: I pointed it at `/etc/hostname` and the
   mission folder got a regular file holding the host name. The builder can
   read any file already, so no new power, but the file then sits in the
   folder the orchestrator commits and pushes. `fs.stat` answers `isLink`;
   skipping links keeps "only those files" true.

## Noted

1. `dispatch` calls `forget($, mission)` whenever `liveSession` says the
   session is not there, and `liveSession` says so also when one `tmux display`
   fails for any reason (10 s timeout, a busy server). The kept windows are then
   dropped from the state, so `troupe_status` and `troupe_close` lose them while
   they may still run; the next dispatch is then refused "exists that troupe
   did not open". Rare; worth one retry before forgetting.
2. A done marker alone does not allow a dependent order: `rule` still asks for
   the order merged onto the mission branch (as in o1), while the plan's
   done-when reads "o1 marked done, o2 allowed". The dry run does the merge
   (an `o1: …` commit) before o2, so it satisfies the stricter rule. I think
   merged is the right rule (o2's worktree must carry o1's code), so I only
   record that the wording and the code differ.
3. `stepOf` reaches `Final review` as soon as SLIM.md is on the mission branch,
   even when only the slim list (no cuts yet) was committed; this follows
   `skills/troupe-mission` §5 as the builder cites it.
4. The reviewer and builder briefs and the report copy of `REVIEW.md` (the
   final review) and `SLIM.md` are by hand: `isResultOf` takes per-order files
   only, as the reviewer role says the orchestrator copies those.
5. The brief sits under `.git/troupe/…`, outside the worktree; on an account
   that is not in auto mode the first read of it may prompt in the window.
   Unchanged from o1's Noted 4; for o4's known limits.

## Dismissed

- A large plan cut short by the command's output limit (checked: a 338 KB plan
  passes the committed-plan comparison).
- `troupe_close` with a window name such as `constructor` or `__proto__` (from
  the code, not driven): the lookup returns an inherited property, but nothing is killed (its pane
  id is undefined, `isAlive` is false) and the answer reads `had already gone`.
- The lost-update race on interleaved dispatches: fixed as claimed; the
  remaining `forget` interleaving only refuses a second call (Noted 1).
- A golden moving: none changed; the panel's, the pane's and the
  walkthrough's checks all pass.
- The 14/15 earlier run of the dry run the builder mentions: the script I
  re-ran has no such check and passes 15/15.

## Manual acceptance

None for this order.

PASS
