# troupe

A Claude Code mod that shows a planned mission beside the chat, in a tmux
panel split to the right of the session. It also asks the person to approve
the plan, and gives the conversation four tools: three that run the mission's orders in Claude
windows of their own (`troupe_dispatch`, `troupe_status` and `troupe_close`)
and one that records what the mission cost (`troupe_metrics`). A mission of
one or two orders runs in light mode. The plugin also carries the
`troupe-mission` skill, which runs a mission from brief to merged MR.
`ROADMAP.md` holds the decisions and the phases.

> **Direction (2026-10-24).** This README describes the Claude Code mod that
> Phases 0–3 built (v0.6.0 after the cleanup), and it stays accurate for the
> code as it is. The project is moving away from that form (ROADMAP,
> "Direction"): no mod, but a `troupe` CLI and the standalone
> `troupe-panel`, so that the orchestrator and the roles can run Claude Code
> or Codex. Going away: the mod's `/troupe` dialog and tools, the fixed
> `builder` / `reviewer` roles and the model allow-list, light mode and
> metrics as part of the core. Staying: plan first, approval
> before any role window opens, one worktree per role, and the persistent
> panel, which gains approval, per-role lights and click-through. Do not
> build on what is going away. The 2026-10-24 cleanup (v0.6.0) already
> removed the in-session pane, OpenRig seat support and `.troupe-state.json`.

## Layout

- `src/`: the mission as data and as a view, with no engine import (the plan
  reader and its checks, order states from files and git, the approval hash,
  the graph and the lines the panel paints). The CLI will build on it.
- `bin/troupe-panel`: the panel, a plain Node program that draws from `src/`.
- `hooks/`: the Claude Code mod (`/troupe`, the approval dialog, the role
  window tools, metrics). It goes when the CLI replaces it.
- `skills/troupe-mission/` and `templates/`: the default workflow.
- `tests/`, `check.sh`; `docs/`: the feasibility record and the missions that
  built troupe.

## Requirements

- **tmux** (tested on 3.4), with Claude Code started inside it (`$TMUX`
  set). The panel splits beside the session's pane and role windows open in
  a tmux session of their own; outside tmux, `/troupe` says so and
  `troupe_dispatch` refuses.
- **git**, with the mission branch and the plan committed on it, for
  `troupe_dispatch` (see below).
- **Node 22.18 or later** on the `PATH` for `bin/troupe-panel`: it runs
  `src/`'s `.ts` files with Node's type stripping.

## The panel

- `/troupe [mission]` inside tmux splits a pane to the right of the
  session's own pane, taking half the window and at least 30 columns, and
  runs `bin/troupe-panel` in it on the mission (the newest under
  `docs/missions/`, a name there, or a folder by its path). The transcript
  keeps the focus. The panel stays fixed while the transcript scrolls.
- `/troupe` again reuses the open panel (another mission redraws it in the
  same pane); a hot reload of the mod keeps it, and a panel pane that was
  closed by hand is split again.
- `/troupe close` closes it; the end of the session closes it too. If
  Claude Code dies without ending, the panel leaves within 2 s on its own
  (`--owner`).
- After it shows the plan, `/troupe` asks for the person's approval, as
  described in the next section.

`bin/troupe-panel <mission dir> [--width N] [--once] [--plain] [--owner PID]`
also runs by hand, in any terminal, and draws from `src/lines.ts`. It
redraws when what it shows changes (the folder polled every 2 s, git
every 10 s) or the terminal is resized, and exits on SIGTERM or ctrl+c.
It never draws more rows than the terminal has: the header stays on top,
and the rest scrolls, with `↑ N more` and `↓ N more rows` saying what is
out of view. ↑/↓ or j/k scroll a row, PgUp/PgDn a page, Home/End to the
ends, and the mouse wheel three rows. Keys reach it while its pane has the
focus (click it, or `tmux select-pane`; click the transcript to go back).
The wheel needs tmux's mouse mode: `set -g mouse on`. `--once`
prints one screen and exits; `--plain` drops the colours.

## Approving the plan

`/troupe <mission>` ends by asking about approval, once per call:

- A plan that passes the checks and has no valid `APPROVAL.json` raises the
  dialog "Approve the plan?" with **Approve** and **Change**.
- **Approve** writes `APPROVAL.json` in the mission folder: the SHA-256 hash
  of the `plan.md` the person was shown, and the time. Any edit of
  `plan.md`, a whitespace edit too, gives another hash, so the record no
  longer holds and the next `/troupe` asks again.
