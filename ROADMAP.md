# troupe — roadmap (revised 2026-10-24)

troupe lets anyone call up an agent troupe with one command, without
configuring a software-factory harness such as OpenRig. The orchestrator
writes a plan with the person; once they approve it, every role opens in a
real tmux window of its own, in its own git worktree, where the person can
watch it and talk to it directly. A panel beside the orchestrator stays open
and shows the work as it moves. The orchestrator and the roles can run any
agent harness that lives in a terminal: Claude Code and Codex first.

Status: Phases 0–3 built the first form, a Claude Code mod (v0.5.0; outcomes
below, kept as history). On 2026-10-24 a mid-term review set the direction
below; it is the standard from now on, and the README's description of the
mod holds only until Phase 5 replaces it.
Repo: GitHub `tianqizhao0704/troupe` (private; migrated from GitLab
`AI/troupe`). Open source is still a later call (Phase 7).
Maintenance is deliberately lightweight: README, `check.sh`, tests and the
docs a phase produces; no feature map, harness, CI or ADRs unless a phase
needs them.

## Direction (2026-10-24)

**What the product is.** Plan first, then roles: the orchestrator and the
person agree on `plan.md`, the person approves it, and only then do role
windows open. The persistent, interactive panel is part of the product, not
an extra. What troupe is not: a port of one person's workflow. The mission
workflow Phases 0–3 built (light/full mode, slim, final review, MR gates,
metrics) is one opinionated recipe that ships as the default skill, and a
user who wants another workflow changes the skill, not the code.

**The rule that draws the line.** Code enforces only what keeps the work
correct; the method lives in the skill, as text, and can be swapped.

Enforced in code (the core):
- No role window before the plan is approved.
- One role, one git worktree and one branch; the plan's `touches` keep two
  roles off the same files.
- Never type into a window that waits on a prompt; touch only the tmux
  session and windows troupe opened.
- The persistent panel.

Moves out of code into the skill (or becomes optional):
- The fixed roles `builder` / `reviewer`: roles are named freely in the plan,
  each with the agent command it runs.
- The model allow-list (`opus`, `sonnet`, `haiku`, `fable`): replaced by that
  per-role command, which carries its own model and permission flags.
- Light/full mode and its forced serial dispatch.
- "Done means one `<id>: …` commit on the mission branch": a dependency is
  done when its result file says so; how and when to merge is the recipe's.
- Slim, final review, the MR and merged gates.
- `troupe_metrics` (reads Claude transcripts only): an optional reader, one
  per harness, later.
- Required `why` and `kind` in the plan: optional; only `touches` is required.

Deleted (the first three in the 2026-10-24 cleanup, v0.6.0):
- The in-session pane (`$.ui.open`): roles need tmux anyway, so the tmux
  panel is the only view.
- OpenRig seat support: the `/proc` lookup of an ancestor's tmux pane, the
  seat warnings.
