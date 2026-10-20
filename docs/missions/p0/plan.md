# Plan: p0 — Phase 0 feasibility (hello pane mod, API probes, FEASIBILITY.md)

Intent: Tianqi approved the troupe roadmap ("OK你开做吧", 2026-10-20). Before
Phase 1 draws the real plan in a pane, prove on Claude Code 2.1.304 that the
mod engine loads a troupe mod and that the API the later phases lean on
exists: refusing an Agent call, an approval dialog with a free-text branch,
listing skills, and parallel worktree subagents. The spec is `ROADMAP.md`
("Uncertain, check first" and "Phase 0"); the brief is 大博士贴's queue item
qitem-20261020093112-7ba43da1ddcaf2ba. Q2 (outside account) is dropped by
decision.

Done when:
- The repo holds a mod named `troupe` (`.claude-plugin/plugin.json`,
  `hooks/hooks.json`, `hooks/register.tsx`, `types/` if needed) that opens a
  pane `troupe` showing the Claude Code version, the terminal columns, whether
  the pane is placed (and the `reason` if not), and `$.agent.list()` with
  descriptions. The repo copy and the dev-mods copy are identical at the
  final commit.
- `docs/FEASIBILITY.md` answers Q1, Q3, Q4, Q5 and Q6 each with yes/no and
  the exact evidence seen (engine question or refusal text, dialog behaviour,
  API shapes, what happened to the worktrees), records `claude --version`,
  lists Q2 as "not run, by decision", and ends with a three-line
  recommendation (Phase 1 as planned / with changes / stop) and any roadmap
  change it implies.
- Q3 is shown live: one Agent call with a `troupe-probe:` description is
  refused and the model reads the reason; one ordinary subagent passes; both
  calls' `description` and `model` are logged.
- `./check.sh` at the repo root runs `claude plugin validate`, `claude plugin
  test` and `tsc -p` (or says why tsc is skipped) and exits 0; at least one
  `*.test.ts` proves the deny rule.
- `.gitignore` covers `.claude/`, `.mcp.json` and `.openrig/`; none of them is
  committed.

Out of scope: reading plan.md, dependency layering, the real approval loop,
the workflow skill, marketplace file or README install line, any paid run on
Tianqi's API key, any remote or push. Layout workarounds when the pane is not
placed (record the reason instead).

## How the work is split

One order. The brief allowed a second (`check.sh` and the test on sonnet),
but the test exists to prove the deny rule written in `hooks/register.tsx`,
and `tsc -p` checks the same files and the types the mod lays down: the
check and the mod change together. This rig has one builder, so a second
order would run serially anyway and only add a review round. The probes
share the one hooks module the engine loads (`register.tsx`), which is the
hub file; it has a single owner by construction.

Loading the mod needs Tianqi: the engine asks "Turn on the mods Claude writes
in this session?" in dev.b1's tile. The builder tells the orchestrator the
moment it is up (or what the engine printed instead), and the orchestrator
tells 大博士贴. Probes that cannot run without the engine (Q1 live, Q3 live,
Q4) wait for that answer; the offline work (types, check.sh, tests, Q5 from
the types, Q6) continues meanwhile.

Cost: no run on Tianqi's API key. Subagents for Q3 and Q6 run inside the
builder's seat on its own login.

## Orders

```yaml
orders:
  - id: o1
    kind: code
    goal: "Ship the hello pane mod, run the Q1 and Q3-Q6 probes, write docs/FEASIBILITY.md with the evidence and a recommendation, and add check.sh with a test that proves the deny rule."
    why: "Phase 0 of ROADMAP.md: later phases rest on these engine facts. Reuses the plugin-authoring skill (where to write, API types in types/claude-code.d.ts) and the trellis-plan spike at ~/.claude/dev-mods/7b60ff2d-d4e0-4799-85d2-6c581256bfdd/trellis-plan/hooks/register.tsx for pane drawing and the Agent tool.call hook (read, not copied wholesale). Nothing in the repo yet; it holds only ROADMAP.md."
    touches:
      - .claude-plugin/
      - hooks/
      - types/
      - tsconfig.json
      - package.json
      - package-lock.json
      - tests/
      - check.sh
      - .gitignore
      - docs/FEASIBILITY.md
      - docs/feasibility/
    depends_on: []
    model: opus
    risks: "The engine may refuse to load hooks modules on this build (the 2026-10-02 rollout switch); then Q1 is that text and the live probes become type-level answers. The pane may not dock (needs fullscreen from 110 columns): record the reason, no workarounds. Q6 subagents write into the repo: keep their files under docs/feasibility/ and make sure no stray worktree or branch outlives the order. The repo copy and the dev-mods copy can drift."
    proof: "./check.sh exits 0; claude --version and the engine's text recorded in docs/FEASIBILITY.md; a rig capture of dev.b1's tile showing the pane (or the refusal line); the Q3 denied and allowed calls with their logged description/model; git worktree list and git branch clean of Q6 leftovers; diff -r of the repo and dev-mods copies empty."
```

## Review

The order is reviewed as it lands by rev.r1 (`REVIEW.md`). On this light rig
that review is also the final review of the whole `feature/p0` diff against
`main`, and says so. Findings go back to the builder, one fix round and one
re-review; then the orchestrator rules. A leftover with a known, bounded fix
is fixed in this mission, not filed.
