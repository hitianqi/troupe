# Plan: p4 — Phase 3, light mode, the skill, metrics and one real mission

Intent: Tianqi opened ROADMAP's Phase 3 ("开 troupe 的 P3吧", 2026-10-22; the
mission is named p4 because p0–p3 are taken). The brief is 大博士贴's queue
item qitem-20261022121907-1a9bd71f392c51d8 and the spec is `ROADMAP.md`
"Phase 3 — The workflow skill and one real mission". Phase 2 left troupe able
to dispatch orders and reviews into role windows and to approve a plan in a
dialog, but it has never run a real mission. p4 adds light mode to the mod,
makes the `troupe-mission` skill complete and usable by anyone, has the
orchestrator write `metrics.json` at teardown, and then runs one real small
mission through troupe end to end on another repository, so its numbers can
be set against the rig-kit's light baseline.
`claude --version`: 2.1.308 (Claude Code) at planning.

Done when:
- **Light mode in the mod.** In a mission of one or two orders,
  `troupe_dispatch` runs the orders one after the other: it refuses the second
  while the first is not merged onto the mission branch, with a reason the
  model reads, whatever `depends_on` says. The review brief for a light
  mission's last order says that review is also the mission's final review,
  gives the mission's base commit, and asks for the whole mission diff and
  every done-when criterion. The pane and the panel name a light mission's
  steps without Slim, Cut and Final review, and reach "MR OK?" once the last
  order is reviewed. `claude plugin test` covers each of these.
- **The skill.** `skills/troupe-mission/` (SKILL.md and `references/`) and
  `templates/` (`plan.md` with goal, roles and orders, `REVIEW.md`, `SLIM.md`)
  describe the whole mission for anyone, not only Tianqi: brief → plan split
  by coupling with declared touches and a model per order → approval in the
  dialog → dispatch by dependency layer through `troupe_dispatch` (role
  windows, a worktree per order) → each order reviewed as it lands → slim →
  cross-order final review (as Tianqi decides below) → at most one fix and
  one re-review per review, then the human → MR gate → merged gate →
  teardown, which writes `metrics.json`. A project's `verify-<app>` skill is
  used when present, else skipped. The skill, the mod and the kit's workflow
  say the same thing about the final review; a kit change, if any, is a
  follow-up note for 大博士贴, not an edit.
- **Metrics.** At teardown the orchestrator has troupe write
  `docs/missions/<mission>/metrics.json`: orders, each order's model, review
  rounds per order and for the mission, refused dispatches, wall time (plan
  approved to MR-ready, and per order), and cost where troupe can know it.
  Every field troupe cannot know is present with `null` and a reason, never
  guessed. Plugin tests cover it.
- **One real mission through troupe.** A real repository and a real small
  issue (Tianqi's pick, decision 2), two orders, from brief to a local
  MR-ready branch: the orchestrator is a `claude --plugin-dir <troupe>`
  session with the pane showing the mission; Tianqi approves the plan in the
  dialog, not in chat; dispatch opens the role windows in their own tmux
  session; real builder and reviewer Claude instances do the orders; the
  reviews come back as files; `metrics.json` is written at the end. Its
  `metrics.json` is compared with the rig-kit light baseline for the same size
  (nav 1h23m, formalize-ui 1h25m), the hook refusals during the run are
  counted (expected 0), and its cost was estimated before the run (below).
- `README.md` describes light mode, the skill, `metrics.json` and the
  acceptance run with its numbers; `ROADMAP.md` has the Phase 3 outcome
  paragraph; `docs/missions/p4/` holds this plan, `RECORD.md` with
  `claude --version`, the reviews, the acceptance run's log and its
  `metrics.json`. `./check.sh` exits 0 with `tsc` run.

Out of scope: Phase 4 (open source, marketplace, licence); any herdr-specific
API; any edit to the kit (follow-ups go to 大博士贴 as a note); the
auto-resolved-dialog guard and an `APPROVAL.json` write guard (p3 leftovers,
not asked for here); opening an MR on the acceptance run's repository (the
branch is a real MR candidate; whether it becomes one is Tianqi's call
afterwards); any paid run on Tianqi's API key; publishing before the MR gate.
Tianqi's global `~/.claude/settings.json` is not touched.

