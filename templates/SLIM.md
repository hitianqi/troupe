# Slim: <mission title>

An Opus subagent of the reviewer runs this once, after every order is merged
and before the final review. It asks one question of the mission's diff: what
can go without losing quality? It reports; a builder does the cutting in one
round.

## Start from the numbers

The troupe-mission skill's `scripts/slim_numbers.sh <repo> <base commit>`
lists the duplicate blocks this mission added and the files over 1,000 lines
it touched. Without it, the same numbers come from
`npx jscpd@5.3.3 --baseline-from-ref <base> --reporters json <repo>` (the
clones marked `isNew`) and `git diff --name-only <base>` with a line count of
each file. Ask of each, and of the rest of the diff:

- Does this logic already have an owner elsewhere?
- Who reads these fields? What breaks if they go?
- Do this code and its tests or fixtures only justify each other?
- Is validation done once, at the boundary?

(The questions are from [deslop-GPT](https://github.com/MrZoyo/deslop-GPT).)

## What does not

- Anything a done-when criterion, a test or the verification harness relies on.
- Error handling at a real boundary: input from the user, the network, a child
  process, the file system.
- Logging and records the project's conventions ask for.
- Style preferences. If the cut would not make the code shorter or simpler to
  follow, it is not a cut.

Look only at what this mission added or changed. Older code is out of scope.

## Report

One entry per item from the numbers and per thing the questions turn up,
each either:

- **CUT**: the file and symbol, and what to remove or merge. **Why it is
  safe**: who calls it, and why behaviour does not change. **Proof**: what the
  builder should run to show nothing broke.
- **Stays**: one line on why.

No CUT entries is a fine result. Do not pad the list.