- `.troupe-state.json` (the session's skills and subagents) and with it the
  panel's skill ✓ / ✗ and subagent-based order states: roles are windows,
  not subagents.
- The Claude Code mod itself (see Architecture), in Phase 5.
- Reading the orchestrator's permission mode from its Claude transcript, with
  the mod: until then it keeps role windows off a project's own mode.

**Architecture.** No mod, because the orchestrator must be able to run in
Codex, where a Claude Code mod never loads.

```
troupe            CLI: check / dispatch / status / send / wait / close
                  the hard rules live here; a refusal exits non-zero with
                  the reason on stderr, which any harness's model reads
troupe-panel      the persistent TUI in a tmux split: progress, a light per
                  role (working / waits on you / done), approval (A / C),
                  click a role for its detail, open it in a popup
skills/           the orchestrator's instructions (the default workflow),
                  shared by Claude Code and Codex
agents            one adapter per harness: start command with a first
                  prompt, how to paste, the "waits on you" pattern
```

| The mod did | Without the mod |
|---|---|
| `/troupe` command | a skill (`/troupe` in Claude Code; Codex reads the same instructions) |
| `troupe_dispatch` etc. as tools that refuse | `troupe dispatch …`; refusal is a non-zero exit with a reason |
| Approve / Change dialog (`$.ui.ask`) | keys in the panel; the plan hash record stays |
| Copy result files on a 2 s poll | the panel's own poll |
| Close the panel at session end | the panel's existing `--owner PID` |

A CLI refusal is as strong as a mod tool's, and as weak: a model can go
round either with plain git and tmux. Moving loses nothing. Dropping the mod
also drops the "Turn on the mods" question at first use.

Reuse: `src/` (`plan.ts`, `mission.ts`, `yaml.ts`, `graph.ts`, `view.ts`,
`lines.ts`, `ansi.ts`) and `bin/troupe-panel` import nothing from the engine;
the cleanup moved them out of `hooks/`. In `hooks/`, `dispatch.ts` uses
`$.fs`, `$.process`, `$.clock` and `$.env` (mechanical swaps to Node) and
`$.tool.register` (replaced by the CLI); `approval.ts` keeps its hash logic
and loses `$.ui.ask`; `register.tsx`, `panel.ts` and `read-state.ts` go.

**The panel.** It stays open beside the orchestrator and is the person's
main view. Planned: a light per role read from `tmux capture-pane` with the
agent's "waits on you" pattern (the signal that matters most: which window
needs the person); click a role (SGR mouse is already on for the wheel) for
its detail: the last lines of its window live, its state, branch,
`git diff --stat`, its result files; open the role in a `tmux display-popup`
attached to its window, so the person talks to it and closes the popup with
the orchestrator and the panel still in place (`switch-client` and back is
the simpler fallback).

**Systems.** tmux is required: macOS, Linux, WSL2. macOS is a first-class
target and is checked in Phase 5. Native Windows is not planned (issue #1,
closed).

**Risk.** Everything dispatch learned (paste a long prompt, wait for ready,
a permission prompt eats keys, the trust dialog) was learned on Claude
Code's TUI. Codex has to be checked the same way before the refactor.

## Phases from here

### Phase 4 — Codex probe (about half a day)

In a scratch tmux server: start `codex "<prompt>"` and `claude "<prompt>"` in
a fresh, untrusted worktree; does the launch prompt survive the trust
prompt? Record Codex's screens when ready, working and waiting on an
approval, and whether bracketed paste reaches it. Evidence in
`docs/FEASIBILITY.md`.

Done when: each question has a yes/no with the screen seen, and the adapter
fields (start command, paste, "waits on you" pattern) are known for both
harnesses, or Codex is found unfit and Tianqi picks what to do.

### Phase 5 — CLI and panel without the mod

Delivers: the `troupe` CLI with the hard rules; roles named in the plan with
a per-role agent command; agent adapters for Claude Code and Codex; the
brief as a launch argument, paste kept for `troupe send`, and `troupe wait`
for results (issue #2); approval in the panel; the default workflow moved
into the skill as text; the deletions above; README rewritten for the new
form; checked on macOS and Linux.

Done when: a two-order dry run in a scratch tmux server, once with a Claude
Code orchestrator and once with a Codex one, with at least one Codex role:
the plan is approved in the panel, dispatch before approval is refused, each
role starts on its brief in its own worktree, and the orchestrator learns of
each result through `troupe wait`.

### Phase 6 — The interactive panel

Delivers: the per-role light, click for detail, the popup into a role
window.

Done when: in a live mission the person sees which role waits on them,
opens it from the panel, answers, and returns without leaving the
orchestrator's window.

### Phase 7 — Open-source release (only if Tianqi decides to open-source)

Delivers: install for Claude Code (a plugin with the skill and `bin/`, no
hooks module) and for Codex; license; secret scan; README with a short gif.
Before the repo goes public, clean what names Prover's internals: the
migrated issues, `docs/missions/`, `docs/feasibility/` and the history in
this file (GitLab URLs, internal repositories, OpenRig seats, local memory
paths).

Done when: someone new installs and runs the sample mission without help, in
under five minutes to the first panel.

### After the refactor: evidence

The acceptance run and the three-arm comparison (`docs/missions/p4/compare.md`)
were deferred in Phase 3 and closed with issue #3: they would have measured
the mod. If troupe needs evidence for its README, they come back as a new
issue, run on the new form and on a task that can be named in public.

## Stays out

Tianqi's personal skills (tianqi-taste, tianqi-ui-ux, tianqi-project-
maintenance, tianqi-skill-design), the chief-of-staff seat, Slack, OpenRig
(neither configured nor supported), terminal backends other than tmux.
Reference only, not a dependency: iha2/superlite.