- **Change** opens a second dialog, "What should change in the plan?", with
  **Not now**, **Approve** and a free-text row. The words typed there go to
  the conversation as a prompt, `Change asked in the plan dialog: <words>;
  edit <mission folder>/plan.md, then /troupe again`, and the answer of `/troupe` ends
  `Change asked: <words>`. The next `/troupe` asks again.
- It fails closed. A blank answer, a dismissed dialog (Esc) and **Not now**
  approve nothing and say `Not approved; /troupe asks again.`. Only the
  word `Approve`, in any case, approves; typed words that are not a label
  are taken as a change.
- A plan with problems is not asked about (`Not asked: the plan has
  problems; fix plan.md first.`), and an approved plan raises no dialog.
  A second `/troupe` while a dialog is open answers `The approval dialog is
  already open.`.
- `APPROVAL.json` is advisory. The dialog is its one intended writer, but a
  file in a folder can be written by anyone, a model included. It stops a
  forgetful dispatch, not one set on getting round it.

## Dispatching the orders

The conversation is the orchestrator. Four tools are registered at session
start; the model calls them as `mcp__troupe__troupe_dispatch`,
`mcp__troupe__troupe_status`, `mcp__troupe__troupe_close` and
`mcp__troupe__troupe_metrics` (see "Metrics").

**`troupe_dispatch(mission, order, role?)`** opens one Claude window for an
order. `role` is `builder` (the default) or `reviewer`. It has two hard
rules, and refuses with a reason the model reads, before it creates anything
(it runs only read-only git commands first):

1. **No dispatch before approval.** `APPROVAL.json` must exist and match
   `plan.md` as it is now. The approved `plan.md` must also be the one the
   mission branch holds (`git show <branch>:<path>`): the window's worktree
   is cut from that branch, so an approved plan that is not committed there
   is refused (`commit it on the mission branch, then dispatch`).
2. **No dispatch while an order it `depends_on` is not done.** Done means
   merged onto the mission branch (one commit titled `<id>: …` there), not
   merely built.

In a light mission (below) a third rule holds: no dispatch of an order while
an order before it is not merged.

The reviewer is dispatched the same way (`role: "reviewer"`) and refused until
the order is built: its branch `order/<mission>/<id>` exists and its
`DONE-<id>.md` is in the mission folder (or in the builder's worktree).

It also refuses a plan with problems, an unknown order, a model that is not
`opus`, `sonnet`, `haiku` or `fable`, a mission or order id with other
characters than letters, digits, `_` and `-`, an order that already has a
live window, a tmux session named `troupe-<mission>` that troupe did not open,
and a session that is not inside tmux. Nothing the caller passes becomes a
command or a flag: every git and tmux call has a fixed shape, and the ids
are checked against the plan before they reach a path, a branch or a window
name.

**`troupe_status(mission?)`** lists each role window kept in this session: its
order, its role, whether it is running or gone, and whether its brief was
sent.

**`troupe_close(mission, window?)`** closes one window (`o1`, or
`review-o1` for a reviewer) or, with no window, the whole role session. It
touches only the session and windows troupe opened, by the ids it kept: a
session of the same name that someone else made is left alone. Worktrees and
branches stay.

### What role windows are

- A tmux session of their own, `troupe-<mission>`, on the orchestrator's
  tmux server, with one window per order (named for the order) or review
  (`review-<id>`), never a pane or window in the orchestrator's session.
- Each window runs `claude --model <model> --effort <effort> --permission-mode
  <mode>` in its own worktree, beside the repository:
  `../<repo>-<mission>-<order>`, on the branch `order/<mission>/<order>` cut
  from the mission branch. A reviewer's is `../<repo>-<mission>-review-<order>`,
  detached at the order's branch (its `-fix` branch once there is one). troupe
  does not load the mod in them (see the limit on a global install).
- **Pinned to the role.** The model is the order's `model` for a builder and
  the reviewer role's for a reviewer; the effort is the role's `effort` in
  the plan's `roles` block, so a window runs as the plan says, not as the
  person's global settings do. A role named without an effort gets `high`,
  and so does every role of a plan with no `roles` block; a role that a
  `roles` block leaves out gets no flag for it. The answer to a dispatch
  names what was pinned.
- **Pinned to the orchestrator's permission mode.** Without the flag a window
  would take the project's own mode (`settings.local.json`, for one), which
  can differ from the orchestrator's. The engine does not hand a mod the
  session's mode, so troupe reads it from the orchestrator's own transcript:
  Claude Code writes a `permission-mode` record there at the start and at
  each change, and the last one counts. Only a mode from a fixed list is
  passed (`default`, `manual`, `acceptEdits`, `plan`, `auto`, `dontAsk`,
  `bypassPermissions`), as one argument. With none readable no flag is
  passed, and the answer says the window runs in the project's permission
  mode. A mode of `bypassPermissions` is passed like any other.
- The brief is a file the mod writes in the repository's git folder,
  `.git/troupe/<mission>/<window>.md` (git tracks nothing there). It holds
  the order's worktree and branch, where to write the result, and the role
  text the mod ships (`skills/troupe-mission/references/`). The window is
  told, by a paste, `Read the brief in <path> and follow it.`
- A window that has gone is opened again on the next dispatch, in the same
  worktree. A role session that has gone is forgotten and opened again.
- Results come back as files. The builder writes `DONE-<id>.md` and the
  reviewer `REVIEW-<id>.md` (`REVIEW-<id>-<n>.md` for a re-review) in their
  own worktrees, under `docs/missions/<mission>/`. The mod copies these
  per-order files back (not `REVIEW.md` or `SLIM.md`: the orchestrator
  copies those by hand) into the orchestrator's mission folder on its 2 s poll, only the files
  git does not track in that worktree, and only when the folder has no such
  file or an older one. The panel then shows the order `done` (marker) or
  `reviewed` (review file).

### Light mode

A mission of one or two orders is light, in the dispatch rules and the
panel:

- **One after the other.** `troupe_dispatch` refuses an order while an order
  before it is not merged onto the mission branch, whatever `depends_on` says.
  "Before" is by dependency layer, then in the order `plan.md` lists them. The
  refusal names the order it waits for. A mission of three orders or more is
  untouched: independent orders can run at once.
- **No slim, no separate final review.** The review of the order that runs
  last is also the mission's final review. Its brief says so, gives the
  mission's base commit (the merge-base of the mission branch with
  `origin/HEAD`, else `main`, else `master`) and `git diff <base>..<branch>`,
  and asks for the whole mission diff and every done-when criterion in
  `plan.md`. With no base found the brief says so and tells the reviewer to
  run `git merge-base`. A re-review of that order gets the same text.
