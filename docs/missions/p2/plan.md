# Plan: p2 — Phase 2 part 1, the tmux checks and the split-right panel

Intent: Tianqi opened Phase 2 ("开 Phase 2 吧", 2026-10-20); the brief is
大博士贴's queue item qitem-20261020122351-4115ddebd1a2bba5 and the spec is
`ROADMAP.md` (the product statement and "Phase 2 — Windows and dispatch").
His shape: `/troupe` with a mission splits a plan panel to the RIGHT inside
the terminal, the conversation is the orchestrator, and later each role gets
its own tmux window. Phase 2 runs as two missions in relay. This one, p2,
answers the three checks the dispatch design rests on and ships the
split-right panel. The next, p3, builds `troupe_dispatch`, the role windows
and the approval dialog, and its design depends on check 1, so p2 does none
of p3's work.

Done when:
- `docs/FEASIBILITY.md` has a Phase 2 section, with `claude --version`, that
  answers each check with its commands, exit codes and output (raw evidence
  under `docs/feasibility/`):
  1. From a hook (not a model Bash call), `$.process.run(["tmux",
     "send-keys", "-t", <pane>, <text>, "Enter"])` into a second tmux pane
     made for the test: whether it runs, whether anything refuses it, whether
     the text arrives. What kills a long-lived `$.process.spawn` child:
     unload, reload, session end.
  2. From a hook, the mod finds the session's own pane (`$TMUX`,
     `TMUX_PANE`, `tmux display -p '#{pane_id}'`) and runs
     `tmux split-window -h -l <cols>` beside it with a command running in the
     split. A `rig capture` of the seat's window shows the split inside the
     seat's tmux window, the one his Herdr tile shows. What happens with no
     `$TMUX`. Anything observed about herdr is noted, not built for.
  3. The text the pane draws (graph canvas, tables, detail) is produced
     outside the engine from the same parser and drawing code, by a Node
     script with no engine imports, at a given width, and redrawn on a poll.
- The o1 verdict reaches 大博士贴 as a row. If check 1 or 2 fails, the
  mission stops after o1 and reports; o2 is not built on a workaround.
- `bin/troupe-panel <mission dir> [--width N]` (Node, ESM, no engine
  imports) draws the Phase 1 view (header, graph, tables, detail: the same
  text as the pane, the same colours as ANSI) in its own tmux pane. It clears
  and redraws on the pane's poll interval, never scrolls, and exits cleanly
  on SIGTERM. It and the mod share one source of truth for the parser and the
  text canvas: what the mod draws from is a module both import, and the pane
  keeps its JSX wrapper.
- The mod, on `/troupe [mission]` inside tmux, splits right
  (`split-window -h`, a sensible width such as 60 columns or 40%) running
  `troupe-panel`, keeps the pane id in `$.state`, reuses it on a later call
  (no second split), and closes it on `/troupe close` and at session end.
  Outside tmux it says "no tmux: showing the in-session pane" and does what
  Phase 1 does. The in-session pane stays available.
- The Phase 1 leftovers are fixed: an unknown effort is flagged; an
  unreadable plan is not shown as "light"; a long id no longer overruns its
  label by one; below about 90 columns the tables degrade to the detail form
  instead of dropping columns.
- `claude plugin test` covers the split decision, the reuse of the pane id
  and the no-tmux fallback. A Node test renders troupe-panel at two widths
  against the Phase 1 goldens. `./check.sh` exits 0 with `tsc` run and runs
  the Node test too.
- `README.md` says that tmux is required and documents `/troupe`,
  `/troupe close` and troupe-panel's usage.
- Seen live: in dev.b1's tile Tianqi types `/troupe docs/missions/p2` and
  sees the panel split right inside that tile, staying fixed while the
  transcript scrolls. He approves the look, through 大博士贴. A text mock or
  capture goes to him first, through 大博士贴, before more drawing.
- `docs/missions/p2/RECORD.md` records `claude --version`, the check
  verdicts in brief, what was seen live and what is left for p3. The repo
  copy and the dev-mods copy of the mod are identical apart from
  `.claude-plugin/types/`.

