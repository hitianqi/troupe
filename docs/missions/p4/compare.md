# Comparison protocol: one small task, three ways (Tianqi, 2026-10-22)

Purpose: measure what troupe costs and saves against the two plain ways of doing the same small task with Claude Code. Three arms, one task, one metric sheet. The troupe arm IS p4's acceptance run (o4), so its metrics.json must carry every field below; the other two arms run afterwards in a separate light mission and fill the same sheet.

## Arms

1. **Single agent.** One Claude Code session; the human chats with it; it builds and reviews itself; the human hand-tests. Model opus 5.5 for everything (inherent to this arm; say so in the sheet). Optional variant 1b: the same, but the review pass is one Agent call on sonnet 5.5.
2. **Built-in subagents.** One Claude Code session as orchestrator; builders and the reviewer are Agent-tool calls with `isolation: "worktree"`, each with explicit `model` and `effort` (no defaults).
3. **troupe.** `/troupe <mission>`: the dialog approves the plan, `troupe_dispatch` opens the role windows, reviews come back as files, metrics.json at teardown.

## Fixed conditions (same in every arm)

- Task: the same brief text, verbatim, from the same base commit, in a fresh worktree and a fresh session per arm. The human answers only what is asked, never volunteers what another arm found; every human reply is logged with a timestamp.
- Roles → model × effort: orchestrator opus 5.5 / high; builder opus 5.5 / high; reviewer sonnet 5.5 / high. Arm 1 is opus/high throughout.
- Effort control: for the duration of the test Tianqi's global `~/.claude/settings.json` effort is set to `high` and left alone; no per-call override anywhere except the explicit values above. (troupe: dispatch must pin `--model` per role; if effort cannot be passed on the command line, it inherits the global value — record what was in effect.)
- Same Claude Code version, same skill list visible to the sessions, same permission mode (auto), same reviewer instructions (REVIEW.md) for the blind final review.
- Login: the seat's Claude login in every arm (no API key); costs converted at API list prices for comparability.

## Metrics (one row per arm; per-role breakdown where it exists)

Time
- `wall_time_s`: brief sent → branch MR-ready (make check green, reviews done).
- `human_attention_s`: minutes the human actively spent (reading, answering, approving, hand-testing), from the reply log.
- `human_interruptions`: number of times the human had to act (answer, approve, press a button, answer a permission prompt).
- `waiting_on_human_s`: time the run sat waiting for the human.

Tokens and cost (per role: orchestrator / builder(s) / reviewer; and total)
- `input_tokens`, `output_tokens` (thinking included), `cache_write_tokens`, `cache_read_tokens` — raw.
- `cost_usd`: API-equivalent at list prices, with cache read and write priced separately; never fold cache read into input.
- `coordination_share`: tokens spent on plan, reviews, records, panel/dialog vs tokens spent writing and testing code (by session/agent purpose).
- `model_effective`, `effort_effective`: read back, not assumed — model from each assistant message's `model` field in the session jsonl (`~/.claude/projects/<cwd>/*.jsonl`); effort from the launch argv/env and a snapshot of settings at start.

Quality
- `blind_review_act_on`, `blind_review_consider`: one fresh reviewer (sonnet high), same REVIEW.md, applied to the three branches without knowing which arm made which.
- `make_check`: green or not at hand-off.
- `handtest_defects`: defects Tianqi finds in the hand test.
- `diff_size`: files / +lines / −lines, against the minimal change the brief needs (judged in the blind review).

Rework and friction
- `fix_rounds`: review fix rounds.
- `churn_lines`: lines added then removed within the run (from the branch's commit history or the worktree diff timeline).
- `refusals`: hook / classifier refusals; `blocked_s`: time stuck on them.
- `prompts_in_role_windows`: permission or trust prompts a person had to answer in role windows (troupe) or subagent gates (arm 2).

## Reading the result

n = 1 per arm: report magnitudes, not significance. A factor of 2 or more is a finding; 30 % or less is a tie. Report the sheet as one table with the three arms as columns, and under it the three things that most explain the differences.

## What p4 must do (o3 metrics, o4 acceptance run)

- metrics.json carries every field above that the mod can know, and names the ones it cannot (e.g. human_attention_s comes from the reply log, blind review happens later).
- Dispatch pins `--model` per role; effort: pass it if Claude Code accepts it on the command line, otherwise record the inherited global value as `effort_effective` with its source.
- The acceptance run records the human reply log (time, what was asked, what Tianqi answered) under docs/missions/<mission>/.
- Keep the task's brief text and base commit in the record so arms 1 and 2 can start from exactly the same point.
