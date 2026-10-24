# p6-panel: readable mission panel and complete mission lifecycle

## Intent

Implement the agreed Phase 6 run-2 design: readable PLAN markdown, truthful
per-branch review FLOW, rich ROLES cards with agent badges and effort meters,
and safe teardown, readiness waiting and open-mission selection. Resolve
[issue #16](https://github.com/tianqizhao0704/troupe/issues/16) and
[issue #17](https://github.com/tianqizhao0704/troupe/issues/17).
The authoritative brief is `.git/troupe/p6/brief-run2.md`; its requirements
are reproduced below because role worktrees have a different `.git` layout.

## Done when

- PLAN reflows paragraphs and hanging-indent bullet/number lists to pane
  width without ellipsis truncation; title is bright/bold, section headings
  are rules, role headings include badges, inline code uses accent and bold
  uses bold with markers removed. YAML is tinted (dim keys, plain values,
  chrome comments) and not reflowed. Header shows path, short hash and
  checks clean or N problems. Update the plan template if needed.
- FLOW layers builders only by depends_on. Review-only roles sit to the
  right of the reviewed boxes with one horizontal arrow per reviewed role,
  dim until the reviewed builder is done, then lit. Narrow layouts put
  reviewers below with `reviews panel, commands as each lands` and no chain
  edge; tests also cover the brief's lock/build dependency example.
- ROLES has one box/card per role, two columns when space permits: badge,
  name/state; model/effort; flags; branch, commits and changed files inside
  and outside touches; starts; elapsed since logged dispatch; known context
  meter or em dash; waiting dialog; result; last nonempty pane line.
- Badges everywhere the panel names an agent: Claude `✻` warm coral,
  Codex `⬢` cool cyan, each one terminal cell; adapters may specify
  badge: { glyph, tone }, unknown agents use their first letter. Do not
  copy OpenRig. Five effort pips use ▰/▱: minimal/low 1, medium 2, high 3,
  xhigh 4, max 5; unset is dim default, unknown words remain literal.
  Apply in gate/detail/cards/FLOW, with FLOW effort replacing unknown context.
- Both stages.yaml and DEFAULT_STAGES end in teardown / Teardown.
  `troupe teardown [-m mission] [--force]` closes mission-owned panes,
  removes role worktrees and their mission parent, role/<mission>/* branches,
  and mission briefs/moved results under git-common-dir/troupe/<mission>.
  Keep log.jsonl and mission branch; append/display teardown event. Refuse
  dirty worktrees and branches unmerged into the mission branch per role
  with reasons unless forced. Preserve pane ownership safeguards. Repeating
  teardown reports nothing left; test refused, forced and repeated paths.
- `troupe wait --role <r> --ready [--timeout s]` waits for ready, ends early
  with the dialog on waits or when the pane is gone. send refusals for
  unknown/working name that command. CLI help, README and workflow agree.
- Both #17 lock cases have regression tests: pid-mismatch reclaim removal
  tolerates ENOENT; an abandoned reclaim directory gives actionable manual
  cleanup guidance once no troupe command is running. Preserve mutual exclusion.
- Default findPlan picks newest open mission: existing log with no teardown,
  or no log plus plan.md not committed. Committed historical no-log plans
  never win; explicit -m still opens any mission. With none open the panel
  shows no mission yet and polls until a new plan appears. Cover linked
  worktrees/git-common-dir and polling in tests where relevant.
- `./check.sh` passes on the integrated mission. Update and inspect
  tests/goldens/plan-gate.txt and tests/goldens/build-api.txt; add meaningful
  narrow/wide PLAN, FLOW and cards coverage. The person sees and approves
  the changed screens before MR approval (entry: panel tabs 1, 2, 3 at wide
  and narrow widths, with badges/effort and reviewer lane visible).
- After all branches pass review and merge locally, run the full check and
  open the MR gate, then STOP. Do not push/open an MR in this run. After a
  future authorized MR opening, the updated workflow runs teardown and
  also `troupe teardown -m p6-polish` to retire the previous finished mission.

## Out of scope

Publishing, merging an MR, unrelated refactors, agent permission bypass,
OpenRig runtime badges, and automatic MR opening during this run.

## Decisions for you

1. Who runs the roles? **Recommended: Codex gpt-6.1-sol high for both
   builders and Claude Opus high for review**, with explicit normal editing
   permissions below. Approving takes this recommendation.
2. How to finish this run? **Recommended: stop with MR gate open after local
   review, integration checks and screen acceptance** as requested; no push,
   MR opening or p6-panel teardown until separately authorized. Retiring
   p6-polish is the final cleanup after that future MR opening.

## How the work is split

Panel rendering, its live model, agent appearance and stage labels form one
role. Commands, lifecycle events, mission selection, polling, CLI help and
workflow documentation form the other. They share no owned files and run
at once. src/log.ts belongs only to commands; src/model.ts belongs only to
panel. Contract: commands adds `{ ev: 'teardown' }` as a log event; panel
must handle that event in activity with a guarded event-name check (also
compile against the old union). New view fields are optional or supplied
by panel's own panel-model changes so both branches work independently.
Badge adapter fields stay optional for existing callers. Rendering helpers
stay in panel-owned files; command helpers stay in command-owned files.
If another shared file is required, report before editing so ownership and
any dependency can be amended and approved. Review each branch as it lands.

```yaml
troupe: 1
goal: "Readable plan, accurate review flow and rich role cards, with safe mission teardown and readiness waiting"
why: "Run 1 exposed misleading flow and unreadable plans, and finished missions reopen by default"
workflow: troupe-mission
base: mission/p6-panel
roles:
  panel:
    agent: codex
    model: gpt-6.1-sol
    effort: high
    flags: [-a, on-request, -s, workspace-write]
    text: workflow:builder
    goal: "Render PLAN, reviewer lanes, role cards, badges, effort and Teardown stage"
    touches: [src/draw.ts, src/model.ts, src/canvas.ts, src/agents.ts, src/panel-model.ts, src/stages.ts, skills/troupe-mission/stages.yaml, tests/draw.node.mjs, tests/agents.node.mjs, tests/goldens/]
  commands:
    agent: codex
    model: gpt-6.1-sol
    effort: high
    flags: [-a, on-request, -s, workspace-write]
    text: workflow:builder
    goal: "Safe teardown, ready waiting, stale-lock fixes and newest-open-mission selection"
    touches: [src/check.ts, src/commands.ts, src/role-commands.ts, src/command-context.ts, src/log.ts, src/panel.ts, src/cli.ts, README.md, skills/troupe-mission/SKILL.md, skills/troupe-mission/templates/plan.md, skills/troupe-mission/roles/, tests/commands.node.mjs, tests/commands-integration.node.mjs, tests/cli.node.mjs, tests/plan.node.mjs, tests/state.node.mjs, tests/panel-live.node.mjs]
  review:
    agent: claude
    model: opus
    effort: high
    flags: [--permission-mode, acceptEdits]
    text: workflow:reviewer
    goal: "Review each branch as it lands against the full brief and safety contracts"
    touches: []
    reviews: [panel, commands]
```

## Role: panel

Implement requirements 1–3 and stage rename exactly as Done when specifies.
Read existing rendering and test conventions first. You own panel-model.ts
for dispatch timestamps, adapter badges and any added view data. Do not edit
command-owned files or plan.ts. FLOW can compute its own builder layering
without changing plan validation. Coordinate any cross-file need with the
orchestrator. Make activity show a teardown event when commands adds it,
without requiring that union member to exist yet. Add badge validation tests
in agents tests, inspect updated goldens, cover wrapping, ANSI styles, narrow
fallback and wide reviewer lanes, card scrolling/selection/hit targets,
unknown effort/context and missing live data. Prove with ./check.sh. Include
wide/narrow screen preview instructions in result for person acceptance.

## Role: commands

Implement requirements 4–6 and both issues exactly as Done when specifies.
Read issue #17 via gh if needed. For its first case, use force:true during
reclaim cleanup; test the race deterministically. For the second, choose
clear manual cleanup guidance rather than an unsafe stale-reclaim bypass.
Respect ownership checks when killing panes, preserve the MR head and log,
and do not mark a refused/partial cleanup finished incorrectly. Protect
unmerged committed work and dirty/untracked changes unless --force. Ensure
idempotence works after worktrees/branches are gone, with explicit -m for a
finished mission. Own log event schema/folding and CLI help. Add one workflow
line about startup readiness, replace the last workflow step with teardown
after MR opening, update README and template as needed. Do not edit
stages.yaml, model.ts or any panel-role file. Add meaningful lifecycle,
ready/waits/gone/timeout, default selection and no-mission polling tests.
Each branch must pass ./check.sh before result. Do not run real teardown
against this mission or p6-polish during build; use isolated test repos.

## Role: review

Review one branch at a time when sent, independently against this plan.
Check file ownership and ./check.sh, drive rendering via fixture previews,
and inspect teardown safety and lock races line by line. Explicitly cover
PLAN no-truncation, hanging lists/inline styles/YAML, narrow/wide FLOW edges,
agent width/color and effort mappings, cards/live elapsed, logged teardown,
mission discovery with no log and linked worktrees, dirty/unmerged refusals,
force/idempotence and pane ownership, ready early-exit behavior, and both
#17 regressions. Mark visual approval as a manual acceptance item with exact
entry points. One fix round per branch; report PASS or FAIL with reproducible
act-on findings. Never edit tracked files or merge branches.
