# Review: <mission title>

Two reviews use this template. Both report; neither fixes.

- **Order review**: each order as it lands, before it is merged. Only that
  order's diff against the mission branch, and only its behaviour. The report
  is `REVIEW-<id>.md`.
- **Final review**: once, after the slim cuts. Only problems across orders:
  the contracts between them, shared state, duplication across them, the
  integrated app. Each order already had its own review. The report is
  `REVIEW.md`.

In light mode (one or two orders) there is no slim pass and no separate final
review: the review of the last order is both. Its brief says so and gives the
mission's base commit; it does the order review's pass and the final review's,
on the whole mission diff against that base, and its report says it is both.

## Inputs

- `plan.md`: intent, done-when criteria, and the orders with their declared files
- The order's diff (order review), or the mission branch diff against its base
  commit, which the brief gives (final review)
- The previous report, for a re-review
- The project's `verify-<app>` skill, if it has one, for launching and driving the app

## Verify in your own instance

Launch the app on its own ports, data directory and build directory. Never build
in, or start a second server against, a working tree where someone already runs
a dev server. Kill only what you started; keep the evidence.

## How deep to look

Match the effort to the blast radius of each change, not to the size of its
diff. Go through the orders in `plan.md` and sort what they touched:

| The change touches | Enough |
|---|---|
| docs, CI config, tests | the project's own checks passed |
| one page or one screen | drive that path once in your instance |
| a shared component or an API boundary | drive it, and read the diff for every caller |
| auth, migrations, permissions, the global layout, deployment | read the diff line by line, and run the path yourself even though the builder already verified it; say in the report that you did both |

## Passes

- **Order review.** Drive the order's goal and proof, and read its diff for
  wrong conditions and missing error paths.
- **Final review.** Drive every done-when criterion through the integrated
  app, and read the diff only where orders meet: contracts that each side
  passed alone, shared state, logic duplicated across orders. A problem inside
  one order is out of scope unless it breaks another.

Record the entry point, the actions and what you observed.

**Siblings.** When you find a defect, look for the same mistake next to it
before you write it up: the other branch of the same condition, the older
copy of the same control, the other dialogs in the same file, the other
callers of the same helper. Report the siblings in the same finding so one
fix round closes them all, and say in the report which siblings you looked
for. (A fix once corrected the colour of one "Not exported" line and left
its older twin two screens away; it came back as its own issue.)

## What you could not verify

Verify everything that can be verified without a human. When something needs
the human's eye (a visual judgment, a product call) or an environment you
cannot drive, do not guess and do not fail the mission for it. List it as a
manual-acceptance item with entry point, preconditions, actions and expected
result, and count it in the verdict. "Recommend the user verify" is not a
substitute for a check you could have run yourself.

## Severity

- **Act on**: breaks a done-when criterion, loses data, opens a security hole,
  or breaks something that worked before. Each item needs a reproduction.
- **Consider**: a real problem that does not block this mission.
- **Noted**: worth knowing, no action proposed.
- **Dismissed**: something you checked and rejected; say why in one line.

At most five nits in total. If Act on has more than five items, filter harder.

**Match the review to what the mission ships.** A mission that ships only a
design (documents, a canvas, a contract no code implements yet) is reviewed
for what a design can get wrong: a missing source, a field nobody reads, an
element nobody feeds, a contradiction, a decision that breaks a boundary.
Runtime races, timeouts and late or lost messages in a design are Noted as
open questions for the phase that implements it, not Act on, unless the
design's own rule cannot work at all.

**Re-review.** Each review gets one fix round and one re-review, written to
`REVIEW-<id>-2.md` (or `REVIEW-2.md` for the final review). Judge each Act-on
finding of the previous report "addressed" or "not addressed". "Attempted" is
not addressed.

## Do not report

- Style the project's own checks already enforce
- Missing unit tests for UI, or missing E2E suites
- Refactors nobody asked for

## Verdict

End with one line: `PASS`, `PASS, <n> items for manual acceptance`, or
`FAIL: <n> Act-on findings`. The verdict goes back to the orchestrator. A
first review that fails goes to a fixer; a re-review that still fails goes to
the orchestrator with the Act-on findings still open, and the orchestrator
rules.

Stop as soon as the report is written. Do not re-verify, tidy, or keep an
app or stand-in running after it; hand back at once. The orchestrator reads
the report from disk and does not wait for anything you do after it.
