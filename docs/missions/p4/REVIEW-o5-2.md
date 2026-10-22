# Re-review: p4, order o5 (README, ROADMAP outcome, RECORD, plugin.json)

Reviewer: rev.r1. Branch `order/p4/o5-fix` at 7d05774 (one commit on `order/p4/o5` 18b7528; `README.md`,
`ROADMAP.md`, `docs/missions/p4/RECORD.md`: 11 lines added, 10 removed). Previous report: `REVIEW-o5.md`.
`claude --version`: 2.1.308.

## The previous Act-on findings

1. **The README's stale claims: addressed.**
   - "Approving the plan" now quotes the prompt as `hooks/approval.ts:106` writes it: `Change asked in the
     plan dialog: <words>; edit <mission folder>/plan.md, then /troupe again` (the code's `${dir}` is the
     mission folder).
   - Known limits now says troupe starts role windows "with `claude --model`, `--effort` and
     `--permission-mode` only", which is what `dispatch.ts` passes and what `README.md:153` already said;
     the `--bare` point is unchanged.
   Siblings: `grep` for `Tianqi asks`, for the old "`claude --model <model>` only" wording and for "tsc
   skipped" over README, ROADMAP and RECORD finds none left.
2. **"tsc skipped": addressed.** `ROADMAP.md` now says `./check.sh` exit 0 on the integrated branch with 88
   plugin tests, 7 panel tests, the walkthrough check and `tsc: clean` (engine types laid); `RECORD.md` says
   `tsc: clean` run by the orchestrator and by rev.r1 with the types laid, the builders' own worktrees having
   none. Both are true: I have run it with the types on every branch of this mission, and again now.

## Nothing else changed

The diff touches only those three files and only those sentences (plus a reflow of two paragraphs); no
tool, field, number or file name moved. `./check.sh` on the branch, with tsc: exit 0, 88 plugin tests, 7
panel tests, walkthrough holds, `tsc: clean`. `git merge-tree` onto the mission branch (still ea29038) is
clean.

## Noted

The README's "Approving the plan" line is longer than the others after the edit (a wrap, no wording
issue). Nothing else.

## Verdict

PASS
