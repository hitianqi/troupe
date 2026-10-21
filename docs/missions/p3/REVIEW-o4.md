# Order review: p3 / o4 (docs)

Reviewer rev.r1 (Sonnet 5.5). `order/p3/o4` at ececb3c (one commit) on 9d9f031.
Judged for truth against the merged code, my earlier reviews, `FEASIBILITY.md`
and the plan. `claude --version`: 2.1.306 (Claude Code). Files: `README.md`,
`ROADMAP.md`, `docs/missions/p3/RECORD.md`, `.claude-plugin/plugin.json`: the four
declared, nothing else.

## How I checked

- `./check.sh`: exit 0, `tsc: clean`, **71 plugin tests pass**, 5 panel tests
  (the docs say 71 and 5), `claude plugin validate` accepts the 0.4.0 manifest.
- Per-order counts in RECORD (46, 57, 62, 51, 55): I had run 46, 57, 51 and 55
  in my reviews, and ran the o2-fix commit (c2c7029) in a temporary worktree: 62.
  All as written.
- Read every command, tool, file, message and rule the README names against
  `hooks/dispatch.ts`, `hooks/approval.ts`, `hooks/mission.ts`, `hooks/plan.ts`
  (including the o2 and o3 fixes) and the strings I saw live in my reviews
  (`Not asked: the plan has problems; fix plan.md first.`, `The approval dialog
  is already open.`, `Change asked: <words>`, `Tianqi asks: …; edit
  <dir>/plan.md, then /troupe again`, the refusal texts, the reopen).
- Read RECORD's facts against `REVIEW-o1.md`, `REVIEW-o2.md`, `REVIEW-o3.md`,
  `REVIEW-o3-2.md` and `FEASIBILITY.md` (twelve cases; case 12 the paste).

## Truth

Everything I checked holds. In particular: the two hard rules and the
committed-plan rule as the README states them; "done means merged"; the reviewer
refused until its branch and `DONE-<id>.md` exist (folder or builder's worktree,
as the o2 fix made it); the refusals list, including the model list, the name
pattern, a live window, a foreign `troupe-<mission>` session and no tmux;
`troupe_status` showing running/gone and "brief not sent"; `troupe_close` by kept
id only, worktrees staying; the reopen in the same worktree; the 30 s wait, the
paste and the still-in-the-box report; the copy rule (plain, untracked, absent
or older, logged once when a copy is committed since); the dialog's behaviour
after the fix round (Not now first, any-case labels, blank and Esc approve
nothing); the order-state paragraph (`DONE-<id>.md`, `REVIEW-<id>-<n>.md`, fix
round stays `reviewed`, Final review once `SLIM.md` is on the mission branch).
ROADMAP's outcome is honest about what rests on a reading rather than a run
(auto-resolve) and says "Phase 2 built", not done, with the live check pending;
light mode is moved to Phase 3 in all three places. RECORD's "seen live" matches
what I drove, including that a real builder and reviewer wrote their files.
Nothing is promised that is not built.

Known limits from the reviews: all present (advisory `APPROVAL.json`; env
inherited from the tmux server and never run on OpenRig's own; brief outside the
worktree; one mission collected; done = merged; committed result file; global
install; no live progress; `/proc` Linux only; prompts in role windows).

## Act on

None.

## Consider

1. **Say that `REVIEW.md` and `SLIM.md` are not copied by the mod.** The README's
   "Results come back as files" names `DONE-<id>.md` and `REVIEW-<id>[-<n>].md`
   only, which is right, but a reader may expect the final review's `REVIEW.md`
   and the slim pass's `SLIM.md` to arrive the same way. They do not
   (`isResultOf` is per order, as `reviewer.md` has the orchestrator copy them);
   a Known-limits line, or one sentence there, closes it (my o2 Noted 4).
2. **"No flag keeps a plugin out of a `claude` it starts"** (Known limits, global
   install) is nearly true: `claude --help` lists `--bare`, which skips hooks
   from installed plugins. It also drops other things, so it is no recommendation,
   but "no flag" is stronger than what I can show; "none that leaves the rest of
   claude as it is" is accurate.

## Noted

1. README says `troupe_dispatch` refuses "before it runs anything"; it runs
   read-only git commands (toplevel, branches, `git show`) first. It creates
   nothing before refusing, which is what matters; "before it creates anything"
   is exact.
2. ROADMAP's outcome has one overlong line where a sentence was joined
   ("…dismissed dialog. That the engine's auto-resolve…"); cosmetic.

## Dismissed

- Test counts, the 15 of 15 dry run, "never run against this checkout", the twelve
  typing cases: all match the evidence.
- RECORD's note that the o2 fix has no report of its own: true, and said so.

## Manual acceptance

None for this order (the live check is o3's, stated as pending in RECORD).

PASS
