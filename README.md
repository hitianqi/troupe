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

In the repository you want to change:

```sh
troupe up                 # or: troupe up --orch codex
```

troupe opens a `mission` window: the orchestrator on the left, the panel on
the right. Inside tmux it uses the current session; outside, it starts one
and attaches. Then:

1. Tell the orchestrator what you want. It writes
   `docs/missions/<mission>/plan.md` and runs `troupe check` until it is clean.
2. The panel shows the plan gate: the goal, why, the done-when list and, per
   role, its agent, model, effort, flags, task, when it starts and the files
   it touches. `a` approves; `c` sends your change back to the orchestrator.
   (`troupe approve` in a terminal works too; a model's shell call cannot
   approve.)
3. The orchestrator dispatches the roles. Each opens in the `roles` window,
   in `.troupe/worktrees/<mission>/<role>` on branch `role/<mission>/<role>`.
   The panel marks a role that waits on you (a trust prompt, a permission):
   `o` jumps to its pane, you answer there, and come back.
4. A reviewer role checks each branch as it lands; findings go back to the
   same window for one fix round; the orchestrator merges onto the mission
   branch. At the MR gate you approve opening the MR. You merge it.

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

All take `-m, --mission <name>` (default: the newest open mission under
`docs/missions/`). Exit 0 on success, 1 when refused (with the reasons), 2
on usage errors.

| Command | What it does |
|---|---|
| `setup [--remove]` | install the workflow skill for each harness found |
| `up [--orch claude\|codex]` | open the orchestrator and the panel |
| `panel` | the live panel (`up` runs it; `--once --plain` prints one frame) |
| `check` | check the plan and the user adapters |
| `approve` | approve the plan, from a terminal only |
| `gate <id> ["question"] [--no-wait]` | ask the person in the panel; prints `approve` or `change: <text>` |
| `stage <id>` | move the panel's stage strip (ids from the workflow's `stages.yaml`) |
| `dispatch <role>` | open a role: worktree, branch, brief, pane |
| `status [--json] [--watch]` | each role's state, commits, changes outside `touches`, result |
| `send <role> <text…>` | type into a role's window, only when it is ready |
| `wait --role <r> [--ready] \| --gate <id> [--timeout s]` | wait for a result, readiness or an answer |
| `close <role> \| --all` | close troupe's panes; worktrees and branches stay |
| `teardown [--force]` | close role panes and remove role worktrees, role branches and temporary mission briefs/results; preserve the mission branch and log |

An open mission has a log without a teardown event, or an uncommitted
plan with no log. Committed historical plans without logs are skipped.
Explicit `-m` opens any mission, including a finished one. With none open,
the panel waits for a new plan.

After opening the MR, run `troupe teardown -m <mission>`. It closes only
role panes; the orchestrator and panel panes opened by `up` stay open.
It refuses dirty or untracked work and commits unmerged into the plan’s
`base` mission branch unless `--force`. Panes with a different owner marker
are skipped. Repeating it with explicit `-m` reports nothing left. The MR
head and log stay available.

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

## Where things live

| What | Where | In git |
|---|---|---|
| the plan | `docs/missions/<mission>/plan.md` | yes |
| the run log (approvals, gates, stages, dispatches) | `<git-common-dir>/troupe/<mission>/log.jsonl` | no |
| the briefs | `<git-common-dir>/troupe/<mission>/brief-<role>.md` | no |
| role worktrees | `.troupe/worktrees/<mission>/<role>` (`/.troupe/` is excluded) | no |
| a role's result | `<worktree>/.troupe/result.md` | no |

## Known limits

- The log is advisory, as any file is: it stops a forgetful dispatch, not a
  model set on writing it by hand.
- Screen patterns come from Claude Code 2.1.310 and Codex 0.162.1 in
  English; a screen troupe does not recognise is `unknown` and is never
  typed into. Context use is on neither harness's default screen, so the
  panel shows `—`.

## Development

`./check.sh` (or `npm test`) builds and runs the tests under plain Node; CI
runs them on macOS and Linux with Node 20 and 22. `src/` holds everything:
the plan (`plan.ts`, `yaml.ts`, `touches.ts`), the adapters (`agents.ts`),
the log and the live reads (`log.ts`, `state.ts`), the commands
(`commands.ts`, `role-commands.ts`, `command-context.ts`, `panes.ts`,
`setup.ts`), and the panel (`model.ts`, `draw.ts`, `canvas.ts`, `panel*.ts`).
`docs/` is the record: the feasibility probes and the missions that built
troupe's first form, a Claude Code mod.
