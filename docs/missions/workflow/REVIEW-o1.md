# Review: workflow, order o1 (the mission workflow as a skill)

Order review of `order/workflow/o1` (tip ec6a082, one commit on de2efe1), by
rev.r1. Report only. Claude Code 2.1.304.

## What I did

- Read `plan.md` (Intent, Done when, Out of scope, o1 and its proof) and the
  diff against de2efe1: 8 files, all under `skills/troupe-mission/`,
  `templates/{REVIEW,SLIM,plan}.md`. `git diff --name-only 5761d26 ec6a082`
  adds only those plus the plan, so o1 stays in its `touches`.
- Ran `claude plugin validate .` in my worktree: passes. The advice about a
  README install line is not a verdict item (README is out of scope).
- Ran `./check.sh`: exit 0, 22 pass, 0 fail, tsc skipped (no types laid, as on
  main). Did not run `slim_numbers.sh` (needs the network); `diff` against the
  kit copy shows header comments only.
- Grep over `skills/` and `templates/` for personal terms, seat names, Slack,
  `rig queue`, OpenRig, CULTURE, kit path, `exit failed`, Chinese gate names:
  one hit, the credit line ("adapted from a personal multi-agent mission
  kit"), which names no person. I also read the text for paraphrases: none.
- Read the SKILL and the three references against `hooks/plan.ts`,
  `hooks/read-state.ts` and `hooks/yaml.ts` at the branch base, the kit's
  `tianqi-mission*.yaml`, `plan_lint.py` and the three role prompts, then
  checked the hand-back's two cross-check tables line by line.
- Checked the worktree mechanics the skill relies on against FEASIBILITY Q6
  and a scratch repo (below).

Depth: text only, so I read every line of the skill and references and the
template diffs; nothing to drive. The pane contract rules I checked by reading
the reader, not by running a mission (that is o2's walkthrough).

## Act on

**A1. A fixer or slim-cut builder cannot do what builder.md tells it, in the
worktree the skill gives it.**
`SKILL.md` step 4 starts every builder with `isolation: "worktree"`, which
FEASIBILITY Q6 shows is cut from the session's HEAD (the mission branch) on a
new `worktree-agent-<id>` branch, and kept with its branch when it holds a
commit. But:
- `builder.md` "Fixing review findings" says to fix "on the branch the review
  was about (the order branch ...)". The fixer's worktree has the mission
  branch's tree, without the order's commits, and the order branch is checked
  out in the first builder's kept worktree.
- `builder.md` "Making the slim cuts" and the final-review fix say to work
  "on the mission branch". That branch is checked out in the orchestrator's
  checkout, and it is the one the orchestrator alone writes.

Reproduction (scratch repo): after `git worktree add ../b1 -b
worktree-agent-1` and `git branch -m order/m/o1` in `b1`, a second worktree
running `git checkout order/m/o1` fails with "'order/m/o1' is already used by
worktree at ...b1"; `git checkout mission` fails the same way for the branch
the first worktree is cut from. So the text sends a fresh session at a dead end
on its first fix round, the loop every failed review takes. The skill never
says where the fixer starts, which branch carries its commit, or that the
orchestrator then merges it (the "only writer" rule needs that last part
stated). Fix in text: say how the fixer gets the order's tree (for the order
fix, the order branch is checked out detached after the builder's worktree is
removed, or the fixer starts from it; for the mission-branch fix and the slim
cuts, it works on its own branch cut from HEAD and hands that branch back), and
that the orchestrator merges the result.
Siblings I looked for: the same wording in `orchestrator.md` Merge item 2 and
Slim section ("a fixer on the order branch", "a builder for one round of cuts
on the mission branch"); the reviewer's `git checkout --detach` is fine.

**A2. plan.md is never committed before dispatch, but builders' worktrees come
from HEAD and builder.md needs plan.md in them.**
Step 2 writes `docs/missions/<mission>/plan.md`; step 4 creates the mission
branch and dispatches. No step commits the plan on the mission branch (the
word "commit" appears nowhere in SKILL.md for the plan). A builder's worktree
is cut from HEAD (FEASIBILITY Q6), so an uncommitted plan.md is not in it.
`builder.md` steps 1 and 3 read the order from `plan.md` and tell the builder
to change `touches` "in `plan.md` in the same commit", which only works when
plan.md is tracked there. The brief gives "the plan's path", which for a
worktree is a different file from the orchestrator's. This mission's own
history shows the real order (plan commit de2efe1, then dispatch), so the fix is
one sentence: after the plan gate, commit plan.md on the mission branch before
dispatching, and give builders the path inside their worktree. Sibling: the
same gap for the mission-folder path the reviewers get (the skill does say
"absolute path ... in your checkout" for those, so only the builder side is
missing).

## Consider

**C1. Brief paths for subagents are relative.** Step 4 and the references say
"give it `references/builder.md`, `templates/REVIEW.md`" and the slim script
as `scripts/slim_numbers.sh`. A subagent in another worktree resolves those
against its own tree, not the plugin folder. Say once in SKILL.md that briefs
carry these as absolute paths. Also "two folders up from this skill's folder"
for `templates/` is a sibling of `skills/`; "next to the `skills/` folder" reads
clearer.

**C2. Reviewer writes into the orchestrator's checkout from a worktree.**
Decision 3 is right for the pane (it reads that folder) and I accept it. A
background reviewer subagent writing outside its worktree may hit a permission
prompt nobody answers. FEASIBILITY Q6 saw the harness refuse an out-of-tree
shell command. Worth one line in the walkthrough or RECORD: whether the write
went through. Not blocking.

**C3. Which mission the pane shows.** The pane picks the plan.md changed last
(`newestMission`). A skill that edits another mission's plan.md while one is
running moves the pane. One sentence under "The shapes the pane reads", or in
RECORD for Phase 3. Not blocking.

## Noted

- **Pane limits the builder found** (a fixer's order stays "reviewed"; `stepOf`
  never returns "Final review") match the code at 5761d26. For RECORD.
- **Slim subagent from a subagent.** The reviewer.md slim pass has a reviewer
  start an Opus subagent. I probed: a general-purpose subagent in this session
  lists an `Agent` tool, so it is possible on 2.1.304. I only read the tool
  list, I did not spawn one. If the orchestrator runs the pass itself the
  nesting is moot.
- Frontmatter `description` is wide and says when not to load it; no trigger
  eval was done (builder said so).
- Credit line "ponytail" and "deslop-GPT" are credits, not personal terms.

## Dismissed

- **Re-review numbering `REVIEW-o1-2.md`** (decision 1). Matches p0 and p1's
  files and the pane's `-\d+` pattern; the kit's `-<fix round>` would give `-1`.
  The template and reviewer.md agree with it.
- **No `oN:` prefix on reviewer and slim agents** (decision 2). Correct:
  `stateOf` counts any agent whose description starts with `<id>:` as the order
  running. SKILL, reviewer.md and the orchestrator text are consistent.
- **Hop cap dropped as a number** (decision 4). The kit's cap only bounded the
  review loop, which "two reviews, then you rule" bounds directly in the same
  words; nothing else loops without a human gate.
- **No plan_lint CLI** (decision 5). Out of scope in the plan. The SKILL's rule
  list equals `checkPlan` (id, kind, touches, why, unknown dependency, cycle,
  overlap); the diff-check command and its `plan.md` exception match
  `plan_lint.py --order`.
- **Lost kit steps or duties.** I found none lost without a reason. The table
  holds up: gates become "ask the human", Slack and queue mechanics and the
  seat teardown message are dropped as OpenRig-specific, light mode is kept,
  and the Orch §4 light-rig history is rightly omitted.
- **YAML claims.** "Block mappings and sequences, quoted and plain scalars,
  flow lists, comments; `|`/`>`, multi-line, `\u` flagged" matches
  `hooks/yaml.ts`.
- **`templates/plan.md` structure.** The diff is wording plus `skills: []`;
  the orders block, keys and headings are unchanged, and the 22 tests pass.
- **Step inference sentence.** Plan problems → Plan; all planned → Plan OK?;
  planned or running → Build; unreviewed done → Order review; light all
  reviewed → MR OK?; full: Slim, Cut once SLIM.md, MR OK? once REVIEW.md.
  Equals `stepOf`.

## Verdict

FAIL: 2 Act-on findings
