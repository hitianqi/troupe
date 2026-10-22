# Record: p4 — light mode, the skill, metrics (Phase 3)

`claude --version`: 2.1.308 (Claude Code). Rig tianqi-troupe-p4: orch.lead
(orchestrator), dev.b1 and dev.b2 (builders), rev.r1 (reviewer). dev.b1 built
o1 and did the o4 set-up; dev.b2 built o2, o3, the o1-mode follow-up and o5.
Plan: `plan.md` here; the comparison protocol it serves is `compare.md`.

The mission's last done-when item, one real mission run through troupe, was
not run: see "The scope change". The slim pass and the final review ran on
the integrated branch after o5 (below); their reports, `SLIM.md` and
`REVIEW.md`, are beside this record.

## What was built

- **o1** (`hooks/dispatch.ts`, `hooks/plan.ts`, `hooks/view.ts`, tests): light
  mode. `rule()` refuses an order while an order before it (dependency layer,
  then plan order) is not merged, only when the mission has one or two orders.
  The review brief of the order that runs last says it is also the final
  review, gives the base commit and `git diff <base>..<branch>`, and asks for
  every done-when criterion. `claudeArgv` pins `--model` and `--effort` per
  role. The steps line in the pane and the panel leaves out Slim, Cut and
  Final review for a light mission.
- **o2** (`skills/troupe-mission/`, `templates/`): the skill and templates
  rewritten for role windows, the approval dialog, light mode, the final
  review as decided and `troupe_metrics` at teardown. No code.
- **o3** (`hooks/metrics.ts`, `hooks/register.tsx`, `hooks/approval.ts`):
  `troupe_metrics {mission}` writes `docs/missions/<mission>/metrics.json`
  from the plan, `APPROVAL.json`, the review files, git and the Claude Code
  transcripts, with `null` and a reason under `nulls` for what it cannot
  know. The Change prompt no longer names a person.
- **o1-mode follow-up** (`hooks/dispatch.ts`, `tests/dispatch.test.ts`): role
  windows run in the orchestrator's permission mode, read from the last
  `permission-mode` record of its transcript and checked against a fixed list;
  with none readable no flag is passed and the dispatch answer says so.
- **o5** (`README.md`, `ROADMAP.md`, this record, `.claude-plugin/plugin.json`
  0.5.0): the docs.

