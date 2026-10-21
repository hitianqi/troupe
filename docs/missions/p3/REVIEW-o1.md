# Order review: p3 / o1

Reviewer rev.r1 (Sonnet 5.5). Order branch `order/p3/o1` at 487d003 (6b6bb54 the
check, 487d003 the build), against the mission branch `feature/NO-JIRA-p3`
(de34865). Judged against `docs/missions/p3/plan.md`, o1's goal, risks and proof.
`claude --version`: 2.1.306 (Claude Code), tmux 3.4.

Diff scope: 28 files. Every code file is on o1's declared `touches`
(`hooks/register.tsx`, `hooks/dispatch.ts`, `hooks/approval.ts`,
`types/index.d.ts`, `tests/dispatch.test.ts`, `docs/FEASIBILITY.md`,
`docs/feasibility/`). Nothing undeclared.

## How I checked

- `./check.sh` in my worktree after `npm install`: exit 0, `tsc: clean`. The
  engine had not laid types in my worktree, so I copied
  `.claude-plugin/types/` from dev.b1's worktree (gitignored; I did not load
  the mod from there). `claude plugin test .`: 46 pass, 0 fail, including the 10
  new dispatch tests; the p1/p2 tests, `node --test tests/panel.node.mjs` and the
  workflow walkthrough all pass.
- Read `hooks/dispatch.ts`, `hooks/approval.ts` and the `register.tsx` and
  `types/index.d.ts` diffs line by line (the hub and the argv builders are the
  blast radius), and the FEASIBILITY section against its raw evidence.