---

# History: the mod (Phases 0–3, 2026-10-20 to 2026-10-22)

What follows is the record of the first form, kept as it was written, except
where marked. Its product sentence was: troupe is a Claude Code mod that
runs the core of the tianqi-rig-kit mission workflow from one Claude Code
session. Decisions of 2026-10-20 were its base (record:
`~/.claude/projects/-home-tizh/memory/mission-pane-mod-plan.md`).

## Phase 0 outcome (2026-10-20, Claude Code 2.1.304)

- Q1 yes: the engine asked "Turn on the mods…", Tianqi turned them on, the
  mod loaded. The pane was not placed at 76 columns: unasked it needs 144,
  110 once the person opened it with `/troupe`.
- Q3 yes, live and tested: an Agent call can be refused with a reason the
  model reads; without the `.catch` guard a throwing hook fails open.
- Q4 yes from the types, not run live: `$.ui.ask` returns the chosen label or
  the text typed under Other; a re-ask is a new call. There is no file
  watcher: plan.md is polled with `$.fs.stat` on `$.clock.every`.
- Q5 partly: skills come from `$.session.usage`; spellings differ
  (`shared:x` shows as `x`); `agent.spawn` takes no `skills`; a missing skill
  on an agent definition is dropped silently at spawn.
- Q6 yes: worktrees are cut from the session HEAD, the engine merges nothing;
  the model merges and cleans up.
- Finding: the auto-mode classifier refuses any seat typing into a tile, its
  own or a peer's; only a person can drive the dialog.
- Leftovers: the probe tool hook lacks `.catch`; the clock timer may stack on
  reload. Fix in Phase 1.

Changes to the phases below, from that outcome: Phase 1 polls plan.md and
checks skill names in both spellings; its done-when is "pane from 144
columns unasked, 110 once opened with /troupe". Phase 2 first verifies live,
with a person at the keyboard: the Approve/Change round trip, a person-opened
pane, a 144-column screenshot, the agent rows drawing, the Change input.
Phase 3's orchestrator runs from the mission checkout and merges each order
itself. Phase 2 was re-planned the same day (windows and dispatch, tmux
first) after Tianqi set the product shape.

## Phase 2 outcome (2026-10-21, Claude Code 2.1.306)

Missions p2 (the split-right panel) and p3 (dispatch). Evidence:
`docs/FEASIBILITY.md` ("Phase 2" and "Phase 2 part 2"),
`docs/missions/p2/RECORD.md`, `docs/missions/p3/RECORD.md`.

- Typing into another tmux pane works from a hook, and an interactive
  `claude` in a window of a separate tmux session acts on it. One finding
  changed the design: a long prompt typed as raw keys into a claude that has
  just started stays unsent, so the brief is pasted (bracketed paste) as a
  one-line prompt naming a brief file. A permission prompt showing in a role
  window eats the keys and the Enter approves it, so dispatch types only into
  a window it has just opened.
- Built: `troupe_dispatch` (refused before approval, and while a `depends_on`
  order is not merged onto the mission branch; also a reviewer role),
  `troupe_status`, `troupe_close` (one window or the whole session); role
  windows in a tmux session of their own, `troupe-<mission>`; results back
  as `DONE-<id>.md` and `REVIEW-<id>.md`, copied into the mission folder;
  the Approve / Change dialog on `/troupe`, with `APPROVAL.json` (the plan's
  hash). A gone window or session is opened again on the next dispatch.
- The Q4 reading held, driven in a reviewer's scratch session: `$.ui.ask`
  returns the label or the typed text. The dialog fails closed on a blank
  answer or a dismissed dialog. That the engine's auto-resolve of an
  unattended dialog cannot approve rests on a reading of the 2.1.306 build,
  not on a run.