- **The view.** The header says `light`, and the steps line leaves out Slim,
  Cut and Final review. Once every order is reviewed the mission is at
  "MR OK?".

## The skill

The plugin carries `skills/troupe-mission/`, with its `references/` and the
`templates/` folder (`plan.md`, `REVIEW.md`, `SLIM.md`). It tells the
orchestrator, for anyone and not only for one team, how to run a mission in
the file shapes the panel reads. Its steps:

1. **Brief**: who wants the outcome, what it is for, what counts as done.
2. **Plan**: `docs/missions/<mission>/plan.md` on the mission branch, split by
   coupling, with declared `touches` and a `model` per order.
3. **Approve** the plan in the `/troupe` dialog (the one human gate before
   work starts).
4. **Dispatch** the orders by dependency layer with `troupe_dispatch`, one
   role window and worktree each; **review** each order as it lands, then the
   orchestrator alone merges it onto the mission branch.
5. In full mode (three orders or more): the **slim pass** and one round of
   cuts, then one **final review** across orders. Light mode has neither.
6. **Fix rounds**: one fix and one re-review per review, then the
   orchestrator rules.
7. **MR gate**, then the MR is opened; **merged gate**, where only a human
   merges.
8. **Teardown**: confirm with the forge, call `troupe_metrics`, then close the
   windows and remove the worktrees and branches.

`troupe_dispatch` takes an order's build and its review. Agent subagents take
what it does not: an order's fixer, the slim pass and its cuts, and the final
review. They are also the fallback when there is no tmux or the troupe tools
are not loaded: the skill then runs the orders as Agent subagents too. A
project's `verify-<app>` skill is used when the plan names it, else skipped.

## Metrics

**`troupe_metrics {mission}`** writes `docs/missions/<mission>/metrics.json`
and answers its path and a one-line summary. The skill calls it at teardown,
before anything is removed (it finds the role windows by their worktree
paths) and before any fetch after the merge (the base commit is read with the
mission branch not yet merged into its base). It reads `plan.md`,
`APPROVAL.json`, the review files in the mission folder, git, and the Claude
Code transcripts of the orchestrator, of its subagents and of the role
windows, found by worktree path. The fields:

- `mode` (`light` or `full`), `mission_branch`, `base_commit`,
  `base_commit_from`, `mr_ready_commit`, `claude_version`.
- `orders`: per order `model`, `merged`, `review_rounds`, `fix_rounds`,
  `wall_time_s` (its dispatch to its merge) and `diff_size`.
