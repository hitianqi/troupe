# Review: p4, order o2 (the troupe-mission skill and templates)

Reviewer: rev.r1. Branch `order/p4/o2` at abf2149, diff `feature/NO-JIRA-p4...order/p4/o2`
(6 files, text only: `skills/troupe-mission/`, `templates/`). Judged against
`docs/missions/p4/plan.md` (the current one on `feature/NO-JIRA-p4`, which moved after o2 forked), not
against the builder's hand-back. `claude --version`: 2.1.308.

Depth: text, no code. Read the whole of SKILL.md, the three references and the template diffs, and read
the hooks they name line by line against it (`dispatch.ts`, `approval.ts`, `mission.ts`, `plan.ts`,
`read-state.ts`, the wiring in `register.tsx`). o1 and o3 are not merged: light mode and
`troupe_metrics` are checked against the plan's contracts. I also read o1's `dispatch.ts` diff for the
light rule, the light review brief and the effort pin.

## What I did

- **Names against code.** Every tool, argument, window name, worktree path, branch name, file name and
  refusal the skill states, against `hooks/`. All match: `troupe_dispatch {mission, order, role}`,
  `troupe_status`, `troupe_close {mission, window}` (`o1` / `review-o1`), session `troupe-<mission>` on
  the orchestrator's server, worktrees `../<repo>-<mission>-<id>` and `-review-<id>` (dispatch.ts:291),
  the reviewer on `-fix` once it exists (:293), the brief in `<git common dir>/troupe/<mission>/`
  (:299), `APPROVAL.json`, `DONE-<id>.md`, `REVIEW-<id>[-n].md`, the `<id>: ` merge subject, the
  `<id>:` agent-description prefix, the mission-branch regex, the copy on the 2 s poll for the shown
  mission (read-state.ts:98), `/troupe [mission|close]`, the plan rules in the skill against
  `checkPlan`, and the step text against `stepOf`. The refusal list is correct as far as it goes (see
  Consider 2).
- **The pane's contract shapes** are kept and extended (APPROVAL.json, DONE, the mission branch name,
  the merge subject), none renamed.
- **Light mode** as the plan's o1 says: serial, refused second order until the first is merged whatever
  `depends_on` says, no slim or separate final review, the last review is the final review with the base
  commit, pane at "MR OK?" once every order is reviewed. SKILL.md, orchestrator.md, reviewer.md and the
  REVIEW template agree with each other and with the plan and o1's diff. The template's "the brief gives
  the base commit" is what o1's `finalDuty` writes.
- **Final review kept in full mode**: skill, pane `STEPS` and the plan's decision 1 agree.
- **De-personalized.** `grep -riE 'tianqi|prover|openrig|kit|herdr|slack|rig send|qitem|大博士'` over
  `skills/` and `templates/`: nothing assumes a person, a company, OpenRig or the kit. `glab` appears only
  next to `gh` as examples. Two small leftovers in Consider 3.
- **`troupe_metrics`** is named as the plan says (`{mission}` in; path and one-line summary out), called
  at teardown after the forge check and before `troupe_close`, worktree removal and branch deletion
  (orchestrator.md step 2), with the file left untracked. The order matches what o3 reads (role windows,
  branches, the mission folder).
- **Template proof.** The unfilled `templates/plan.md` copied into a folder and run through
  `docs/missions/workflow/check-sample.mjs`: no plan problems, two orders, `layersOf` o1 > o2, `isLight`;
  the three "FAIL" lines are the stateOf/stepOf checks, expected with no REVIEW files. (The builder's
  filled-sample run was not repeated.)
- **`./check.sh`** (tsc skipped: no engine types laid in this worktree, as the builder said). On o2:
  exit 1, exit 1, exit 0. Each failure is one pane or panel timing test, a different one the first two
  times ('the pane draws the newest mission, flags a missing skill…', then 'the skill verdict follows the
  session…'). On the fork point 438bb7b: exit 1 ('the skill verdict follows the session…', the same
  test), then exit 0. Load average 5–9 throughout. o2 changes no TypeScript. So flaky, not o2's; see
  Noted 1.

## Act on

