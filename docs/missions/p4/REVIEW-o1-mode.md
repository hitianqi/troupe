# Review: p4, o1 follow-up (role windows run in the orchestrator's permission mode)

Reviewer: rev.r1. Branch `order/p4/o1-mode` at 5f3d9cb (one commit on `feature/NO-JIRA-p4` 87c256b):
`hooks/dispatch.ts` and `tests/dispatch.test.ts`, both o1's `touches`. Why it exists: o4's set-up found a
role window would open in the project's `acceptEdits` (`settings.local.json`), not in the orchestrator's
`auto`, against compare.md's "same permission mode in every arm" (qitem-20261022130159-06e127b1b8b75e2c).
`claude --version`: 2.1.308. Short review: the diff is 102 lines added, 23 removed, one concern.

## What I did

- **Read the whole diff**, then checked each of the asked points on real data.
- **`./check.sh` with tsc** (fresh types, from o3's tree, still laid in my worktree): exit 0, 88 plugin
  tests pass, panel tests pass, walkthrough holds, `tsc: clean`. `git merge-tree` onto the mission branch
  (still 87c256b): clean; the changed files are the two declared.
- **The transcript line, in real transcripts.** Across every transcript on this machine that has one, the
  line is `{"type":"permission-mode","permissionMode":"<mode>","sessionId":…}` (keys exactly those three);
  it is written at session start (this session: line 4) and again on each change, so the last one is the
  mode in force (sessions that began in `acceptEdits` and were moved to `auto` end on `auto`; the final
  values seen are `auto`, `acceptEdits`, `default`). `lastPermissionMode` reads the last such line, skips
  one that is cut mid-write, and does not confuse text that merely contains the words (it requires
  `type === 'permission-mode'` after parsing, otherwise looks further back).
- **The path and the slug.** `${CLAUDE_CONFIG_DIR or ~/.claude}/projects/<slugOf(cwd or root)>/<session
  id>.jsonl`, the same lookup `metrics.ts` uses. `slugOf` against real folder names: a dot becomes `-`
  (`/home/tizh/.openrig/workspace` is `-home-tizh--openrig-workspace`), a path like
  `~/scratch/troupe/p4-run/blueprint-desktop` becomes `-home-tizh-scratch-troupe-p4-run-blueprint-desktop`,
  which is how the folders on disk are named. The session's cwd is tried first, then its root.
- **What reaches argv.** Only a value from `PERMISSION_MODES` (`default, manual, acceptEdits, plan, auto,
  dontAsk, bypassPermissions`, the `claude --permission-mode` choices plus `default`), checked in
  `lastPermissionMode`, passed as `--permission-mode <mode>` as one argv element. Nothing the model or a
  tool call supplies goes in: the mode comes from Claude Code's own record of the session, the model and
  effort are checked as before. A mode outside the list, a missing session id, an unreadable file: no
  flag.
- **The fallback is honest.** With no mode found the window opens on the project's setting and the
  answer says exactly that ("the project's permission mode (this session's could not be read)"); with
  one, "permission mode auto". The three answers (sent, not typed, still in the input box) carry it.
- **Tests.** Every dispatch argv and answer expectation now includes the mode; new ones: the last recorded
  mode wins (auto then acceptEdits gives acceptEdits); an unreadable transcript gives no flag and says so;
  `lastPermissionMode` on a cut line, an unlisted mode, and the `"mode"` look-alike.

## Act on

None.

## Consider

None that blocks the acceptance run.

## Noted

1. **`bypassPermissions` passes through, and I find that acceptable as the brief puts it ("as the person
   set it").** The windows run builders and reviewers in worktrees the human already chose to trust by
   starting the orchestrator that way; passing a weaker mode than the orchestrator's would break
   compare.md's "same mode" rule the other way. It is worth one line in the README's description of
   dispatch (o5), so nobody learns it from a window.
2. **`plan` and `dontAsk` pass through too**, and either would leave a builder window unable to edit or
   to run commands without a prompt. An orchestrator in `plan` mode cannot call `troupe_dispatch` in the
   first place, so this is theoretical; `dontAsk` is the person's choice.
3. **`dispatch.ts` now imports `slugOf` from `metrics.ts`.** No cycle (`metrics.ts` does not import
   `dispatch.ts`), and it keeps one slug rule; `mission.ts` would be the tidier home, not worth a change
   now.
4. **The transcript is read in full at each dispatch** (a few MB for a long orchestrator session) and
   scanned from the end, so the cost is the read, once per window.
5. **Not driven live**: whether `claude --permission-mode auto` in a role window needs a first-use
   confirmation on a given account is for o4 to see in the first window; the flag and the choices were
   checked by the builder against the parser (`--permission-mode bogus` refused, `default` and `manual`
   accepted).

## Dismissed

- "The mode could be forged through the transcript": the file is Claude Code's, the value must be in the
  fixed list, and the worst case is one of the list's modes, each a mode the person could pick anyway.
- "The last line may be stale after Shift+Tab": a line is written on each change (real sessions show the
  sequence), so the last is current.

## Verdict

PASS
