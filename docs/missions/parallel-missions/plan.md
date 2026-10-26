# parallel-missions: run several missions at once

## Intent

Several missions should run at the same time, in one repository or in several,
each with its own orchestrator, panel and roles window, none acting on another
([#36](https://github.com/tianqizhao0704/troupe/issues/36)). Which mission a
command acts on becomes a deterministic rule in the CLI, not something the
skill asks the orchestrator to remember: a mission is bound to its
orchestrator's pane and lives in its own worktree, and troupe refuses rather
than guesses.

## Done when

- Two orchestrators in one repository each run a mission to the MR gate at once, neither passing `-m`.
- Each mission has its own panel and its own roles window; neither shows the other's roles or gates.
- The person's main checkout never changes branch; each mission branch lives in its own worktree.
- A troupe command whose mission cannot be determined refuses and lists the open missions; it never picks the newest.
- `troupe status` with no mission, outside any mission, lists open missions with their worktree and panel.
- Tests cover two open missions in one repository and one mission each in two repositories.

## Out of scope

- Missions that keep their plan in the main checkout (the current layout): no fallback for them.
- Running two missions in one orchestrator pane.
- Panel layout or drawing changes beyond showing which mission it belongs to.

## Decisions for you

1. **Old-layout missions.** Drop them, or keep "newest open plan in the main
   checkout" as a fallback? **Recommended: drop**, because the fallback is
   exactly the silent wrong-mission behaviour this removes; no mission is open
   in the old layout now.
2. **`troupe up`.** It opens an orchestrator before a mission has a name.
   **Recommended: `up -m <m>` is required**, creates the mission worktree and
   starts the orchestrator in it, bound to `<m>`; `up` without `-m` refuses.
3. **Teardown and the mission worktree.** **Recommended: teardown also removes
   the mission worktree** (after the branch is pushed) and unbinds the
   orchestrator pane; the `mission/<m>` branch stays as the MR head.

## How the work is split

One builder. The binding rule, the resolver every command calls, the panel
and roles-window marks, dispatch, teardown and their tests all change
together: the resolver reads the pane marks that `open` and `mission new`
write, and `tests/commands.node.mjs` covers all of them. Two builders would
share that test file and the resolver's contract. The builder is Claude and
the reviewer Codex, so the review is not on the builder's model.

```yaml
troupe: 1
goal: "Several missions run at once, each bound to its orchestrator pane and its own worktree"
why: "One open mission per repository blocks running independent changes in parallel (#36)"
workflow: troupe-mission
base: mission/parallel-missions
roles:
  missions:
    agent: claude
    model: claude-opus-5-5
    effort: medium
    flags: [--permission-mode, acceptEdits]
    text: workflow:builder
    goal: "Bind each mission to its orchestrator pane and worktree; make mission resolution deterministic"
    touches: [src/, tests/, skills/troupe-mission/SKILL.md, README.md]
  review:
    agent: codex
    model: gpt-5.6-sol
    effort: medium
    flags: [-a, on-request, -s, workspace-write]
    goal: "Review the missions branch"
    touches: []
    reviews: [missions]
    text: workflow:reviewer
```

## Role: missions

Read issue #36 first. Today a command without `-m` acts on the newest open
plan (`findPlan` in `src/check.ts`), the panel and orchestrator marks are keyed
by repository root (`src/panel-open.ts`, `src/orchestrator.ts`), dispatch
tiles every role into one window named `roles` (`rolesWindow` in
`src/panes.ts`), and the skill creates `mission/<m>` in the person's checkout.

Build this:

1. **`troupe mission new <m>`.** Refuses if `<m>` is not a valid name, already
   has a log, a branch or a worktree. Creates the worktree
   `<main checkout>/.troupe/missions/<m>` on a new branch `mission/<m>` cut from
   the current branch of the main checkout (or `--base <ref>`), writes the
   skill's plan template to `docs/missions/<m>/plan.md` in it with `base:` set
   to `mission/<m>`, binds the caller pane (`@troupe-mission=<m>`, plus the
   repository's common dir so a pane in another repository never matches),
   and opens that mission's panel. A caller pane already bound to another open
   mission refuses. It prints the worktree path.
2. **One resolver** used by every command that acts on a mission (dispatch,
   send, wait, gate, stage, status, close, teardown, approve, check, panel
   reads and panel actions). In order: `-m <m>`; the caller pane's
   `@troupe-mission`; a panel pane's orchestrator's `@troupe-mission`; the
   current worktree's branch `mission/<m>`. Otherwise refuse, listing the open
   missions and their worktrees. `-m <m>` reads the plan from the mission's
   worktree, from wherever it is run. `-m` naming another mission than the
   caller pane's binding refuses. No newest-plan fallback remains.
3. **Mission paths.** A mission's plan, merges and `troupe check` run in its
   worktree. Role worktrees stay at
   `<main checkout>/.troupe/worktrees/<m>/<role>`, never nested in the mission
   worktree. The log stays in the common git dir.
4. **Panel per mission.** `open` opens a panel for the caller's mission beside
   the caller, and is idempotent per mission, not per repository. The panel
   pane is marked with its orchestrator pane and mission; it resolves its
   mission through them each frame. `open --planning` before
   `mission new` still shows "planning" and picks the mission up once the
   pane is bound. The panel shows the mission's name.
5. **Orchestrator marks per mission.** `markOrchestrator` no longer unmarks
   another mission's orchestrator; gate answers are delivered to the pane bound
   to that mission only.
6. **Roles window per mission**: `roles-<m>` (no `:` in tmux window names).
   tmux session names stay per repository.
7. **`troupe up -m <m>`** does `mission new` and starts the orchestrator with
   its cwd in the worktree; `up` without `-m` refuses.
8. **Teardown** also removes the mission worktree (refusing when it has
   uncommitted or untracked files, or the branch is not pushed, unless
   `--force`), and unbinds the orchestrator pane and closes its panel.
9. **`troupe status`** resolved to no mission lists open missions, their
   worktree, orchestrator pane and panel pane, exit 0.
10. **Skill text** (`skills/troupe-mission/SKILL.md`): step 2 uses
    `troupe mission new <m>` instead of creating the branch by hand; merges
    run in the mission worktree (`git -C <worktree>`); nothing tells the
    orchestrator to `cd` and rely on it. Update README where it describes
    one mission per repository.

Do not change the plan format, log events' existing fields, panel drawing
(beyond the mission name), or agent adapters.

Prove it with `./check.sh` clean, and tests that, with two open missions in one
repository on one tmux server: each caller pane resolves its own mission with
no `-m`; an unbound pane refuses and lists both; each mission has one panel
and one `roles-<m>` window; a gate answer goes only to its own orchestrator;
`mission new` never changes the main checkout's branch; teardown of one leaves
the other intact. Also one mission each in two repositories with the same
mission name. Write `.troupe/result.md` with the commands you ran.

## Role: review

Review `role/parallel-missions/missions` when it lands. Beyond the reviewer
rules, check:

- Every command that acts on a mission goes through the one resolver; grep for
  remaining `findPlan(` calls with an empty mission and for marks keyed by
  repository root alone.
- No path silently picks a mission: each ambiguous case refuses and the
  refusal names the open missions.
- A pane in one repository can never resolve a mission in another.
- Teardown cannot remove a worktree with uncommitted work without `--force`.
- The skill text matches the commands as built.
