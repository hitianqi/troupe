# Order review: p3 / o3

Reviewer rev.r1 (Sonnet 5.5). Order branch `order/p3/o3` at 846836a (one
commit), against the mission branch `feature/NO-JIRA-p3` (9610612). Judged
against `docs/missions/p3/plan.md` (o3's goal, risks, proof) and the brief
orch.lead gave me. `claude --version`: 2.1.306 (Claude Code), tmux 3.4.

Diff scope: `hooks/approval.ts` and `tests/approval.test.ts`, both declared.
`register.tsx`, `dispatch.ts` and the types are untouched.

## How I checked

- `./check.sh` in my worktree (`npm install`, types copied from dev.b1's o2
  worktree, laid by the same 2.1.306): exit 0, `tsc: clean`; 51 plugin tests
  pass, 0 fail, 5 of them the new approval tests; panel node 5/5; the workflow
  walkthrough holds.
- Read `hooks/approval.ts` whole and the test file's titles against the plan's
  proof list.
- **Drove the dialog myself in a scratch session**, answering it with tmux
  keys on a server of my own (`env -u TMUX -u TMUX_PANE`,
  `~/scratch/troupe/rev/`), an orchestrator `claude --plugin-dir <o3
  worktree> --model haiku` in a scratch repo holding the sample mission and a
  copy of it with an overlapping plan (`bad`). Tianqi's live check in dev.b2's
  tile is still his: I did not touch that tile, and what I saw is a
  stand-in for it, not a replacement (the AFK case below I could not drive).
  Server killed and the scratch folder deleted afterwards.

## What I observed (live, 2.1.306)

| Case | Result |
| --- | --- |
| `/troupe sample`, no record | The engine draws the dialog: `Plan` chip, "Approve the plan?", `1. Approve  2. Change  3. Type something.  4. Chat about this`. |
| Enter on Approve | `…The plan is approved (2026-10-21T15:38:03.048Z).`; `APPROVAL.json` written with `sha256:137ed63b…`, equal to `sha256sum plan.md`. |
| `/troupe sample` again | No dialog; `The plan is approved (…)`. |
| One newline appended to `plan.md`, `/troupe sample` | The dialog is asked again. |
| Change (option 2) | A second dialog: `Change`, "What should change in the plan? Type it under Other.", `1. Approve  2. Not now  3. Type something.` (see Consider 2). |
| Typed under Other: "Rename o2 to the second step" | The command answered `… Change asked: Rename o2 to the second step`, and the conversation received `Tianqi asks: Rename o2 to the second step; edit docs/missions/sample/plan.md, then /troupe again` as a user prompt; the model started on it. **The prompt submitted from `$.clock.after(0)` works in the real engine**; this is the item the builder said only a live run would show. |
| Enter on the empty "Type something." row | Treated as no words: `Not approved; /troupe asks again.` (my own mis-drive; the code's empty-text branch behaves). |
| `/troupe bad` (overlap, no `depends_on`) | `…Not asked: the plan has problems; fix plan.md first.` No dialog, no record. |
| Esc on the dialog | `Not approved; /troupe asks again.`; no record written. |
| Hash of "the plan that was shown" | `writeApproval($, dir, plan)` hashes the text `gate` read and checked, not a fresh read; an edit made while the dialog is up is not approved (it is asked again). Read in the code and in the test; not raced by hand. |

## Act on

1. **An unattended dialog might approve (ruled by orch.lead; build it).**
   dev.b2 found that AskUserQuestion can auto-resolve when the person is away
   (`afkTimeoutMs` in its result) and `$.ui.ask` returns only the answer
   string, so `gate` cannot tell an auto-resolved answer from a person's. The
   first dialog's first option, highlighted by default, is `Approve`.
   *Reproduction:* I could not reproduce the auto-resolve (it needs the person
   idle and I do not know what the engine answers), and I could not find
   `afkTimeoutMs` anywhere in the laid types (`grep -i afk
   .claude-plugin/types` is empty; the AskUserQuestion tool's `result` is not
   typed there). So the field name and shape are dev.b2's reading of a runtime
   result. Build the guard as ruled: `$.tool.call({ tool: 'AskUserQuestion',
   questions: [...] })` directly (the types say it runs through the same
   permission check and the dialog), refuse an answer whose result carries
   `afkTimeoutMs`, and **log the raw result once in a scratch run before
   trusting the field name**.
   *A simpler equivalent:* I see none that is robust. Reordering the options
   so that the non-approving option is first only helps if auto-resolve picks
   the first option, which nobody has shown; a typed confirmation under Other
   is safe but worse to use. The `$.tool.call` check is the right size (about
   ten lines). Doing both the check and the reorder in Consider 2 costs
   nothing.

## Consider

1. **What a person must still check.** Everything in the live flow I could drive, I did, and it held (table). Left for Tianqi's check is what needs his own screen: the dialog in his tile, and the AFK path of Act on 1.
2. **The Change dialog highlights `Approve` first.** After Change, the second
   dialog's `1. Approve` is under the cursor. Two Enters in a row (a double tap,
   key repeat) approve the plan the person had just said needs a change. Low
   impact: the orchestrator then edits the plan and the hash no longer holds;
   but between the two a dispatch would pass. Put `Not now` first
   (`options: [NOT_NOW, APPROVE]`), or drop Approve from that dialog (the
   person can still run `/troupe` again).
3. **Typed words equal to a label decide the dialog.** Under Other, the exact
   text `Approve` approves; `approve` or `Approved` goes to the conversation as
   a change request ("Tianqi asks: approve; edit plan.md…"). Comparing the
   typed text case-insensitively, or not accepting `Approve` from the free-text
   path, keeps the dialog honest. Nit-sized.

## Noted

1. The double-dialog flag is a module variable. A hot reload while a dialog is
   up gives the new module a clear flag. The dialog holds the prompt, so
   nobody can run `/troupe` meanwhile; I could not make it matter.
2. The builder's decision to submit the Change prompt from `$.clock.after(0)`
   (the engine refuses `$.prompt.submit` inside `command.run`): judged and
   confirmed live; the words also stay in the command's answer, so a refused
   submit loses nothing.
3. `APPROVAL.json` stays forgeable by the model (my o1 Noted 2); I agree with
   the builder that o4's README should say it is advisory and the dialog is
   its one intended writer.
4. No test covers the "dialog already open" answer; the flag is a few lines.
5. The record is kept in `$.state` and in the file; `approvalOf` re-reads the
   file each time, so a deleted file is not approved (as in o1).

## Dismissed

- A dialog raised from a timer or twice at once: only `/troupe` raises it, once
  per call; the one timer is the prompt submit after the answer.
- The record surviving a whitespace edit: seen live, a newline asks again.
- Writing the record for a plan other than the one shown: the hash is of the
  text read before the dialog.

## Manual acceptance

1. Tianqi's live check in dev.b2's tile, as dev.b2's row describes it (Approve
   once, Change once, then the dialog back). I saw the same flow work in a
   scratch session on 2.1.306; what remains is the person's own screen.

The one Act-on item is the guard orch.-lead ruled into the fix round; the order
is otherwise sound.

FAIL: 1 Act-on findings
