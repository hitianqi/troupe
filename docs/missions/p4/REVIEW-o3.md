# Review: p4, order o3 (troupe_metrics, metrics.json at teardown)

Reviewer: rev.r1. Branch `order/p4/o3` at 0202ca7 (one commit on `feature/NO-JIRA-p4` 4602d27: `hooks/metrics.ts`
new, `hooks/register.tsx`, `hooks/approval.ts`, `tests/metrics.test.ts` new, `tests/approval.test.ts`).
Judged against the plan (order o3, the o2/o3 `troupe_metrics` contract) and `docs/missions/p4/compare.md`
(its Metrics and last section), not against the builder's notes. `claude --version`: 2.1.308.
Merge: `git merge-tree` of `order/p4/o3` onto the mission branch now at 8d017da (o1, o2 merged) is clean
(no conflict); every changed file sits under o3's `touches`; `dispatch.ts` and `types/index.d.ts` untouched.

Depth: a new file that reads Claude Code's moving transcript format and prices tokens, so the number each
field carries matters more than the diff's size. I read `metrics.ts` in full, then checked its claims
against real data on this machine rather than against its own tests.

## What I did

- **`./check.sh` with tsc.** Fresh engine types laid from my worktree at o3 as asked (scratch tmux server,
  trust answered Yes for the empty scratch folder, quit, server killed, folder deleted). Result: exit 0,
  79 plugin tests pass, panel tests pass, walkthrough "all checks hold", **`tsc: clean`**.
- **Token totals against an independent count.** `readTranscript` on two real transcripts (this seat's
  session, 50 messages, and an older troupe rehearsal session, 16 messages) against a separate Python
  count (one usage per `message.id`, `<synthetic>` dropped): input, output, cache-write and cache-read
  totals are identical on both. The extra `api-request-blob` lines that Claude Code writes (they repeat
  earlier tool results) are ignored by the reader, so nothing is counted twice.
- **Price table against its source.** The claude-api skill: Opus 5.5 $4 / $20, cache read $0.20; Sonnet 5.5
  $2 / $10, cache read $0.20; Fable 5.1 $10 / $50, cache read $0.25; cache writes 1.25x (5 min) and 2x
  (1 hour) of input; Haiku 5.5's price depends on prompt size (≤100K tokens $0.10 / $0.50). `PRICES` matches
  all of it, and leaving Haiku out (cost `null` with a reason) is right, as the real Haiku transcript shows
  (`cost: null`, "no list price in troupe's table for claude-haiku-5-5").
- **Refusals against real shapes.** In 60 real transcripts, a troupe refusal is a `tool_result` with
  `is_error: true` and no `permissionDecision` (counted as `troupe`, and into `refused_dispatches`); a
  hook refusal is `{source: hook, decision: reject, reasonType: hook}`; the classifier and safety check
  are `reasonType: classifier` / `safetyCheck`; a person's refusal is `source: user_reject`; an accepted
  call that then fails is `decision: accept` with `is_error` (skipped by `else if (decision !== undefined)
  continue`, so not counted). All as the classifier in `readTranscript` expects. Effort: the per-line
  `effort` field is on real assistant lines (`high`, `medium`).
- **Wiring.** `registerMetrics` and `metricsHooks` follow `dispatch.ts`'s pattern exactly (declare under
  `.catch` and log; serve under `.catch` that denies); the tool name `mcp__troupe__troupe_metrics`
  matches the others; the mission name is checked against `NAME` before it reaches a path, and the only
  write is `docs/missions/<mission>/metrics.json`. A throw cannot stop the rest of the mod.
- **Fields against compare.md.** Every compare.md field the mod can know is present: `wall_time_s`, the four
  token kinds per role and in total, `cost_usd`, `coordination_share`, `model_effective`,
  `effort_effective` (with its source), `blind_review_*`, `make_check`, `handtest_defects`, `diff_size`,
  `fix_rounds`, `churn_lines`, `refusals` (by kind), `blocked_s`, `prompts_in_role_windows`. The ones troupe
  cannot know (`human_attention_s`, `human_interruptions`, `waiting_on_human_s`, `blind_review_*`,
  `make_check`, `handtest_defects`, `churn_lines`, `blocked_s`) are `null` with a reason under `nulls`,
  keyed by path. Unknowns are not guessed: a role with no transcript nulls its tokens, cost and total; a
  message with no list price nulls the cost; an unmerged order nulls its wall time and size; a non-JSON
  line is skipped and noted. The plan's own list is also there: orders and models, review rounds per order
  and for the mission, refused dispatches with reasons, wall time (approved to MR-ready, and per order),
  cost.
- **approval.ts** now says "Change asked in the plan dialog: …": no person named; the test follows.
- **Role windows without `$.state`.** Found by the worktree paths `<root>-<mission>-<id>` and
  `-review-<id>` plus `$.state` when it still holds them, so `troupe_close` does not hide them; the
  order in the skill (metrics before close) is then belt and braces.

## Act on

