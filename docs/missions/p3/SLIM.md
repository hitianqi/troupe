# Slim: p3, dispatch, role windows and the approval dialog

Slim pass by rev.r1's Opus subagent over `git diff da96337..HEAD` on
`feature/NO-JIRA-p3` (176584a), read only. Numbers from the kit's
`scripts/slim_numbers.sh <worktree> da96337`. I spot-checked the CUT claims below
by grep before writing them down (the `approval` atom has no reader, `.brief` is
never read, `doneOrders` has one caller, the three tool-name constants are used
once each, the `register.tsx` comment is stale). Five small code cuts; everything
the numbers flagged stays. Already ruled by orch.lead for the same round, not
repeated here: the "Plan.md changed" capitalisation, README on `REVIEW.md` and
`SLIM.md`, the `--bare` softening, "refuses before it creates anything".

## From the numbers

- **Stays**: `docs/feasibility/p3-c10-big-keys.txt:1-26` = `p3-c11-big-paste.txt:1-26`.
  Both are the 57-line brief echoed back: the two arms of case 5 (keys against
  paste, `docs/FEASIBILITY.md:481`); they differ in the outcome lines 26-27.
- **Stays**: c04 = c05a:5-21, c04 = c05b:1-15, c03 = c04/c05a, c02 = c03 (lines
  1-6 and 6-11), and the shared footers with c05b and c10. Cumulative captures
  of one window: each holds the earlier cases as scrollback, and each is still
  the raw capture of the moment its case cites (`FEASIBILITY.md:477-482`). c02
  and c03 carry the version banner c04 has lost; c05a/b are case 6's before and
  after. Dropping c02/c03 would save doc lines and lose the per-case snapshot.
- **Stays**: `p3-c06b:1-6` = `p3-c07:1-6` = `p3-c06c:1-6`: the same banner and
  prompt, three different outcomes (manual prompt, auto, keys into the prompt),
  cited for cases 7 and 8.
- **Stays**: `p3-c2-role-o1-landed.txt:1-7` = `docs/missions/p3/dry-run/output.txt:31-38`:
  different runs (o1's build check, `FEASIBILITY.md:572`; the dry run the done-when
  asks for), both cited.
- **Stays**: `tests/approval.test.ts:47-56` = `tests/dispatch.test.ts:103-112`: the
  fs read/write handlers of two different fake worlds; sharing them needs a
  parameterised helper that is no shorter.
- **Stays**: `tests/dispatch.test.ts:428-434` = `:476-482` = `:495-501`: a five-line
  arrange step; a helper saves a few lines and hides the setup each test reads.
- **Stays**: no touched file is over 1000 lines.

## From the questions

- **CUT**: the `approval` atom in `hooks/approval.ts:16`, its writes at `:44`
  (`writeApproval`) and `:54` (`approvalOf`), the state key `approval:
  TroupeApproval | null` at `types/index.d.ts:93-94`, and the then-unused `dir`
  field of `TroupeApproval` (`types/index.d.ts:49-50`; set in `approval.ts:34`,
  `:44`, `:46`); drop the `atom` and `update` imports at `approval.ts:1`.
  **Why it is safe**: nothing reads the atom (no `read($, approval)`, no
  `state.troupe.approval` in hooks/, bin/ or tests/). Every decision re-reads
  `APPROVAL.json` (`approvalOf`, used by `dispatch.ts:128` and `gate`). The only
  fields used are `reason`, `record.approvedAt` (`approval.ts:110`, `:119`) and
  `planHash` (`:58`); the file on disk holds only `planHash` and `approvedAt`.
  The plan asked o1 to declare the key, but no done-when criterion or test relies
  on it.
  **Proof**: `./check.sh` (71 plugin tests, `tsc` clean; notably
  `tests/approval.test.ts:82`, `:144`, `tests/dispatch.test.ts:189`, `:199`,
  `:320`), then `grep -rn "'approval'\|approval:" hooks types` shows nothing.

- **CUT**: the fallback in `writeApproval` (`hooks/approval.ts:41-42`): make
  `plan` a required parameter and drop `?? (await $.fs.read(`${dir}/plan.md`))`.
  **Why it is safe**: its only caller is `gate` at `approval.ts:119`, which always
  passes the plan text it showed (`REVIEW-o3.md` makes that a requirement); no
  test imports `writeApproval`.
  **Proof**: `./check.sh`; `tests/approval.test.ts:82` and `:144` pass.

