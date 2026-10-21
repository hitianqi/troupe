# troupe

A Claude Code mod that shows a planned mission beside the chat: inside tmux
in a panel split to the right of the session, elsewhere in a pane of the
session. It also asks the person to approve the plan, and gives the
conversation three tools that run the mission's orders in Claude windows of
their own: `troupe_dispatch`, `troupe_status` and `troupe_close`.
`ROADMAP.md` holds the decisions and the phases; this is Phase 2.

## Requirements

- **tmux** (tested on 3.4). `troupe_dispatch` needs it: role windows open in
  a tmux session of their own, and without tmux the tool refuses. For the
  panel it is optional: without it, `/troupe` falls back to the in-session
  pane.
- **git**, with the mission branch and the plan committed on it, for
  `troupe_dispatch` (see below).
- **Node 22.18 or later** on the `PATH` for `bin/troupe-panel`: it runs the
  mod's own `.ts` files with Node's type stripping.
- **Linux**, when Claude Code runs without `$TMUX` in its environment (an
  OpenRig seat, for one): the mod then finds the session's tmux pane, and its
  socket, in the environment of the nearest ancestor process that has one,
  read from `/proc`. With `$TMUX` set, any system works.

## The panel

- `/troupe [mission]` inside tmux splits a pane to the right of the
  session's own pane, taking half the window and at least 30 columns, and
  runs `bin/troupe-panel` in it on the mission (the newest under
  `docs/missions/`, a name there, or a folder by its path). The transcript
  keeps the focus. The panel stays fixed while the transcript scrolls.
- `/troupe` again reuses the open panel (another mission redraws it in the
  same pane); a hot reload of the mod keeps it, and a panel pane that was
  closed by hand is split again.
- `/troupe close` closes it and brings the in-session pane back; the end of
  the session closes it too. If Claude Code dies without ending, the panel
  leaves within 2 s on its own (`--owner`). While the panel is open, the
  in-session pane is closed: one view at a time.
- In an OpenRig seat, a split beside the seat's pane cuts that seat off
  from `rig send` and queue wakes while it is open: OpenRig expects a
  single pane in the seat's window. Close the panel (`/troupe close`)
  before you leave such a seat.
- Outside tmux, `/troupe` says `no tmux: showing the in-session pane` and
  opens the pane, as below.
- After it shows the plan, `/troupe` asks for the person's approval, as
  described in the next section.

While the panel is open, the mod writes `.troupe-state.json` in the mission
folder: what only the engine knows, the session's skill names and its
subagents (description and status), from which the panel draws the skills'
✓ / ✗ and the orders' running and done states. It is rewritten only when
it changes, and git ignores it.

`bin/troupe-panel <mission dir> [--width N] [--once] [--plain] [--owner PID]`
also runs by hand, in any terminal: it draws the same view as the pane, in
the same colours, from the same code (`hooks/lines.ts`). It redraws when
what it shows changes (the folder and the facts polled every 2 s, git
every 10 s) or the terminal is resized, and exits on SIGTERM or ctrl+c.
It never draws more rows than the terminal has: the header stays on top,
and the rest scrolls, with `↑ N more` and `↓ N more rows` saying what is
out of view. ↑/↓ or j/k scroll a row, PgUp/PgDn a page, Home/End to the
ends, and the mouse wheel three rows. Keys reach it while its pane has the
focus (click it, or `tmux select-pane`; click the transcript to go back).
The wheel needs tmux's mouse mode: `set -g mouse on`. `--once`
prints one screen and exits; `--plain` drops the colours. With no
`.troupe-state.json` beside it, it shows only the running orders git
shows and says the session lists no skills to check against; one left by
an earlier session is read as it stands.

## Approving the plan

`/troupe <mission>` ends by asking about approval, once per call:

- A plan that passes the checks and has no valid `APPROVAL.json` raises the
  dialog "Approve the plan?" with **Approve** and **Change**.
- **Approve** writes `APPROVAL.json` in the mission folder: the SHA-256 hash
  of the `plan.md` the person was shown, and the time. Any edit of
  `plan.md`, a whitespace edit too, gives another hash, so the record no
  longer holds and the next `/troupe` asks again.
