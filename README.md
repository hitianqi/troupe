# troupe

A Claude Code mod that shows a planned mission in a pane beside the chat.
`ROADMAP.md` holds the decisions and the phases; this is Phase 1, a
read-only view.

## What the pane shows

The pane `troupe` reads `docs/missions/<mission>/plan.md` under the
session's working directory: the mission whose `plan.md` changed last (on a
tie, the higher name, so `p1` over `p0`), or the one named by
`/troupe <mission>`. `/troupe <path>` takes a mission folder by its path
instead, such as `/troupe ../other-checkout/docs/missions/p1`. It is drawn
in the OpenRig TUI's own style and colours, top to bottom:

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
3. **Tables**, like OpenRig's seat table: ROLE | MODEL | EFFORT | SKILLS |
   STATE | NOW, then ID | LAYER | MODEL | STATE | DEPENDS | GOAL. A role's
   state comes from what the pane reads: the orchestrator "needs you" at a
   gate, the builder works while an order runs, the reviewer while one is
   done but not reviewed.
4. **Detail**, like OpenRig's detail view: `── GOAL`, `── ORDERS · n` and
   `── ROLES · n`, each role with its model, effort meter, duty bullets and
   skills ✓ / ✗.

A role in the plan's `roles` block is either `name: [skills]` or a mapping
with `model`, `effort`, `duty` (a list of lines) and `skills`; what it
leaves out, and a plan with no block, gets the defaults for orchestrator,
builder and reviewer. A skill counts if the session lists it under either
spelling (`shared:x` and `x`). An order's state is `planned`, `running` or
`done` (from a subagent whose description starts with `<id>:`), or
`reviewed` (a `REVIEW-<id>.md` in the mission folder).
`docs/missions/p1/mock-p1.txt` is the approved mock of this drawing.

On a rig that builds its orders in seats rather than in subagents the pane
can see, an order stays `planned` until its `REVIEW-<id>.md` appears, so the
pane can show the orchestrator at "needs you ◆ Plan OK?" through the whole
build. A review that fails still counts as reviewed. Live stage tracking is
Phase 3.

The header says whether the plan passes the rules of the kit's
`plan_lint.py`: a code order without `touches` or `why`, an unknown or cyclic
`depends_on`, a duplicate id, overlapping `touches` with no `depends_on`
between them, and YAML it cannot read. The problems are listed under GOAL;
they never stop the drawing.

It polls plan.md every 2 s and redraws when the file changes. It asks for
the session's skills again every 30 s, or at the next poll if the last ask
failed. `templates/plan.md` is the plan format with `goal` and the full
`roles` block. Keep each value on one line: the pane reads the YAML that
format uses, and flags anything else (`|` or `>` blocks, multi-line values,
`\u` escapes) as a problem with its line.

## Seeing it

A pane that opens by itself is placed only in a terminal at least 144
columns wide. Once you open it with `/troupe`, it is placed at any width.

- **Docked**: in Claude Code's fullscreen layout from 110 columns, the pane
  sits beside the transcript, floor to ceiling, and draws all four parts.
  It stays in place as the transcript scrolls. The engine sets the dock's
  width (about 50 columns in a 230-column terminal here, whatever the pane
  asks for); drag it to 107 columns or more for the graph's groups side by
  side.
- **Inline**: on the main screen (the default inside tmux), the pane sits
  above the prompt. It draws the header and DETAIL first, then the TABLES,
  and the GRAPH only when the engine gives it the rows for all of it; it
  asks for them when it opens, and the person can resize it. The inline
  block is part of the terminal's own output, so scrolling the terminal
  back moves it out of view with everything else.

Only the fullscreen layout keeps the pane fixed. `/tui fullscreen` switches
a running session (it restarts and resumes it, and saves `"tui":
"fullscreen"` in `~/.claude/settings.json`; `/tui default` goes back).

## Loading it

- From a checkout: `claude --plugin-dir <this repo>`.
- While developing: load the `plugin-authoring` skill in a session, and write
  the mod under the folder it names (`~/.claude/dev-mods/<session>/troupe/`).
  The person answers "Turn them on" once, and every edit reloads at the end
  of the turn. Keep that copy and this repo identical.

## Checking it

`./check.sh` runs `claude plugin validate .`, `claude plugin test .` and
`tsc -p .` (after `npm install`). `tsc` needs the API types the engine lays
in `.claude-plugin/types/` when it loads the mod from this folder; without
them the script says so and skips `tsc`.
