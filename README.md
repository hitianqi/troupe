<p align="center"><img src="assets/icon.svg" width="128" alt="troupe icon"></p>

# troupe

One command calls up an agent troupe. The orchestrator writes a plan with
you; once you approve it, every role opens in a real tmux window of its own,
in its own git worktree and branch, where you can watch it and talk to it
directly. A panel beside the orchestrator stays open and shows the work as it
moves. The orchestrator and each role run Claude Code or Codex, with the
model you pick per role.

No harness to configure: the plan says who does what, and `troupe` keeps the
work correct. No role window opens before the plan, as it is now, is
approved; one role is one worktree, one branch and one pane; nothing is
typed into a window that is not ready for it; every role's permission is
pinned in the plan, never inherited. How the mission runs (when to review,
when to merge, which gates) is a workflow skill you can replace.

`ROADMAP.md` holds the direction and the phases.

## Requirements

- **tmux** (macOS, Linux or WSL2).
- **Node 20 or later** and **git**.
- **Claude Code** and/or **Codex** on the `PATH`.

## Install

Not on npm yet. From a clone:

```sh
npm ci && npm run build && npm link   # puts `troupe` on the PATH
troupe setup                          # installs the workflow skill for Claude Code and/or Codex
```

`troupe setup` copies `skills/troupe-mission/` to `~/.claude/skills/` and
`~/.agents/skills/` for the harnesses it finds, marks its copies, updates
them when run again, and never overwrites a skill folder it did not write.
`troupe setup --remove` takes its copies away.

## A mission

You can also start from an agent you already have open: ask it to run a
troupe mission; it runs `troupe open --planning` to show the panel while
preparing the plan, then `troupe mission new <mission>`, which gives the
mission its own worktree and binds it to that agent's pane. In tmux the panel splits off beside the agent; in
herdr it opens in a herdr pane
beside the agent, attached to troupe's tmux session; elsewhere it prints the
`tmux attach` line (on macOS, Terminal or iTerm2 opens with it).

In the repository you want to change:

```sh
troupe up -m <mission>    # or: troupe up -m <mission> --orch codex
```

troupe creates the mission's worktree, `.troupe/missions/<mission>` on a new
branch `mission/<mission>` cut from your current branch, and opens a
`mission` window: the orchestrator on the left, working in that worktree,
the panel on the right. Your checkout stays on its branch. Inside tmux it
uses the current session; outside, it starts one and attaches. Then:

1. Tell the orchestrator what you want. It writes
   `docs/missions/<mission>/plan.md` in the mission worktree and runs
   `troupe check` until it is clean.
2. The panel shows the plan gate: the goal, why, the done-when list and, per
   role, its agent, model, effort, flags, task, when it starts and the files
   it touches. `a` approves; `c` sends your change back to the orchestrator.
   (`troupe approve` in a terminal works too; a model's shell call cannot
   approve.)
3. The orchestrator dispatches the roles. Each opens in the
   `roles-<mission>` window, in `.troupe/worktrees/<mission>/<role>` on
   branch `role/<mission>/<role>`.
   The panel marks a role that waits on you (a trust prompt, a permission):
   `o` jumps to its pane, you answer there, and come back.
4. A reviewer role checks each branch as it lands; findings go back to the
   same window for one fix round; the orchestrator merges onto the mission
   branch. At the MR gate you approve opening the MR. You merge it, then
   answer `Merged?` in the panel; only then are the role windows and
   worktrees removed.

Several missions can run at once, in one repository or in several: start
each from its own agent pane. Each has its own worktree, panel and roles
window, and every command acts on the mission bound to the pane it runs in.

## The plan

Markdown around one fenced yaml block; each role's task is a
`## Role: <name>` section in the Markdown. The template is
`skills/troupe-mission/templates/plan.md`.

```yaml
troupe: 1
goal: "Refresh tokens rotate on every use, and a reused one is refused"
why: "Stolen refresh tokens stay valid for 30 days today (issue #212)"
workflow: troupe-mission
base: mission/auth-refresh
profiles:
  claude-build:
    agent: claude
    model: opus
    effort: high
    flags: [--permission-mode, acceptEdits]
    text: workflow:builder
roles:                                # one role = one window, worktree and branch
  api:
    agent: codex
    model: gpt-6.1-sol
    effort: high
    flags: [-a, on-request, -s, workspace-write]
    goal: "Rotate the token on refresh; refuse a reused one"
    touches: [src/api/refresh.ts, src/api/errors.ts]
  web:
    use: claude-build
    model: sonnet
    goal: "Sign the user out when a refresh is refused"
    touches: [web/src/session/]
    depends_on: [api]                 # opens once api's result says done
  review:
    use: claude-build
    goal: "Review each branch as it lands"
    touches: []                       # changes no files
    reviews: [api, web]
    text: workflow:reviewer
```