- Checked by: 73 plugin tests and 6 panel tests in `./check.sh`, a scripted
  dry run in a scratch tmux server (15 of 15 checks,
  `docs/missions/p3/dry-run/`), the order reviews and the final review, which
  drove the done-when end to end. Dispatch was run only in scratch
  repositories on scratch tmux servers, never against this checkout.
- Seen live: Tianqi approved and changed a plan in the dialog himself
  (Change's words came back as a prompt, Approve wrote the record;
  `docs/missions/p3/RECORD.md`).
- Left: prompts and dialogs inside role windows stay the person's;
  `APPROVAL.json` is advisory.
- Light mode (1-2 orders, serial, no slim) was not built. Tianqi's decision
  for p3 ("Light mode 先不做"): it moves to Phase 3 with the skill.

## Phase 3 outcome (2026-10-22, Claude Code 2.1.308)

Mission p4. Evidence: `docs/missions/p4/RECORD.md`, the order reviews beside
it, `docs/missions/p4/compare.md`.

- Built: light mode in the mod (one or two orders run one after the other,
  by dependency layer and then plan order, whatever `depends_on` says; no
  slim and no separate final review; the review of the order that runs last
  is also the final review, and its brief gives the base commit; the pane and
  the panel leave out Slim, Cut and Final review); the `troupe-mission` skill
  and the `templates/`, rewritten for role windows, the approval dialog and
  metrics, usable by anyone and not only by Tianqi's rig; `troupe_metrics`,
  which writes `docs/missions/<mission>/metrics.json` at teardown (tokens and
  cost at list prices per role, review and fix rounds, refused dispatches,
  wall times, `diff_size`; what troupe cannot know is `null` with a reason);
  role windows pinned to the role's model and effort and to the
  orchestrator's own permission mode.
- Checked by: `./check.sh` exit 0 on the integrated branch with 88 plugin
  tests, 7 panel tests, the walkthrough check and `tsc: clean` (engine types
  laid); every order reviewed by rev.r1. o2 and o3 each failed the first
  review on one Act-on finding and passed the re-review after one fix round.
  Found and fixed: the skill said effort was shown and not passed, while
  dispatch pins it (o2); `diff_size` counted the mission's own record files
  (o3). A follow-up to o1, found when the acceptance run was set up (role
  windows opened in a project's `acceptEdits` while the orchestrator ran in
  `auto`), passed its review.
- Decisions: Tianqi approved the plan on 2026-10-22 at 12:23Z and kept the
  full-mode cross-order final review (light mode has none). The comparison
  protocol `docs/missions/p4/compare.md` was added at 12:32Z (one task, three
  arms; troupe's `metrics.json` carries its fields).
- Not done: the done-when item "One real mission through troupe" was not run.
  Tianqi deferred it at 14:11Z, after the run's set-up. (Closed on
  2026-10-24 with the new direction; see "After the refactor: evidence".)
  GitHub issue #3 (from GitLab AI/troupe#3) holds the task, the recipe to
  attach and `compare.md`. Light
  mode and the serial rule have been run only against a fake git and tmux in
  tests; `troupe_metrics` was also read against real transcripts in the
  reviews. None has run in a mission of its own.
- Left: see `RECORD.md`, "Considers left open" and "Left for later".

## What was checked while drafting this (2026-10-20)