- **CUT**: `doneOrders` (`hooks/dispatch.ts:107-112`): inline it at its one call
  site, `dispatch.ts:149`, as `(await gitFacts(args => ok(run($, ['git', '-C',
  root, ...args])), name, plan.orders.map(one => one.id)))?.merged ?? []`.
  **Why it is safe**: `rule` is its only caller (grep) and tests do not import it
  (`tests/dispatch.test.ts:5` imports `isReady`, `isUnsent`, `READY_MS`, `SENT_MS`).
  **Proof**: `./check.sh`; `tests/dispatch.test.ts:209` and `:218` pass.

- **CUT**: the REVIEW-file pattern is written three times: `hooks/mission.ts:49`
  (`stateOf`), `hooks/dispatch.ts:90` (`isResultOf`), `hooks/dispatch.ts:260`
  (`reviewerBrief`'s round count). Export one `isReviewOf(id, name)` from
  `hooks/mission.ts` next to `doneMarker` (`:40`), using `stateOf`'s escaped form;
  `stateOf` becomes `files.some(file => isReviewOf(id, file))`, `isResultOf`
  becomes `name === doneMarker(id) || isReviewOf(id, name)`, `reviewerBrief` uses
  `files.filter(name => isReviewOf(m.order.id, name))`.
  **Why it is safe**: mission.ts already owns order state from files; the
  dispatch copies match the same names, because those ids passed `NAME`
  (`dispatch.ts:33`: letters, digits, `_`, `-`), so escaping changes nothing.
  **Proof**: `./check.sh`, especially `tests/read-state.test.ts:129`, `:200` and
  `tests/dispatch.test.ts:391`, `:417`, `:428`, `:495`.

- **CUT**: the `brief` field of `TroupeRoleWindow` (`types/index.d.ts:67-68`) and
  `brief` in the record at `hooks/dispatch.ts:318`.
  **Why it is safe**: written once, never read. `status` (`dispatch.ts:353`) prints
  `isBriefSent` and `worktree`; every message that names the brief uses the local
  `brief` (`:323`, `:331`, `:335`). Grep for `.brief` in hooks/ and tests/ finds
  nothing, and the state test at `tests/dispatch.test.ts:218-257` does not check
  the record's shape.
  **Proof**: `./check.sh`, including `tests/dispatch.test.ts:218`, `:290`, `:303`.

- **CUT**: `DISPATCH`, `STATUS`, `CLOSE` (`hooks/dispatch.ts:42-44`): write the names
  directly at `:422`, `:437`, `:443`.
  **Why it is safe**: each is used once and nothing outside dispatch.ts imports
  them; the hooks at `:452`, `:455`, `:458` already spell `mcp__troupe__troupe_*`
  out in full, so the constants do not keep the two spellings in step anyway.
  **Proof**: `./check.sh`; grep shows the three tool names registered and hooked.

- **Stays**: several exports have no importer (`MODELS`, `windowName`,
  `claudeArgv`, `argv`, `typedPrompt`, `isResultOf`, `rule` in dispatch.ts;
  `readApproval`, `Approved` in approval.ts). Removing `export` makes nothing
  shorter: style.
- **Stays**: asking tmux twice in `liveSession` (`dispatch.ts:174`), `forget` on a
  gone session (`:291`), the `told` set (`:383`): deliberate o2-fix behaviour
  (`RECORD.md:63-67`) or real failure paths.
- **Stays**: the SLIM.md term in the git cache key (`read-state.ts:57`,
  `bin/troupe-panel:66`) and `isSlimMerged` in `gitFacts` and `stepOf`: the "Final
  review" leftover the done-when asks for.
- **Stays**: the `$.ui.log` catches at `register.tsx:94`, `read-state.ts:95` and the
  `.catch` deny wrappers at `dispatch.ts:452-462`: error handling at the boundary.
- **Stays**: `docs/feasibility/p3-c1-tprobe3-register.ts`,
  `docs/missions/p3/dry-run/`, README, ROADMAP and RECORD: evidence or docs the
  done-when requires. README states "advisory" once in full and Known limits
  points back to it.

## Notes for the orchestrator

- Stale comment at `hooks/register.tsx:15-16`: it lists the role-window tools as
  "(troupe_dispatch, troupe_status)" but `troupe_close` is registered too
  (`dispatch.ts:442`). A one-word fix, not a cut.
- No behaviour bug found while reading.