- **Change** opens a second dialog, "What should change in the plan?", with
  **Not now**, **Approve** and a free-text row. The words typed there go to
  the conversation as a prompt, `Tianqi asks: <words>; edit <mission
  folder>/plan.md, then /troupe again`, and the answer of `/troupe` ends
  `Change asked: <words>`. The next `/troupe` asks again.
- It fails closed. A blank answer, a dismissed dialog (Esc) and **Not now**
  approve nothing and say `Not approved; /troupe asks again.`. Only the
  word `Approve`, in any case, approves; typed words that are not a label
  are taken as a change.
- A plan with problems is not asked about (`Not asked: the plan has
  problems; fix plan.md first.`), and an approved plan raises no dialog.
  A second `/troupe` while a dialog is open answers `The approval dialog is
  already open.`.
- `APPROVAL.json` is advisory. The dialog is its one intended writer, but a
  file in a folder can be written by anyone, a model included. It stops a
  forgetful dispatch, not one set on getting round it.

## Dispatching the orders

The conversation is the orchestrator. Three tools are registered at session
start; the model calls them as `mcp__troupe__troupe_dispatch`,
`mcp__troupe__troupe_status` and `mcp__troupe__troupe_close`.

**`troupe_dispatch(mission, order, role?)`** opens one Claude window for an
order. `role` is `builder` (the default) or `reviewer`. It has two hard
rules, and refuses with a reason the model reads, before it runs anything:

1. **No dispatch before approval.** `APPROVAL.json` must exist and match
   `plan.md` as it is now. The approved `plan.md` must also be the one the
   mission branch holds (`git show <branch>:<path>`): the window's worktree
   is cut from that branch, so an approved plan that is not committed there
   is refused (`commit it on the mission branch, then dispatch`).
2. **No dispatch while an order it `depends_on` is not done.** Done means
   merged onto the mission branch (one commit titled `<id>: …` there), not
   merely built.

The reviewer is dispatched the same way (`role: "reviewer"`) and refused until
the order is built: its branch `order/<mission>/<id>` exists and its
`DONE-<id>.md` is in the mission folder (or in the builder's worktree).

It also refuses a plan with problems, an unknown order, a model that is not
`opus`, `sonnet`, `haiku` or `fable`, a mission or order id with other
characters than letters, digits, `_` and `-`, an order that already has a
live window, a tmux session named `troupe-<mission>` that troupe did not open,
and a session that is not inside tmux. Nothing the caller passes becomes a
command or a flag: every git and tmux call has a fixed shape, and the ids
are checked against the plan before they reach a path, a branch or a window
name.

**`troupe_status(mission?)`** lists each role window kept in this session: its
order, its role, whether it is running or gone, and whether its brief was
sent.

**`troupe_close(mission, window?)`** closes one window (`o1`, or
`review-o1` for a reviewer) or, with no window, the whole role session. It
touches only the session and windows troupe opened, by the ids it kept: a
session of the same name that someone else made is left alone. Worktrees and
branches stay.

### What role windows are

- A tmux session of their own, `troupe-<mission>`, on the orchestrator's
  tmux server, with one window per order (named for the order) or review
  (`review-<id>`). Never a pane or window in the orchestrator's session: in
  an OpenRig seat that would cut the seat off from `rig send`.
- Each window runs `claude --model <model>` in its own worktree, beside the
  repository: `../<repo>-<mission>-<order>`, on the branch
  `order/<mission>/<order>` cut from the mission branch. A reviewer's is
  `../<repo>-<mission>-review-<order>`, detached at the order's branch (its
  `-fix` branch once there is one). No permission flag is passed, and troupe
  does not load the mod in them (see the limit on a global install).
- The brief is a file the mod writes in the repository's git folder,
  `.git/troupe/<mission>/<window>.md` (git tracks nothing there). It holds
  the order's worktree and branch, where to write the result, and the role
  text the mod ships (`skills/troupe-mission/references/`). The window is
  told, by a paste, `Read the brief in <path> and follow it.`
- A window that has gone is opened again on the next dispatch, in the same
  worktree. A role session that has gone is forgotten and opened again.