- Drove it live, in my own scratch: a git repo with three copies of the
  sample mission (`sample`, `par` with two independent orders, `par2`, and
  `other`) on `feature/NO-JIRA-<mission>` branches under `~/scratch/troupe/rev/`;
  a tmux server of my own (`tmux -S ~/scratch/troupe/rev/tmux.sock`, started
  with `env -u TMUX -u TMUX_PANE`); an "orchestrator" `claude --plugin-dir
  <my worktree> --model haiku` in it, asked in plain sentences to call the
  tools; role windows on my own login (opus and sonnet, as the plans say).
  Nothing was opened on OpenRig's tmux server and nothing was dispatched
  against the troupe checkout. Afterwards I killed the server and deleted the
  socket, repo, worktrees and branches (`ls ~/scratch/troupe` shows only the
  builders' files).
- How to reuse: the repo is `git init`, the sample plan copied to
  `docs/missions/<name>/plan.md`, a branch `feature/NO-JIRA-<name>`, the
  trust dialog answered once ("Yes, I trust this folder" is the second
  option), and `APPROVAL.json` written by hand as
  `{"planHash":"sha256:<sha256sum plan.md>","approvedAt":"…"}` until o3's dialog
  exists.

## What I observed

| Case | Result |
| --- | --- |
| `troupe_dispatch sample o1`, no record | Refused: `the plan is not approved: no APPROVAL.json in docs/missions/sample. Nothing was dispatched.` No worktree, branch, session or brief was created. |
| Record written (hash by `sha256sum`), dispatch o1 | `Dispatched o1 (opus) to window @1 of tmux session troupe-sample: worktree …/repo-sample-o1, branch order/sample/o1, brief …/.git/troupe/sample/o1.md, sent.` The builder in the window read the brief and answered. The mod's hash agrees with `sha256sum`. |
| One blank line appended to `plan.md`, dispatch o2 | Refused: `plan.md changed since it was approved … must be approved again.` Nothing created. Removing the line made the same record hold again. |
| o2 while o1 is not merged | Refused `o2 depends on o1, not done yet`. After a commit `o1: …` was fast-forwarded onto the mission branch, o2 was allowed and opened as a second window in the same `troupe-sample` session. |
| o1 dispatched again | Refused: `o1 already has a window (@1, pane %1) in troupe-sample` (kept in `$.state`, so it survives what a reload does to module variables). |
| `mission "../sample"`, `mission "-h"`, `order "o1; touch /tmp/pwned"`, `order "../../x"` | All refused by the name pattern before any path, branch or command. `/tmp/pwned` was not created. |
| An order whose plan says `model: "opus --dangerously-skip-permissions"` | Refused: `order o1 names model … a role window runs opus, sonnet, haiku, fable`. The model reaches argv only from the fixed list. |
| A tmux session `troupe-other` that I opened, then dispatch for mission `other` | Refused: `a tmux session named troupe-other exists that troupe did not open`. My session was untouched and nothing was added to it. |
| A plan with an overlap and no `depends_on` | Refused with the plan problem, nothing created. |
| Two parallel `troupe_dispatch` calls (o1, o2 of two independent orders) in one model turn, twice (`par`, `par2`), each opening a fresh session | Both calls answered `sent`; two windows each; `troupe_status` listed both. The lost-update race I looked for (two calls reading `roles`, both writing it back) did not occur; the code has no guard, see Noted 1. |
| `troupe_status` | Lists each window's order, role, running or gone, and the worktree. It showed a window I killed with `tmux kill-window` as `gone`. |
| p1/p2: `/troupe sample` inside tmux | Panel split right (100 columns), and the command's answer ends `The plan is approved (…)`. With a changed plan it says so and still shows the panel; `/troupe close` closes it and brings the pane back. |
| Brief pasted, six dispatches in all | All six were `sent`; none stayed in the input box (the builder's case 12 holds in my instance too). |

Argv: I read every `argv` builder and the three inline git calls
(`rev-parse --show-toplevel`, `for-each-ref`, `rev-parse --git-common-dir`).
Each is a fixed array. Caller text reaches argv only as the validated
mission or order name, the mission-branch name git printed, or the model from
the fixed list. The brief text is a fixed sentence plus a path the mod built,
passed after `--` to `set-buffer`; it is pasted, never run. The order id is
checked against the plan before it reaches a path, branch or window name.

## Act on

None.

## Consider

1. **A window that has gone, or a failed open, cannot be dispatched again;
   git stops it.** After `tmux kill-window` on o2, `troupe_status` says `gone`
   (right), but `troupe_dispatch sample o2` fails with `git could not add the
   worktree … fatal: a branch named 'order/sample/o2' already exists`. The same
   happens after the tmux step failed ("The worktree … is there", which the
   message says). The plan puts "a window that has gone is opened again on the
   next dispatch" on o2 (its goal names gone windows reopened), so this is not
   an o1 defect; o2 must reuse an existing worktree and branch of the same name
   when the window or session is gone, not call `git worktree add -b` again.
   Siblings I looked for: the only caller of `argv.worktreeAdd` is `dispatch`;
   the gone-session path (`liveSession` returns undefined, the kept windows are
   dropped on the next `keep`) reaches the same git error.
2. **An approved plan that is not committed on the mission branch is
   dispatched anyway.** The hash is of the plan.md in the orchestrator's
   checkout; the worktree is cut from `m.base`, so the builder reads whatever
   plan.md the mission branch holds. If the plan was approved and not yet
   committed (or committed differently), the builder works from another plan
   than the one the human approved. From the code, not driven by me. In this
   mission the plan is committed first, so it does not bite here; a cheap guard
   is to compare `git show <base>:<dir>/plan.md` with the approved text, or
   dispatch from a cut that carries it. Fine to leave for o2 or Phase 3.

## Noted

1. `keep` writes back `session` computed from a read taken before the slow
   steps (worktree add, 30 s wait for the input box). Two dispatches that
   interleave would lose a window record. I could not make it happen: both
   parallel pairs went through, which suggests the engine serialises a mod's
   tool calls, but the code does not guard it. o2 grows this file; a
   re-read of `roles` just before `keep` would remove the question.
2. `APPROVAL.json` is a plain file in the mission folder, so the orchestrator
   model can write one itself with its Write tool; the hash proves the plan did
   not change after the record, not that a person approved. The rule stops a
   forgetful dispatch, not a model set on bypassing it. o3's dialog is the only
   intended writer; the README should say the record is advisory.
3. Role windows inherit the environment of the tmux server, not the
   orchestrator's. In my instance the server was started from my own seat, so
   the role windows carried its `OPENRIG_SESSION_NAME` and
   `OPENRIG_NODE_ID` and my login (my fault, in my scratch; those windows may
   have reported activity under my seat for a minute). In the real run the server
   is OpenRig's; nobody has run a dispatch on it, by the plan's design. On the
   first real run, `env | grep OPENRIG` in a role window and `rig ps` for the
   new session are worth one look.
4. The brief sits in `<repo>/.git/troupe/…`, outside the worktree. On an
   account that is not in auto mode the builder's first read of it draws a
   permission prompt in its window; dispatch cannot see or answer that (the
   FEASIBILITY known limit 1 and the "left to the human" item).
5. The builder sent the typing verdict to orch.lead, not to 大博士贴; the plan
   says it reaches 大博士贴 as a row, so the orchestrator has to pass it on
   (its hand-back says so).
6. `dispatch` and `status` print the model "typed" or "sent" text from a single
   look 1.5 s after the Enter; the check holds in all six of my dispatches, and
   a slow machine could still report a sent prompt as unsent, which only asks the
   person to press Enter.
7. Nit: `/troupe`'s answer capitalises the reason's first letter, so a changed
   plan reads `Plan.md changed since it was approved …` (the file name in
   capitals). `approval.ts` `gate`.

## Dismissed

- Typed-brief injection through the mission or order argument: refused by the
  name pattern, tried live with `../`, `-h`, `;` and `../../`.
- A hostile `model:` in plan.md reaching `claude`: stopped by the model list.
- The lost-update race on parallel dispatch: not reproduced in two tries
  (Noted 1 keeps it as a guard question, not a finding).
- A role session opened on OpenRig's server: not tried, by the brief's rule.
- The `gate` and dialog: o3's order, not reviewed here.

## Manual acceptance

None for this order.

PASS