- `review_rounds` (`orders`, `final`, `total`) and
  `refused_dispatches` (a `count` and the `reasons`).
- `time`: `approved_at`, `mr_ready_at`, `plan_approved_to_mr_ready_s` and
  `wall_time_s`.
- `tokens`: per role (`orchestrator`, `builder`, `reviewer`) and `total`,
  `input_tokens`, `output_tokens`, `cache_write_tokens`, `cache_read_tokens`,
  `cost_usd`, and per role `model_effective` and `effort_effective`, read
  back from the transcripts. `coordination_share` is the orchestrator's and
  the reviewers' tokens over all.
- `quality.diff_size` and `rework` (`fix_rounds`, `refusals` by kind,
  `prompts_in_role_windows`), `subagents`, and `prices`.

Cost is at API list prices, for comparison; nothing is billed per token on a
login. Cache reads and the 5-minute and 1-hour cache writes are priced apart,
and `prices` lists the table used. `diff_size` leaves out the mission folder,
whose plan, approval and review records are not the product change; the
sheet says so in `diff_size_from`.

What troupe cannot know is `null`, with its reason under `nulls`, keyed by
the field's path, never a guess: the human's attention, interruptions and
waiting time, the blind review, the project's own check, the hand test,
churn, and time blocked on a refusal. The same goes for a transcript not
found, a model with no price in the table (Haiku), or an order not merged.
The sheet is the one `docs/missions/p4/compare.md` asks for. The transcript
format is Claude Code's and moves: a line that is not JSON is skipped and
noted under `nulls`, and the counts may then be low.

## Known limits

- **Prompts inside a role window are the person's to answer.** A permission
  prompt, a question from the builder, or the trust dialog of an untrusted
  repository waits in that window. A brief typed under a permission prompt
  would be lost and its Enter would approve the pending call, so dispatch
  types only into a window it has just opened, and only once claude's input
  box shows. If no box shows within 30 s it types nothing and says so; if
  the prompt is still in the box after the Enter, it says so, and the person
  presses Enter there. The brief is in the git folder, outside the worktree:
  an account not in auto mode may be asked to allow reading it.
- **The brief is pasted, not typed.** Raw keys sent to a claude that has just
  started can leave the Enter as a newline (`docs/FEASIBILITY.md`, case 12).
- **`APPROVAL.json` is advisory** (above).
- **Results are collected only for the mission the panel shows**: the newest
  `plan.md`, or the one `/troupe` names. Run `/troupe <mission>` to collect
  another mission's.
- **Done means merged.** A `DONE-<id>.md` shows the order as `done` on the
  panel, but does not release an order that depends on it; the orchestrator
  merges first.
- **A committed result file.** If a builder commits its `DONE-<id>.md`, or a
  reviewer its report, after the mod copied it, remove the copy in the
  mission folder before merging; the mod logs this once. It cannot delete
  files itself.
- **Role windows inherit the tmux server's environment**, not the
  orchestrator's. Start the tmux server from a plain shell.
- **A globally installed troupe loads in role windows too.** troupe starts
  them with `claude --model`, `--effort` and `--permission-mode` only.
  `claude --bare` would skip the hooks of installed plugins, but it also
  skips settings hooks, LSP, auto-memory and more, so troupe does not pass
  it. Load troupe with
  `--plugin-dir` or from the session's mods folder instead.
- **The base commit is a guess.** Light mode's final review and
  `metrics.json` take the merge-base of the mission branch with `origin/HEAD`,
  `main` or `master`. A mission cut from another branch gets a base that is
  too old.
- **A research order** has no `<id>: ` merge commit, so in a light mission
  the serial rule would wait for it for ever.
- **`metrics.json` prices Sonnet 5.5 from the claude-api skill's list, which
  is not confirmed.** Claude Code's own per-session cost tally disagrees with
  it on some sessions.
- **A resumed orchestrator session under a new id is missed** by
  `troupe_metrics`: it reads the transcript of the session it runs in.
- **Role windows exist only for an order's build and review.** A fixer, the
  slim pass and the final review run as Agent subagents on the orchestrator's
  login, with no window to watch.
- **The role windows' own progress** (what a window is doing) is not shown;
  the panel knows an order only as planned, running (its branch is ahead of
  the mission branch), done or reviewed.
- **macOS**: the mod has not been run there yet, and one panel test needs
  GNU `script -c` and `timeout` (ROADMAP, Phase 5).

## What the panel shows

