# Final review: p4, light mode, the skill, metrics (Phase 3)

Reviewer: rev.r1, not a builder of this mission. Cross-order review of the integrated mission branch
`feature/NO-JIRA-p4` at 1d4f56f (o1, the o1-mode follow-up, o2, o3, o5 and the slim cuts merged; base c0d784b;
o4 deferred to AI/troupe#3). `claude --version`: 2.1.308. Judged against `docs/missions/p4/plan.md` ("Done
when" and its "Scope change"), driven in the integrated app. Each order already had its own review; this one
looks at the contracts between them, the integrated behaviour and the slim cuts' effect.

## How I drove it

Entry point: a scratch repository, a scratch tmux server and a `claude --plugin-dir <my worktree at 1d4f56f>
--permission-mode auto` orchestrator (Haiku, to keep cost down), as p3's dry run does, never against the
troupe checkout or OpenRig's tmux server. The repository held a two-order light mission `lite` made from the
walkthrough's sample plan with `o2` made independent of `o1` (`depends_on: []`, disjoint files), so that only
the light rule could refuse it, on `feature/NO-JIRA-lite` over a `main` commit, with an `APPROVAL.json` that
matches the plan (the dialog itself was driven in p3 and its tests). I typed short prompts asking the
orchestrator to call the troupe tools and read the answers, the argv of the role windows from `/proc`, the
briefs from the repository's git folder, the panel from `/troupe lite`, and `metrics.json`. Real Claude role
windows ran on the seat's login for a few seconds each. Everything is closed: the scratch tmux server, its
windows, the worktrees and the scratch folder are gone, and no `--plugin-dir` process is left.

Observed:

1. **Light serial refusal, live.** `troupe_dispatch lite o1` opened a window. `troupe_dispatch lite o2` was
   refused: "o2 waits for o1: a light mission (one or two orders) runs its orders one after the other,
   whatever depends_on says, and o1 is not merged onto feature/NO-JIRA-lite yet. Nothing was dispatched."
   `o2` had no dependency, so this is the light rule alone. After a merge commit titled `o1: add a` the same
   dispatch opened the `o2` window.
2. **A role window's argv.** The `o1` window's claude process is `claude --model opus --effort high
   --permission-mode auto`; the `review-o1` window's is `claude --model sonnet --effort high
   --permission-mode auto`; the dispatch answers say the same ("opus, effort high, permission mode auto"),
   the mode read back from the orchestrator's own transcript (it was started in `auto`). The `o2` window got
   `sonnet`, its order's model.
3. **The briefs.** `o1`'s review brief is an order review, with no final-review text. `o2`'s (the last order)
   says "an order review and the mission's final review", "This is a light mission (2 orders): this review is
   also the mission's final review. There is no slim pass and no other final review.", gives the base commit
   5f59c80… (the `main` commit, the merge-base of the mission branch with `main`) and `git diff
   5f59c80…..order/lite/o2`, and asks for every done-when criterion one by one. It lists the reviewer's skills.
4. **The panel.** `/troupe lite` split the panel to the right (100 columns): header `TROUPE · lite · light ·
   plan checks clean`, with both orders reviewed the orchestrator "needs you ◆ MR OK?", and the detail's
   `steps:` line reads `Plan → ◆ Plan OK? → Build → Order review → ◆ MR OK? → Open MR → ◆ Merged? →
   Teardown`: no Slim, Cut or Final review. (Colours are not visible in a text capture; the wrap case is the
   open Consider from the o1 review.)
5. **Hand-back copies.** The real `o1` builder window read its brief, found the sample plan's files missing
   from the scratch repository and wrote `DONE-o1.md` itself ("blocked, not built"); troupe copied it into
   the mission folder on the poll. (The reviewer's report copy-back was not exercised: that window was closed
   before it wrote one; p3's run covered it.)
6. **`troupe_metrics`, after `troupe_close`.** Written to `docs/missions/lite/metrics.json`; the answer is
   "2 orders (light), 2 reviews, 0 fix round(s), 1 refused dispatch(es), …". It found the builder and reviewer
   windows' transcripts (two sessions each) although their windows were already closed, by worktree path.
   `mode: light`; `base_commit` 5f59c80… (the same commit the brief named, from `baseOf`, which the slim cut now
   shares); `base_commit_from` names `main` and says to run it before any fetch; `refused_dispatches`: count 1
   with the o2 reason above; `orders[o1]`: model opus, merged, 1 review, 0 fix rounds, `wall_time_s` 99,
   `diff_size` **1 file, +30** (the merge commit had 3 files, +70: the mission folder's records are left out, as
   fixed in o3); `orders[o2]`: not merged, so `wall_time_s` and `diff_size` are `null` with reasons;
   `quality.diff_size` 1 file +30 with its `diff_size_from` note; the top-level `fix_rounds` is gone and
   `rework.fix_rounds` is 0; tokens per role with `model_effective` read from the transcripts (opus and sonnet
   for the builders, effort `high` read back); the orchestrator's cost is `null`: "no list price in troupe's
   table for claude-haiku-5-5", and the total's with it; human attention, interruptions, waiting, blind review,
   make check, hand test, churn and blocked time are `null` with their reasons. At list prices the builders
   cost $0.37 and the reviewers $0.25 in this run.
7. **`./check.sh` on 1d4f56f with tsc:** exit 0, 88 plugin tests, 7 panel tests, walkthrough holds, `tsc:
   clean`.

## Done-when, one by one

- **Light mode in the mod:** the refusal, the last-order brief, the steps line and "MR OK?" are as in 1–4; the
  plugin tests cover each (88 pass).
- **The skill and the templates:** the skill, the mod and the README agree on the tool set (four), the
  refusals, the light rule, the final review (kept in full mode, none in light), the file shapes and the
  teardown order; the one gap is Consider 1.
- **Comparison protocol:** dispatch pins `--model` and `--effort` per role (2); `metrics.json` carries compare.md's
  fields and names those troupe cannot know (6). The reply log, the brief text and the base commit belong to
  the acceptance run, deferred; issue AI/troupe#3 holds them.
- **Metrics:** 6.
- **One real mission:** not run. README ("Checking it" and the limits), ROADMAP ("Not done") and RECORD
  ("The scope change") all say so, with the issue link, and none claims it ran or counts it. The issue exists
  and is open.
- **Docs and the check:** the README describes light mode, the skill and `metrics.json` and says the
  acceptance run is deferred; ROADMAP has the outcome paragraph; `docs/missions/p4/` holds the plan, RECORD,
  compare.md and the reviews; `./check.sh` exits 0 with `tsc` run.

## Act on

None.

## Consider

1. **The skill and the plan template describe a window's command line without the permission mode.**
   `skills/troupe-mission/SKILL.md:59` says the window runs `claude --model <model> --effort <effort>`;
   `templates/plan.md:82` says the same with "the builder role's effort". The o1-mode follow-up (merged after
   o2's fix) made it `--model … --effort … --permission-mode <the orchestrator's mode>` (live argv in 2), and
   the README and the dispatch answer say so. Not a wrong statement, an incomplete one, and the skill already
   tells the orchestrator that prompts wait in the windows, so it does not break a mission: but an orchestrator
   that runs in `acceptEdits` or `bypassPermissions` should know its windows inherit it. One clause in each
   place closes it. Siblings looked for: `references/*.md` (no command line there), `templates/REVIEW.md`,
   `templates/SLIM.md`, README (correct).

## Noted

1. **Open Considers from the order reviews, still open and recorded in RECORD:** the steps line loses its
   colours where a wrap lands on a label; the base commit is a guess at the default branch; a research order
   never gets a merge commit, so it would hold the serial rule; the Sonnet price is the claude-api skill's
   list; a resumed orchestrator session is missed; the timing flake in `./check.sh`. None changed in the
   slim round.
2. **The slim cuts changed nothing observable, and the live run is the evidence:** the brief and
   `metrics.json` name the same base commit now that both call `baseOf`; the permission mode and the
   orchestrator's transcript are read through the shared `ownTranscript` (the mode came back `auto`, the
   transcript was found); the removed top-level `fix_rounds` is gone from the sheet, the summary line and the
   README, with the value kept under `rework`. The origin/HEAD branch of `baseOf` is exercised by no test
   (the slim note says the same) and by this run only through the `main` fallback (the scratch repository has
   no remote); it is the same two git calls as before the cut.
