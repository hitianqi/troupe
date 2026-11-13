# Changelog

## 0.7.0

- The live panel moves: spinners, breathing borders, state pills and
  tokens/s sparklines on each role; packets run along FLOW, a finished branch
  lights the way to review, and the panel opens by drawing the dispatch. It
  repaints only the cells that change.
- FLOW is laid out as a dependency tree: a role hangs under the one it waits on.
- ROLES, PLAN, LOG and DIFF are redrawn: role cards with context gauges; the
  plan as rendered Markdown with contents, its execution shape and its
  problems next to the roles they concern; LOG as key=value lanes that follow
  the newest event; DIFF as a file tree with hunks and a minimap.
- The panel switches between English and Chinese (`中/EN` or `L`), and the
  agents write what you read in the language you chose.
- While the orchestrator drafts the plan, PLAN says so and for how long.
- Done-when criteria are ticked one by one as the reviewer passes them; the
  reviewer lists them as `done_when` in its result.
- New README GIFs, in English and Chinese.

## 0.6.0 — first public release

- `troupe` CLI: write a mission plan, approve it, and run each role as a real
  Claude Code or Codex session in its own tmux window, git worktree and branch.
- Live panel beside the orchestrator: roles, stages, activity, the plan and a
  log; approve or request changes from the panel.
- Gates: plan approval, role dependencies, declared file overlaps, agent
  permissions, and your confirmation before the pull request and cleanup.
- Several missions at once, in one repository or across repositories.
- Workflow skill installed by `troupe setup`.