- Results come back as files. The builder writes `DONE-<id>.md` and the
  reviewer `REVIEW-<id>.md` (`REVIEW-<id>-<n>.md` for a re-review) in their
  own worktrees, under `docs/missions/<mission>/`. The mod copies them
  into the orchestrator's mission folder on its 2 s poll, only the files
  git does not track in that worktree, and only when the folder has no such
  file or an older one. The panel then shows the order `done` (marker) or
  `reviewed` (review file).

## Known limits

- **Prompts inside a role window are the person's to answer.** A permission
  prompt, a question from the builder, or the trust dialog of an untrusted
  repository waits in that window. A brief typed under a permission prompt
  would be lost and its Enter would approve the pending call, so dispatch
  types only into a window it has just opened, and only once claude's input
  box shows. If no box shows within 30 s it types nothing and says so; if
  the prompt is still in the box after the Enter, it says so, and the person
  presses Enter there. The brief is in the git folder, outside the worktree:
  an account not in auto mode may be asked to allow reading it.
- **The brief is pasted, not typed.** Raw keys sent to a claude that has just
  started can leave the Enter as a newline (`docs/FEASIBILITY.md`, case 12).
- **`APPROVAL.json` is advisory** (above).
- **Results are collected only for the mission the pane shows**: the newest
  `plan.md`, or the one `/troupe` names. Run `/troupe <mission>` to collect
  another mission's.
- **Done means merged.** A `DONE-<id>.md` shows the order as `done` on the
  panel, but does not release an order that depends on it; the orchestrator
  merges first.
- **A committed result file.** If a builder commits its `DONE-<id>.md`, or a
  reviewer its report, after the mod copied it, remove the copy in the
  mission folder before merging; the mod logs this once. It cannot delete
  files itself.
- **Role windows inherit the tmux server's environment**, not the
  orchestrator's. Start the tmux server from a plain shell: one started from
  an OpenRig seat carried that seat's `OPENRIG_*` variables into the role
  windows. troupe has not been run on OpenRig's own tmux server.
- **A globally installed troupe loads in role windows too**; no flag keeps a
  plugin out of a `claude` it starts. Load it with `--plugin-dir` or from the
  session's mods folder instead.
- **Light mode** (one or two orders, serial, no slim) is not built; it moved
  to Phase 3 with the skill.
- **The role windows' own progress** (what a window is doing) is not shown;
  the panel knows an order only as planned, running (its branch is ahead of
  the mission branch), done or reviewed.
- The `/proc` route that finds the session's tmux pane without `$TMUX` is
  Linux only, as before. `troupe_dispatch` uses it.

## What the pane shows

The pane `troupe` (and the panel) reads `docs/missions/<mission>/plan.md` under the
session's working directory: the mission whose `plan.md` changed last (on a
tie, the higher name, so `p1` over `p0`), or the one named by
`/troupe <mission>`. `/troupe <path>` takes a mission folder by its path
instead, such as `/troupe ../other-checkout/docs/missions/p1`. It is drawn
in the OpenRig TUI's own style and colours, most important first (the
panel scrolls what does not fit, the pane leaves it to the engine's own
window):

1. **Header**: `TROUPE · <mission> · light · plan checks clean · <goal>`. The
   goal is the `goal:` key of the plan's YAML block, else the first
   sentence of its Intent.
2. **Graph**, like OpenRig's topology view, and like it showing only the
   roles and the human checkpoints: a double box "▦ MISSION" holding
   ≡ orchestrator (the plan, the MR), ≡ builder (its orders) and ≡ reviewer
   ("review <id>" or idle), joined by ━━▶, with ◆ Plan OK? after the plan
   and ◆ MR OK? and ◆ Merged? at the end, and a "fix ≤ 2" arrow looping
   from reviewer back to builder. The current box is orange and bold, done
   green ✓, waiting grey. Below 107 columns the flow stacks top to bottom.
3. **ROLES and ORDERS**, one line each: a role's glyph, name, model, state
   and what it is on; an order's glyph, id, model, state and `← ` the
   orders it waits on. A role's state comes from what the pane reads: the
   orchestrator "needs you" at a gate, the builder works while an order
   runs, the reviewer while one is done but not reviewed.
4. **Detail**, like OpenRig's detail view: `── GOAL`, `── ORDERS · n` and
   `── ROLES · n`, each role with its model, effort meter, duty bullets and
   skills ✓ / ✗.

