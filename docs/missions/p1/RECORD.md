# p1 record: the pane reads plan.md

Run on 2026-10-20 in the OpenRig seat dev.b1 (rig tianqi-troupe-p1), on
`claude --version`: **2.1.304 (Claude Code)**. One order, o1, on
`order/p1/o1`.

## What was built

The pane `troupe` is the mock Tianqi approved (`mock-p1.txt`), in the
OpenRig TUI's style and theme: a header; the GRAPH (a double box "▦ MISSION"
holding the groups plan, build, review and land joined by ━━▶, their steps
and orders stacked inside, the current step orange, done green ✓, light-skipped
struck, a "fix ≤ 2" loop from review to build; stacked top to bottom below
107 columns); the TABLES (roles, orders); the DETAIL sections (GOAL, ORDERS,
ROLES with duty bullets and skills ✓ / ✗). Inline it puts the header and
DETAIL first.

- `hooks/register.tsx` (63 lines) only wires: the `/troupe [mission or
  folder]` command, the poll, the pane's render hook.
- `hooks/read-state.ts` finds the mission, reads plan.md when its mtime
  changes, resolves the roles' skills against `$.session.usage` and infers
  each order's state.
- `hooks/plan.ts`: the goal, the roles (list or mapping form, with
  defaults), the orders block, plan_lint's rules, the layers, the workflow
  steps and the current one.
- `hooks/yaml.ts`: the YAML subset the plan format uses. A hooks module can
  import only the plugin's own files, so there is no YAML library; anything
  outside the subset is flagged with its line, not misread.
- `hooks/view.ts` (header, tables, detail) and `hooks/graph.ts` (a character
  canvas: the engine's Box has no border titles or free lines) build styled
  lines; `hooks/draw-pane.tsx` paints them.
- The Phase 0 probe tool, probe commands, Agent deny rule and their two
  tests are gone (Tianqi removed the tests himself after the auto-mode
  classifier refused the deletion to the seat).

## What the engine said

| Width | How opened | `isPlaced` / `reason` | Placement |
| --- | --- | --- | --- |
| 76 columns | unasked, on `session.start` | `false`: "unasked below 144 columns (76 now): placed when the person opens it, or when the terminal is widened to 144 columns" | none |
| 76 columns | Tianqi typed `/troupe ../troupe-p1-o1/docs/missions/p1` | `true` | `inline` above the prompt, 72 body columns |
| about 129 columns | the same pane, after Tianqi widened the tile | `true` | still `inline`, 125 body columns, about 14 rows: the layer and the o1 row show, the gates do not |

The seat's terminal is not in the fullscreen (alternate-screen) layout, so
widening keeps the pane inline. Docked placement (110 columns in fullscreen)
and the unasked opening at 144 columns are the engine's own rule, as its
`isPlaced` / `reason` answer states it; no screenshot of them was taken.

## Seen live

The seat's session runs in the main checkout (`~/repos/projects/troupe`,
on `main`, which has no p1 plan). The EnterWorktree relocation was declined
by house rule, so `/troupe` also takes a mission folder by its path.

- After `/troupe ../troupe-p1-o1/docs/missions/p1` the pane showed
  `TROUPE · p1 · Plan: p1 — Phase 1, the pane reads plan.md`, the folder,
  `inline · 72 cols`, the three roles with `builder ✓ plugin-authoring`,
  and `plan checks clean`.
- At 13:05:51 the seat changed the plan's `reviewer: []` to
  `reviewer: [troupe-no-such-skill]`. A capture at 13:05:54 showed
  `reviewer ✗ troupe-no-such-skill (not in this session)` (red). After the
  edit was reverted, the next capture showed `reviewer no skills` again.
- **Inline, the frame shows about nine rows.** The orders and the gates sit
  below them and are reached by scrolling the focused pane. Docked (110
  columns, fullscreen) the engine's types say the pane runs floor to
  ceiling; not seen here.

## Tianqi's look

- About 11:07Z, after the inline view at 76 columns and the live edit,
  Tianqi said "looks fine, approved".
- Right after, he withdrew it: "wait, that's all the plan? I cannot see any
  model info, goal, role duty, how the work is split, the workflow, .etc??".
  Inline he had seen the first nine rows. The orders (with model, state and
  goal) and the gates were below the fold. The plan's spec draws no mission
  intent or done-when, no role duty, no split rationale and no workflow
  stages. His words went to orch.lead, which amends the plan through
  大博士贴 before any of it is built. Then he widened the tile to look again
  (table above).

## The second amendment: four parts, and "does not scroll away"

The plan was amended twice (25b3841, then 8b91f8a, ruled by 大博士贴). The
first amendment (a goal line, a stage line, one-line duties) was still "太简单了"
to Tianqi. His spec has four parts: the goal; the workflow's key steps with
the human gates; each role's model, effort, duty bullets and skills; the
orders. He also asked "有没有什么办法不随着滚动消失". That pane (lines of text)
was replaced in rounds 3 and 4, below.

**Scrolling away: only the fullscreen layout keeps the pane fixed.** The
engine's own text (the API types of 2.1.304):

