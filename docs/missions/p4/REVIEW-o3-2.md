# Re-review: p4, order o3 (troupe_metrics)

Reviewer: rev.r1. Branch `order/p4/o3-fix` at ebdc0d3 (one commit on `order/p4/o3` 0202ca7; `hooks/metrics.ts`
and `tests/metrics.test.ts` only). Previous report: `REVIEW-o3.md`. `claude --version`: 2.1.308.

## The previous Act-on finding

1. **`diff_size` counted troupe's own record files: addressed.**
   Both git calls now carry the pathspec `-- . ':(exclude)docs/missions/<mission>'`: the per-order
   `git show --shortstat --format= <merge>` and the mission's `git diff --shortstat <base> <tip>`
   (`gather`, the shared `product` list). The sheet says so in a new `quality.diff_size_from`.
   Checked in real git with the exact argv shape (`git -C <root> …`, run from another cwd): the earlier
   repro (a 40-line product file plus `plan.md`, `DONE-o1.md`, `REVIEW-o1.md`) now prints `1 file changed,
   40 insertions(+)` for both the merge commit and the base-to-tip diff, where it printed 4 files and 43
   lines before. A commit that touches only the mission folder prints nothing, which `shortstat` reads as
   zeros, so a records-only merge is not an error. The order merge list itself (`git log base..branch`) has
   no pathspec, so such a merge is still found and its wall time kept.
   The test asserts both argvs exactly, pathspec included.
   Siblings: looked for another count of diff size (`rework.churn_lines` is `null`; nothing else): none.

## The Considers

1. **Fixer counted as reviewer: addressed.** `roleOfSubagent` now tests `cut|cuts|fix|fixer|fixes` before
   `review|slim pass`; `fix final review findings` is a builder, and the helper test says so. The mirror
   case remains (a reviewer whose description happens to contain "fix", such as `re-review after the fix`,
   now counts as a builder). Only the final review's re-review is a subagent (an order's re-review is a role
   window, found by its worktree), and the skill names no description for it, so this is Noted below, not
   a finding.
2. **Base commit: addressed.** A new `base_commit_from` names the branch the base was read against and
   says to run `troupe_metrics` before any fetch after the merge, which is the skill's teardown order;
   asserted in the main test.

## Nothing else broke

The diff is 22 lines added and 5 removed, in `metrics.ts` and its test; the wiring, the reader and the
approval change are untouched. `./check.sh` with tsc (the fresh types laid earlier from o3's tree): exit
0, 79 plugin tests pass, panel tests pass, walkthrough holds, `tsc: clean`. `git merge-tree` of
`order/p4/o3-fix` onto the mission branch (still 8d017da) is clean, and the changed files are the same five
as before, all under o3's `touches`.

## Noted

1. **Subagent role is still a description heuristic.** With the order flipped, an unmatched or ambiguous
   description goes to the other side (see Consider 1). Having the skill name the final re-review's and the
   cutter's descriptions (`final re-review`, `slim cuts`) would end it; for the acceptance run, whoever
   writes the descriptions can avoid "fix" in a reviewer's.
2. **The mission folder is relative to the session's directory.** `docs/missions/<mission>` is resolved as
   every other path in the mod is, against the orchestrator's checkout root; a session started in a
   subfolder of the repository would exclude the wrong path. Same assumption as `dispatch.ts`; no change
   asked.

## Dismissed

- "The `:(exclude)` pathspec needs a recent git": it is available since git 1.9; this machine's git
  runs it.

## Verdict

PASS
