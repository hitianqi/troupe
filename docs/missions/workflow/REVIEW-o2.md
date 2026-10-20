# Review: workflow, order o2, and the final review

Two passes in one report. This is the **order review of o2** (diff against
e810ad2) and, because the mission is light (two orders), also the **final
review of the whole branch** (diff against the trunk 5761d26). By rev.r1.
Report only. Claude Code 2.1.304, Node v22.23.2. Reviewed
`order/workflow/o2` at 6a57c50 in a detached worktree.

## What I did

- Read plan.md as amended (both amendments), the hand-back, and the diff:
  o2's commit (14 files, the walkthrough, the check, the sample, RECORD and
  four skill files) and the whole branch against 5761d26 (20 files).
- Read o2's skill edits (after o1's re-review) line by line, not only the
  hand-back's summary: SKILL §4–§8, `builder.md` step 2, `orchestrator.md`
  Merge, Slim, Land, Teardown, `reviewer.md` intro, slim and report steps.
- Ran the walkthrough check on `sample/`: exit 0, all seven checks hold,
  output identical to the walkthrough's. On a copy with o2's `depends_on`
  emptied: exit 1, the same three failures as shown in the walkthrough
  (readPlan overlap, layers `o1+o2`, step "Plan"). On a copy with the o1
  review files removed: exit 1 (o1 `planned`, step "Build"), so the check does
  read the REVIEW files, not only the plan.
- Ran `claude plugin validate .`: passes. `./check.sh`: exit 0, 22 pass,
  0 fail, tsc skipped as on main.
- Grep of `skills/` and `templates/` for `tianqi`, the Chinese gate names,
  `slack`, `rig queue`, `openrig`, `culture`, kit path, seat and queue words,
  `exit failed`, `herdr`: no match at all (the credit line does not even hit
  the patterns). I also read the text for paraphrases: none.
- Ground: `git diff --name-only 5761d26 HEAD` lists only `skills/`,
  `templates/{plan,REVIEW,SLIM}.md` and `docs/missions/workflow/`; the diff of
  `hooks/ tests/ bin/ README.md check.sh tsconfig.json .gitignore
  docs/FEASIBILITY.md` is empty.
- Scratch repo rehearsal of the branch rules in my last review stands; I did
  not repeat it.

Depth: text and a check script. I read every changed line and ran the check on
three inputs. Nothing here is auth, migrations or deployment.

## Pass 1: order review of o2

**Touches.** o2 changed `SKILL.md`, `orchestrator.md`, `builder.md` and
`reviewer.md` outside `docs/missions/workflow/`. The first three were added by
the plan's first amendment, `reviewer.md` by o2's own plan.md edit in the same
commit (the rule the skill states: update `touches` in the same commit). All
four are in the amended `touches` and nothing else is outside them. No new
dependency: o2 already depends on o1, and nothing else touches those files.

**The two wording leftovers from `REVIEW-o1-2.md`: addressed.**
- The touches check names the order's last reviewed branch (`-fix` after a fix
  round) in SKILL §4 and `orchestrator.md` Merge item 1; the "Merge" bullet
  and Merge item 3 already said "last reviewed branch".
- `builder.md` step 2 now forbids only checking out a branch another worktree
  holds and says creating a new branch from one is fine, pointing at the
  fixer's `git switch -c`.

**The C2 change, followed across SKILL, reviewer.md and orchestrator.md,
including teardown: consistent.** The same story is told in each place: the
reviewer writes its report untracked in its own worktree at
`docs/missions/<mission>/<file>` and hands back the absolute path (SKILL §4
Order review; `reviewer.md` intro and step 4); the orchestrator copies it into
its own mission folder and commits it with the merge (§4 Merge, §5 for
`SLIM.md`, §6 for `REVIEW.md`, §8 "check every copy is committed",
`orchestrator.md` Merge 2–3, Slim, Land); teardown deletes only copies that are
committed, then `git worktree remove` without `--force`, then `-D` for the
engine's leftover `worktree-agent-<id>` branch of a fixer and of a reviewer
(`orchestrator.md` Teardown 2–3). Builders rename their branch, so they leave
no engine branch behind; the slim cutter and the final fixer rename too. I
found no stale sentence from the old "write into the orchestrator's checkout"
text (grep for "checkout" and "mission folder" across the three files).
The evidence behind it (RECORD, WALKTHROUGH C2 section): the harness refuses a
write into the session checkout from an isolated agent, and a write in its own
worktree is kept. It was seen in auto mode only; the skill's approach (write in
your own worktree) is safe in any mode, so I take that limit as Noted.