- Claude Code is 2.1.304. The mod engine ships in it and its own skill
  (`plugin-authoring`) documents the API: `register(on, options)`, hooks
  `($, e, next)`, `on('tool.call', { tool: 'Agent' })` can `{ deny }`,
  `$.ui.open` / `ui.render` for a pane, `$.ui.ask` for a dialog, `$.agent.list`
  and `$.agent.spawn`, a `$.skill` noun and `ContextSkills` for the skills
  the session can load. The spike's shape (`import { atom, read, update }
  from 'claude-code'`) is still the shape. The reference says the API "is
  early access and moves between releases", so types are the authority.
- Enabling: mods written in a session need the person to answer "Turn on the
  mods Claude writes in this session?" once; `claude --plugin-dir <folder>`
  loads a mod for one session without that question; `claude -p` never loads
  hooks modules. Sharing, if it ever happens, is a repo with
  `.claude-plugin/marketplace.json` and `/plugin install troupe --marketplace
  <owner>/<repo>`.
- Pane placement: docked beside the transcript in fullscreen from 110 columns
  once the person asked for that pane id (144 unasked); below that it waits
  undrawn and `$.ui.open` says why.
- Name: `troupe` on npm is a 2022 empty placeholder (0.0.1). npm does not
  matter for a marketplace install; the GitHub repo name does. `claude-troupe`
  is free on npm if a fallback is ever wanted.
- Reusable: spike `~/.claude/dev-mods/7b60ff2d-.../trellis-plan/hooks/register.tsx`
  (974 lines: pane drawing, dependency layering, the Agent tool.call hook);
  kit `templates/plan.md` (the YAML `orders` block: id, kind, goal, why,
  touches, depends_on, model, risks, proof), `templates/REVIEW.md`,
  `templates/SLIM.md`, `scripts/plan_lint.py` (overlap ⇒ depends_on, cycles,
  fail-closed on empty touches), `scripts/check-agents.mjs` (the idea of
  resolving skills for real; its OpenRig resolver is not reusable).

## Uncertain, check first (Phase 0)

1. **Does the engine load a mod on this build?** A hello pane via
   `claude --plugin-dir ~/repos/projects/troupe` in a fresh terminal. The
   2026-10-02 failure was "hooks modules are turned off in this process: the
   rollout switch served off".
2. ~~Does it load for someone else?~~ Dropped by Tianqi on 2026-10-20: the
   outside-account install test is not run in Phase 0. Open source stays a
   later call; nothing else in the roadmap depends on it.
3. **Can the Agent call be intercepted and refused reliably?** `tool.call`
   with the `.catch` guard pattern from the reference (a thrown hook must
   still refuse). Also: does `e.input.description` carry the "o1: …" prefix
   the orchestrator writes, and does `e.input.model` carry opus/sonnet.
4. **Does `$.ui.ask` support a free-text branch** (Approve / Change with a
   typed change), and can the dialog come back after the plan file changes?
5. **Can the mod list the skills a subagent will actually get** (`$.skill`,
   `ContextSkills`, `agent.spawn`'s `skills` preload) so the pane can flag a
   skill that is not found?
6. Parallel orders in worktrees from one session: does the Agent tool's
   `isolation: "worktree"` give each order its own checkout, and does the
   orchestrator merge them back cleanly?

## Phases

### Phase 0 — Feasibility (about half a day)

Delivers: a hello pane mod in the repo and `docs/FEASIBILITY.md` answering
questions 1 and 3–6 above with the exact output seen (engine line, dialog
text, API gaps), plus a recommendation for Phase 1.

Done when: every question has a yes/no with evidence, and Tianqi has picked
one of: go on as planned / go on with changes / stop.

Measured by: `claude plugin validate` clean on the hello mod; a capture of
the pane docked in a session on this machine; `check.sh` green.

### Phase 1 — The pane reads plan.md (about half a day; "see the pane")

Delivers:
- `hooks/read-state.ts`: parse the YAML `orders` block out of
  `docs/missions/<mission>/plan.md` (same regex and rules as plan_lint:
  overlapping touches must be joined by depends_on; cycles and unknown ids
  flagged); infer order state from the mission dir (REVIEW-o1.md etc.) and
  from `$.agent.list()` descriptions prefixed with the order id.
- `hooks/draw-pane.tsx`: reuse the spike's layering and drawing. Shows roles
  with their resolved skills (missing ones flagged), orders in dependency
  layers with model and state, the human gates (plan / MR / merged).
- No `show_plan`, `report_order`, `report_checkpoint` tools. The pane
  watches the file.

Done when: in a repo with a sample plan.md, the pane appears from 144
columns unasked and from 110 once opened with `/troupe`, redraws within the
poll interval of a plan edit, and flags a skill that does not exist.

Measured by: `claude plugin test` fixtures (a valid plan, an overlapping plan
without depends_on, bad YAML, a missing skill); each hooks file under 300
lines; one screenshot.

### Phase 2 — Windows and dispatch (tmux first; decided 2026-10-20)

Checks first, half a day, each with evidence in `docs/FEASIBILITY.md`:
1. Can a hook send keys to another tmux pane? `$.process.run(["tmux",
   "send-keys", …])` from the mod, where a Bash call from the model is
   refused by the auto-mode classifier ("Tmux Self Drive", Phase 0 finding).
2. Can the mod find its own tmux pane (`$TMUX`, `tmux display -p`) and
   split right, and does the split show as a tile under herdr?
3. A standalone panel process (same parser as read-state) drawing the plan
   in that split, never scrolling, at any width.

Then the build:
- `troupe_dispatch(order)`: a tool the mod registers for the orchestrator.
  It is the home of the two hard rules: refuse before the plan is approved,
  refuse while `depends_on` is not done. On success it creates the order's
  worktree, opens a tmux window there with a Claude instance (no mod needed
  in role windows, so no "Turn on the mods" question; `--permission-mode`
  as the user set it), and types the order brief into it.
- Results come back as files in `docs/missions/<mission>/` (done markers,
  REVIEW-<id>.md); the panel polls them, as it already polls plan.md.
- Approval is `$.ui.ask` in the orchestrator window: Approve / Change, Change
  taking free text; the orchestrator edits plan.md, the panel redraws, the
  dialog comes back. Verified live with a person at the keyboard first.
- Light mode: 1–2 orders, serial, no slim. Moved to Phase 3 with the
  skill (decided for p3, 2026-10-21); not part of Phase 2.

Done when: `/troupe` with a two-order mission opens the panel on the right,
the dialog approves the plan, two role windows open in their worktrees and
take their briefs, a dispatch before approval and a dispatch with an unmet
dependency are refused with a reason the model reads, and the panel shows the
orders moving to done.

Measured by: the three checks with their evidence; `claude plugin test` for
the dispatch rules; one scripted two-order dry run; what is left to the
human (prompts in role windows) listed in the record.

Trade-off accepted: no queue or daemon, so no recovery after a reboot, one
machine only, and the human watches the role windows for prompts.

### Phase 3 — The workflow skill and one real mission (about one day)

Delivers:
- Light mode, moved here from Phase 2: one or two orders, serial, no slim and
  no final review, as the kit's `tianqi-mission-light` does.
- `skills/troupe-mission/SKILL.md` plus de-personalized `plan.md`,
  `REVIEW.md`, `SLIM.md` templates: brief → plan (split by coupling, declared
  touches, per-order model) → approval → dispatch by dependency layer
  (worktrees for parallel orders) → review each order as it lands → slim →
  cross-order final review → at most two fix rounds then the human → MR gate
  → merged gate → teardown. A project's own `verify-<app>` skill is used if
  present, otherwise skipped.
- The orchestrator writes `docs/missions/<mission>/metrics.json` at teardown:
  orders, models, review rounds, refused dispatches, wall time, cost.

Done when: one real small mission (two orders, a real repo, a real issue) runs
from brief to a local MR-ready branch with the pane showing it, and Tianqi
approves the plan in the dialog, not in chat.

Measured by: metrics.json of that run against the rig-kit baseline for the
same size (nav 1h23m, formalize-ui 1h25m, both light); the number of hook
refusals during the run (expected 0 in a well-behaved run); the cost,
estimated before the run and asked for above 5 USD.

### Phase 4 — Open-source release

Superseded on 2026-10-24 by Phase 7 above.

## Estimate

Phases 0–2 fit the "half a day to see the pane" expectation only if Phase 0 is
clean. Mission p0 (Phase 0) was launched 2026-10-20 as a light rig. Phases 0–3 together are about two days; Phase 4 is an extra half day.
Missions run on the kit rig `tianqi-troupe`; implementation goes to Opus and
Sonnet builders. Branches and MRs on GitLab like the other projects; only
Tianqi merges.

## Stays out (decided 2026-10-20)

Superseded on 2026-10-24 by "Stays out" above.