## Decisions for Tianqi (asked at 计划可以吗)

Answered 2026-10-22 12:23Z in Slack: plan approved; decision 1 **keep** the
cross-order final review in full mode; decision 2 **blueprint-desktop, the
shared card component for Rows and Findings**. The cost estimate below was
asked with the plan and approved with it.

1. **Full mode's cross-order final review: keep or drop?** The kit still has
   it (done by the same reviewer), and he has waived it on recent missions.
   Recommendation: **keep it in full mode, light mode has none**. It is the
   only review that drives the done-when on the integrated branch, and in p3
   it found the one cross-order bug of the mission (the pane still asked
   "Plan OK?" after Approve, because no single order owned the step). Its
   cost is one reviewer pass of about 20 minutes. If he drops it, the skill
   and the pane drop it (the step goes Slim → Cut → MR OK?), and a follow-up
   note tells 大博士贴 how to bring the kit's `tianqi-mission.yaml` and the
   orchestrator and reviewer roles in line.
2. **Which repository and issue for the real mission?** It must not be troupe
   itself (dispatch there collides with this mission's own `order/p4/*`
   branches, p3's lesson). Suggestion: blueprint-desktop, with a two-order
   issue whose files are disjoint from AI-79 formalize-warn, which is running
   there now (contract, runner, bridge, Formal/Formalize, Review's Model gaps,
   `docs/adr/0008`). Candidates: the shared card component for Rows and
   Findings (calm-ui leftover), or the D4 live-rail wording on API-key logins
   (calm-ui leftover); or an AI-79 leftover once !47 lands. Branch from
   blueprint-desktop's `main` as it is then; if !47 lands first, rebase.
   If the issue changes how a screen looks, Tianqi sees the screenshots
   before the branch counts as MR-ready.

## The acceptance run (o4): where it runs, and its cost

- **Where:** a scratch tmux server (`tmux -L troupe-p4`) with one session for
  the orchestrator, `claude --plugin-dir <the integrated troupe-p4 worktree>`
  started in a worktree of the chosen repository under `~/scratch/troupe/`.
  Dispatch opens the role session `troupe-<mission>` on that same scratch
  server. Tianqi opens a terminal of his own and attaches to it
  (`tmux -L troupe-p4 attach`); he types the brief, answers the dialog and
  any prompt in the role windows. The o4 builder sets it up, watches it with
  `tmux capture-pane`, keeps the log, and stops it at teardown.
  Why not p3's method (the dialog in a builder's tile): the OpenRig seat's
  window would then hold the panel split and the role session would sit on
  OpenRig's tmux server, which troupe has never run on (README "Known
  limits"); a split pane in a seat's window makes the seat unreachable until
  `/troupe close`. A scratch server keeps the run off the rig.
- **Login and cost:** the orchestrator and every role window run on the seat's
  own Claude login, nothing on Tianqi's API key. Estimate at API list prices,
  for comparison only: an Opus orchestrator over about 1.5 h, two builder
  windows and two review windows, with short briefs — about 15–30 USD
  equivalent, billed to the login's plan, not charged per token. This is
  above 5 USD, so it is named here and asked at 计划可以吗.
- **Real mission's mode:** two orders, so light mode: serial, no slim, the
  second order's review is the final review. Its gates stop at a local
  MR-ready branch: "MR OK?" is answered by Tianqi, and nothing is pushed.

## How the work is split

Three lanes are independent and run in parallel; the acceptance run needs all
three; the docs need the run's numbers.

- **o1 owns dispatch and the step.** Light mode lives where the hard rules
  already live: `hooks/dispatch.ts` (the serial rule and the light review
  brief) and `hooks/plan.ts` (`isLight`, `STEPS`, `stepOf`), plus what draws
  the step (`hooks/view.ts`, `hooks/graph.ts`, `bin/troupe-panel`) and their
  tests.
