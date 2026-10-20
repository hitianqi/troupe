# troupe

A Claude Code mod that shows a planned mission beside the chat, read-only:
inside tmux in a panel split to the right of the session, elsewhere in a
pane of the session. `ROADMAP.md` holds the decisions and the phases; this
is Phase 2, part 1.

## Requirements

- **tmux** for the panel (tested on 3.4). Without it, `/troupe` falls back to
  the in-session pane.
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
own artefacts, in this order: `reviewed` with a `REVIEW-<id>.md` in the
mission folder; `done` once merged onto the mission branch (one commit
titled `<id>: …`); `running` while its branch `order/<mission>/<id>` has
commits the mission branch lacks, or a subagent whose description starts
with `<id>:` is live; `done` when such a subagent finished; else `planned`.
The mission branch is the local branch named for the mission
(`feature/NO-JIRA-p2`, or `p2`); git is asked at most every 10 s. A review
that fails still counts as reviewed. Live progress inside an order is
Phase 3.

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
