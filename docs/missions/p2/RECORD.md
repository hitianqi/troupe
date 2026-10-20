# Record: p2 — the tmux checks and the split-right panel

Claude Code 2.1.304, Node v22.23.2, tmux 3.4. Rig tianqi-troupe-p2 (light):
orch.lead, dev.b1, rev.r1. Plan: `plan.md` here, with its 12:54Z amendment.

## o1: the three checks (verdicts in brief)

`docs/FEASIBILITY.md`, "Phase 2 — the tmux checks", with raw evidence in
`docs/feasibility/p2-*`; rev.r1's review is `REVIEW-o1.md` (PASS).

1. A hook can type into another tmux pane (`$.process.run(["tmux",
   "send-keys", …])`): exit 0, unrefused, the text arrived. Reload, unload
   and session end each kill a `$.process.spawn` child.
2. The engine has no `$TMUX` in an OpenRig seat, and `tmux display -p`
   names another pane; the session's pane is found through its process
   ancestry, and a split from the hook shows inside the seat's window.
3. The pane's text is drawn outside the engine by plain Node, identical to
   the p1 golden, redrawn on a poll.

## o2: what was built

- `hooks/lines.ts` (the view's lines, moved out of `draw-pane.tsx`),
  `hooks/mission.ts` (the mission from plan.md, the folder and the engine's
  facts, moved out of `read-state.ts`) and `hooks/ansi.ts` (one screen as
  ANSI): no engine import, so the pane and `bin/troupe-panel` draw from
  the same code. The hooks import each other with `.ts` extensions, and
  `tsconfig.json` has `allowImportingTsExtensions` and
  `erasableSyntaxOnly`, so Node runs them with no flag.
- `bin/troupe-panel`: the view in its own terminal, redrawn on the 2 s poll
  and on resize, cut to the terminal so it never scrolls, gone on SIGTERM,
  SIGINT, SIGHUP or when its `--owner` process is gone.
- `hooks/panel.ts` and `register.tsx`: `/troupe [mission]` inside tmux
  splits the panel right of the session's pane (half the window, at
  least 30 columns; `-d`, so the transcript keeps the focus), keeps the
  pane in `$.state` and reuses it (another mission respawns it in place; a
  hot reload adds no split; a pane closed by hand is split again);
  `/troupe close` and `session.end` close it; with no tmux, the pane. The
  session's pane comes from `$TMUX`/`$TMUX_PANE`, else from the nearest
  ancestor's environment in `/proc`, which names the socket too (rev.r1's
  o1 consideration). Every tmux call is an argv; tmux runs no shell.
- `.troupe-state.json` (git-ignored): the session's skill names and its
  subagents, written by the mod into the mission folder only while a panel
  is open and only when they change, read by the panel.
- The Phase 1 leftovers: an unknown effort is a plan problem; a plan with no
  orders read is not "light"; a DETAIL label of 13 characters or more is
  cut with `…` instead of running one over; the tables no longer drop
  columns (they are gone, below); below 48 columns a DETAIL label takes its
  own line. The narrow stacked graph's fix-loop line is shortened to fit
  instead of overwriting the frame.
- After the first look (below), the view is graph first, for the panel and
  the in-session pane alike: the header (the goal on one line), the GRAPH,
  compact ROLES (glyph, name, model, state, now) and compact ORDERS (glyph,
  id, model, state, ← deps), one line each, then DETAIL; cut from the bottom
  to the rows there are, the last row `…`, never more lines than rows. The
  wide tables of the p1 mock are gone, so the p1 goldens were regenerated
  (`tests/mock-p1.ts`: the whole view at 110 columns, and the same cut to 30
  rows) and `mock.test.ts` and the pane tests rewritten to match; after
  the second look the GRAPH goldens were regenerated too (one line per
  step inside a role). One view at a time: while the panel is open the
  in-session pane is closed (and not opened after a reload); `/troupe close`
  brings it back. The reported width is what tmux gave the pane.
- troupe-panel places every line at its row by cursor address with
  autowrap off and writes no newline, so a frame cannot scroll the screen
  even where the terminal counts a character wider; each row is cleared
  before it is written (clearing after would erase the last column, which
  the 158x57 capture showed and the Node test now pins).

## Verification