Out of scope: `troupe_dispatch`, role windows, worktrees per role, the
approval dialog, live progress of subagents, herdr-specific API, any paid
run, and any publishing before the MR gate. Tianqi's global
`~/.claude/settings.json` is not touched. If a check needs fullscreen, it
runs `claude --plugin-dir` in the builder's own scratch tmux server with a
per-session setting, and the record says so.

Amendment (2026-10-20 12:54Z, 大博士贴's ruling on the o1 verdict): all
three checks passed (`docs/FEASIBILITY.md`, "Phase 2 — the tmux checks").
The engine has no `$TMUX`, so the mod finds its own pane by its process
ancestry against `tmux list-panes -a`. Two calls for o2 are approved:
1. The split takes 40% of the window, at least 30 columns. Below about 90
   columns the panel draws the detail form (dev.b1's tile is 76 columns).
2. The mod writes a small state file in the mission dir that the panel reads
   for what only the engine knows: order states from the agent list, and the
   skills' ✓/✗. git ignores it (`.gitignore`), and the README names it.

Second amendment (2026-10-20 13:41Z, ruling qitem-20261020134143-96799456db392c61
from 大博士贴, verbatim). The A/B question is settled as B, extended. It
supersedes the panel's look rules in the first amendment and in Done when
(width cap, one view at a time, content priority, no overflow):

> RULING on the p2 look, from 大博士贴, after looking at dev-b1's tmux window myself (tmux list-panes / capture-pane on the daemon server, 13:4xZ). Tianqi's words: "啥也没看着" (first try, path cut to …/p), then "这一下子给我好多，而且根本没有 workflow graph". Verdict: NOT approved as it stands. What is actually on his screen:
> - Window 158x57, two panes: %126 = the seat's Claude pane squeezed to 40 columns; %134 = the troupe-panel (node) at 117 columns and ACTIVE. The /troupe reply said "63 columns" but the panel holds 117 now, so the split took most of the window and the transcript is unreadable at 40.
> - Inside the 40-column seat pane the IN-SESSION pane also opened (the TROUPE box with GOAL/ORDERS text wrapped at 38 cols). Two views at once, both mostly goal text. That is the "一下子好多".
> - The 117x57 panel shows NO GRAPH: its content (header + detail + tables, ~78 lines) exceeds 57 rows, so the inline rule dropped the graph, and the overflow redraws so the capture shows the tail of one frame above the head of the next: it scrolls, which it must never do.
> DECISIONS (A/B settled as B, extended):
> 1. Width: the split is 40% of the window, min 30, MAX 50%; never more. If the window is narrower than ~80, say so and do not split. Report the width you actually got, from tmux, not the request.
> 2. One view at a time: when the split panel is open, the in-session pane is NOT drawn (close it / skip ui.open); it comes back on /troupe close or outside tmux.
> 3. Priority of content, both panel and pane, in this order, cutting from the bottom to fit the rows: header → GRAPH (roles + ◆ checkpoints; stacked below 107 cols, side by side above) → compact ROLES (one line each: glyph, name, model, state, now) → compact ORDERS (one line each: glyph, id, model, state, ← deps) → DETAIL only if rows remain. Goal text: one line, truncated with …; the long order goals only in DETAIL. The graph is the point of the panel and is never dropped while it fits; when even the graph does not fit, draw its stacked form cut to the rows and say "…" on the last row.
> 4. Never overflow: the renderer takes the pane's real rows (tmux pane_height, or the engine's rows) and emits at most that many lines, every frame. A test for it at 30x27, 60x40, 117x57.
> 5. The "63 columns" vs 117: find out why (resize after open? split -l misapplied?) and make the reported width the real one.
> Then a new look: send me a rig capture of BOTH panes (seat pane and panel) at his tile size, and a row; he looks once more.

Correction (2026-10-20 13:43Z, Tianqi through 大博士贴): the 40-column
Claude pane was his own drag, not the split. Items 1 (width cap) and 5
(63 vs 117) of the ruling above are withdrawn: the split defaults to 40% or
50%, at least 30 columns, and reports the real width from tmux. Items 2, 3
and 4 stand.

Third amendment (2026-10-20 13:47Z, 大博士贴's ruling on a finding):
while the panel was open in dev.b1's window, OpenRig refused every delivery
to that seat ("does not have the single expected bound pane"). o2 adds:
`split-window -d`, so the split does not take focus; the mod survives its
pane vanishing (a re-split on the next `/troupe`, no stale id); and
RECORD.md names the known limit: a split in an OpenRig seat's window makes
the seat unreachable by `rig send` and queue wakes. p3's role windows must
be separate tmux windows or sessions, never panes beside an OpenRig-bound
one. Looks stay in dev.b1's tile, and Tianqi runs `/troupe close` after
each.

Fourth amendment (2026-10-20 14:09Z, Tianqi's look-2 verdict through
大博士贴, "是空的，而且宽度不是 50%"): the split is 50% of the window;
waiting items use a brighter grey that reads on a picture background
(OpenRig theme's next step up from dim, or #9aa3ad), and strikethrough is
kept only for steps skipped as light; inside a group box each step is one
line, the checkpoints stay small boxes, so the graph, roles and orders fit
in 57 rows at 63 and at 79 columns.

Fifth amendment (2026-10-20 14:14Z, 大博士贴): order state is also read
from git, so the panel is honest on rig-built missions. An order branch
`order/<mission>/<id>` with commits ahead of the mission branch is running,
an order squash-merged onto the mission branch is done, and the builder is
working while any order runs. RECORD.md says live subagent progress stays
Phase 3.

## How the work is split

Two orders in series, as the brief sets out. o1 is research by nature, but
it is a `code` order: its evidence is committed (`docs/FEASIBILITY.md`,
`docs/feasibility/`), and its probe mod lives in the session's dev-mods
folder or in scratch, outside the repo. o1 changes none of `hooks/`, `bin/`
or `tests/`. If check 3 shows that the shared code needs changing to run
under plain Node (the hooks import each other without extensions, under
`moduleResolution: bundler`, and `read-state.ts` imports the engine), o1
records that as a finding, and o2 makes the change.

o2 owns every code file. The extraction (one module that both the pane and
troupe-panel draw from), the split logic in `register.tsx`, the leftovers in
`view.ts`, `graph.ts` and `plan.ts`, and their tests all change together.
`register.tsx` and `types/index.d.ts` are hubs, so one order owns them.
Splitting o2 further would only serialize it on this one-builder rig and add
a review round. o2 depends on o1 because its design rests on o1's verdict.
The two orders share `docs/missions/p2/`: o1 writes its evidence notes
there, and o2 writes RECORD.md and the mock.

Loading the mod needs Tianqi. The engine asks "Turn on the mods Claude
writes in this session?" once, in dev.b1's tile. The builder sends a queue
row the moment it is up, and another when the panel is ready to be seen. The
orchestrator passes both to 大博士贴. Offline work continues meanwhile.

Cost: no run on Tianqi's API key. Subagents inside a seat run on its own
login.

## Orders

```yaml
goal: "Split the mission plan out to a panel on the right of the terminal, after proving the tmux moves the dispatch design rests on."
roles:
  orchestrator:
    model: opus
    effort: high
    duty:
      - "Writes the plan and gets it approved"
      - "Dispatches each order and merges it onto the mission branch"
      - "Opens the MR after the go, then tears down"
    skills: [messaging-the-human, queue-handoff]
  builder:
    model: opus
    effort: high
    duty:
      - "Runs the tmux checks from a hook, with evidence"
      - "Builds troupe-panel and the split, sharing one drawing module with the pane"
      - "Fixes review findings, once per review"
    skills: [plugin-authoring]
  reviewer:
    model: sonnet
    effort: high
    duty:
      - "Reviews each order for behaviour as it lands"
      - "On a light rig, the last review is also the final review"
    skills: []
orders:
  - id: o1
    kind: code
    goal: "Answer the three Phase 2 checks with evidence in docs/FEASIBILITY.md: tmux send-keys and a spawned child from a hook, finding the session's own pane and splitting right from a hook (with and without $TMUX), and the pane's text drawn by a plain Node script outside the engine on a poll."
    why: "ROADMAP Phase 2 puts the checks first: p3's dispatch types briefs into role windows, which Phase 0 found a model Bash call cannot do (\"Tmux Self Drive\"). Reuses the Phase 0 method and layout (docs/FEASIBILITY.md, docs/feasibility/ raw evidence, a probe mod under ~/.claude/dev-mods/<session>/), the p1 mod as the base for the probe, and hooks/plan.ts, view.ts and graph.ts as the code check 3 runs outside the engine."
    touches:
      - docs/FEASIBILITY.md
      - docs/feasibility/
      - docs/missions/p2/
    depends_on: []
    model: opus
    risks: "The mod needs Tianqi's one-time 'Turn on the mods' answer in dev.b1's tile; until then only check 3 can run. $.process may be refused by the classifier or by a permission rule, as the model's Bash call was; that is a result, not a blocker to work around. A split inside the seat's own window changes Tianqi's tile, so the probe closes its split. A spawned child that outlives the session would leak, so it is killed by hand and recorded. The hooks import each other without extensions under bundler resolution, so check 3 may need a loader or a build step; that is a finding for o2, not a change here."
    proof: "Each check's commands, exit codes and output in docs/FEASIBILITY.md and docs/feasibility/; a rig capture of dev.b1's window showing the split; the check-3 script's output at two widths, then again after a plan edit; the verdict row to the orchestrator."

  - id: o2
    kind: code
    goal: "Ship bin/troupe-panel and the /troupe split-right (pane id kept and reused, /troupe close, session-end close, no-tmux fallback to the in-session pane) on one shared drawing module, fix the four Phase 1 leftovers, with tests, README, RECORD.md, and the look seen and approved by Tianqi."
    why: "ROADMAP Phase 2 and the brief: the plan must stay fixed beside the transcript, which an inline pane cannot (p1 RECORD.md: no call pins an inline pane; the dock gets about 50 columns). Reuses hooks/plan.ts (parser and checks), view.ts and graph.ts (the text lines and graph canvas, already engine-free), the POLL_MS interval and the setTarget/readMission mission lookup in read-state.ts and register.tsx, and the p1 goldens in tests/ for the panel test. Nothing in the repo spawns or drives tmux yet, so the split is new."
    touches:
      - hooks/
      - bin/
      - types/index.d.ts
      - tests/
      - package.json
      - package-lock.json
      - check.sh
      - tsconfig.json
      - .claude-plugin/plugin.json
      - README.md
      - .gitignore
      - docs/missions/p2/
    depends_on: [o1]
    model: opus
    risks: "The look is Tianqi's: a text mock or capture goes to him through 大博士贴 before more drawing. The panel and the pane must not drift: one module, imported by both; the p1 goldens must still pass for the pane. Running .ts under plain Node (type stripping, import extensions) must not break the engine's loading of the same files. A split that is never closed leaves a stray pane in Tianqi's tile: close on /troupe close and at session end, and do not stack a second split on reload. tmux absent, or a pane id that has gone, must fall back rather than fail. The leftovers touch shared view code that the p1 tests pin."
    proof: "./check.sh exits 0 with tsc and the Node test run; claude plugin test covers the split decision, pane id reuse and the no-tmux fallback; troupe-panel's output at two widths matches the goldens; a rig capture of dev.b1's tile with the panel split right after /troupe docs/missions/p2, then after /troupe close; Tianqi's look approved through 大博士贴; diff -r of the repo and dev-mods copies empty apart from .claude-plugin/types/."
```

## Review

Each order is reviewed by rev.r1 as it lands (`REVIEW.md`). On this light
rig the o2 review is also the final review of the whole
`feature/NO-JIRA-p2` diff against `main`, and says so. Findings go back to
the builder, with one fix round and one re-review; then the orchestrator
rules. A leftover with a known, bounded fix is fixed in this mission, not
filed.
