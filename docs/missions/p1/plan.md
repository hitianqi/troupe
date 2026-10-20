# Plan: p1 — Phase 1, the pane reads plan.md

Intent: Tianqi opened Phase 1 ("开 Phase 1 吧", 2026-10-20); the brief is
大博士贴's queue item qitem-20261020104556-f184fee40a62bcb1 and the spec is
`ROADMAP.md` ("Phase 0 outcome" and "Phase 1"). The troupe pane stops being
a probe display and shows a mission: it reads `docs/missions/<mission>/plan.md`
from the session's working directory, checks it with plan_lint's rules, and
draws the roles with their skills resolved for real, the orders in dependency
layers with model and state, and the three human gates. It only reads; the
deny rules and the approval dialog are Phase 2.

Done when:
- `hooks/read-state.ts` finds the mission (the newest dir under
  `docs/missions/`, or the one named by `/troupe <mission>`), parses the YAML
  block holding `orders` (and `roles`), and flags, without failing the
  drawing: a code order with no `touches` or no `why`, unknown `depends_on`
  ids, duplicate ids, cycles, overlapping `touches` not joined by
  `depends_on`, and YAML it cannot parse. It polls the file with `$.fs.stat`
  on one `$.clock.every` timer that does not stack across reloads.
- Order state comes from the mission dir (`REVIEW-<id>.md` present →
  reviewed) and from `$.agent.list()` entries whose description starts with
  `<id>:` (running / done); otherwise planned.
- Roles come from the plan's `roles` block. Each role carries `model`,
  `effort` (think level: low / medium / high / xhigh / max), `duty` (a list
  of bullet lines) and `skills`; an order's own `model` stays the override
  for that order. The short list form (`builder: [skill, …]`) is still
  accepted, with default model, effort and duty for orchestrator, builder
  and reviewer; with no block at all the three defaults are shown. Each
  skill is resolved against `$.session.usage` in both spellings (`shared:x`
  and `x`), and one that is not found is flagged visibly. `templates/plan.md`
  in this repo carries the full `roles` block.
- `hooks/draw-pane.tsx` draws pane `troupe`, titled `TROUPE · <mission>`,
  in four parts, plus plan problems wherever they fit best:
  1. **Goal**: the `goal:` key of the plan's YAML block when present
     (`templates/plan.md` carries it), else the first sentence of Intent.
  2. **Workflow**: the key steps of the kit's mission flow
     (`<kit>/workflows/tianqi-mission.yaml`, as drawn by
     `<kit>/scripts/draw_mission.py`), compact, not the full diagram:
     Intent → Plan → Plan OK? → Build (each order, in parallel: build →
     order review → fix, ≤ 2 reviews) → Slim → Cut → Final review (fix,
     ≤ 2 reviews) → MR OK? → Open MR → Merged? → Teardown → main. The three
     human gates are marked as such; the current step is highlighted from
     state the pane already has (gate rows, order states, the REVIEW / SLIM
     files in the mission dir); a plan of one or two orders is `light` and
     skips Slim, Cut and Final review. No live stage tracking (Phase 3).
  3. **Roles**: per role its model, effort, duty bullets and skills
     (missing flagged).
  4. **Orders** (the work split): orders in dependency layers with id,
     model, state, goal and depends_on. If 大博士贴 confirms a different
     fourth part with Tianqi, that replaces this one.
  It reuses the spike's layering and palette, with no backgrounds. Docked
  it all shows. Inline, the pane fits the rows the engine gives it
  (`e.props.scroll.bodyRows`, about 9 at 76 columns): a compact layout
  ranked goal, workflow, orders, roles, so nothing important is cut by the
  fold.
- **The look is the third amendment below**: an OpenRig-TUI-like GRAPH
  (nested boxes, docked or when the rows allow) and TABLE (roles, then
  orders; inline shows header + table). A static text mock
  (`~/scratch/troupe/mock-p1.txt`, 110 columns, real p1 data) is approved
  by Tianqi through 大博士贴 before any drawing code; the built pane
  matches the approved mock.
- **The pane does not scroll away.** Find what the engine allows to keep
  the inline pane in place above the prompt as the transcript scrolls
  (`rows` / `columns` on `$.ui.open`, the main-screen inline placement,
  the fullscreen layout, anything else in the types) and use it. If only
  the docked (fullscreen) pane can stay fixed, record why in RECORD.md
  with the engine's own text, and the orchestrator tells 大博士贴.
- `hooks/register.tsx` only wires (≤ 100 lines); `read-state.ts` and
  `draw-pane.tsx` are each under 300 lines. The Phase 0 probe tool, probe
  commands and probe deny rule are gone, and with them the tool hook that
  lacked `.catch`.
- `claude plugin test` has fixtures for a valid plan, an overlapping plan
  without `depends_on`, bad YAML and a missing skill, plus a unit test of the
  layering. `./check.sh` exits 0 with `tsc` actually run.
