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
- Roles and their skills come from the plan's `roles` mapping (role → list
  of skill names; three default roles with none declared when the block is
  absent). Each skill is resolved against `$.session.usage` in both
  spellings (`shared:x` and `x`), and one that is not found is flagged
  visibly. `templates/plan.md` in this repo carries the `roles` block.
- `hooks/draw-pane.tsx` draws pane `troupe`, titled `TROUPE · <mission>`,
  in this order so the inline frame (about 9 rows at 76 columns) shows the
  first part: the goal line (first sentence of the plan's Intent); the
  workflow stage line; orders in dependency layers with model, state and
  goal; then roles, each with a one-line duty and its skills (missing
  flagged); plan problems; the gates plan / MR / merged as plain rows; and
  the first ~3 lines of the plan's "How the work is split". Docked, it all
  shows. It reuses the spike's layering and palette, with no backgrounds.
- The workflow is the static row of stages plan → build → review → slim →
  final review → MR → merged, with the current stage marked from state the
  pane already has (gate rows and order states); a plan of one or two
  orders shows `light` beside it. No live stage tracking (Phase 3).
- A role's duty comes from a `duty` field when the `roles` block uses the
  mapping form (`builder: { skills: [...], duty: "..." }`); the list form
  (`builder: [...]`) is still accepted, and then the default duty line for
  orchestrator, builder and reviewer is shown.
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

Amendment (2026-10-20 11:13Z, ruled by 大博士贴): after a first look inline
Tianqi withdrew his approval — "that's all the plan? I cannot see any model
info, goal, role duty, how the work is split, the workflow". The pane now
also draws the goal line, role duties, the split, and the workflow stages,
and orders its content for the inline fold. Still one order. Anything he
asks for beyond Phase 1 (live progress, dialogs, costs) is listed in
RECORD.md as Phase 2/3, not built.

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
roles:
  orchestrator:
    duty: "Plans, dispatches the order, merges it, owns the mission branch"
    skills: []
  builder:
    duty: "Builds o1 in its worktree and hands it back"
    skills: [plugin-authoring]
  reviewer: []
orders:
  - id: o1
    kind: code
    goal: "Turn the troupe pane into a read-only view of the mission plan: read-state.ts parses and checks plan.md and resolves role skills, draw-pane.tsx draws the goal, the workflow stage, orders in layers, roles with duties, gates and the split (inline fold first), register.tsx only wires; probes removed, p0 leftovers fixed, tests, README, and the pane seen by Tianqi."
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
