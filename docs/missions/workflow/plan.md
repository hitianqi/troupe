# Plan: workflow — the mission workflow as a skill

Intent: write troupe's mission workflow as a Claude Code skill, so that one
session can play the orchestrator and run a mission from brief to merged MR
without OpenRig. Tianqi said "开1" to 大博士贴's proposal to start the text
half of `ROADMAP.md` Phase 3 now, in parallel with p2. The brief is 大博士贴's
queue item qitem-20261020125951-26af5b37dad886b9. The source is the
tianqi-rig-kit (`~/repos/private/tianqi-rig-kit`): its workflows
`tianqi-mission.yaml` and `tianqi-mission-light.yaml`, its templates
`plan.md`, `REVIEW.md` and `SLIM.md`, `scripts/plan_lint.py`, its agents'
role prompts and `rigs/tianqi-dev/CULTURE.md`. The skill drops everything
personal: Tianqi's own skills, the chief-of-staff seat, Slack, the OpenRig
queue and seat configuration. Where the kit says "send 大博士贴" or "post to
Slack", the skill says "tell the human". Phase 3's code half
(`troupe_dispatch`, role windows, the approval dialog) comes after p2.

Done when:
- `skills/troupe-mission/SKILL.md` exists, `claude plugin validate .` accepts
  the plugin with it, and its frontmatter description says when to load it.
  It gives the generic workflow in the kit's order: brief → plan → the human
  approves the plan → dispatch by dependency layer, in parallel where orders
  are independent → each order reviewed as it lands → slim pass → one
  cross-order final review → fix rounds, at most two reviews each, then the
  human rules → MR gate → merged gate → teardown. Light mode covers one or two
  orders: serial, no slim, and the order review doubles as the final review.
  A project's own `verify-<app>` skill is used when present and skipped
  otherwise.
- The plan step in the SKILL covers: split by coupling; declared `touches`;
  overlapping touches joined by `depends_on`; a hub file with one owner; a
  per-order `model`; the `goal` line; the `roles` block with model, effort,
  duty and skills.
- The SKILL fixes the shapes the pane already reads:
  `docs/missions/<mission>/plan.md` with its YAML block; order ids `oN`;
  `REVIEW-<id>.md`, `REVIEW-<id>-<n>.md`, `SLIM.md` and `REVIEW.md` in the
  mission folder; and Agent descriptions that start with `oN:`. Each rule
  matches `hooks/plan.ts` and `hooks/read-state.ts` as they stand at 5761d26.
- `skills/troupe-mission/references/orchestrator.md`, `builder.md` and
  `reviewer.md` carry each role's duty from the kit's agent prompts, without
  anything personal. A grep of `skills/` and `templates/` for `tianqi`,
  `大博士贴`, `Slack`, `rig queue`, `OpenRig`, `CULTURE` and the kit's path
  finds nothing, or only a credit line naming the source. Where the kit has
  the orchestrator message the human, the skill says "tell the human" or
  "ask the human".
- `templates/REVIEW.md` and `templates/SLIM.md` come from the kit without
  anything personal. Anything they need from the kit, such as the slim pass's
  numbers, is either carried in the skill or described so a project without
  the kit can produce it. `templates/plan.md` matches the SKILL and keeps its
  structure: the reader still parses it, and the existing tests still pass.
- `docs/missions/workflow/WALKTHROUGH.md` runs one sample two-order mission
  through the skill as written: its plan.md, the brief for each order, the
  review verdicts, the gates and the teardown. The sample plan and review
  files are fixtures for a check that `node` runs from this mission's folder.
  The check uses the existing reader: `readPlan` and `layersOf` from
  `hooks/plan.ts`, and `stateOf` from `hooks/read-state.ts` if it can be
  imported without the engine. It shows the sample parses with no problems,
  as two orders in the right layers, light, with the reviewed state read from
  the REVIEW files. It is also shown failing once on a broken copy of the
  sample.
