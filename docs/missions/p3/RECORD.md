# Record: p3 — dispatch, role windows and the approval dialog

`claude --version`: 2.1.306 (Claude Code), tmux 3.4. Rig tianqi-troupe-p3:
orch.lead, dev.b1 (o1, o2, and o4 through a sonnet subagent, as o4's model
says), dev.b2 (o3), rev.r1.
Plan: `plan.md` here (o2 gained one declared file, `bin/troupe-panel`, in the
same commit). Light mode was left out on Tianqi's word ("Light mode 先不做"):
it moves to Phase 3 with the skill (`ROADMAP.md`).

Dispatch was never run against the troupe checkout, because a mission named
p3 collides with our own `order/p3/*` branches and `../troupe-p3-*`
worktrees; every dispatch ran in scratch repositories on scratch tmux
servers.

## o1: the typing check (verdict in brief)

`docs/FEASIBILITY.md`, "Phase 2 part 2", with raw evidence in
`docs/feasibility/p3-*`; reviewed in `REVIEW-o1.md` (PASS).

**Typing into an interactive `claude` works, from a hook.** From a mod loaded
with `claude --plugin-dir` on a scratch tmux server, `send-keys` into a
window of a separate tmux session running `claude` delivered a one-line
prompt, three lines and a 57-line brief, and Claude acted on each. Twelve
cases in all; the ones that shaped the build:

- **The brief is pasted, not typed** (case 12). A claude that has just
  started, typed into as soon as its input box shows, with a prompt longer
  than a line sent as raw keys: the Enter is taken as a newline and the
  prompt stays unsent (5 of 6 fresh windows, the first real dispatch among
  them). A bracketed paste (`set-buffer`, `paste-buffer -p`, Enter) was sent
  in 5 of 5. So dispatch pastes one fixed sentence naming a brief file, and
  looks again 1.5 s later; if the prompt is still in the box it says so.
- A permission prompt showing eats the keys, and the Enter approves the
  pending call (case 7); a draft in the box merges with the brief (case 6);
  keys typed before claude drew lose their Enter (case 9). So dispatch types
  only into a window it has just opened, after a bounded wait (30 s) for the
  input box, never into a window in use.
- A new folder asks the trust question, default "No, exit" (case 10); a
  worktree of a trusted repository does not (case 11). On this account no
  flag is already auto mode; `manual` is what prompts.
- A hot reload empties module variables, so the windows are kept in
  `$.state`.

## What was built

