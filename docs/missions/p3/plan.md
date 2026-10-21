# Plan: p3 — Phase 2 part 2, dispatch, role windows and the approval dialog

Intent: Tianqi opened p3 ("我们开始做 troupe P3吧", then "角色窗口单独一个
session，Light mode 先不做，开始吧", 2026-10-21); the brief is 大博士贴's
queue item qitem-20261021141927-57f1863429c7d3ef and the spec is
`ROADMAP.md` (the product statement and "Phase 2 — Windows and dispatch").
p2 proved the tmux moves and shipped the split-right panel. p3 builds the
rest of Phase 2: `troupe_dispatch`, the tool that is the home of the two
hard rules (no dispatch before the plan is approved, none while a
`depends_on` order is not done); one tmux window per order or review, in a
tmux session of their own, each a Claude instance in its own worktree that
takes its brief by typed keys; results coming back as files the panel
reads; and the Approve / Change dialog that writes the approval record.
Light mode moves to Phase 3 with the skill.

Done when:
- `docs/FEASIBILITY.md` has a "Phase 2 part 2" section with `claude
  --version` and raw evidence under `docs/feasibility/p3-*`: from a hook,
  `tmux send-keys` into a window of a separate tmux session running
  interactive `claude` delivers a prompt and Claude acts on it; what happens
  with a permission prompt showing, with the input box not empty, and with
  `--permission-mode auto` against the default; and how a multi-line brief
  arrives. The verdict reaches 大博士贴 as a row. If typing into an
  interactive Claude fails, the mission stops after o1's check and reports.
- `troupe_dispatch(order)` is a tool the mod registers. It refuses, with a
  reason the model reads, before the plan is approved (no approval record, or
  the plan's hash differs from the record's) and while any `depends_on`
  order is not done. On success it adds the order's worktree and branch from
  the mission branch, opens the role session `troupe-<mission>` if it is not
  open, opens a window named for the order in it running `claude` with the
  order's model (no mod in role windows), types the order's brief and Enter,
  keeps the session and `{order → window}` in `$.state`, and answers what it
  did. Every command it runs has a fixed shape; nothing the caller passes
  becomes a command or a flag. It acts only on the session and windows it
  opened itself.
- `troupe_status` answers each window's order, role and liveness.
- The reviewer is dispatched the same way, with its brief from
  `reviewer.md`. A finished order or review shows on the panel and the pane
  as done or reviewed, from files only (a done marker the builder's brief
  tells it to write, `REVIEW-<id>.md`). The two p2 leftovers are fixed: an
  order in a fix round shows as `reviewed`, and the step can reach "Final
  review".
- `troupe_close <order>` closes one window, and `troupe_close` with no order
  kills the role session. A window or session that has gone is opened again
  on the next dispatch, not reported as running.
- `/troupe <mission>` with a plan that passes the checks and has no valid
  approval record asks "Approve the plan?" with Approve and Change. Approve
  writes the record (plan hash and time) in the mission folder; Change takes
  free text and hands it to the conversation ("Tianqi asks: …; edit plan.md,
  then /troupe again"); the next `/troupe` asks again; an edited plan
  invalidates the record.
- `claude plugin test` covers: refused before approval, refused on an unmet
  `depends_on`, allowed after both, refused after the plan changed, the
  fixed argv of every tmux and git call, the record and the hash rule, the
  dialog's two answers, close, and a window or session gone.
- A scripted dry run in a scratch tmux server, on a scratch copy of a repo
  holding the two-order sample mission (`docs/missions/workflow/sample/`):
  dispatch o1 opens the role session and window and the brief lands;
  dispatch o2 is refused until o1 is done; o1 marked done, o2 is allowed.
  Its output is kept under `docs/missions/p3/`.
- Seen live: Tianqi answers the dialog in a builder's tile (Approve once,
  Change once, then the dialog back), through 大博士贴.
- `README.md` documents the tmux requirement, `/troupe`, the dialog,
  `troupe_dispatch`, `troupe_status`, `troupe_close`, what role windows are
  (a tmux session of their own) and the known limits. `ROADMAP.md` has the
  Phase 2 outcome paragraph and says light mode moved to Phase 3.
  `docs/missions/p3/RECORD.md` records `claude --version`, the verdicts, the
  dry run, what was seen live and what is left to the human (prompts in role
  windows). `./check.sh` exits 0 with `tsc` run.

Out of scope: light mode; the workflow skill text (`skills/troupe-mission/`
is done and is read, not changed); slim and final-review mechanics beyond
what the skill says; any herdr-specific API; cost tracking and metrics.json
(Phase 3); recovery after a reboot; any paid run on Tianqi's API key; any
publishing before the MR gate. Tianqi's global `~/.claude/settings.json` is
not touched (no `/model`, no `/tui fullscreen`).

## How the work is split

o1 owns the hubs. `hooks/register.tsx` is the one place the mod wires
commands and tools, and `types/index.d.ts` holds the mod's `$.state` keys.
o1 lays all of the mission's wiring in `register.tsx` once: at
`session.start` it calls one registration function in `hooks/dispatch.ts`
(which registers `troupe_dispatch` and `troupe_status`, and later o2's
`troupe_close`), and `/troupe` calls one gate function in
`hooks/approval.ts` after the plan is shown. o1 also writes the approval
record itself (where it lives, its plan hash, read and write) in
`approval.ts`, since its refusal rule reads it, and declares in
`types/index.d.ts` the state keys for the role session, the windows and the
approval record. After o1, o2 and o3 do not touch `register.tsx` or each
other's files, so they run in parallel.

- o2 grows `hooks/dispatch.ts` (the reviewer, close, a gone window or
  session) and owns the state logic in `hooks/mission.ts` and
  `hooks/plan.ts` (done markers, the two leftovers), the tests of those,
  `check.sh` and the dry run. Its overlap with o1 (`dispatch.ts`, the types,
  its tests) is serialized by `depends_on`.
- o3 replaces o1's gate in `hooks/approval.ts` with the dialog and owns its
  own test file. It keeps any state it needs in the module or in the
  `$.state` key o1 declared, so it does not touch the types file.
- o4 writes the docs once both have landed: `README.md`, `ROADMAP.md`,
  `RECORD.md` and the plugin's version and description. Splitting the docs
  out removes the one file o2 and o3 would otherwise both edit. It is
  `sonnet`: the text follows what o1 to o3 shipped and what their reviews
  found.

The real repository already holds this mission's own `order/p3/<id>`
branches and `../troupe-p3-<id>` worktrees, which are exactly what
`troupe_dispatch` creates for a mission named p3. So no test, dry run or
live check runs `troupe_dispatch` against this checkout. Dispatch is tried
only in a scratch repository under `~/scratch/troupe/`, on a scratch tmux
server (`tmux -L` or `-S` under `~/scratch/troupe/`), with role windows on
the seat's own login and closed after each run.

Where the role session lives: on the tmux server of the orchestrator
session (the socket `panel.ts` already finds through `$TMUX` or the process
ancestry), so the person can switch to it with the usual tmux keys. That is
a session of its own, never a pane or window in the orchestrator's session,
which in an OpenRig seat would cut the seat off from `rig send` (p2 RECORD,
"Known limit"). In this rig's checks and dry run the "orchestrator" is a
scratch `claude --plugin-dir` on a scratch server, so nothing is opened on
OpenRig's server.

Loading the mod: the checks and the dry run use `claude --plugin-dir` in the
builder's own scratch tmux server, as p2's live drive did. If a builder uses
the session's mods folder instead, the engine asks "Turn on the mods Claude
writes in this session?" in its tile: the builder sends the orchestrator a
row the moment it is up, and the orchestrator passes it to 大博士贴. The
dialog's live check needs a person and a loaded mod in a builder's tile
(o3's, dev.b2): when it is ready, o3 sends a row with the tile and the exact
steps, the orchestrator passes it to 大博士贴, and nothing else waits on it.
The live check runs on the sample mission folder (a scratch copy or
`docs/missions/workflow/sample`), not on p3, and no dispatch is made from
it.

Cost: no run on Tianqi's API key (0 USD). Role windows in the checks and the
dry run run `claude` on the seat's own login, with short prompts, and are
closed after each run.

Seats: o1 on dev.b1; then o2 on dev.b1 (it builds on o1's module) and o3 on
dev.b2 in parallel; o4 on whichever builder is free. Each order is capped
at 90 minutes of building; a builder that drifts hands back as it stands.

## Orders

```yaml
goal: "From an approved plan, open one Claude window per order in a tmux session of its own, in its own worktree, and refuse any dispatch before approval or before its dependencies are done."
roles:
  orchestrator:
    model: opus
    effort: high
    duty:
      - "Writes the plan and gets it approved by 大博士贴"
      - "Dispatches each order and merges it onto the mission branch"
      - "Opens the MR after the go, then tears down"
    skills: [messaging-the-human, queue-handoff]
  builder:
    model: opus
    effort: high
    duty:
      - "Runs the typing check from a hook, with evidence"
      - "Builds the dispatch, the role windows and the dialog in the mod"
      - "Fixes review findings, once per review"
    skills: [plugin-authoring]
  reviewer:
    model: sonnet
    effort: high
    duty:
      - "Reviews each order for behaviour as it lands"
      - "Runs the slim pass and the final review across the orders"
    skills: []
orders:
  - id: o1
    kind: code
    goal: "Prove that a hook can type a prompt into an interactive Claude in a window of a separate tmux session, then build troupe_dispatch and troupe_status with the two hard rules, fixed argv, the approval record and the mission's wiring in register.tsx."
    why: "ROADMAP Phase 2's build half rests on typed briefs, never tested against an interactive Claude (p2 RECORD, 'Left for p3'). Reuses p2's method for checks (docs/FEASIBILITY.md, docs/feasibility/ evidence, a probe or the mod under claude --plugin-dir in a scratch tmux server); tmux() and the session's socket from hooks/panel.ts; missionBranchOf and gitFacts from hooks/mission.ts for the mission branch and done orders; readPlan and the plan checks from hooks/plan.ts; skills/troupe-mission/references/builder.md as the brief's body. Nothing in the mod registers a tool or opens a worktree yet, so dispatch.ts and approval.ts are new."
    touches:
      - docs/FEASIBILITY.md
      - docs/feasibility/
      - hooks/register.tsx
      - hooks/dispatch.ts
      - hooks/approval.ts
      - types/index.d.ts
      - tests/dispatch.test.ts
    depends_on: []
    model: opus
    risks: "Writing a mod that runs commands may draw the classifier's [Create RCE Surface]: every argv is a fixed shape, the order id is checked against the plan before it is used in a path, a branch or a window name, and no caller text becomes a command or flag (the brief is typed with send-keys -l or pasted from a buffer, never run). A multi-line brief typed raw may submit early or be cut: the check finds the form that lands (a literal paste, or a short prompt naming a brief file). A permission prompt or a non-empty input box in the role window may eat the keys: record what happens rather than work around it. A role session opened on OpenRig's tmux server could confuse the daemon: checks run on a scratch server only. Dispatch against this checkout would collide with the mission's own order/p3/* branches and worktrees: scratch repositories only. register.tsx is the hub: the p1/p2 tests for /troupe, the split and the pane must still pass."
    proof: "The check's commands, exit codes, captures and verdict in docs/FEASIBILITY.md and docs/feasibility/p3-*, with claude --version; the verdict row to the orchestrator before the build; ./check.sh exits 0 with tsc; claude plugin test covers refused before approval, refused on unmet depends_on, allowed after, refused after a plan edit, and the exact argv of each tmux and git call; one dispatch in a scratch repository on a scratch tmux server opens the session and window and the brief lands (a capture-pane)."

  - id: o2
    kind: code
    goal: "Role windows end to end: the reviewer dispatched the same way, results back as files the panel and pane read, the two state leftovers fixed, troupe_close for one window or the whole session, gone windows reopened, and a scripted two-order dry run."
    why: "The rest of the ROADMAP Phase 2 build. Reuses o1's dispatch.ts (the argv builders, the rules, the state) for the reviewer and for close; stateOf and stepOf in hooks/mission.ts and hooks/plan.ts, which already read REVIEW files and git, for done markers and the two leftovers (p2 RECORD: a fix round shows as 'reviewed'; stepOf never returns 'Final review'); the panel's existing poll, so no new watcher; docs/missions/workflow/sample/ as the dry run's mission; skills/troupe-mission/references/reviewer.md as the reviewer's brief. The mod knows each order's worktree from $.state, so it can read markers and reports where the role window wrote them if a write into the session checkout is refused."
    touches:
      - hooks/dispatch.ts
      - hooks/mission.ts
      - hooks/plan.ts
      - hooks/read-state.ts
      - types/index.d.ts
      - tests/dispatch.test.ts
      - tests/read-state.test.ts
      - tests/mock-p1.ts
      - tests/mock.test.ts
      - tests/panel.node.mjs
      - check.sh
      - docs/missions/p3/dry-run/
    depends_on: [o1]
    model: opus
    risks: "mission.ts and plan.ts are read by the pane and by bin/troupe-panel alike: a state change must not move the p1/p2 goldens except where the leftovers say, and the workflow walkthrough check (docs/missions/workflow/check-sample.mjs) must still hold. Killing the role session must kill only the session the mod opened, by the name and id it kept. A window that has gone must not show as running. The dry run opens real Claude windows: short prompts, the seat's own login, closed at the end, a scratch server and repository only."
    proof: "./check.sh exits 0 with tsc; claude plugin test covers the reviewer's dispatch, a done marker and REVIEW-<id>.md read as done/reviewed, a fix round as reviewed, the step reaching Final review, troupe_close for one and for all, a gone window and a gone session reopened; the dry-run script and its output under docs/missions/p3/dry-run/: o1 dispatched (session and window open, brief captured), o2 refused, o1 marked done, o2 allowed; tmux ls after it shows the scratch server gone."

  - id: o3
    kind: code
    goal: "The Approve / Change dialog on /troupe: Approve writes the approval record, Change hands Tianqi's words to the conversation, an edited plan asks again, verified offline and then live by Tianqi."
    why: "ROADMAP Phase 2: approval is $.ui.ask in the orchestrator's window, and the dispatch rule needs a record to read. Reuses o1's approval record (path, hash, read and write) and gate hook in hooks/approval.ts; the plan problems from hooks/plan.ts (a plan with problems is not asked about); the 2 s poll that already redraws the panel on a plan edit; Phase 0's Q4 reading of $.ui.ask (the label, or the text typed under Other), re-checked against the 2.1.306 types."
    touches:
      - hooks/approval.ts
      - tests/approval.test.ts
    depends_on: [o1]
    model: opus
    risks: "$.ui.ask was never run live and the API moves between releases: read the types laid by 2.1.306 first. A dialog raised from a timer, or twice at once, would nag: it comes only from /troupe, once per call. The record must not survive a plan edit, a whitespace edit included. The live check needs Tianqi at the keyboard and a loaded mod in dev.b2's tile; it runs on the sample mission, makes no dispatch, and ends with /troupe close if the panel opened."
    proof: "./check.sh exits 0 with tsc; claude plugin test covers Approve writing the record, Change returning the text to the conversation, the dialog asked again after Change, no dialog for an approved plan or one with problems, and an edited plan invalidating the record; the 'dialog ready for the live check' row with the tile and exact steps; Tianqi's result through 大博士贴."

  - id: o4
    kind: code
    goal: "The docs for what p3 shipped: README, the Phase 2 outcome in ROADMAP with light mode moved to Phase 3, the mission record, and the plugin's version and description."
    why: "The brief asks for README, ROADMAP and RECORD, and o2 and o3 would otherwise both edit README. Reuses the existing README sections and p2's RECORD.md as the shape; the facts come from FEASIBILITY.md, the dry run, the order reviews and the live check."
    touches:
      - README.md
      - ROADMAP.md
      - docs/missions/p3/RECORD.md
      - .claude-plugin/plugin.json
    depends_on: [o2, o3]
    model: sonnet
    risks: "Docs that promise what the code does not do: every command, tool and limit named is checked against the merged code. The live check may not have happened yet: then RECORD.md says 'live check pending' and the orchestrator fills the result in at the final fix."
    proof: "./check.sh exits 0; each documented command and tool exists in hooks/ (grep); RECORD.md names claude --version, the o1 verdict, the dry run, the live check and what is left to the human."
```

## Review

Each order is reviewed by rev.r1 as it lands (`REVIEW-<id>.md`). After the
last merge rev.r1 runs the slim pass against da96337, one round of cuts goes
to a builder, and rev.r1 does the final review of the whole
`feature/NO-JIRA-p3` diff against `main`: every done-when criterion it can
drive in its own scratch tmux server, the dispatch end to end with the
approval record written by the dialog's code path. Each review gets one fix
round and one re-review; then the orchestrator rules.