- **o2 owns the skill and the templates** (`skills/troupe-mission/`,
  `templates/`). It changes no code. It names `troupe_metrics` as the
  teardown call, the contract o3 builds (below); the two meet only at that
  name.
- **o3 owns metrics** in a new `hooks/metrics.ts`, wired in
  `hooks/register.tsx`, with state types in `types/index.d.ts` if it needs
  any. It must not touch `dispatch.ts` (o1's): what it counts, it reads from
  the mission folder, git, the approval record, `$.state` and the session
  transcripts. If it finds it genuinely needs a line in `dispatch.ts`, it
  updates this plan in the same commit and becomes `depends_on: [o1]`.
- **o4 runs the real mission** once o1–o3 are merged, and writes only its
  record under `docs/missions/p4/acceptance/`. Its product branch lives in the
  other repository, outside troupe's tree.
- **o5 writes the docs** (`README.md`, `ROADMAP.md`, `RECORD.md`) after o4,
  since they carry the run's numbers.

The contract between o2 and o3: a tool `troupe_metrics` with input
`{ mission }` that writes `docs/missions/<mission>/metrics.json` and answers
its path and a one-line summary. The fields are the ones in "Done when";
o3 may add fields, not rename these.

## Orders

```yaml
goal: "Light mode, a complete skill and metrics.json for troupe, proven by one real two-order mission run through it"
roles:
  orchestrator:
    model: opus
    effort: high
    duty:
      - "Writes the plan and gets it approved"
      - "Dispatches each order and merges it onto the mission branch"
    skills: []
  builder:
    model: opus
    effort: high
    duty:
      - "Builds its order in its own worktree, within its declared files"
    skills: [plugin-authoring]
  reviewer:
    model: sonnet
    effort: high
    duty:
      - "Reviews each order for behaviour as it lands"
      - "Runs the slim pass and the cross-order final review"
    skills: [plugin-authoring]
orders:
  - id: o1
    kind: code
    goal: "Light mode in the mod: serial dispatch, the last order's review is the final review, and the pane and panel name the light steps"
    why: "ROADMAP Phase 3 and the skill's isLight rule; plan.ts already has isLight and stepOf skips the heavy steps, but dispatch lets a light mission's two orders run in parallel and the review brief never says it is the final review. Reuses rule() and reviewerBrief() in dispatch.ts, gitFacts in mission.ts and the STEPS list."
    touches:
      - hooks/dispatch.ts
      - hooks/plan.ts
      - hooks/view.ts
      - hooks/graph.ts
      - bin/troupe-panel
      - tests/dispatch.test.ts
      - tests/read-state.test.ts
      - tests/pane.test.tsx
      - tests/graph-goldens.ts
      - tests/panel.node.mjs
    depends_on: []
    model: opus
    risks: "dispatch.ts holds the two hard rules; a light rule that is too wide would refuse a full mission's parallel orders. The panel and the pane share step text with the Phase 1 goldens."
    proof: "./check.sh green; plugin tests for: the second light order refused until the first is merged, a three-order mission's independent orders still both allowed, the light review brief naming the base commit and the final-review duty, the light step sequence ending at MR OK?"

  - id: o2
    kind: code
    goal: "The troupe-mission skill and templates, complete and usable by anyone: the full workflow through troupe_dispatch, light mode, the final review as decided, verify-<app> when present, metrics at teardown"
    why: "The skill from !2 still dispatches through the Agent tool and mentions the dispatch tool only as a later phase; it predates role windows, the approval dialog and metrics. Reuses the existing SKILL.md, references/ and templates/, and the kit's tianqi-mission flow as the model, without Tianqi's seats or tools."
    touches:
      - skills/troupe-mission/
      - templates/
    depends_on: []
    model: opus
    risks: "The pane reads the file names and the plan block the skill tells the orchestrator to write; renaming any of them breaks the pane. The skill must match what o1 builds (the light rule) and o3's troupe_metrics contract in this plan."
    proof: "A read-through against hooks/ (every file name and tool it names exists or is in this plan's contracts); templates/plan.md filled with the sample mission passes the pane's plan checks (docs/missions/workflow/check-sample.mjs in ./check.sh)."

  - id: o3
    kind: code
    goal: "troupe_metrics writes docs/missions/<mission>/metrics.json at teardown: orders, models, review rounds, refused dispatches, wall time and cost where troupe can know it, null with a reason where it cannot"
    why: "ROADMAP Phase 3 asks for metrics.json so a troupe mission can be measured against the rig-kit baseline. Nothing records it today. Reuses plan.ts's reader, mission.ts's gitFacts and file rules, approval.ts's record (the approval time) and $.state's role windows; a new file keeps it out of dispatch.ts."
    touches:
      - hooks/metrics.ts
      - hooks/register.tsx
      - types/index.d.ts
      - tests/metrics.test.ts
    depends_on: []
    model: opus
    risks: "Reading session transcripts for refusals or tokens depends on Claude Code's transcript format, which moves; a wrong count would mislead the baseline comparison, so an unknown stays null with a reason. register.tsx wires every hook: a mistake there stops the whole mod."
    proof: "./check.sh green; plugin tests for a fixture mission: the fields, a refused dispatch counted, review rounds counted from REVIEW files, a field troupe cannot know is null with a reason."

  - id: o4
    kind: code
    goal: "Run one real two-order mission through troupe on the repository and issue Tianqi picks, from brief to a local MR-ready branch, and record it"
    why: "ROADMAP Phase 3's done-when: troupe has never run a real mission. Reuses p3's dry-run set-up (docs/missions/p3/dry-run/run.sh) for the scratch tmux server, and the integrated troupe-p4 worktree as the plugin."
    touches:
      - docs/missions/p4/acceptance/
    depends_on: [o1, o2, o3]
    model: opus
    risks: "Tianqi's time at the keyboard for the brief, the dialog and the role windows' prompts; a run that stalls costs his attention. The run's branch is in another repository where AI-79 is under way: disjoint files, rebase if !47 lands first. Scratch servers, role sessions and worktrees must be closed at the end (p2 once left dead sockets)."
    proof: "docs/missions/p4/acceptance/ holds the run's log, its metrics.json, the hook refusals counted, and the comparison with nav 1h23m and formalize-ui 1h25m; the product branch exists locally in the other repository with both orders merged and their reviews."

  - id: o5
    kind: code
    goal: "README, ROADMAP's Phase 3 outcome and the mission record"
    why: "CULTURE's lightweight maintenance: the README says what the mod does; ROADMAP records each phase's outcome; RECORD.md is the mission record with claude --version. Reuses p3's RECORD.md shape."
    touches:
      - README.md
      - ROADMAP.md
      - docs/missions/p4/RECORD.md
      - .claude-plugin/plugin.json
    depends_on: [o4]
    model: sonnet
    risks: "Claims the code does not back; checked against hooks/ and the acceptance record."
    proof: "Every tool, file and number named in the docs exists in hooks/, skills/ or docs/missions/p4/acceptance/; ./check.sh green."
```

`model` is the orchestrator's call per order, shown to Tianqi at plan
approval: `opus` where the work needs judgement, `sonnet` where it is well
bounded. o1–o4 are `opus` (the dispatch rules are the mod's high-risk
surface; o2 is the product's main text; o3 reads moving formats; o4 drives a
live run). o5 is docs.

## Who builds what

dev.b1: o1, then o4 (it knows dispatch best by then). dev.b2: o2, then o3
(o2 is mostly text and should finish first; o3 starts when either builder is
free). o5 goes to whichever builder is free after o4, as a sonnet subagent.
Each order is capped at 90 minutes of building; a builder that drifts hands
back as is.

## Review

Each order is reviewed as it lands by rev.r1 (`REVIEW-<id>.md`), and the
integrated mission once more, across orders, after the slim cuts
(`REVIEW.md`), unless Tianqi says otherwise. Findings go to a fixer: one fix
and one re-review per review; then the orchestrator rules.