- **o1** (dev.b1): `hooks/dispatch.ts` registers `troupe_dispatch` and
  `troupe_status`; `hooks/approval.ts` holds the approval record
  (`APPROVAL.json`: the plan's SHA-256 and the time) and o1's stand-in gate;
  `register.tsx` wires both; `types/index.d.ts` declares the state keys.
  The two hard rules, every git and tmux argv a fixed shape, ids checked
  against a name pattern and the plan before they reach a path, a branch or
  a window name, the model taken from a fixed list. 46 plugin tests.
- **o2** (dev.b1): the reviewer role (`role: "reviewer"`, refused until the
  order is built), `troupe_close` (one window or the session, by the ids
  kept), a gone window or session opened again in the same worktree, the
  committed-plan rule (the mission branch must hold the approved
  `plan.md`), and results back as files: `DONE-<id>.md` and
  `REVIEW-<id>[-<n>].md` copied from each window's worktree into the mission
  folder on the 2 s poll. The two p2 leftovers: an order in a fix round stays
  `reviewed`, and the step reaches "Final review" once `SLIM.md` is on the
  mission branch (the panel too, through `bin/troupe-panel`). The dry run.
  57 plugin tests.
- **o2 fix**: the copy skips files git tracks in the window's worktree
  (a committed marker would make the merge abort) and links, and does not
  overwrite a newer file in the folder; a reused reviewer worktree is moved
  to the branch its brief names; one failed tmux look no longer forgets
  running windows. 62 plugin tests.
- **o3** (dev.b2): the Approve / Change dialog in `approval.ts`. Approve
  writes the record for the plan text that was shown; Change opens a second
  dialog and hands the typed words to the conversation as a prompt, sent from
  a timer because the engine refuses `$.prompt.submit` inside `command.run`.
  A plan with problems is not asked about; one dialog at a time. 51 plugin
  tests.
- **o3 fix**: fails closed (only a non-empty answer spelling `Approve`
  approves; blank, whitespace and a dismissed dialog do not), the Change
  dialog lists Not now before Approve so a double Enter does not approve,
  typed words that spell a label count as it, and the "already open" answer
  has a test. 55 plugin tests.
- **o4** (dev.b1, written by a sonnet subagent and checked against `hooks/`):
  `README.md`, `ROADMAP.md`, this record, and the plugin's version
  (0.4.0) and description.

Integrated, `./check.sh` shows 71 plugin tests and 5 panel tests, and `tsc`
clean.

## Reviews and fix rounds (rev.r1)

In this folder: `REVIEW-o1.md` (PASS, with two Considers: a gone window
could not be dispatched again; an approved plan not committed on the mission
branch was dispatched anyway; both went to o2), `REVIEW-o2.md` (PASS, five
Considers, the merge trap of a committed marker among them; the o2 fix
answered four of them; Consider 3, results collected for one mission only,
stayed; the fix has no report of its own here), `REVIEW-o3.md`
(FAIL: one Act-on, an unattended dialog might approve) and `REVIEW-o3-2.md`
(the re-review of the o3 fix: PASS, with one item for manual acceptance,
Tianqi's live check).

The route ruled for the Act-on (call `AskUserQuestion` through `$.tool.call`
and refuse a result carrying `afkTimeoutMs`) does not exist: the engine
refuses a plugin's own call ("that is $.ui.ask"). The fix is the fail-closed
reading above instead. The slim pass and the final review are not in this
record; the orchestrator adds them if they ran.

## The dry run

`docs/missions/p3/dry-run/run.sh` and `output.txt`: a scripted run on a
scratch repository holding the two-order sample mission
(`docs/missions/workflow/sample/`) on a scratch tmux server, with a
`claude --plugin-dir` orchestrator asked in plain sentences to call the
tools. It checks, in order: o1 refused before approval; o1 dispatched, the
role session `troupe-sample` and its window open, the brief landed and
claude acted on it; o2 refused while o1 is not done; `DONE-o1.md` written in
o1's worktree comes into the mission folder; the review of o1 dispatched
(detached at its branch) and its brief landed; `troupe_close` closes o1's
window; an `o1: …` commit on the mission branch stands in for the merge, and
o2 is dispatched and lands; `troupe_status` lists o2 running;
`troupe_close` closes the session; the session and the scratch server are
gone. **15 of 15 PASS**, exit 0. rev.r1 ran it again on its own scratch
server, 15 of 15. The dry run is not part of `./check.sh`: it needs a
`claude` login and opens real windows.

## Seen live

- **Live check pending.** Tianqi's check of the Approve / Change dialog in
  dev.b2's tile, on 846836a (before o3's fix round). The orchestrator fills
  in the result here.
- rev.r1 drove the dialog in a scratch session on 2.1.306, answering it with
  tmux keys: the dialog draws, Approve writes `APPROVAL.json` (the hash equals
  `sha256sum plan.md`), an approved plan asks nothing, one appended newline
  asks again, Esc approves nothing, a plan with problems is not asked about.
  The Change prompt (`Tianqi asks: …`) sent from the timer reached the
  conversation and the model started on it. It re-drove the fixed dialog
  (Not now first, ` approve ` typed under Other approves).
- Auto-resolve could not be reproduced (rev.r1 left a dialog idle for 170 s;
  dev.b2 could not trigger it either). That an auto-resolved dialog cannot
  approve rests on dev.b2's read of the 2.1.306 build: it submits only the
  answers already given, so a lone question comes back empty and approves
  nothing. A guard in `register.tsx` (`on('tool.call', { tool:
  'AskUserQuestion' })` refusing a result with `afkTimeoutMs`, about ten
  lines and one line of wiring) is a Phase 3 option.
- Role windows were seen live only on scratch servers, on the seat's own
  login: builders and reviewers read their briefs, a real builder and a real
  reviewer wrote `DONE-o1.md` and `REVIEW-o1.md` on their own, a killed
  window and a killed session were opened again, a same-named session that
  troupe did not open was left alone.

## Left to the human

- **Prompts and dialogs inside role windows.** A permission prompt or a
  question from a builder waits in its window. Dispatch types only into a
  window it has just opened, so it does not answer one by accident, and
  cannot see one.
- **The trust question for an untrusted repository.** A worktree of a
  trusted repository asks nothing; a repository claude has not seen asks
  "Is this a project you created or one you trust?", default "No, exit".
  Dispatch then finds no input box, types nothing, and says so; the person
  answers in the window. This was seen in the check, not through dispatch.
- **Pressing Enter when dispatch reports the prompt still in the box.**
- Removing a copied `DONE-<id>.md` or review from the mission folder before
  merging an order that committed it (troupe logs it once).
- Running `/troupe <mission>` to collect the results of a mission the pane
  is not showing.

## Known limits

In `README.md`, "Known limits": `APPROVAL.json` is advisory; done means
merged (a marker shows `done` but does not release a dependent order); role
windows inherit the tmux server's environment (a server started from an
OpenRig seat carried its `OPENRIG_*` variables) and troupe has not been run on
OpenRig's own server; a globally installed troupe loads in role windows too (`--bare` would skip
plugin hooks but skips much else, so troupe does not pass it);
the brief sits outside the worktree and an account not in auto mode may be
asked to allow reading it; the `/proc` route is Linux only, as before.

## Left for Phase 3 and later

- Light mode (moved here from Phase 2).
- The one-hook guard for an auto-resolved dialog; a hook that denies writes
  to `APPROVAL.json`.
- Live progress inside an order; the metrics file.
- `Final review` was seen in tests only, not on a live full mission.

Not applied: `tianqi-project-maintenance` in full, per the lightweight
maintenance decision; the README, `check.sh` and the tests only.