Below 46 columns the ROLES and ORDERS lines leave out the model. Below 48
columns each DETAIL label takes its own line, with the value under it.

A role in the plan's `roles` block is either `name: [skills]` or a mapping
with `model`, `effort`, `duty` (a list of lines) and `skills`; what it
leaves out, and a plan with no block, gets the defaults for orchestrator,
builder and reviewer. A skill counts if the session lists it under either
spelling (`shared:x` and `x`). An order's state comes from the mission's
own artefacts, in this order: `reviewed` with a `REVIEW-<id>.md` (or
`REVIEW-<id>-<n>.md`) in the mission folder; `done` once merged onto the
mission branch (one commit titled `<id>: …`) or with its `DONE-<id>.md` in
the folder; `running` while its branch `order/<mission>/<id>` has
commits the mission branch lacks, or a subagent whose description starts
with `<id>:` is live; `done` when such a subagent finished; else `planned`.
The mission branch is the local branch named for the mission
(`feature/NO-JIRA-p2`, or `p2`); git is asked at most every 10 s. A review
that fails still counts as reviewed, so an order in a fix round stays
`reviewed`. The step reaches "Final review" once `SLIM.md` is on the mission
branch. Live progress inside an order is Phase 3.

The header says whether the plan passes the rules of the kit's
`plan_lint.py`: a code order without `touches` or `why`, an unknown or cyclic
`depends_on`, a duplicate id, overlapping `touches` with no `depends_on`
between them, and YAML it cannot read; and a role's effort that is not one
of `low`, `medium`, `high`, `xhigh`, `max`. A plan with no orders read is
not called light. The problems are listed under GOAL;
they never stop the drawing.

It polls plan.md every 2 s and redraws when the file changes. It asks for
the session's skills again every 30 s, or at the next poll if the last ask
failed. `templates/plan.md` is the plan format with `goal` and the full
`roles` block. Keep each value on one line: the pane reads the YAML that
format uses, and flags anything else (`|` or `>` blocks, multi-line values,
`\u` escapes) as a problem with its line.

## The in-session pane

Outside tmux, `/troupe` opens the pane `troupe` instead. A pane that opens by itself is placed only in a terminal at least 144
columns wide. Once you open it with `/troupe`, it is placed at any width.

- **Docked**: in Claude Code's fullscreen layout from 110 columns, the pane
  sits beside the transcript, floor to ceiling, and draws what its rows hold.
  It stays in place as the transcript scrolls. The engine sets the dock's
  width (about 50 columns in a 230-column terminal here, whatever the pane
  asks for); drag it to 107 columns or more for the graph's groups side by
  side.
- **Inline**: on the main screen (the default inside tmux), the pane sits
  above the prompt, with the rows the engine gives it: it asks for all of
  the view when it opens, and the person can resize it. A view taller than
  the pane scrolls in the engine's own window (the arrows while the pane
  is focused); the header scrolls with it. The inline
  block is part of the terminal's own output, so scrolling the terminal
  back moves it out of view with everything else.

Of the pane's two forms only the docked one keeps it fixed (the tmux panel
needs neither). `/tui fullscreen` switches
a running session (it restarts and resumes it, and saves `"tui":
"fullscreen"` in `~/.claude/settings.json`; `/tui default` goes back).

## Loading it

The plugin carries a skill, `troupe-mission`, that runs a mission from brief
to merged MR in the file shapes the pane reads.

- From a checkout: `claude --plugin-dir <this repo>`.
- While developing: load the `plugin-authoring` skill in a session, and write
  the mod under the folder it names (`~/.claude/dev-mods/<session>/troupe/`).
  The person answers "Turn them on" once, and every edit reloads at the end
  of the turn. Keep that copy and this repo identical.

## Checking it

`./check.sh` runs `claude plugin validate .`, `claude plugin test .`, the
Node test of troupe-panel (`node --test tests/panel.node.mjs`), the workflow
walkthrough check (`docs/missions/workflow/check-sample.mjs`) and
`tsc -p .` (after `npm install`). `tsc` needs the API types the engine lays
in `.claude-plugin/types/` when it loads the mod from this folder; without
them the script says so and skips `tsc`.