1. **`diff_size` counts troupe's own record files, so it overstates the product change against the other
   arms.** `orders[].diff_size` is `git show --shortstat` of each order's squash-merge commit and
   `quality.diff_size` is `git diff --shortstat <base> <tip>` (`metrics.ts:483` and `:485`), with no
   pathspec. The skill has the orchestrator commit the mission's records on the mission branch: `plan.md`,
   `APPROVAL.json`, and, in each merge commit, the order's `DONE-<id>.md` and `REVIEW-<id>*.md` copies
   (SKILL.md step 4, "Merge"; orchestrator.md "Merge" 3). All of those land inside the numbers.
   compare.md asks for `diff_size` "against the minimal change the brief needs" so the three arms can be
   set side by side, and says a factor of 2 is a finding. Arms 1 and 2 have no such files.
   Repro (real git, a one-order mission whose only product change is one 40-line file):
   `src/a.ts` (+40), `docs/missions/x/plan.md`, `DONE-o1.md`, `REVIEW-o1.md`, committed as `o1: add a`:
   `git show --shortstat --format= HEAD` prints `4 files changed, 43 insertions(+)`; with
   `-- . ':(exclude)docs/missions/x'` it prints `1 file changed, 40 insertions(+)`. On a real two-order
   mission the records add six or more files, and the plan and review texts add far more lines than a small
   product diff, so the sheet would show the troupe arm several times larger than it is.
   Siblings, same defect in the same function: the per-order `diff_size` and the mission's
   `quality.diff_size`; I looked for a third place that counts diff size (`rework.churn_lines` is `null`;
   nothing else). The fix is one pathspec on both git calls (the mission folder is `docs/missions/<mission>`,
   already in hand as `dir`), plus the test's fake git answering the pathspec form; and say in the field
   that the mission folder is left out.

## Consider

1. **A fixer's role can come out as "reviewer".** `roleOfSubagent` tests `review|slim pass` before
   `cut|fix`, so a description such as `fix final review findings` (the skill gives the final review's
   fixer "a description with no id" and no wording) is counted as a reviewer, and its tokens move from
   the builder column to the reviewer's and into `coordination_share`. Either test fix/cut first, or have
   the skill name the descriptions (`final fix`, `slim cuts`). The orchestrator's other fallback (anything
   unmatched counts as the orchestrator) is documented in the code and fine.
2. **The mission's base commit is the merge-base with `origin/HEAD`, `main` or `master`**, like o1's brief,
   so `base_commit`, the order merge list and `quality.diff_size` assume that branch does not yet contain
   the mission. In the skill's teardown order that holds (metrics run before the fetch and fast-forward),
   but a fetch between the forge's merge and the call, or a mission cut from another branch, gives the
   wrong base (an empty diff, or too much). Name the base in the sheet's `base_commit_from`, or say in the
   skill to run it before any fetch; not blocking for the acceptance run, which opens no MR.

## Noted

1. **`review_rounds.final` counts `REVIEW.md` files only.** In a light mission the last order's review is
   also the mission's final review and is counted under `orders`, so `final` is 0; `mode: "light"` is in the
   sheet, so a reader can tell. The compare sheet should say so when it sets a light run against a full one.
2. **`coordination_share` is a definition, not a measurement**: orchestrator plus reviewer tokens over all,
   all four kinds, by session. It is documented in `coordination_share_from`; the orchestrator's tokens
   include merging and gate work, which compare.md counts as coordination too, so it fits.
3. **Sonnet cost is as good as its table.** The builder could not reconcile some Sonnet sessions with
   Claude Code's own cost lines; the table matches the claude-api skill's prices exactly, and the sheet
   names its source in `prices.source`. Server tool use (web search requests) is not priced.
4. **Limits the builder names, and I agree with:** a resumed orchestrator under a new session id is missed;
   a very long project path (Claude Code may shorten its folder name) is not found and then shows as
   `null` with the folder it looked for; a role window folder holds every session ever run in that
   worktree path, which for these `<repo>-<mission>-<id>` names is the mission's own.
5. **A whole transcript is read as one string per file.** Fine at this size (an hour-long Opus session is a
   few MB); a day-long session could make the call slow, and the tool has no progress to show.
6. **Not run live in an engine session** (the plan leaves that to o4); the fixture test covers the sheet
   and the real transcripts above cover the reader.

## Dismissed

- "Reading `$state` only would miss closed windows": it reads the worktree folders first, `$.state` as an
  addition (see above).
- "Hook refusals of `troupe_dispatch` are counted twice (`refusals.troupe` and `refused_dispatches`)": the
  two fields count different things (all refused troupe-tool calls, and dispatch refusals only), and each
  appears once.
- "Duplicate lines in the transcript double the tokens": checked on real files, the totals equal an
  independent per-message count.
- "`approval.ts` change breaks the dialog": the prompt text only; test updated; check passes.

## What I could not verify

Nothing needs the human's eye. Not driven: `troupe_metrics` inside a live engine session (o4's acceptance
run is the first use); the reader was exercised on two real transcripts, but no complete mission's set of
transcripts exists to run the whole sheet on.

## Verdict

FAIL: 1 Act-on findings