`troupe check` refuses: an unknown agent; `flags` that do not pin the
agent's permission (Claude Code: `--permission-mode`; Codex: `-a` and `-s`);
a role with no text or no `touches`; an unknown `depends_on`, `reviews` or
profile; a dependency cycle; two roles whose `touches` overlap without a
`depends_on` between them. `model` and `effort` are passed as written.

## Commands

All take `-m, --mission <name>`. Without it, a command acts on the mission
bound to the pane it runs in (a panel follows its orchestrator's), else on
the `mission/<name>` branch checked out where it runs; otherwise it refuses
and lists the open missions with their worktrees. `-m` reads the plan from
the mission's worktree from anywhere, but refuses to name another mission
than the pane's own. Exit 0 on success, 1 when refused (with the reasons), 2
on usage errors.

| Command | What it does |
|---|---|
| `setup [--remove]` | install the workflow skill for each harness found |
| `mission new <name> [--base <ref>]` | create the mission's worktree on `mission/<name>` with the plan template, bind this pane to it and open its panel |
| `open [--planning]` | show this pane's mission's panel beside it (one per mission); without a mission it refuses and lists the open ones, except with `--planning`, which shows a panel waiting for `mission new`; `open -m <name>` from an unbound pane makes it that mission's orchestrator, only once the previous orchestrator pane is gone or dead |
| `up -m <name> [--orch claude\|codex]` | `mission new`, then open the orchestrator in the mission worktree and the panel |
| `panel` | the live panel (`up` runs it; `--once --plain` prints one frame) |
| `check` | check the plan and the user adapters |
| `approve` | approve the plan, from a terminal only |
| `gate <id> ["question"] [--no-wait]` | ask the person in the panel; prints `approve` or `change: <text>` |
| `stage <id>` | move the panel's stage strip (ids from the workflow's `stages.yaml`) |
| `dispatch <role>` | open a role: worktree, branch, brief, pane |
| `status [--json] [--watch]` | each role's state, commits, changes outside `touches`, result; with no mission resolved, the open missions with their worktree, orchestrator pane and panel pane |
| `send <role> <text…>` | type into a role's window, only when it is ready |
| `wait --role <r> [--ready] \| --gate <id> [--timeout s]` | wait for a result, readiness or an answer |
| `close <role> \| --all` | close troupe's panes; worktrees and branches stay |
| `teardown [--force]` | close role panes and the mission's panel, remove role worktrees, role branches, the mission worktree and temporary mission briefs/results; preserve the mission branch and log |

An open mission has a worktree on its `mission/<name>` branch or a log, and
no teardown event. Explicit `-m` opens any mission, including a finished
one. Until its orchestrator is bound, the panel waits for one.

Once the MR is merged and its `merged` gate approved, run `troupe teardown -m
<mission>`. It closes role panes and the mission's panel, and unbinds the
orchestrator's pane, which stays open. It refuses while any gate the
workflow declares is not approved, and refuses dirty or untracked work,
commits unmerged into the plan's `base` mission branch, and an unpushed
mission branch, unless `--force`. Panes with a different owner marker are skipped. Repeating it
with explicit `-m` reports nothing left. The MR head and log stay available.

Use `troupe wait --role <r> --ready --timeout 60` after dispatch or before
sending new work. It succeeds on ready, stops with the dialog on waits, and
fails if the pane is gone or the timeout expires.

A role finishes by writing `.troupe/result.md` in its worktree, with front
matter `status: done | blocked | failed` and `summary: "<one line>"`.

## The panel

Title bar, tabs (`1 MISSION`, `2 ROLES`, `3 PLAN`, `4 LOG`, `5 DIFF`), the
needs-you strip (an open gate, each role waiting on you), then roles, stages
and activity on the left and the flow plus the selected role's detail with
its window live on the right. ↑↓ or j/k select a role, `o` opens its pane,
`s` sends it a message (a dead key while it waits on you), `d` diff, `v`
plan, `a` / `c` answer a gate, `?` help, `q` quits. Clicks work where tmux
passes the mouse (`set -g mouse on`).

## Agents