`./check.sh` on the integrated build: exit 0, 88 plugin tests, 7 panel tests,
the walkthrough check holds, `tsc: clean` (run by the orchestrator and by
rev.r1 with the engine types laid; the builders' own worktrees had none).

## Reviews and fix rounds (rev.r1)

- `REVIEW-o1.md`: PASS. Two Considers, left open (below).
- `REVIEW-o2.md`: FAIL, one Act-on: the skill said effort is "shown, not
  passed", while o1 pins it (the plan gained the pin after o2 forked).
  `REVIEW-o2-2.md`: PASS. The fix put the right sentence in the three places
  and took three Considers (what "last order" means, the refusal list, two
  leftovers that named a company and a scratch folder).
- `REVIEW-o3.md`: FAIL, one Act-on: `diff_size` counted the mission folder's
  own records (plan, approval, review copies) and so overstated the product
  change. `REVIEW-o3-2.md`: PASS. The fix added a pathspec to both git calls
  and a `diff_size_from` note, and took two Considers: a fixer's description is
  a builder's (`roleOfSubagent` tests fix and cut first), and the sheet names
  the branch its base commit came from (`base_commit_from`).
- `REVIEW-o1-mode.md`: PASS, no Act-on finding and no Consider.

## The slim pass (`SLIM.md`)

rev.r1's slim pass listed six CUT entries; dev.b1 made all of them, merged as
1d4f56f:

1. One owner for the mission's base commit: `baseOf` in `hooks/mission.ts`,
   used by both the light final-review brief (`dispatch.ts`) and
   `metrics.json`, so the two cannot name different base commits.
2. One owner for this session's transcript: `ownTranscript` in
   `hooks/metrics.ts`, used for the permission mode in `dispatch.ts` and by
   `troupe_metrics`.
3. A dispatch test that duplicated another, removed.
4. Dead `originHead` scaffolding in the dispatch test's fake git, removed.
5. The sheet's top-level `fix_rounds`, a copy of `rework.fix_rounds`,
   removed.
6. A README bullet said three times, kept once.

With them: `SKILL.md` names four tools (`troupe_metrics` was missing), and
one test of `baseOf` covers both callers (origin's default branch, then
`main`, then `master`), per the slim pass's notes.

## The final review (`REVIEW.md`)

rev.r1, on the integrated branch at 1d4f56f: PASS, no Act-on finding. It
drove the mod live on a scratch light mission, in a scratch tmux server with
a `claude --plugin-dir` orchestrator:

- the light serial refusal of the second order, then its dispatch once the
  first was merged;
- the role windows' argv: `claude --model … --effort … --permission-mode
  auto`;
- the light last order's review brief (the final-review duty and the base
  commit);
- the panel's light steps;
- `troupe_metrics` after `troupe_close`, with the windows found by worktree
  path.

Its one Consider, that `SKILL.md` and `templates/plan.md` gave a window's
command line without `--permission-mode`, was fixed before the MR. Noted and
left as is: `approved_at` is written in UTC while `mr_ready_at` keeps the
committer's offset; `plan_approved_to_mr_ready_s` is right. Not driven live:
the in-session pane, the approval dialog (p3 and the tests), a full-mode
mission, and the reviewer's report copy-back.

## The scope change

On 2026-10-22 at 14:11Z Tianqi deferred the acceptance run. o4 was cancelled
after its set-up and left the plan's orders block; the task, the attach recipe
and `compare.md` are in GitLab issue AI/troupe#3
(https://git.i.prover.com/AI/troupe/-/work_items/3). o5 followed o1 to o3
directly. So no real mission has run through troupe: light mode, the serial
rule and `troupe_metrics` are covered by tests and reviews only.

## Findings from the o4 set-up

- Role windows started in the project's `acceptEdits` (its
  `settings.local.json` `defaultMode`) while the orchestrator ran in `auto`,
  against compare.md's "same permission mode". Fixed by the o1-mode
  follow-up.
- The pane showed an older, landed mission before the new mission's plan
  existed.
- The global effort setting was `xhigh`; compare.md wants `high`. Dispatch now
  pins effort per role.

## Considers left open

- The steps line loses its colours where a wrap lands on a label (the current
  step goes dim at a wrap edge). A look, not a lost fact: the header names the
  step.
- The base commit is the merge-base with `origin/HEAD`, `main` or `master`.
  A mission cut from another branch gets a base that is too old, in the light
  final-review brief and in `metrics.json`.
- A research order never gets an `<id>: ` merge commit, so a light mission
  with one would stall the serial rule.
- Sonnet 5.5's price in `metrics.json` is the claude-api skill's list and is
  not confirmed: Claude Code's own per-session tally disagrees on some
  sessions.
- `troupe_metrics` misses a resumed orchestrator session under a new id.
- `./check.sh`'s pane and panel timing tests are flaky under load: one failed
  now and then in the reviews, and passed on a second run.

## Left for later

- Role windows for an order's fixer, the slim pass and the final review (they
  are Agent subagents).
- The guard for an auto-resolved dialog, and a guard on writes to
  `APPROVAL.json` (p3 leftovers, out of scope here).
- The acceptance run, in AI/troupe#3.

## Kit follow-ups for the coordinator

No kit edit was made; these are notes.

- `workflows/tianqi-mission-light.yaml`: the build step does not say that the
  last order's review is also the final review (the whole diff against the
  base, every done-when).
- `templates/plan.md`, "Review": "at most two rounds per review", where the
  kit's `REVIEW.md` and the full workflow say one fix and one re-review.
- The kit's full fix step has the builder fix on the mission branch itself.
  troupe keeps "only the orchestrator merges": fixers work on their own
  branches. A deliberate difference.
- The final review agrees across the kit, the skill and the pane: kept in full
  mode, none in light mode.

Not applied: `tianqi-project-maintenance` in full, per the lightweight
maintenance decision; the README, `check.sh` and the tests only.