1. **The skill says effort is not passed to a role window; the plan and o1 say it is.**
   `SKILL.md:174-175`: "A role window runs at its own default effort: `effort` is shown, not passed."
   The plan's Comparison protocol and o1's goal ("dispatch pins `--model` and `--effort` per role") make
   it the opposite, and o1's branch builds it: `claudeArgv(model, effort)` runs
   `claude --model <m> --effort <role effort>` (the builder role's effort for a builder, the reviewer
   role's for a reviewer; a role the plan leaves out gets the default `high`). Once o1 merges, the skill
   tells every orchestrator that `effort` in `roles` is decorative, when it sets the cost and the
   comparison arm of each window.
   Repro: read `SKILL.md:170-176` beside the plan's "Comparison protocol" and `git diff
   feature/NO-JIRA-p4...order/p4/o1 -- hooks/dispatch.ts` (`claudeArgv`, `effortOf`).
   Not the builder's fault: the effort pin was added to the plan (b446708) after o2 forked.
   Siblings, same stale picture of what a window runs: `SKILL.md:58` ("The window runs `claude --model
   <model>`: the order's `model` for a builder, the reviewer role's for a reviewer") and
   `templates/plan.md` ("the role window runs `claude --model <model>`", in the model paragraph under the
   orders block). Looked for the same claim in `references/*.md`, `templates/REVIEW.md` and
   `templates/SLIM.md`: none there. The fix is one sentence in each of the three places: the window runs
   the role's model (the order's `model` overrides it for a builder) and the role's `effort`.

## Consider

1. **Light mode's "last order" is not defined.** The skill says the last order's review is the final
   review; o1 decides "last" as the last in dependency-layer-then-plan order. In a two-order mission whose
   `depends_on` runs against the listing order, a reader could pick the wrong one. One clause in step 4
   ("the order that runs last") closes it. Not blocking: the brief the reviewer gets says which review it
   is.
2. **The refusal list is shorter than the code's.** `SKILL.md:61-68` omits: a model the tool does not run
   (`MODELS`: opus, sonnet, haiku, fable; dispatch.ts:115), no mission branch for the mission (:124), a
   tmux session `troupe-<mission>` that troupe did not open (:286), and a worktree git cannot add. Each
   comes with its own reason in the answer, so an orchestrator that reads answers recovers; the list is
   still the one place the skill promises "every refusal".
3. **Two small leftovers for "anyone".** `orchestrator.md:159` says "Delete the mission's scratch
   folder", but no scratch folder is defined anywhere in the skill (it comes from a personal setup): drop
   the sentence or say what it is. `SKILL.md:110` gives `feature/NO-JIRA-p4` as an example mission-branch
   name: a Jira-key convention from one company; `feature/p4` shows the same rule. Also `SKILL.md:201-204`
   says "No … commands" and then asks the human to type `/troupe <mission>`.

## Noted

1. **`./check.sh` is flaky under load** (see above): 3 failures in 5 runs across two commits, a pane or
   panel timing test each time, none touching skill text. Whoever lands o2 should expect it.
2. **`hooks/approval.ts` still says "Tianqi asks: …"** in the Change prompt on this branch. The plan
   gives that line to o3 (4602d27), so it is not o2's; the skill's own text ("**Change** takes their
   words, which come back to you as a prompt") is right for any wording.
3. **A wait on `REVIEW-<id>.md` can fire while the reviewer is still writing it** (the file exists from
   the first write). The skill's wait is `until [ -f <file> ]`; the reviewer's brief tells it to say so in
   its window when done, and the orchestrator reads the file after the wake, so the usual cost is one
   short read of a partial report. Same for `DONE-<id>.md`. Not worth a rule now; the acceptance run will
   show whether it bites.
4. **The builder's follow-ups 1–5 are not o2's** and I did not re-judge them: (1) approval.ts wording is
   o3's; (2) the reviewer brief does not list the reviewer role's skills, o1's file, and `reviewer.md`
   covers it for now; (3) no fixer/slim/final-review role windows, a later phase; (4) metrics before
   close, followed in the skill; (5) kit notes, for 大博士贴, no edit here.

## Dismissed

- "The skill should say to commit `APPROVAL.json`": checked; dispatch reads it from the checkout and
  only requires `plan.md` on the mission branch (dispatch.ts:126), so committing it is record-keeping,
  which the skill says it is for.
- "Renamed or removed contract names": none; the file names the pane reads are all unchanged.
- "`troupe_close` before `troupe_metrics` would lose data": the skill orders them the safe way round.
- "`SLIM.md` template unchanged, so stale": it names nothing that changed; no personal terms.

## What I could not verify

Nothing here needs the human's eye. Not driven: a live mission with this skill (that is o4, and the
reason this order's proof is a read-through); the light serial refusal and the light review brief as
code (o1 is not merged; I read o1's diff for them but did not run it).

## Verdict

FAIL: 1 Act-on findings