- `./check.sh` exit 0 (after the rebase): `claude plugin validate`; `claude plugin test` (36
  pass: the view's goldens, order, viewport, keys, colours and the 57-row fit, the git state rules, the pane, the
  leftovers, and `tests/split.test.ts` for the split decision and argv, the
  engine's own `TMUX`, the width tmux reports, reuse, respawn, reload, a
  gone pane, close, session end, one view at a time and the no-tmux
  fallback); `node --test tests/panel.node.mjs` (5 pass: the panel at 110
  columns is the view golden, whole and through a 30-row viewport; at 50
  the stacked GRAPH golden; no line past the terminal at 30x27, 63x57,
  79x57, 117x57, 110x20; and the command itself, `--once` and in a real
  terminal under `script`, where it writes no newline, clears each row
  before writing it, scrolls on an End key, asks for mouse reports and
  gives them back, uses the alternate screen, and exits 0 on SIGTERM; and
  the git rule on a real repository with a lagging main); the workflow walkthrough check;
  `tsc -p .` clean.
- Mutants in a scratch copy, each caught: never reusing the panel (1
  fail), no close at session end (1 fail), ignoring the ancestry (4 fail).
- Driven live in a scratch `claude --plugin-dir` session in the builder's
  own tmux server, started as a seat is (no `TMUX` in the engine, the
  pane's shell has it): split at 64 of 160 columns with the right `--owner`,
  reuse, respawn on another mission, close, close again, reopen, a hot
  reload with the panel open (no second split), `/exit` (panel gone), a
  `kill -KILL` of claude (panel gone), and the owner check alone (panel
  exit 0 within 2.5 s). `live-scratch.txt`.
- The repo and the dev-mods copy (`~/.claude/dev-mods/<session>/troupe/`)
  are identical in every shared path (`hooks`, `bin`, `types`, `tests`,
  `skills`, `tsconfig.json`, `package.json`, `.claude-plugin/plugin.json`);
  only `.claude-plugin/types/` differs, laid by the engine.

## Seen live

- The text mock (`mock-p2.txt`) went to Tianqi with one question: at 30x27
  the approved rules show the header, the goal and the first order, and no
  role state; A keeps them, B is a compact form.
- First look, in dev.b1's tile (window 158x57): not approved. He saw two
  views at once (the in-session pane, opened unasked at session start,
  inside a seat pane he had dragged to 40 columns, and the panel at 117),
  mostly goal text, and no workflow graph, since the inline rule dropped
  the graph when the rows ran out. 大博士贴's ruling, corrected by Tianqi:
  one view at a time; graph first, compact roles and orders, the goal on
  one line; never more lines than the pane's rows, tested at 30x27, 60x40
  and 117x57. The split itself had not taken the focus (`-d`; his drag
  had); the overflow he saw did not reproduce at 63 and after a resize to
  117, and the cursor-addressed drawing now rules it out.
- Second look (capture `look-2.txt`, a scratch window of his tile's size,
  158x57, the session run as a seat; then the panel in his tile): not
  approved, "it is empty, and the width is not 50%". His screenshot showed
  why it looked empty: on his Herdr picture background the dim grey
  waiting items (MR, idle, the fix loop, ◆ MR OK?, planned) were nearly
  invisible; and the stacked graph, three rows per step, pushed ORDERS out
  of 57 rows. 大博士贴's three fixes, built: the split is half the window
  (at least 30 columns); waiting items are drawn in #9aa3ad, lighter than
  OpenRig's dim #6d7480 (the theme has no step between it and bright);
  inside a role's box each step is one line, the checkpoints stay small
  boxes, so the graph, ROLES and ORDERS fit in 57 rows at 63 and at 79
  columns (a test, with three orders: ORDERS end on row 42). The GRAPH
  goldens were regenerated for it. The panel also shows the mission folder
  as it was given, as the pane does.
- Third look (`look-3.txt`, 158x57, panel 79 columns; then in his tile):
  the look passes (graph, roles, orders, contrast), with one fix: "it
  cannot scroll, I cannot scroll down to read the plan". Built to
  大博士贴's spec: troupe-panel owns a viewport over the whole view, the
  header pinned on top, `↑ N more` on the next row when scrolled and
  `↓ N more rows · ↑↓ PgUp PgDn` on the last while there is more below
  (replacing `…`); ↑/↓ and j/k a row, PgUp/PgDn a page, Home/End, and the
  mouse wheel (SGR mouse reports, which tmux passes on with `set -g mouse
  on`). Never more rows than the pane has, tested at every offset at
  30x27, 63x57 and 79x57, the end reaching the last DETAIL line; and in a
  real terminal under `script`, an End key scrolls it. The in-session
  pane uses the engine's own scrolling: it draws the whole view, and the
  engine's Pane scrolls a taller tree in its window (`e.props.scroll` is
  read-only, moved by the person's keys while the pane is focused), so it
  cannot pin the header; that is said here and in the README.
- Also added (大博士贴, 14:14Z): an order's state from git. `done` once
  squash-merged onto the mission branch (a commit `<id>: …` on the mission
  branch alone), `running` while `order/<mission>/<id>` is ahead of it;
  the builder shows working while an order runs. The mission branch is the
  local branch named for the mission; git is asked at most every 10 s, by
  the mod and troupe-panel alike, through one shared `gitFacts`. Live
  subagent progress inside an order stays Phase 3.
- Fourth look: `look-4.txt` (158x57: the panel at the top, then after End),
  then in his tile: approved ("fine, go on", 14:40Z).

## The rebase onto the workflow mission

The workflow mission (`skills/troupe-mission/`, `docs/missions/workflow/`)
landed on main first (c3433a7); the mission branch was rebased onto it and
`order/p2/o2` onto that, cleanly. Its walkthrough check
(`docs/missions/workflow/check-sample.mjs`) imports `stateOf` from
`hooks/read-state.ts`, which o2 had moved to `mission.ts`; `read-state.ts`
now re-exports `stateOf` and `hasSkill`, and the check holds ("all checks
hold"), now without `--experimental-transform-types`. Folded in from its
RECORD: the check is one line of `./check.sh` (on `sample/`; its
`register.mjs` still stands in for the engine import of `read-state.ts`),
and the README says the plugin carries the `troupe-mission` skill. Its
other option, a plugin test that also runs it on a copy without o2's
`depends_on`, was not taken: the one line is the bounded form.

## Known limit: a split in an OpenRig seat's window

While the panel was open beside dev.b1's pane, OpenRig refused every
delivery to the seat ("does not have the single expected bound pane"), so
`rig send` and queue wakes did not reach it until orch.lead killed the
panel pane. troupe itself does not use OpenRig, but p3's role windows must
be separate tmux windows or sessions, never panes beside an OpenRig-bound
pane; and a look in a seat's tile ends with `/troupe close`.

## The fix round (rev.r1's review of o2, REVIEW-o2.md: FAIL, one Act-on)

- **Act on, fixed:** `gitFacts` read an order as merged when its `<id>: …`
  commit was on no local branch but the mission's, so with a local `main`
  behind `origin/main` (this project fetches into `refs/remotes/origin`
  only) earlier missions' `o1: …`/`o2: …` made this mission's orders
  `done` before they existed. The log now also leaves out what any remote
  branch has, except the remote copies of the mission branch and the order
  branches (after a push they hold the same commits). A Node test builds a
  real repository with a lagging `main`: `{ running: [o2], merged: [] }`,
  and after o1's merge and a push `merged: [o1]`; under the old rule it
  fails.
- Taken from Consider: the README drops the `…` line, warns that a split
  in an OpenRig seat's window cuts the seat off, and says tmux 3.4 is what
  was tested; `panel-probe.mjs` says it is o1's historical evidence, run
  on 2b9a1b7 (89eb623 before the rebase), and no longer runs on this tree
  (FEASIBILITY.md is outside o2's files and unchanged).
- Taken from Noted, a one-liner: troupe-panel draws on the alternate
  screen, so its frames no longer pile up in the pane's scrollback (live:
  `history_size=0`); the README now says an old `.troupe-state.json` is
  read as it stands.

## Left for p3 and later

- Typing a brief into a pane that runs interactive Claude (o1's open point).
- Writing `troupe_dispatch` may draw the classifier's `[Create RCE Surface]`
  at write time, as o1's first probe did: keep its surface narrow.
- Live progress inside an order (what a role window is doing) is p3; the
  git rule only tells running from merged.
- The `/proc` route is Linux only; elsewhere the mod needs `$TMUX` in its
  environment.
- From the review's Noted, left as they are: the reviewer never shows
  "working" on a rig-built mission and the builder shows "working" while
  its order is under review (no signal without the agent list); a stale
  `.troupe-state.json` is believed by a panel run by hand later; widths
  are string lengths, so a CJK or emoji character would misalign a box
  edge (repository content is English); the panel and the mod each run
  a few git commands every 10 s.

Not applied: `tianqi-project-maintenance` in full, per the lightweight
maintenance decision; the README, `check.sh` and the tests only.