**Walkthrough against the skill as it now stands: each step matches the
section it cites.** §1 brief, §2 plan, §3 gate question (no ids or commands),
§4 mission branch with `git switch -c`, base commit by `git merge-base`, plan
committed before dispatch, builder brief fields, `<id>:` description,
`review o1` description without a prefix, the `-fix` branch started from the
order branch, the re-review brief with the previous report's absolute path and
`REVIEW-o1-2.md`, the touches check on the fix branch, squash-merge with both
report copies, light mode's last review with the base commit, §8, §9, §10 and
teardown (steps 1–4 match `orchestrator.md`). Gaps 2, 3, 5–10 are shown with
their fix, and the fixes are in the skill. Gaps 1 (no plan-check command
without the pane) and 4 (`effort` on the Agent tool) are left open and said
so, which is within the plan (no plan_lint CLI).

**The check.** Uses `readPlan`, `layersOf`, `isLight`, `stateOf` and `stepOf`
unchanged from `hooks/`; `claude-code` is answered by a stub in `resolve.mjs`
that stands in only for calls `stateOf` does not make, and the header and
RECORD say so. It imports nothing from p2. It runs from the mission folder
(`node --import ./register.mjs ... check-sample.mjs`, exit 0) and, with absolute
paths, from `/`.

## Pass 2: final review of the whole branch against 5761d26

Every Done-when criterion of plan.md, with evidence:

1. **SKILL exists; validate accepts it; the description says when to load it;
   the workflow is in the kit's order, light mode, `verify-<app>`.** Met.
   `claude plugin validate .` passes (run). Description names the triggers and
   when not to load it. Steps 1–11 run brief → plan → gate → build → slim →
   final review → fix rounds → MR gate → open → merged gate → teardown; light
   mode is "one or two orders, serial, no slim, last review also the final";
   `verify-<app>` is used when present and skipped otherwise (the last section
   of the SKILL, `reviewer.md` step 2, `builder.md` step 5).
2. **The plan step covers** split by coupling, `touches`, `depends_on` for
   overlap, one owner for a hub file, per-order `model`, the `goal` line, and
   the `roles` block with model, effort, duty and skills. Met (SKILL §2).
3. **The SKILL fixes the shapes the pane reads and each rule matches
   `plan.ts` and `read-state.ts`.** Met. I compared the step-inference
   paragraph with `stepOf` branch by branch, the review file names with the
   regex in `stateOf`, the `<id>:` prefix with `startsWith`, the YAML subset
   with `yaml.ts`, `isLight` with the light-mode rule, and the new paragraph
   about which mission the pane shows with `newestMission` and `setTarget`.
   The reader is untouched since 5761d26.
4. **The three references carry each role's duty; the grep is clean; "tell the
   human" replaces the kit's messaging.** Met. The cross-check tables in the
   o1 hand-back held when I read the kit's role prompts against them (o1
   review). Grep: no match.
5. **`REVIEW.md` and `SLIM.md` are de-personalized; the slim numbers are
   carried; `plan.md` matches the SKILL and keeps its structure.** Met.
   `scripts/slim_numbers.sh` is carried (comment-only diff from the kit),
   `SLIM.md` gives the bare `jscpd` and `git` commands without it, and
   `templates/plan.md` changed in wording and `skills: []` only; the 22 tests
   pass.
6. **WALKTHROUGH, fixtures and a node check, shown failing once.** Met, with
   one gap: the walkthrough spells out o1's builder brief and o1's review
   brief, but o2's builder brief and o2's reviewer brief are "same brief
   shape" (see Consider C2). Plan, verdicts (FAIL then PASS, PASS), gates and
   teardown are all there.