Built in: `claude` and `codex`. An adapter says how to start the agent with
a first prompt, how to pass model and effort, which flags pin its
permission, and which screen patterns mean waits on you, working and ready.
Add one as `~/.config/troupe/agents/<name>.yaml` or
`<repo>/.troupe/agents/<name>.yaml` (the repository's wins); `src/agents.ts`
holds the built-ins in the same shape.

A built-in role's turn comes from its agent, not its screen. Claude roles
start with lifecycle hooks in `--settings` (`UserPromptSubmit`,
`PermissionRequest`, `PostToolBatch`, `Stop`, and the idle notice after an
interrupt) that write `.troupe/activity.json`; Codex roles are read from
their own session log (`task_started`, `task_complete`, `turn_aborted`).
Only that report makes a role ready for `send`. A Claude role's hooks also
report when it waits on you: `PermissionRequest` opens the wait (an approval
or a question), the next tool batch ends it as answered, and a deny or Esc,
which runs no hook, ends it with the interrupt row in the role's transcript.
Each wait's end is kept in the record (the last 50).
Otherwise, while a turn runs, the screen patterns tell waiting on an
approval from working; before the first report they stand in, but never as
ready. An adapter with `usage` unset is read from its screen alone.

The orchestrator is told, not polled. Every troupe command it runs records
its agent session in the run log: Claude Code's `CLAUDE_CODE_SESSION_ID` or
Codex's `CODEX_THREAD_ID`, accepted only when that agent is an ancestor of
the command, and the pane to type to (tmux, or herdr's `HERDR_PANE_ID`).
When a role's agent reports its turn over with a result written, the
person answers a gate in the panel, or the person answers a Claude role's
wait in its window (`Role review was answered in its window and went on
working.`, or `… was stopped in its window …` after a deny or Esc), the
panel types one line into the orchestrator after the orchestrator's own
turn has ended, read from its transcript (Claude's `turn_duration` or
interrupt row) or session log (Codex). Every answered wait is told once,
oldest first, unless the role's finish was told, work was sent to it, or it
wrote a result since. Each line is logged as a `notice`, so none repeats or
is lost across panel restarts. A mission with no recorded session falls back to
the old screen-checked gate answers.

Codex roles open without the "Trust this folder?" dialog: each is started
with `-c projects={"<main checkout>"={trust_level="trusted"}}`, the entry
answering the dialog would save (Codex keys trust by the repository root),
for that run only; `~/.codex/config.toml` is not changed.

Codex roles using `workspace-write` receive `--add-dir` grants for their own
Git worktree metadata, shared `objects`, and `refs/heads/role/<mission>` plus
its reflogs. This allows commits without granting the whole common Git
directory or main-branch refs. Mission refs and objects are shared, so this
is not isolation between roles in the same mission. The approval/sandbox
flags remain the ones in the plan. See the [Codex CLI reference](https://developers.openai.com/codex/cli/reference).

## Where things live

| What | Where | In git |
|---|---|---|
| the mission worktree | `.troupe/missions/<mission>` on `mission/<mission>` | no |
| the plan | `docs/missions/<mission>/plan.md` in the mission worktree | yes |
| the run log (approvals, gates, stages, dispatches) | `<git-common-dir>/troupe/<mission>/log.jsonl` | no |
| the role's launch brief | `<worktree>/.troupe/brief.md` (archived beside the run log as `brief-<role>.md`) | no |
| role worktrees | `.troupe/worktrees/<mission>/<role>` (`/.troupe/` is excluded) | no |
| a role's result | `<worktree>/.troupe/result.md` | no |

## Known limits

- The log is advisory, as any file is: it stops a forgetful dispatch, not a
  model set on writing it by hand.
- Screen patterns come from Claude Code 2.1.310 and Codex 0.162.1 in
  English. They no longer decide when a built-in role is ready, only whether
  a running turn waits on you; a screen troupe does not recognise is
  `unknown` and is never typed into.
- Codex logs no approval request, so a Codex role waiting on one shows as
  waits only while its screen pattern matches; either way it is not ready.
  Its answer is not told to the orchestrator.
- Context use comes from each role's transcript. Codex logs its window; for
  Claude, troupe launches the role with a status line (`--settings`) that
  saves the window Claude Code reports to `.troupe/context.json`, then runs
  the status line you configured, so yours still shows. Until it first runs,
  the panel assumes 200k, or 1M once the context passes 200k.

## Development

`./check.sh` (or `npm test`) builds and runs the tests under plain Node; CI
runs them on macOS and Linux with Node 20 and 22. `src/` holds everything:
the plan (`plan.ts`, `yaml.ts`, `touches.ts`), the adapters (`agents.ts`),
the log and the live reads (`log.ts`, `state.ts`), the commands
(`commands.ts`, `role-commands.ts`, `command-context.ts`, `missions.ts`,
`panes.ts`, `setup.ts`), and the panel (`model.ts`, `draw.ts`, `canvas.ts`, `panel*.ts`).