- `isFullscreen`: "True under the fullscreen (alternate-screen) layout;
  false on the main screen (`CLAUDE_CODE_NO_FLICKER=0`, tmux by default)
  and headless", and "The terminal always says: `true` fullscreen, `false`
  on the main screen, fixed per session".
- `Pane.placement`: "`dock` beside the transcript (the terminal in
  fullscreen from 110 columns), or `inline` above the prompt".
- `$.ui.open` `rows`: "The body rows the pane's content wants while seated
  inline above the prompt: it opens that tall, up to what the layout
  spares, not a third. A request, not a grant"; `columns`: "the dock opens
  that wide, floor to ceiling".

So a mod has no call that pins an inline pane. On the main screen the
inline block is drawn into the terminal's own output, and scrolling the
terminal back takes it out of view. The OpenRig seats run in tmux, so they
are on the main screen unless the session is switched with `/tui
fullscreen` (round 4). What the mod does: ask inline for the rows it needs.

**Beyond Phase 1** (asked for or implied, not built):

- Phase 2: the human gates' own state (Plan OK?, MR OK?, Merged?), and with
  it the step past "MR OK?"; the Approve / Change dialog.
- Phase 3: live stage tracking from the mission's own events, rather than
  inferring the step from order states and files; per-role progress.

## The third look (withdrawn): cards

Tianqi, 11:25Z: "这太简陋了，能不能搞点这种正儿八经的TUI图形化的东西，现在就完全是一堆文字啊".
f34d8ce drew step boxes and round cards with chips; he rejected it in round 4.
Seen live then, in a scratch session: the first docked pane (fullscreen via
`/tui fullscreen`), about 50 of 160 columns wide. That `/tui fullscreen` also
wrote `"tui": "fullscreen"` into his global settings; he chose (b), and the
seat ran `/tui default`.

## Round 4: mock first, then the drawing

Tianqi rejected the f34d8ce cards ("太丑了"; "我只是想要 openrig 类似的 table + graph"); the seat wrote a text mock of OpenRig's graph, seat table and detail view with p1's data, and he approved it ("可以，就这样做", 11:52Z). The pane is now that mock, cell for cell at 110 columns: `docs/missions/p1/mock-p1.txt`, checked by `tests/mock.test.ts`.

Seen live (scratch session, `claude --plugin-dir` of the o1 worktree):

- Inline at 114 columns (main screen): the header, then GOAL, ORDERS · 1 and
  ROLES · 3 with bullets and skills, then the tables, as the mock.
- Inline at 230 × 80, with the rows for all of it: the GRAPH first, as
  docked.
- Docked (fullscreen, 230 columns): beside the transcript, but only about 50
  columns wide. The engine ignored the 110 the pane asks for (`$.ui.open`
  `columns`, "a request, not a grant"), so the graph's groups stack top to
  bottom there (`capture-docked-50cols.txt`; inline:
  `capture-inline-114cols.txt`).
- `CLAUDE_CODE_NO_FLICKER=1` and `--settings '{"tui":"fullscreen"}'` did not
  switch this build to fullscreen inside tmux; `/tui fullscreen` did. It
  writes the user's settings, so the seat ran `/tui default` straight after
  and checked `~/.claude/settings.json` was byte-identical.

**Deviation and ruling:** docked at ~50 columns the mock's four groups cannot sit side by side, so below 107 columns the graph stacks them, joined by ▼, with the loop as one line (`capture-docked-50cols.txt`).
大博士贴 ruled (a), 12:00Z: keep the stacked graph below 107 columns, side by side from 107.

## Checks

`./check.sh`: `claude plugin validate .` passes; `claude plugin test .` 21
pass, 0 fail; `tsc: clean`. The tests:

- the approved mock: the pane at 110 columns, docked and inline, equals
  `docs/missions/p1/mock-p1.txt` line for line, and its colours are the
  legend's;
- goldens of the GRAPH for p1 at 50 columns (the stacked dock Tianqi gets)
  and at the 106 / 107 boundary between stacked and side by side;
- the four fixtures, the layering test, plan_lint's other rules, order
  state, the goal, both roles forms, and the workflow step at each state;
- pane tests through the engine kit:
  - the docked pane of a mission (stacked graph at 100 columns), with the
    missing skill, a redraw after an edit, and no second poll after a
    second `session.start`;
  - `/troupe <folder>`;
  - a skill verdict that follows the session;
  - the inline order with few rows (header, DETAIL, TABLES), and the GRAPH
    first when the rows are there.

Mutations in scratch copies fail the matching test: removing the timer's
cancel (`Expected: 3, Received: 6`), and caching the skill listing forever.
The real p0 and p1 plans parse with no problems, and plan_lint still
accepts p1 with its `roles` key.

The fix round after rev.r1's review: the skill verdict is computed on every
poll (the listing is asked again after a failure, and every 30 s);
`shared:x` is the only spelling dropped (`rescue` no longer matches
`codex:rescue`); the pane's `$.ui.open` on `session.start` is caught; a
double-quoted escape other than `\n \t \\ \" \/` is refused; the README
says "newest" is the newest `plan.md`.

Not applied: `tianqi-project-maintenance` in full, per the lightweight
maintenance decision (2026-10-20); only the README, `check.sh` and tests.