7. **RECORD records `claude --version`, what was built, what `check.sh` and
   `tests/` should gain, the README line, and what Phase 3's code half still
   needs.** Met (2.1.304; the section list matches).
8. **`./check.sh` passes; `git diff --stat 5761d26` shows only the declared
   ground.** Met (run; ground check above).

**Contradictions across skill, references, templates, walkthrough, RECORD:**
none that change what a session does. The re-review file names
(`REVIEW-<id>-2.md`, `REVIEW-2.md`), the light-mode rule, the branch names and
the report flow agree in `templates/REVIEW.md`, `templates/plan.md`, the SKILL,
the references, the walkthrough and RECORD. Siblings I looked for: the touches
check wording in both places; "mission folder in your checkout" in the old
text (gone); the `<id>:` prefix rules in the walkthrough's descriptions; the
`-2` naming in the sample fixtures.

**Personal terms:** none in `skills/` or `templates/`. The walkthrough has
this machine's absolute paths and a scratch path (Noted N2).

## Act on

None.

## Consider

- **C1. "Do not wait for the agent to finish" no longer fits where the report
  is.** SKILL §4 ends with "The report on disk is the review's result. Once it
  is written, read it and move on; do not wait for the agent to finish after
  it." That sentence came from the kit's reviewers that kept running for hours
  after the report. Now the report sits in the reviewer's worktree and its
  path comes in the agent's hand-back, so the orchestrator is told where it is
  only when the agent returns. Say either that the path is predictable
  (`<checkout>/.claude/worktrees/agent-<agentId>/docs/missions/<mission>/<file>`,
  with the agent id from the Agent result) so the orchestrator can read it as
  soon as it exists, or drop the sentence. Reproduction: read §4 end against
  `reviewer.md` intro ("Hand back its absolute path"). Not blocking: the
  hand-back arrives when the reviewer stops, which `reviewer.md` tells it to
  do the moment the report is written.
- **C2. o2's two briefs are not written out.** The plan's Done-when asks for
  "the brief for each order". The walkthrough gives o1's builder and reviewer
  briefs in full and says "same brief shape" for o2 (plus the base commit for
  the light-mode final review). A fresh reader can reconstruct it, so Consider.

## Noted

- N1. C2 (the harness refusing a write outside the agent's worktree) was
  probed in auto mode only; RECORD and the walkthrough say so. Phase 3's
  dispatch tool should settle it.
- N2. The walkthrough and one scratch command contain `/home/tizh/...` and
  `~/scratch/troupe-workflow/`; the sample mission is made up, but the
  project's scratch folder is `~/scratch/troupe/`. Harmless; `<repo>` would be
  more portable.
- N3. RECORD says the check's "paths resolve from the check file, so any cwd
  works". The fixture paths do; the command's `--import ./docs/...` is
  relative, so it works from the repo root or the mission folder (with
  `./register.mjs`), and from elsewhere only with absolute paths. I ran all
  three.
- N4. The two pane limits (a fixed order stays "reviewed"; `stepOf` never
  returns "Final review") are in RECORD for Phase 3; the check's `stateOf` is
  fed no agents, so the `<id>:` rule itself is not exercised by it (the p1
  tests cover it).
- N5. After p2 lands the check must be re-run against the new `hooks/`; RECORD
  says so.
- N6. Not verified by me: a fresh agent following the skill live (the
  walkthrough is written, hashes and ids are placeholders, as stated), and
  the base commit after a rebase onto the trunk (the plan expects one before
  the MR; `git merge-base` is then re-taken).

## Dismissed

- **o2 changing skill files outside `docs/missions/workflow/`.** Declared in
  the amended `touches`, the only way to land the two leftovers and C2, and
  reviewed here as carefully as o1.
- **Subagent-in-subagent for the slim pass.** Checked in my first report: the
  `Agent` tool is listed for a general-purpose subagent on 2.1.304.
- **The `sample/` folder under `docs/missions/workflow/`.** `newestMission`
  only looks at `docs/missions/<name>/plan.md`, so the pane never takes
  `sample/` for a mission.
- **Gaps 1 and 4 left open.** Within the plan: a plan-check CLI is out of
  scope, and `effort` belongs to the dispatch tool.

## Verdict

PASS