- Live, in dev.b1's session with the mod loaded and this repo as cwd: the
  pane shows this plan (p1), an edit to the plan redraws it within the poll
  interval, and a skill that does not exist is flagged. Tianqi has looked at
  the pane (inline, and once with the tile widened) and approved what it
  shows and how it looks, through 大博士贴. Docked placement (110 fullscreen
  / 144 unasked) is evidenced by the engine's own `isPlaced` / `reason`
  answer; no separate docked screenshot is required.
- `docs/missions/p1/RECORD.md` records `claude --version`, the engine's
  `isPlaced` / `reason` at each width tried, and what was seen live.
  `README.md` says what the mod shows, how to load it, and the 144/110
  columns. The repo copy and the dev-mods copy of the mod are identical.

Amendment (2026-10-20, second version, 11:17Z, from 大博士贴): after a
first look inline Tianqi withdrew his approval — "that's all the plan? I
cannot see any model info, goal, role duty, how the work is split, the
workflow". A first amendment (goal line, a stage line, one-line duties) was
still "太简单了". His spec has four parts: the goal; the workflow with all
its key steps and the human gates, not as complex as the kit diagram; each
role's model, think/effort level, duty as bullets and skills for this task;
and the orders (assumed, being confirmed). He also asked "有没有什么办法不随
着滚动消失": the pane must not scroll away. Still one order. Anything he
asks for beyond Phase 1 (live progress, dialogs, costs) is listed in
RECORD.md as Phase 2/3, not built.

Third amendment (2026-10-20 11:46Z, ruling qitem-20261020114624-b6ca0380c1f0814d from 大博士贴, verbatim; it supersedes the "A real TUI" bullet in Done when):

> RULING on the p1 look, from 大博士贴 after Tianqi's verdict on f34d8ce ("太丑了"; "我只是想要 openrig 类似的 table + graph"; "他就是做不出来"). The one-row strip of boxes and cards (his screenshot /tmp/claude-1000/-home-tizh-openrig-hq/1789fee0-4839-4717-89c9-32d06fbd9cb0/images/36.png) is rejected. He wants the two things OpenRig's TUI draws, and nothing invented beyond them. Look at his two reference screenshots: /tmp/claude-1000/-home-tizh-openrig-hq/1789fee0-4839-4717-89c9-32d06fbd9cb0/images/37.png (the seat TABLE) and /tmp/claude-1000/-home-tizh-openrig-hq/1789fee0-4839-4717-89c9-32d06fbd9cb0/images/38.png (the rig TOPOLOGY graph). Then read how OpenRig draws them and copy the conventions: /home/tizh/.local/node/node-v22.23.2-linux-x64/lib/node_modules/@openrig/cli/tui/dist/render.js, /home/tizh/.local/node/node-v22.23.2-linux-x64/lib/node_modules/@openrig/cli/tui/dist/sections.js, /home/tizh/.local/node/node-v22.23.2-linux-x64/lib/node_modules/@openrig/cli/tui/dist/stylize.js (glyphs · → ↑ ↓ ━ ┃ ◆ ▶ and the box set; blue caps headers; dotted row separators; the % meter; the highlighted current box in orange; the dim/grey for idle).
>
> WHAT THE PANE IS, top to bottom (vertical, like the TUI; NOT one row):
> 1. Header line: TROUPE · p1 · light · plan checks clean · <goal>.
> 2. GRAPH (like 38.png): one outer double-bordered box titled "▦ MISSION p1". Inside, left to right, single-bordered group boxes titled "≡ plan", "≡ build", "≡ review", "≡ land", joined by ━━▶ arrows. Each group box holds its step boxes stacked vertically: plan: Intent, Plan, ◆ Plan OK?; build: one box per order (o1 opus 36%-style: status glyph ● ◐ ○ ✓, id, model, state); review: Order review, Slim, Cut, Final review (light: dimmed/struck); land: ◆ MR OK?, Open MR, ◆ Merged?, Teardown, main ✓. The current step's box is orange with bold text, done boxes green ✓, waiting grey. One feedback arrow drawn BELOW the boxes from review back to build labelled "fix ≤ 2", exactly like the loop arrow in 38.png.
> 3. TABLE (like 37.png): blue caps header row, dotted separators (┄ or · line) between rows, columns: ROLE | MODEL | EFFORT | SKILLS | STATE | NOW. One row per role (orchestrator, builder, reviewer): EFFORT as the ▪▪▪▫▫ meter, SKILLS as names with ✓/✗, STATE idle / working / needs you (orange, like the TUI), NOW = the order it is on. Then a second small table for ORDERS: ID | LAYER | MODEL | STATE | DEPENDS | GOAL (goal truncated to the column).
> 4. Nothing else. No cards, no chips, no colour not in the TUI.
>
> INLINE vs DOCKED: inline (main screen) gets the header + the TABLE (roles, then orders) — that fits ~9–16 rows; the GRAPH shows when docked or when the inline pane has the rows for it. Ask for the rows the graph needs; never collapse the graph into one row.
>
> PROCESS CHANGE so this is the last round on the look: before coding, dev.b1 writes a static TEXT MOCK of the full pane (plain text in ~/scratch/troupe/mock-p1.txt, at 110 columns, with the real p1 data) and you send it to me as a row; I show it to Tianqi; he approves or marks it up; only then the drawing code. If the engine's Box cannot draw a particular glyph or border, say which and what you draw instead, in the mock.
>
> Plan amendment: still one order; append this ruling verbatim to the plan's amendment section; the fix round's other findings stand.

