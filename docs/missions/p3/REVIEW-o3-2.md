# Order re-review: p3 / o3 (fix round)

Reviewer rev.r1 (Sonnet 5.5). `order/p3/o3-fix` at 7918269 (one commit on
`order/p3/o3` 846836a). Previous report: `REVIEW-o3.md` (verdict `FAIL: 1
Act-on findings`). `claude --version`: 2.1.306 (Claude Code). Diff:
`hooks/approval.ts`, `tests/approval.test.ts`, both declared.

## How I checked

- `./check.sh` in my worktree: exit 0, `tsc: clean`; `claude plugin test` 55
  pass, 0 fail (9 approval tests); panel node 5/5; walkthrough holds.
- Read the diff of `hooks/approval.ts` and the four new test titles.
- Drove the fixed dialog live in a scratch session (own tmux server, scratch
  repo with the sample mission, orchestrator `claude --plugin-dir <o3-fix tree>
  --model haiku`, answered with tmux keys); server and folder deleted afterwards.

## The previous findings

| Finding | Verdict | Evidence |
| --- | --- | --- |
| **Act on 1**: an unattended dialog might approve | **Addressed**, by a different route than ruled; I accept it | See below. |
| Consider 1: what a person must still check | n/a (manual acceptance, below) | |
| Consider 2: the Change dialog highlighted `Approve` first | **Addressed** | Live: the second dialog draws `1. Not now  2. Approve  3. Type something.` with the cursor on `Not now`; Enter there answered `Not approved; /troupe asks again.` and wrote no record. Test pins the option order. |
| Consider 3: `approve` typed under Other did not approve | **Addressed** | Live: ` approve ` typed under Other in the first dialog wrote `APPROVAL.json` (hash equal to `sha256sum plan.md`, as before) and answered `The plan is approved (…)`. Labels compare trimmed and case-insensitively (`is`); words that are not a label still go to the conversation. |
| Noted 4: no test for "dialog already open" | **Addressed** | New test: a second `/troupe` while the first dialog is held open answers `The approval dialog is already open.` and the first then approves. |

### Act on 1: the route changed, the protection holds

The ruled route (`$.tool.call` of `AskUserQuestion`, then refuse an answer
carrying `afkTimeoutMs`) does not exist: the engine refuses a plugin's own call
(`that is $.ui.ask`), which `claude plugin test` shows. dev.b2 read the 2.1.306
build instead: an auto-resolved dialog submits only the answers already given,
so a single-question single-select dialog comes back with none, and `gate` now
approves **only** on a non-empty answer that spells `Approve`; blank,
whitespace and dismissed are `Not approved`.

I accept that in place of the ruled route:

- It is fail-closed on the one thing that matters. An approval needs the
  word `Approve` to come back from `$.ui.ask`; an auto-resolve with no answers
  gives an empty string, a stray value gives words that go to the conversation
  as a change request, not an approval. I see no auto-resolve path that
  produces `Approve` without a person choosing or typing it: the Change dialog
  (also one question, none given) is the same case.
- I tried to reproduce the auto-resolve and could not: a dialog left idle for
  170 s in my scratch session did not resolve itself, so whatever triggers it
  (a longer idle, an unattended mode) is not in that window. This is the same
  as dev.b2's: the claim rests on the build's code, not on an observed result.
  I also still could not find `afkTimeoutMs` in the laid types (the
  field name rests on the build).
- The one-hook option dev.b2 offers (`on('tool.call', { tool:
  'AskUserQuestion' })` in `register.tsx`, refusing a result with
  `afkTimeoutMs`) would close even a path I cannot see; it is the better
  belt-and-braces and stays a Phase 3 option, as orch.lead decided. I do not
  hold the order on it.

## Regressions

None. Approve still writes the hash of the plan that was shown; an approved plan
asks nothing; an edited plan asks again; a plan with problems asks nothing;
`Change` with words still goes to the conversation (code path unchanged, and the
earlier live check of the timer submit stands); `dispatch.test.ts` is untouched
and green.

## Consider

None new.

## Noted

1. After the fix, typed words equal to `Approve` in either dialog still approve
   (by design: someone who types it means it).
2. The 170 s idle test is not a proof that auto-resolve never fires; it is
   all I could try.

## Manual acceptance

1. Tianqi's live check in dev.b2's tile, as before. The live mod there is still
   846836a, so it shows `Approve` first after Change until it is reloaded;
   the fix round's only visible change is `Not now` first after Change. I saw
   it work in my scratch session; what remains is his own screen.

PASS, 1 item for manual acceptance
