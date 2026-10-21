# Final re-review: p3 (fix `order/p3/fix`)

Reviewer rev.r1 (Sonnet 5.5). `order/p3/fix` at 654b287, one commit on the
mission tip 7a74d57. Previous report: `REVIEW.md` (PASS, 2 items for manual
acceptance, one Consider). `claude --version`: 2.1.306 (Claude Code).

## The previous finding

**Consider 1** (the panel still read `needs you ◆ Plan OK?` after Approve):
**addressed**, in both views.

Driven live in my own scratch session (own tmux server, scratch repo with the
sample mission, `claude --plugin-dir` on this tree, answered with tmux keys;
server and folder deleted afterwards):

| State | Panel gate | Orchestrator line |
| --- | --- | --- |
| Dialog up, no record | `◆ Plan OK?` | `needs you ◆ Plan OK?` |
| After Approve | `✓ Plan OK?` | `idle` |
| `plan.md` edited by one newline | `◆ Plan OK?` | `needs you ◆ Plan OK?` |
| Edit reverted (the record holds again) | `✓ Plan OK?` | `idle` |
| `APPROVAL.json` removed | `◆ Plan OK?` | `needs you ◆ Plan OK?` |
| Record put back | `✓ Plan OK?` | `idle` |

The in-session pane (`/troupe close` brings it back) agrees: `✓ Plan OK?` and
`idle` with the record, `◆ Plan OK?` and `needs you` with it removed. Each change
showed within the 2 s poll.

## No regression

- `./check.sh`: exit 0, `tsc: clean`; **73 plugin tests** pass (71 + 2), panel
  node 6/6 (5 + 1), the workflow walkthrough holds. No golden moved
  (`tests/panel.node.mjs` gained a case, `tests/pane.test.tsx` and
  `read-state.test.ts` gained cases; no expected screen was edited).
- **The dialog and dispatch rules are unchanged in behaviour.** `approvalOf`,
  `gate` and `writeApproval` read as before; `readApproval` is now
  `recordOf(file text)` and `planHash`/`APPROVAL_FILE` moved to `mission.ts`
  (re-exported from `approval.ts`, so `dispatch.ts` and the tests import the same
  names). The hash and the record's reading have one definition now, used by the
  dialog, the dispatch rule, the pane and `bin/troupe-panel`.
  In my drive, with the record put back by hand, `troupe_dispatch o1` was
  accepted and opened its window, and `troupe_close` closed the session.
- Read the diff: `stepOf` answers `Build` only when every order is `planned` and
  the record holds for `plan.md` as it is now; plan problems still come first,
  an edited plan or a missing or unreadable record gives `Plan OK?` again,
  and every later step is unchanged. The pane keeps the plan's text with its
  parse and re-reads the record each poll; the panel reads the file beside
  `plan.md` and treats a missing one as not approved.

## Act on

None.

## Consider

None new.

## Noted

1. The record is read and the plan hashed on every poll (2 s) in both views; the
   plan is about 20 KB, so the cost is negligible, and the pane re-hashes only
   what it already holds.
2. The `Final review` step is still computed and not drawn (Noted 1 of
   `REVIEW.md`); unchanged.

## Manual acceptance

1. Tianqi's live check in dev.b2's tile, and prompts inside role windows, as in
   `REVIEW.md`: unchanged and still his.

PASS, 2 items for manual acceptance