The panel reads `docs/missions/<mission>/plan.md` under the
session's working directory: the mission whose `plan.md` changed last (on a
tie, the higher name, so `p1` over `p0`), or the one named by
`/troupe <mission>`. `/troupe <path>` takes a mission folder by its path
instead, such as `/troupe ../other-checkout/docs/missions/p1`. It is drawn
in the OpenRig TUI's own style and colours, most important first (the
panel scrolls what does not fit):

1. **Header**: `TROUPE · <mission> · light · plan checks clean · <goal>`. The
   goal is the `goal:` key of the plan's YAML block, else the first
   sentence of its Intent.
2. **Graph**, like OpenRig's topology view, and like it showing only the
   roles and the human checkpoints: a double box "▦ MISSION" holding
   ≡ orchestrator (the plan, the MR), ≡ builder (its orders) and ≡ reviewer
   ("review <id>" or idle), joined by ━━▶, with ◆ Plan OK? after the plan
   and ◆ MR OK? and ◆ Merged? at the end, and a "fix ≤ 2" arrow looping
   from reviewer back to builder. The current box is orange and bold, done
   green ✓, waiting grey. Below 107 columns the flow stacks top to bottom.
3. **ROLES and ORDERS**, one line each: a role's glyph, name, model, state
   and what it is on; an order's glyph, id, model, state and `← ` the
   orders it waits on. A role's state comes from what the panel reads: the
   orchestrator "needs you" at a gate, the builder works while an order
   runs, the reviewer while one is done but not reviewed.
4. **Detail**, like OpenRig's detail view: `── GOAL`, `── ORDERS · n` and
   `── ROLES · n`, each role with its model, effort meter, duty bullets and
   skills.

Below 46 columns the ROLES and ORDERS lines leave out the model. Below 48
columns each DETAIL label takes its own line, with the value under it.

A role in the plan's `roles` block is either `name: [skills]` or a mapping
with `model`, `effort`, `duty` (a list of lines) and `skills`; what it
leaves out, and a plan with no block, gets the defaults for orchestrator,
builder and reviewer. An order's state comes from the mission's
own artefacts, in this order: `reviewed` with a `REVIEW-<id>.md` (or
`REVIEW-<id>-<n>.md`) in the mission folder; `done` once merged onto the
mission branch (one commit titled `<id>: …`) or with its `DONE-<id>.md` in
the folder; `running` while its branch `order/<mission>/<id>` has
commits the mission branch lacks; else `planned`.
The mission branch is the local branch named for the mission
(`feature/NO-JIRA-p2`, or `p2`); git is asked at most every 10 s. A review
that fails still counts as reviewed, so an order in a fix round stays
`reviewed`. The step reaches "Final review" once `SLIM.md` is on the mission
branch. A light mission is at "MR OK?" once every order is reviewed.

The header says whether the plan passes the rules of the kit's
`plan_lint.py`: a code order without `touches` or `why`, an unknown or cyclic
`depends_on`, a duplicate id, overlapping `touches` with no `depends_on`
between them, and YAML it cannot read; and a role's effort that is not one
of `low`, `medium`, `high`, `xhigh`, `max`. A plan with no orders read is
not called light. The problems are listed under GOAL;
they never stop the drawing.

It polls plan.md every 2 s and redraws when the file changes.
`templates/plan.md` is the plan format with `goal` and the full
`roles` block. Keep each value on one line: the panel reads the YAML that
format uses, and flags anything else (`|` or `>` blocks, multi-line values,
`\u` escapes) as a problem with its line.

## Loading it

The plugin carries the skill `troupe-mission` (see "The skill").

- From a checkout: `claude --plugin-dir <this repo>`.
- While developing: load the `plugin-authoring` skill in a session, and write
  the mod under the folder it names (`~/.claude/dev-mods/<session>/troupe/`).
  The person answers "Turn them on" once, and every edit reloads at the end
  of the turn. Keep that copy and this repo identical.

## Checking it

`./check.sh` runs `claude plugin validate .`, `claude plugin test .`, the
Node test of troupe-panel (on macOS its terminal test fails: it needs GNU
`script -c` and `timeout`) (`node --test tests/panel.node.mjs`), the workflow
walkthrough check (`docs/missions/workflow/check-sample.mjs`) and
`tsc -p .` (after `npm install`). `tsc` needs the API types the engine lays
in `.claude-plugin/types/` when it loads the mod from this folder; without
them the script says so and skips `tsc`.

The acceptance run, a real two-order mission run through troupe, was not
done. It was deferred in Phase 3 and closed on 2026-10-24 (issue #3): it
would have measured the mod that the new direction replaces. So light mode
and `troupe_metrics` are covered by the plugin tests and the order reviews
only. The comparison protocol, `docs/missions/p4/compare.md`, may come back
for the new form.