3. **`approved_at` is UTC (`…Z`) while `mr_ready_at` keeps the committer's offset (`…+02:00`).**
   `plan_approved_to_mr_ready_s` is right (127 s, checked by hand); a reader comparing the two strings by eye
   could be misled. Not worth a change now.
4. **`RECORD.md` does not yet mention the slim pass, its cuts or this review** (it says they "run after o5");
   the orchestrator completes it when this lands.
5. **Not driven live:** the in-session pane (outside tmux: tests only), the approval dialog (p3, tests), a
   full-mode mission (slim and final review steps in the pane), and the reviewer's report copy-back.
6. **Cost of this run on the seat's login:** a few role-window turns on Opus and Sonnet and a Haiku
   orchestrator. Claude Code showed "close to your usage credit limit" in the orchestrator window during the
   run; nothing here used an API key.

## Dismissed

- "Light rule can refuse a full mission's parallel orders": checked in the o1 review and by the test; not
  re-driven live (it needs three more role windows).
- "`troupe_metrics` after `troupe_close` loses the windows": it found both windows' transcripts by worktree
  path after the close (6).
- "The cuts removed coverage": `./check.sh` is green with the same 88 plugin tests as before the cuts' test
  edits it replaces (the removed test duplicated an older one, as the slim list says).

## What I could not verify

Manual acceptance: none for troupe itself. The real mission is not a manual-acceptance item here: it is
deferred by the human and recorded as such.

## Verdict

PASS
