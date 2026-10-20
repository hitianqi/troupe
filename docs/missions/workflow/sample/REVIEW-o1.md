# Review: idcheck, order o1 (the plan check flags ids that are not oN)

Order review of `order/idcheck/o1` by the reviewer. Report only.

## What I did

- Read `plan.md` and the diff against the mission branch: `hooks/plan.ts` and
  `tests/read-state.test.ts`, both declared in `touches`.
- Ran `./check.sh`: passes. Ran `readPlan` on three plans with ids `o1`,
  `o10` and `o01`.

## Act on

**A1. `o10` is flagged.** The pattern is `/^o\d$/`: one digit. A plan with ten
orders is reported as "o10: order id must be oN". Reproduction: `readPlan` on a
plan whose last order is `o10` lists that problem. Sibling checked: the message
for an empty id is unchanged.

## Consider

- None.

## Noted

- The new test covers `o01` only, not `o10`; fixing A1 should add that case.

## Dismissed

- The message wording differs from the other problems' (`<id>: ...`): it follows them, so nothing to change.

## Verdict

FAIL: 1 Act-on finding
