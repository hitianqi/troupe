---
name: troupe-mission
description: Run a multi-step software change as a troupe mission, with this session as the orchestrator. You write a plan with the person, they approve it in the troupe panel, and each role then works in a real tmux window of its own (Claude Code or Codex), in its own git worktree and branch, in parallel where the files allow; a reviewer role checks each branch as it lands and you merge, then open the MR after the person's yes. Use it whenever the person wants work split across several agents or windows, says "troupe", "mission", "run this as a mission", "split this into roles", "open the roles", "dispatch", "开几个 agent 并行做", or asks to plan, approve, build, review or land a mission under docs/missions/, in Claude Code or in Codex. Not for a change one session can just make, and not for changing troupe itself.
---

# Mission

You are the orchestrator in the person's current agent session. The person
watches the panel beside you and the roles in the `roles` window, and can
talk to any role directly. You plan, dispatch, review the results, merge,
and stop at the person's gates. You do not write the roles' code.

The `troupe` CLI enforces what keeps the work correct: no role opens before
the plan, as it is now, is approved; one role is one worktree, one branch and
one pane; nothing is typed into a window that is not ready; each role's
`flags` pin its permission. When a command refuses, it says why: fix the
cause, do not retry as is or work around it. Never type into a role window
yourself (no `tmux send-keys`); use `troupe send`.

`troupe wait` and `troupe gate` block until something happens. Run them in
the background when your harness can, so it wakes you when they end;
otherwise give `--timeout` and run them again.

How far to read, how to split, what to ask and how long your messages are
is your judgment; the steps below are the order things happen in.

## 1. Brief

Run `troupe open` first, in the foreground (harmless if already open; never
`troupe up`, which starts a second orchestrator); pass its attach line to the
person when it gives one.

Find out what the person wants, why, what counts as done, and what is out of
scope. Read the code it touches. A question the code cannot answer becomes a
decision in the plan, with your recommendation; ask now only what blocks the
plan itself.

## 2. Plan

Create the mission branch `mission/<mission>` from the base branch in this
checkout (ask first if the checkout has uncommitted work), copy
`templates/plan.md` from this skill's folder to
`docs/missions/<mission>/plan.md`, and fill it in. Set `base:` to the mission
branch: each role's worktree is cut from it at dispatch, so a role sees what
you merged before it.

- **A role is a window.** Name roles for what they do (`api`, `web`,
  `review`). Split by coupling, not by file: files that change together go
  to one role, and a hub file (shared types, config, a registry) is touched
  by one role only. Where two roles would share a file, first try to remove
  the sharing (split the file); only then order them with `depends_on`.
  Fewer, fuller roles beat many thin ones: each is a window the person
  watches.
- **Each role says who runs it**: `agent` (`claude`, `codex`, or an adapter
  in `.troupe/agents/`), `model`, `effort`, and `flags`, which must pin its
  permission (Claude Code: `--permission-mode acceptEdits`; Codex:
  `-a on-request -s workspace-write`). Propose; the person decides at the
  gate. Propose a bypass mode only when the person asks for one.
  For Codex `workspace-write`, dispatch adds `--add-dir` for its Git index,
  shared objects and the mission's refs/reflogs. This permits commits, not
  writes to the main branch; roles still share the mission refs and objects.
- **Each role's text** is its `## Role: <name>` section: what to do, what
  not to change, how to prove it works. Builders also take
  `text: workflow:builder`.
- **One reviewer role by default**: `touches: []`, `reviews: [...]`,
  `text: workflow:reviewer`, on a different model from the builders where the
  person agrees. It reviews each branch as it lands.
- A change to how something looks needs a done-when criterion that the
  person has seen and approved it.
- **The top of the plan is what the person reads at the gate**, and the
  panel shows each done-when item on one line. Keep the intent to a few
  sentences and each done-when item to one checkable line, what and not how,
  usually three to six of them; the how goes in the role sections.

Run `troupe check` until it is clean. Commit the plan on the mission branch.

## 3. Gate: plan OK?

Tell the person in a few plain lines what they are approving, the decisions
with your recommendations, and who runs each role. Then run
`troupe gate plan "<one line>"`. The panel shows the plan gate: `a` approves
(and takes your recommendations), `c` sends their words back to you as
`change: <words>`, which sends you back to step 2: edit, check, commit, gate
again. Any later edit of `plan.md` or of a role text it references needs
approval again before the next dispatch.

## 4. Build

`troupe stage build`, then `troupe dispatch <role>` for every builder whose
`depends_on` are done; independent roles run at once. Arm one
`troupe wait --role <role>` per dispatched role. A role stuck on a dialog (a
trust prompt, a permission) shows in the panel as waiting on the person;
tell them which window if it stays. `troupe status` shows every role.

When a builder's result says `done`, read `.troupe/result.md` in its
worktree and check `troupe status`: files changed outside its `touches`
fail it (send it back, or change the plan and get it approved again). Then
it goes to review. `blocked` or `failed`: read why, then answer it with
`troupe send`, change the plan, or ask the person.

For startup readiness or before sending follow-up work, run
`troupe wait --role <role> --ready --timeout 60`; a dialog or gone pane
ends the wait early so you can act on it.

## 5. Review, fix, merge

`troupe stage review` once the first branch lands. Dispatch the reviewer,
then give it each branch in the order they land:
`troupe send review "Review role/<mission>/<role>: …"`. `troupe send` puts
the role's old result aside first, so `troupe wait --role` waits for the new
one.

- PASS: merge the role's branch onto the mission branch (one commit per
  role, subject `<role>: <what it does>`), then dispatch the roles that just
  became ready.
- Act-on findings: `troupe send <builder> "<the findings, or the review
  file's path>"` to the same window, on the same branch; then review again.
  **One fix round, then you rule**: merge it, or hold it and tell the
  person why. No third review.

## 6. Gate: MR OK?

When every role is merged: `troupe stage mr-ok`, then
`troupe gate mr-ok "<what the MR delivers; open findings with your
recommendation>"`. Nothing is pushed before `approve`. A change sends you to
the fix loop or the plan.

## 7. Open the MR and teardown

`troupe stage mr`; push the mission branch and open one MR against the base
branch, per the project's conventions. A refused push: tell the person and
stop. After opening the MR, run `troupe stage teardown`, then
`troupe teardown -m <mission>`. It removes mission-owned role panes,
worktrees, branches and temporary briefs/results while keeping the MR head
and log. It closes only role panes; the orchestrator and panel panes opened
by `up` stay open. Dirty or untracked files and unmerged commits refuse cleanup;
resolve them before retrying, or ask the person before discarding them with
`--force`. Repeating teardown with explicit `-m` is safe. Only a person
merges the MR.

## Telling the person

They hear from you at the two gates and whenever something blocks: a
refusal you cannot fix, a role waiting on them, a role held after its fix
round, a plan change that needs approval again. Their language, short,
plain words, your recommendation. No step names or logs.