Out of scope: the deny rules and the Approve/Change dialog (Phase 2), the
workflow skill and live stage tracking (Phase 3), gate state beyond
"unknown", any paid run, any
push before the MR gate, anything in `docs/` beyond this mission's folder.

## How the work is split

One order. The brief allowed a second (tests and README on sonnet), but the
fixtures test exactly the rules `read-state.ts` implements and `tsc` checks
both against the types `types/index.d.ts` declares: the parser, its types and
its tests change together. `hooks/register.tsx` and `types/index.d.ts` are
hubs every other file imports, so they need one owner anyway. This light rig
has one builder, so a second order would run after the first and add only a
review round. The README is a few lines and goes with the order.

Loading the mod needs Tianqi: the engine asks "Turn on the mods Claude writes
in this session?" once in dev.b1's tile. The builder sends a queue row the
moment it is up, and another when the pane is ready to be seen; the
orchestrator passes both to 大博士贴, who asks Tianqi to answer, widen the tile
or type `/troupe`. Offline work (parser, fixtures, check.sh) continues
meanwhile.

Cost: no run on Tianqi's API key. Subagents inside a seat run on its own
login.

Roles in this plan's own block are the live sample the pane draws while the
mission runs.

## Orders

```yaml
goal: "Show a mission in a pane: its goal, the workflow and where it stands, the roles, and the orders."
roles:
  orchestrator:
    model: opus
    effort: high
    duty:
      - "Writes the plan and gets it approved"
      - "Dispatches each order and merges it onto the mission branch"
      - "Opens the MR after the human's go, then tears down"
    skills: [messaging-the-human, queue-handoff]
  builder:
    model: opus
    effort: high
    duty:
      - "Builds its order in its own worktree"
      - "Keeps ./check.sh green and the dev-mods copy in step"
      - "Fixes review findings, once per review"
    skills: [plugin-authoring]
  reviewer:
    model: sonnet
    effort: high
    duty:
      - "Reviews each order for behaviour as it lands"
      - "On a light rig, that review is also the final review"
    skills: []
orders:
  - id: o1
    kind: code
    goal: "Turn the troupe pane into a read-only view of the mission plan: read-state.ts parses and checks plan.md and resolves role skills, draw-pane.tsx draws four parts (goal, workflow key steps with gates and the current step, roles with model/effort/duty/skills, orders in layers) and stays in place as the transcript scrolls, register.tsx only wires; probes removed, p0 leftovers fixed, tests, README, and the pane seen by Tianqi."
    why: "ROADMAP Phase 1 with the Phase 0 changes. Reuses the p0 mod (hooks/register.tsx: pane open and placement, $.agent.list polling, $.session.usage skill listing, the atom state pattern), the trellis-plan spike at ~/.claude/dev-mods/7b60ff2d-d4e0-4799-85d2-6c581256bfdd/trellis-plan/hooks/register.tsx (Kahn layering, layer rows and palette; read, not copied), and the kit's scripts/plan_lint.py (the overlap, cycle, unknown-id and empty-touches rules, ported to TS) and templates/plan.md (the YAML orders block as the input format)."
    touches:
      - hooks/
      - types/index.d.ts
      - tests/
      - templates/plan.md
      - .claude-plugin/plugin.json
      - check.sh
      - tsconfig.json
      - README.md
      - docs/missions/p1/
    depends_on: []
    model: opus
    risks: "The hooks module may not be able to import a YAML library; then it needs a small parser for the template's subset, and anything outside it must be flagged as unparseable rather than misread. The plan's YAML block must stay valid for plan_lint too (an extra roles key is ignored by it). Timer re-arming across reloads is the p0 leftover; a second timer doubles the polling. Skill names differ by spelling (shared:x listed as x). Placement needs a person: the pane cannot be shown placed until Tianqi widens the tile or types /troupe. The repo and dev-mods copies can drift. Removing the probe deny rule removes its two tests; Phase 2 brings real deny rules and their tests."
    proof: "./check.sh exits 0 with tsc run; wc -l on the three hooks files; the four fixtures and the layering test pass under claude plugin test; a rig capture of dev.b1's tile with the pane showing p1, before and after a plan edit, with a missing skill flagged; isPlaced/reason in RECORD.md; Tianqi's look approved through 大博士贴; diff -r of the repo and dev-mods copies empty apart from .claude-plugin/types/."
```

## Review

The order is reviewed as it lands by rev.r1 (`REVIEW.md`). On this light rig
that review is also the final review of the whole `feature/NO-JIRA-p1` diff
against `main`, and says so. Findings go back to the builder, one fix round
and one re-review; then the orchestrator rules. A leftover with a known,
bounded fix is fixed in this mission, not filed.
