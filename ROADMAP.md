# troupe — roadmap (revised 2026-10-24)

troupe lets anyone call up an agent troupe with one command, without
configuring a software-factory harness such as OpenRig. The orchestrator
writes a plan with the person; once they approve it, every role opens in a
real tmux window of its own, in its own git worktree, where the person can
watch it and talk to it directly. A panel beside the orchestrator stays open
and shows the work as it moves. The orchestrator and the roles run Claude
Code or Codex, or any terminal agent with an adapter.

Status: Phase 5 is built (2026-10-24): the `troupe` CLI, the live panel and
the rewritten workflow skill replace the Claude Code mod that Phases 0–3
built (kept below as history). Next: the end-to-end run (Phase 6).
Repo: GitHub `tianqizhao0704/troupe` (private). Open source is a later call
(Phase 7). Maintenance stays light: README, `check.sh`, tests, CI and the
docs a phase produces.

## Direction (2026-10-24)

**What the product is.** Plan first, then roles: the orchestrator and the
person agree on `plan.md`, the person approves it in the panel, and only
then do role windows open. The persistent, interactive panel is part of the
product. What troupe is not: a port of one person's workflow. The default
workflow is one recipe in a skill; a user who wants another changes the
skill (its text and its `stages.yaml`), not the code.

**The rule that draws the line.** Code enforces only what keeps the work
correct; the method lives in the skill, as text, and can be swapped.

Enforced in code:
- No role window before the plan, hashed as it is now with the role texts it
  references, is approved; approval lives in the run log.
- One role, one git worktree, one branch, one pane; overlapping `touches`
  need `depends_on`.
- Each role's `flags` pin its agent's permission; it is never inherited.
- Never type into a window that is not ready; touch only the panes troupe
  opened.
- The persistent panel.

In the default skill (`troupe-mission`), replaceable: brief → plan → plan
gate → build → review per branch as it lands, one fix round sent to the same
window → merge onto the mission branch → MR gate. A stricter recipe
(`troupe-mission-strict`: slim, cross-role final review, two-round cap) may
come later as a separate optional workflow.

**Architecture.**

```
troupe            CLI: setup / up / panel / check / approve / gate / stage /
                  dispatch / status / send / wait / close; a refusal exits 1
                  with the reason, which any harness's model reads
troupe panel      the persistent TUI in window 0 beside the orchestrator
skills/           the workflow: SKILL.md, stages.yaml, roles/, templates/
agents            one adapter per harness: start command with a first prompt,
                  model and effort flags, permission flags, screen patterns
```

State: `plan.md` (tracked, hashed); `<git-common-dir>/troupe/<m>/log.jsonl`
(written only by the CLI and the panel); live reads from tmux, git and each
role's `.troupe/result.md`. The design and its decisions are in the design
proposal kept in the git folder (`.git/troupe/design/proposal.md`, section
"Decided").

**Systems.** tmux on macOS, Linux and WSL2; macOS and Linux run in CI. Native
Windows is not planned (issue #1, closed).

## Phase 4 outcome (2026-10-24): the Codex probe

Both harnesses keep the launch-argument prompt through the trust dialog;
bracketed paste works in both; under an approval dialog a paste is dropped
and Enter approves, so troupe never types into a waiting window. Once a
repository is trusted, neither asks again in its worktrees, sibling or
nested, so role worktrees live in `.troupe/worktrees/` and need no
pre-trust. Context use is on neither default screen. Evidence:
`docs/FEASIBILITY.md`, "Phase 4" and "Phase 5 step 0".

## Phase 5 outcome (2026-10-24): CLI and panel without the mod

Built in eleven steps, one PR each (#6–#14 and the clean-up), Codex writing
the adapters, the commands and the panel's interaction, Claude the format,
the state, the drawing and the skill, Sonnet the mechanical steps:

- The package (`@troupe/cli`, private until Phase 7; Node 20+; CI).
- The plan format: one yaml block with `profiles` and `roles` (a role is a
  window), raw per-agent `flags`, `## Role:` sections; `troupe check`.
- Adapters for Claude Code and Codex, and user adapter files.
- The run log and the live reads.
- The commands, the brief as a launch argument and `troupe wait`
  (issue #2, closed).
- The panel as designed (section 5b), live, with keys and mouse; approval
  in the panel.
- The workflow skill for the CLI; `troupe setup` installs it for both
  harnesses.
- The mod deleted: `hooks/`, `.claude-plugin/`, `bin/troupe-panel` and the
  mod's readers and views.

Not yet shown: a real mission with real agents (Phase 6).

## Phases from here

### Phase 6 — The end-to-end run, then slim

A small real mission on this Mac: one Claude Code orchestrator, one Codex
role and one Claude Code role, from `troupe up` to the MR gate; then the same
with a Codex orchestrator. Fix what it finds.

Then slim the commands' guards. Done: a pane is troupe's when its id and its
`@troupe-owner` marker match the log; `session.json` and the command lock
are gone.

Done when: both runs reach the MR gate with the person only approving,
answering dialogs and talking to roles, and `troupe dispatch` before
approval is refused.

### Phase 7 — Open-source release (only if Tianqi decides to open-source)

Delivers: `@troupe/cli` on npm (register the `troupe` org; else
`troupe-cli`), a single-file binary later for machines without Node;
license; secret scan; README with a short gif. Before the repo goes public,
clean what names Prover's internals: the migrated issues, `docs/missions/`,
`docs/feasibility/` and the history in this file.

Done when: someone new installs and runs a mission without help, in under
five minutes to the first panel.

### After: evidence

The acceptance run and the three-arm comparison (`docs/missions/p4/compare.md`)
closed with issue #3. If troupe needs evidence for its README, they come
back as a new issue, on a task that can be named in public.

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
