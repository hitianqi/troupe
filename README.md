<p align="center"><img src="assets/icon.svg" width="112" alt="troupe icon"></p>

<h1 align="center">troupe</h1>

<p align="center"><b>Run a team of coding agents you can actually watch.</b><br>
One plan you approve, then every role in a real terminal window of its own,<br>
in its own git worktree, on Claude Code or Codex.</p>

<p align="center">
  <a href="LICENSE"><img alt="license: MIT" src="https://img.shields.io/badge/license-MIT-2F5079"></a>
  <a href="#agents"><img alt="agents: Claude Code and Codex" src="https://img.shields.io/badge/agents-Claude%20Code%20%C2%B7%20Codex-F29B7A"></a>
  <img alt="runs in tmux" src="https://img.shields.io/badge/runs%20in-tmux-7FA9D9">
  <img alt="node 20 or later" src="https://img.shields.io/badge/node-%E2%89%A5%2020-2F5079">
  <a href="https://github.com/hitianqi/troupe/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/hitianqi/troupe/actions/workflows/ci.yml/badge.svg"></a>
</p>

<p align="center"><img src="docs/media/panel-live.gif" width="860" alt="The troupe panel beside the orchestrator: roles, stages, activity and a flow of the roles as they work"></p>

## Why troupe

- **You see every agent.** Each role is a live Claude Code or Codex session in
  its own tmux pane. Jump into any of them, read along, or type to it directly;
  nothing hides inside a subagent.
- **Nothing starts before you approve the plan.** The orchestrator writes a
  plan with you; the panel shows the goal, the done-when list and who runs each
  role. Press `a`, or `c` to send a change back. Edit the plan later and it needs
  approval again.
- **No two agents in the same files.** One role is one worktree, one branch
  and one pane. Roles whose files overlap must be ordered, or `troupe check`
  refuses the plan.
- **Mix agents and models per role.** A Claude Code builder, a Codex builder and
  a reviewer on a third model, each with the effort and permission flags you
  pin in the plan.
- **A reviewer on every branch, and gates where it matters.** A reviewer role
  checks each branch as it lands; you approve the MR and confirm the merge
  before anything is torn down.

## Quick start

You need tmux (macOS, Linux or WSL2), Node 20+, git, and Claude Code and/or
Codex on the `PATH`.

```sh
npm install -g troupe-cli
troupe setup        # installs the troupe-mission skill for Claude Code and/or Codex
```

Then, inside tmux, open Claude Code or Codex in the repository you want to
change and ask for a mission:

```
Run a troupe mission: add a search box that filters the list as you type,
and a dark theme that follows the system setting.
```

The panel opens beside your agent, and the plan shows up in it for approval.
(`troupe up -m <mission>` starts the orchestrator and the panel for you
instead.)

## How a mission runs

**1. Plan, then approve.** The orchestrator reads the code, writes
`docs/missions/<mission>/plan.md` and runs `troupe check` until it is clean.
You read the plan in the panel, send a change, and approve.

<p align="center"><img src="docs/media/plan-review.gif" width="860" alt="Scrolling the plan in the panel, sending a change, and approving the revised plan"></p>

**2. Roles open, each in its own window.** Independent roles start at once;
the others wait for what they depend on. When a role waits on you (a
permission, a question), the panel says so; `o` jumps to its pane, you answer
there, and come back.

<p align="center"><img src="docs/media/roles-live.gif" width="860" alt="The roles window: a Claude Code builder, a Codex builder and a reviewer working side by side"></p>

**3. Review as each branch lands.** The reviewer checks every branch; findings
go back to the same window for one fix round, then the orchestrator merges onto
the mission branch.

**4. Land it.** At the MR gate you approve opening the MR. You merge it,
answer `Merged?` in the panel, and only then are the role windows and worktrees
removed.

<p align="center"><img src="docs/media/mr-gate.gif" width="860" alt="The MR gate, the Merged? gate and teardown closing the role windows"></p>

Several missions can run at once, in one repository or in several: start each
from its own agent pane. Your checkout stays on its branch throughout; each
mission works in `.troupe/missions/<mission>` on `mission/<mission>`. In
herdr, the panel opens in a herdr pane beside the agent, attached to troupe's
tmux session.

How a mission runs (when to review, when to merge, which gates) is a workflow
skill, `skills/troupe-mission`, that you can change or replace. The CLI only
enforces what keeps the work correct.

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

From a clone: `npm ci && npm run build && npm link` puts your build of
`troupe` on the `PATH`. `./check.sh` (or `npm test`) builds and runs the tests under plain Node; CI
runs them on macOS and Linux with Node 20 and 22. `src/` holds everything:
the plan (`plan.ts`, `yaml.ts`, `touches.ts`), the adapters (`agents.ts`),
the log and the live reads (`log.ts`, `state.ts`), the commands
(`commands.ts`, `role-commands.ts`, `command-context.ts`, `missions.ts`,
`panes.ts`, `setup.ts`), and the panel (`model.ts`, `draw.ts`, `canvas.ts`, `panel*.ts`).
