# Final review: p3, dispatch, role windows and the approval dialog

Reviewer rev.r1 (Sonnet 5.5). `feature/NO-JIRA-p3` at 28bc7c6 (the four orders,
their fixes, the slim commit 6d5f4d5 and SLIM.md), against `main` (da96337).
Judged against `docs/missions/p3/plan.md`'s Done when, across the orders.
`claude --version`: 2.1.306 (Claude Code), tmux 3.4. 47 files, +3734 −39.

## How I checked

- `./check.sh` on 28bc7c6 (code identical to the slim tip edef99f; the tip adds
  only SLIM.md): exit 0, `tsc: clean`, 71 plugin tests pass, 5 panel tests, the
  workflow walkthrough holds.
- **The real app, end to end, in my own scratch** (`~/scratch/troupe/rev/`: a git
  repo holding the sample mission on `feature/NO-JIRA-sample`, a tmux server of my
  own started with `env -u TMUX -u TMUX_PANE`, an orchestrator `claude
  --plugin-dir <this tree> --model haiku`; role windows on my login, opus and
  sonnet, short prompts). Nothing on OpenRig's server, nothing against the troupe
  checkout. Everything closed and deleted afterwards.
- The scripted dry run (`docs/missions/p3/dry-run/run.sh`, run from a copy outside
  the repo) on the same tree: **15/15 PASS**, server gone.
- Read the diff where orders meet: `dispatch.ts` ⇄ `approval.ts` ⇄ `mission.ts` /
  `plan.ts` / `read-state.ts` / `bin/troupe-panel`, the state keys in
  `types/index.d.ts`, the slim cuts, and README / ROADMAP / RECORD against the
  code.

## Done when, criterion by criterion

| Done when | Result |
| --- | --- |
| FEASIBILITY "Phase 2 part 2" with `claude --version` and raw evidence; verdict reaches 大博士贴 as a row | Section and `docs/feasibility/p3-*` present (twelve cases, 2.1.306). The verdict row went out (`qitem-…143726-e1dd…`, then the correction row about the paste). |
| `troupe_dispatch` refuses before approval and on an unmet `depends_on`; on success worktree, session, window, brief, `$.state` | Driven on the integrated build: no record, refused with `the plan is not approved: no APPROVAL.json …` (nothing created); `o2` refused `depends on o1, not done yet`; after the dialog approved, `o1` opened `troupe-sample:o1` in `../repo-sample-o1` on `order/sample/o1`, the builder read its brief and acted. Plan edit, name injection, hostile model, foreign session: refused in my o1 and o2 reviews, unchanged since. |
| `troupe_status` | Lists each window's order, role, running/gone, brief sent. |
| Reviewer dispatched the same way; done/reviewed from files only; the two p2 leftovers | `role: "reviewer"` opened `review-o1` detached at the order's branch; the real builder wrote `DONE-o1.md` and the real reviewer `REVIEW-o1.md`; both were copied into the mission folder on the poll and the panel moved `o1` planned → done → reviewed, no `/troupe` re-run. A fix round stays `reviewed`. The step reaches **Final review**: with real git facts on a three-order mission (all `reviewed`) it is `Slim` without `SLIM.md` and `Final review` with `SLIM.md` committed on the mission branch (a small script over `gitFacts`/`missionOf`; note that no screen draws this step, see Noted 1). |
| `troupe_close` one window and the session; a gone window or session reopened | Closed `review-o1` by its kept id, then the whole session (`Closed the role session troupe-sample … the worktrees stay`); in my o2 review a killed window and a killed session were opened again in the same worktree, a same-named foreign session untouched. |
| `/troupe <mission>` asks "Approve the plan?"; Approve writes the record; Change hands free text on; edited plan invalidates | Driven live here: panel opened on the right (115 columns), dialog drawn, Enter on Approve wrote `APPROVAL.json` (hash = `sha256sum plan.md`), and **that record is what `troupe_dispatch` then accepted**: the o1 ⇄ o3 contract holds end to end. Change / words / Esc / empty / "approve" typed / plan with problems / edited plan: driven in my o3 reviews. |
| `claude plugin test` covers the listed cases | The titles cover every item (refused before approval, unmet `depends_on`, allowed after, after a plan edit, argv, record and hash, both dialog answers, close, gone window and session). |
| Scripted dry run in a scratch tmux server, output kept under `docs/missions/p3/` | `dry-run/run.sh` and `output.txt` present; re-run by me, 15/15. |
| Seen live: Tianqi answers the dialog in a builder's tile | **Pending, his** (manual acceptance 1). |
| README, ROADMAP outcome and light mode moved, RECORD, `./check.sh` exit 0 with `tsc` | All present and true to the code (reviewed in REVIEW-o4 and again after the slim round); `./check.sh` exit 0 with `tsc` run. |