- `docs/missions/workflow/RECORD.md` records `claude --version`, what was
  built, what `check.sh` and `tests/` should gain once p2 has merged (the
  walkthrough check), any README line to add then, and what Phase 3's code
  half still needs from the skill.
- `./check.sh` passes on the mission branch. `git diff --stat 5761d26` shows
  changes only under `skills/`, `templates/plan.md`, `templates/REVIEW.md`,
  `templates/SLIM.md` and `docs/missions/workflow/`.

Out of scope: `troupe_dispatch`, role windows and the approval dialog
(Phase 3's code half, after p2); `metrics.json` and the real two-order
mission (Phase 3 proper); any change under `hooks/`, `bin/`, `tests/`,
`README.md`, `check.sh`, `tsconfig.json`, `.gitignore`, `docs/FEASIBILITY.md`,
`docs/feasibility/` or `docs/missions/p2/` (p2's ground); a plan_lint CLI;
mod loading (this mission is text only, so there is no "Turn on the mods"
question); any push before the MR gate.

## How the work is split

Two orders, serial. o1 writes the skill: `SKILL.md`, the three role
references and the three templates. These change together. The SKILL names
the templates and the roles, and the templates repeat the SKILL's rules, so
they belong in one order. It is `opus`: deciding what the skill keeps from
the kit and what it drops takes judgement.

o2 runs a sample mission through the finished skill and checks it against
the existing reader, then writes the mission record. It shares no file with
o1 (it writes only under `docs/missions/workflow/`), except for the two
wording leftovers from o1's re-review (amendment below). It still depends on o1:
a walkthrough written before the skill is final would test a draft. It is
`sonnet`: given the skill, the work is well bounded, and a builder that only
has the written skill to go on is a fair test of whether the skill can be
followed. Where it cannot, o2 says so in its hand-back, and the fix goes to
o1's text in o2's fix round.

The check lives in `docs/missions/workflow/` because p2 owns `tests/` and
`check.sh` until it lands. The hooks import each other without extensions,
so a plain `node` run needs a resolve hook. p2 met the same problem
(`docs/missions/p2/ts-resolve.mjs` on its branch, not yet on the trunk), so
o2 writes its own small hook. It does not import p2's file. Node 22 also
needs `--experimental-transform-types`, not only strip-types, because
`hooks/yaml.ts` uses a parameter property. With both, this plan already
parses clean. The orchestrator checked that by hand.

Gates: 大博士贴 approves this plan and gives the MR go on Tianqi's behalf.
p2 is expected to land first, and this branch rebases onto the trunk before
its MR. Cost: nothing runs on Tianqi's API key; subagents run on the seat's
own login.

Amendment (2026-10-20 13:16Z, orchestrator): o1 passed its re-review
(`REVIEW-o1-2.md`) with two Consider items that are bounded wording fixes.
o1 has no review rounds left, so they go to o2, and o2's review covers them.
First, the touches diff check (SKILL step 4, `orchestrator.md` Merge item 1)
names `order/<m>/<id>` and not the last reviewed `-fix` branch. Second,
`builder.md` step 2's "never check out another builder's branch" reads oddly
next to the fixer's `git switch -c`. o2 now also touches `SKILL.md`,
`references/orchestrator.md` and `references/builder.md`, and it already
depends on o1.

## Orders

```yaml
goal: "Write troupe's mission workflow as a skill: the steps, the three roles and the templates, de-personalized from the kit, with a sample mission that the pane's reader parses."
roles:
  orchestrator:
    model: opus
    effort: high
    duty:
      - "Writes the plan and gets it approved"
      - "Dispatches each order and merges it onto the mission branch"
      - "Opens the MR after the human's go, then tears down"
    skills: [messaging-the-human, queue-handoff]
  builder:
    model: opus
    effort: high
    duty:
      - "Builds its order in its own worktree"
      - "Fixes review findings, once per review"
    skills: [tianqi-skill-design]
  reviewer:
    model: sonnet
    effort: high
    duty:
      - "Reviews each order as it lands"
      - "On a light rig, the last order review is also the final review"
    skills: []
orders:
  - id: o1
    kind: code
    goal: "Write skills/troupe-mission/SKILL.md, references/orchestrator.md, builder.md and reviewer.md, and the de-personalized templates REVIEW.md, SLIM.md and plan.md: the kit's mission workflow for one Claude Code session, in the shapes the pane reads."
    why: "ROADMAP Phase 3, text half. Reuses the kit's workflows (tianqi-mission.yaml and tianqi-mission-light.yaml: the steps, the loop guard, light mode), templates/REVIEW.md and SLIM.md (copied, then de-personalized), plan_lint.py's rules as hooks/plan.ts already implements them, and the orchestrator, builder and reviewer role prompts. troupe has no skill yet; templates/plan.md exists from p1 and gets small edits only."
    touches:
      - skills/troupe-mission/
      - templates/REVIEW.md
      - templates/SLIM.md
      - templates/plan.md
    depends_on: []
    model: opus
    risks: "The pane parses templates/plan.md, and tests/fixtures.ts follows its shape. A structural change there would break p2's tests or the reader. The kit's slim pass relies on scripts/slim_numbers.sh, which a project without the kit lacks, so the skill must carry or describe the numbers. A grep for personal terms misses paraphrases, so the review reads the text as well. A skill folder with bad frontmatter fails claude plugin validate for the whole plugin. Agent descriptions starting with oN: is Phase 1's state signal, and Phase 3 may replace it with windows, so the skill states it without building on it."
    proof: "claude plugin validate . lists or accepts the skill; ./check.sh passes; the personal-terms grep over skills/ and templates/ is clean; diff of templates/plan.md against 5761d26 shows no structural change; a step-by-step cross-check table in the hand-back maps each kit workflow step and each role-prompt duty to the place the skill covers it, or says why it was dropped."

  - id: o2
    kind: code
    goal: "Write docs/missions/workflow/WALKTHROUGH.md, a sample two-order mission run through the skill as written, with its plan and review files as fixtures for a node check against hooks/plan.ts, and the mission record RECORD.md."
    why: "The brief's item 4 and 5: shows the skill can be followed and that what it produces is what the pane reads. Reuses hooks/plan.ts (readPlan, layersOf, isLight) and hooks/read-state.ts (stateOf), imported unchanged, and the p1 RECORD.md's shape. Nothing in tests/ can be used: p2 owns it until it lands."
    touches:
      - docs/missions/workflow/
      - skills/troupe-mission/SKILL.md            # the two wording leftovers of REVIEW-o1-2.md
      - skills/troupe-mission/references/orchestrator.md
      - skills/troupe-mission/references/builder.md
    depends_on: [o1]
    model: sonnet
    risks: "The hooks import without extensions and read-state.ts imports 'claude-code', which node cannot resolve outside the engine. If stateOf cannot be imported, the check reimplements nothing and states that it covers readPlan and layersOf only. p2 changes hooks/ too, so after the rebase the check must still run against the reader p2 lands. A sample plan that uses YAML outside hooks/yaml.ts's subset would be flagged, which is a finding about the skill or the template, not about the fixture."
    proof: "node <the check> exits 0 on the sample and prints what it checked; the same check run on a broken copy (overlapping touches without depends_on) exits non-zero; ./check.sh passes; RECORD.md carries claude --version."
```

`model` is the orchestrator's call per order, shown to the human at plan
approval: `opus` where the work needs judgement, `sonnet` where it is well
bounded.

## Review

rev.r1 reviews each order as it lands (`templates/REVIEW.md`). The mission
ships text and a check, so the review checks what a design can get wrong: a
step of the kit lost without a reason, a rule that contradicts the pane's
reader, a personal term left in, an instruction the walkthrough could not
follow. On this light rig o2's review is also the final review of the whole
`feature/NO-JIRA-workflow` diff against the trunk, and says so. Findings go
back to the builder for one fix round and one re-review, then the
orchestrator rules. A leftover with a known, bounded fix is fixed in this
mission, not filed.
