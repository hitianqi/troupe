# workflow record: the mission workflow as a skill

Run on 2026-10-20 on `claude --version`: **2.1.304 (Claude Code)**, Node
v22.23.2. Two orders on `feature/NO-JIRA-workflow`: o1 (opus)
wrote the skill; o2 (sonnet) walked a
sample mission through it. Reviews: `REVIEW-o1.md`, `REVIEW-o1-2.md`, and
o2's, which is also the final review.

## What was built

- **o1**: `skills/troupe-mission/` (`SKILL.md`, `references/orchestrator.md`,
  `builder.md`, `reviewer.md`, `scripts/slim_numbers.sh`) and the
  de-personalized `templates/REVIEW.md`, `SLIM.md` and `plan.md`: the kit's
  workflow for one session as orchestrator, in the shapes the pane reads.
- **o2**: `WALKTHROUGH.md`, a written two-order sample mission taken through
  the skill (one order fails once and is fixed, light mode, the three gates,
  teardown), with ten places where the skill could not be followed and what
  changed; the fixtures `sample/` (plan, `REVIEW-o1.md`, `REVIEW-o1-2.md`,
  `REVIEW-o2.md`); `check-sample.mjs` with `resolve.mjs` and `register.mjs`;
  this record. In the skill: the two wording leftovers of `REVIEW-o1-2.md`
  (the touches check names the last reviewed branch; `builder.md` step 2),
  the C2 fix below, and three small gaps the walkthrough found (base
  commit, previous report for a re-review, the mission folder is not
  "uncommitted work").

## The check

```
node --import ./docs/missions/workflow/register.mjs --experimental-transform-types --no-warnings docs/missions/workflow/check-sample.mjs [folder]
```

Run it from the repo root as written: the `--import` path is relative to
the cwd. From elsewhere, give `register.mjs` and the check by absolute path;
the fixtures and hooks are found from the check file either way. It imports `hooks/plan.ts` and
`hooks/read-state.ts` unchanged and checks that the sample reads with no
plan problems, as two orders in layers `o1 > o2`, light, each order
`reviewed` from the REVIEW files, and the step "MR OK?". It exits 1 on any
failure; the broken copy in `WALKTHROUGH.md` fails three checks. The
`'claude-code'` stub in `resolve.mjs` stands in only for the engine calls
`stateOf` does not make: `read-state.ts` imports `atom, read, update` and only
its poll uses them. It does not import anything from `docs/missions/p2/`.

## C2: where the reviewer writes its report

The skill as o1 wrote it told the reviewer to write into the orchestrator's
checkout. Probes by o2's builder (Claude Code 2.1.304, **auto mode**), haiku
subagents with `isolation: "worktree"`:

- A write to `<session checkout>/docs/missions/c2-probe/REVIEW-probe.md` was
  refused by the harness, not by a permission prompt: "This agent is isolated
  in the worktree <session checkout>/.claude/worktrees/agent-<id>. Edit the
  worktree copy of this file instead of the shared-checkout path."
- A write outside any repo succeeded without a prompt (auto mode; other modes
  were not tried).
- A write to `docs/missions/probe/REVIEW-o1.md` inside the agent's own
  worktree, untracked, succeeded. The engine kept the worktree because of the
  file; the session read the report there. `git worktree remove` refused it
  ("contains modified or untracked files, use --force"); after the file was
  deleted it succeeded, and `git branch -D worktree-agent-<id>` removed the
  leftover branch.

Outcome in the skill: the reviewer writes the report in its own worktree at
`docs/missions/<mission>/<file>`, untracked, and hands back the absolute
path; the orchestrator copies it into its own mission folder (where the pane
reads it) and commits it with the merge, or with the slim or final-review
step; teardown deletes the copies in the reviewer worktrees before `git
worktree remove`, never with `--force`. Changed: `SKILL.md` §4–§8,
`references/reviewer.md`, `references/orchestrator.md` (Merge, Slim, Land,
Teardown).

A third probe showed that a worktree subagent can read a file in the
session checkout by its absolute path (the Read of
`<checkout>/docs/missions/p1/RECORD.md` succeeded, no prompt), so a
re-review can read the previous report where the orchestrator copied it.
Not verified: the other permission modes.

## Pane limits o1 found

- An order stays `reviewed` while a fixer works on it after a failed review:
  `stateOf` returns `reviewed` as soon as any `REVIEW-<id>…` file exists,
  whatever its verdict, and the fixer's `<id>:` description is ignored.
- `stepOf` never returns "Final review". A full mission goes Slim → Cut →
  "MR OK?" once `REVIEW.md` exists; the final review itself shows as Cut.
  Past "MR OK?" the pane knows nothing (the gates are Phase 2).

## For `check.sh` and `tests/` once p2 has merged

- Add the walkthrough check as a test under `claude plugin test`: run
  `check-sample.mjs` as a child process (it needs the flags above) and expect
  exit 0 on `sample/` and exit 1 on a copy without o2's `depends_on`. Or one
  line in `check.sh` after the plugin test, running it on `sample/` only. If
  p2's resolve hook lands in `tests/`, `resolve.mjs` can go and the command
  shrinks to its flags.
- After p2 rebases `hooks/`, run the check again: it reads the reader as it
  then is.
- README: one line under the install or skills part, once the plugin ships the
  skill: "The plugin carries a skill, `troupe-mission`, that runs a mission
  from brief to merged MR in the file shapes the pane reads."

## What Phase 3's code half still needs from the skill

- **`troupe_dispatch`** replaces the Agent tool and the `oN:` description
  (`SKILL.md` says so). It needs the dispatch inputs the briefs already carry
  as fields: order id, branch name, model, effort, the files to read and the
  base commit. Today `effort` has no clear home on the Agent tool (Gap 4).
- **Role windows** need the roles' boundaries the skill states: who writes
  which file (only the orchestrator merges and commits; the reviewer's report
  is untracked in its own worktree).
- **The approval dialog** needs the three gates' questions in a fixed shape
  (what is approved, the recommendation, open decisions, each order's model,
  the plan path), as `SKILL.md` §3 and §8 give them in prose.
- **`metrics.json`** has no source yet: the skill records nothing about
  rounds, reviews per order or time.
- A plan-check command for a project without the pane (Gap 1): the check's
  `readPlan` call is the start of one.