## Across the orders

- **Contracts.** `writeApproval` (o3) and `approvalOf` (o1) share one hash and
  one file; `rule` (o1/o2) reads it after the same plan checks as `gate`; the
  committed-plan rule (o2) sits between them without changing either. `gitFacts`
  gained its `files` argument (o2) and every caller passes it or defaults it
  (`dispatch.ts` rule, `read-state.ts`, `bin/troupe-panel`). `doneMarker` and
  `isReviewOf` have one home in `mission.ts`; `stateOf`, `isResultOf` and the
  reviewer brief share it.
- **State keys.** `roles` (o1 declares, o2 grows and `keepWindow`/`forget`
  write); `approval` and `TroupeRoleWindow.brief` were removed by the slim round
  and nothing reads either; `tsc` is clean.
- **Slim cuts.** Reviewed with everything: the atom, the `brief` field,
  `doneOrders`, the three constants, `isReviewOf`, `writeApproval`'s required
  `plan`. Each is a pure removal or an inline; `check.sh` and my dry run and
  end-to-end drive pass on the cut tree. The "Plan.md" capitalisation fix and the
  README edits from the round are as ruled.
- **Duplication across orders.** None left that matters (the numbers' remainder is
  evidence files and test arrange steps, kept deliberately).

## Act on

None.

## Consider

1. **The panel does not show the approval.** Right after Approve in my drive
   the panel still read `orchestrator … needs you ◆ Plan OK?`; the gate only
   turns done once an order moves (`stepOf` reads order states, never
   `APPROVAL.json`). Until the first dispatch the human sees a gate that is
   already answered, which in this product is the one thing the panel is for. A
   cheap fix is to treat a valid record as "Plan OK? passed" when the orders are
   all `planned` (the plan hash is the one `approvalOf` checks). Not a
   done-when item; Phase 3 can take it.

## Noted

1. The step is computed (Slim, Cut, Final review) but no screen draws it: the
   graph shows roles and the human gates only, so the Phase 2 leftover "the step
   can reach Final review" is observable in state and tests, not on the panel;
   the MR OK? gate lights only after `REVIEW.md`.
2. Carried from my reviews, all documented in the README's Known limits: results
   are collected for the one mission the pane shows; `REVIEW.md` and `SLIM.md` are
   copied by the orchestrator; a done marker shows `done` but only a merge releases
   a dependent order; env inherited from the tmux server; troupe never run on
   OpenRig's own tmux server (by this mission's design); the brief sits outside the
   worktree and may prompt on an account not in auto mode.
3. `APPROVAL.json`, `DONE-<id>.md` and the copied REVIEW files are untracked files
   in the orchestrator's checkout; the orchestrator commits the reports and removes
   a copied marker if a builder committed it (the README says so).
4. The unattended-dialog safety rests on a reading of the 2.1.306 build (answers
   already given are what auto-resolve submits), not on a run; I left a dialog idle
   170 s and it did not resolve. The one-hook guard stays a Phase 3 option.

## Dismissed

- The `Final review` step not appearing on screen as a defect: the panel's design
  draws gates, not steps (p1); the leftover asked for the state to reach it.
- Race in parallel dispatch: not reproduced (o1 review) and the state write is now
  a merge at the moment of the write.
- Duplicate evidence blocks: kept on purpose (SLIM.md, each case's own capture).

## Manual acceptance

1. **Tianqi's live check of the Approve / Change dialog in dev.b2's tile** (row
   `qitem-20261021152346-828da7b2674e359e` to 大博士贴, still blocked; the mod there
   is reloaded to the fixed dialog). I drove the same dialog by tmux keys in my own
   scratch session and it behaved as the README says; what remains is his screen.
2. **Prompts and dialogs inside role windows** (a permission prompt, a builder's
   question, the trust dialog of a new repository) are the person's to answer, as
   the README and RECORD say; no dispatch types into a window in use.

PASS, 2 items for manual acceptance
