# troupe — roadmap (draft, 2026-10-20)

troupe is a Claude Code mod (a plugin with a hooks module) that
runs the core of the tianqi-rig-kit mission workflow inside one Claude Code
session: Agent-tool subagents are the roles, and a read-only pane docked on
the right shows the plan and its progress. It does not talk to OpenRig.

Status: Phase 0 done (2026-10-20, mission p0; see `docs/FEASIBILITY.md`).
Repo: GitLab `AI/troupe`, developed on the Prover account like the other
projects; open source is a later call. Decisions of 2026-10-20 are the base
(record: `~/.claude/projects/-home-tizh/memory/mission-pane-mod-plan.md`).
Maintenance is deliberately lightweight: README, `check.sh`, plugin tests and
the docs a phase produces; no feature map, harness, CI or ADRs unless a
phase needs them.

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
itself.

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

### Phase 2 — Two hard rules and the approval dialog (about half a day)

Delivers:
- `hooks/enforce-rules.ts`: `on('tool.call', { tool: 'Agent' })` with the
  guard pattern. Deny when the plan is not approved; deny when the order's
  `depends_on` is not done. Orders are identified by the "oN:" description
  prefix; an Agent call without a prefix is not an order and passes.
- Approval: when plan.md is ready (lint passes) the mod asks with `$.ui.ask`:
  Approve / Change. Change takes free text (e.g. "o2 on opus", "add the
  verify skill to the reviewer"), hands it to the orchestrator as context,
  the orchestrator edits plan.md, the pane redraws, the dialog comes back.
  Approval is written to a file in the mission dir so it survives a reload.
- Light mode: a plan with 1–2 orders skips the slim pass and runs serially.

Done when: the tests prove dispatch before approval is refused with a reason
the model can read, o2 before o1 is refused, o2 after o1 is allowed, and one
Change round trip edits the plan and re-asks.

Measured by: `claude plugin test`; a scripted two-order dry run in the troupe
repo itself (no paid model calls beyond a short session).

### Phase 3 — The workflow skill and one real mission (about one day)

Delivers:
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

### Phase 4 — Open-source release (about half a day; only if Tianqi decides to open-source)

Delivers: `.claude-plugin/marketplace.json`, README with the install line and
a 60-second screenshot or gif, license, secret scan, a "how to tell it is
working" section (the test suite and metrics.json).

Done when: a colleague installs from GitHub and runs the sample mission
without help.

Measured by: install to first pane under five minutes for someone new; the
issues they file.

## Estimate

Phases 0–2 fit the "half a day to see the pane" expectation only if Phase 0 is
clean. Mission p0 (Phase 0) was launched 2026-10-20 as a light rig. Phases 0–3 together are about two days; Phase 4 is an extra half day.
Missions run on the kit rig `tianqi-troupe`; implementation goes to Opus and
Sonnet builders. Branches and MRs on GitLab like the other projects; only
Tianqi merges.

## Stays out (decided 2026-10-20)

Tianqi's personal skills (tianqi-taste, tianqi-ui-ux, tianqi-project-
maintenance, tianqi-skill-design), the chief-of-staff seat, Slack, OpenRig
seat configuration. Reference only, not a dependency: iha2/superlite.
