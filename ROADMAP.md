# troupe — roadmap

troupe lets anyone call up an agent troupe with one command, without
configuring a software-factory harness such as OpenRig. The orchestrator
writes a plan with the person; once they approve it, every role opens in a
real tmux window of its own, in its own git worktree, where the person can
watch it and talk to it directly. A panel beside the orchestrator stays open
and shows the work as it moves. The orchestrator and the roles run Claude
Code or Codex, or any terminal agent with an adapter.

Status: Phase 6 is done (2026-10-25): two real missions, one with a Claude
Code orchestrator and one with a Codex orchestrator, ran from `troupe up` to
the MR gate, and the commands' guards were slimmed. Phases 0–3 built an
earlier form, a Claude Code mod, that Phase 5 replaced. Next: Phase 7.
Repo: GitHub `tianqizhao0704/troupe` (private). Open source is a later call
(Phase 7). Maintenance stays light: README, `check.sh`, tests, CI and the
docs a phase produces.

## Direction (2026-10-24)

**What the product is.** Plan first, then roles: the orchestrator and the
person agree on `plan.md`, the person approves it in the panel, and only
then do role windows open. The persistent, interactive panel is part of the
product. What troupe is not: a port of one person's workflow. The default
workflow is one recipe in a skill; a user who wants another changes the
skill (its text and its `stages.yaml`), not the code.

**The rule that draws the line.** Code enforces only what keeps the work
correct; the method lives in the skill, as text, and can be swapped.

Enforced in code:
- No role window before the plan, hashed as it is now with the role texts it
  references, is approved; approval lives in the run log.
- One role, one git worktree, one branch, one pane; overlapping `touches`
  need `depends_on`.
- Each role's `flags` pin its agent's permission; it is never inherited.
- Never type into a window that is not ready; touch only the panes troupe
  opened.
- The persistent panel.

In the default skill (`troupe-mission`), replaceable: brief → plan → plan
gate → build → review per branch as it lands, one fix round sent to the same
window → merge onto the mission branch → MR gate. A stricter recipe
(`troupe-mission-strict`: slim, cross-role final review, two-round cap) may
come later as a separate optional workflow.

**Architecture.**

```
troupe            CLI: setup / up / panel / check / approve / gate / stage /
                  dispatch / status / send / wait / close; a refusal exits 1
                  with the reason, which any harness's model reads
troupe panel      the persistent TUI in window 0 beside the orchestrator
skills/           the workflow: SKILL.md, stages.yaml, roles/, templates/
agents            one adapter per harness: start command with a first prompt,
                  model and effort flags, permission flags, screen patterns
```

State: `plan.md` (tracked, hashed); `<git-common-dir>/troupe/<m>/log.jsonl`
(written only by the CLI and the panel); live reads from tmux, git and each
role's `.troupe/result.md`. The design and its decisions are in the design
proposal kept in the git folder (`.git/troupe/design/proposal.md`, section
"Decided").

**Systems.** tmux on macOS, Linux and WSL2; macOS and Linux run in CI. Native
Windows is not planned (issue #1, closed).

## Phase 4 outcome (2026-10-24): the Codex probe

Both harnesses keep the launch-argument prompt through the trust dialog;
bracketed paste works in both; under an approval dialog a paste is dropped
and Enter approves, so troupe never types into a waiting window. Once a
repository is trusted, neither asks again in its worktrees, sibling or
nested, so role worktrees live in `.troupe/worktrees/` and need no
pre-trust. Context use is on neither default screen. The screen captures
the adapters are tested against are in `tests/fixtures/agents/`.

## Phase 5 outcome (2026-10-24): CLI and panel without the mod

Built in eleven steps, one PR each (#6–#14 and the clean-up), Codex writing
the adapters, the commands and the panel's interaction, Claude the format,
the state, the drawing and the skill, Sonnet the mechanical steps:

- The package (named `@troupe/cli` then, `troupe-cli` now; private until Phase 7; Node 20+; CI).
- The plan format: one yaml block with `profiles` and `roles` (a role is a
  window), raw per-agent `flags`, `## Role:` sections; `troupe check`.
- Adapters for Claude Code and Codex, and user adapter files.
- The run log and the live reads.
- The commands, the brief as a launch argument and `troupe wait`
  (issue #2, closed).
- The panel as designed (section 5b), live, with keys and mouse; approval
  in the panel.
- The workflow skill for the CLI; `troupe setup` installs it for both
  harnesses.
- The mod deleted: `hooks/`, `.claude-plugin/`, `bin/troupe-panel` and the
  mod's readers and views.

Not yet shown: a real mission with real agents (Phase 6).

## Phases from here

### Phase 6 — The end-to-end run, then slim

A small real mission on this Mac: one Claude Code orchestrator, one Codex
role and one Claude Code role, from `troupe up` to the MR gate; then the same
with a Codex orchestrator. Fix what it finds.

Then slim the commands' guards. Done: a pane is troupe's when its id and its
`@troupe-owner` marker match the log; `session.json` and the command lock
are gone.

Done when: both runs reach the MR gate with the person only approving,
answering dialogs and talking to roles, and `troupe dispatch` before
approval is refused.

### Phase 7 — Open-source release (only if Tianqi decides to open-source)

Delivers: `troupe-cli` on npm (the `troupe` org and the bare name are
taken), a single-file binary later for machines without Node;
license; secret scan; README with a short gif. It is published as a new
repository with one initial commit from the cleaned `main`; this repository
and its history stay private.

Done when: someone new installs and runs a mission without help, in under
five minutes to the first panel.

### After: evidence

If troupe needs evidence for its README (a comparison with a single session,
for example), it comes back as a new issue, on a task that can be named in
public.

## Stays out

Tianqi's personal skills (tianqi-taste, tianqi-ui-ux, tianqi-project-
maintenance, tianqi-skill-design), the chief-of-staff seat, Slack, OpenRig
(neither configured nor supported), terminal backends other than tmux.
Reference only, not a dependency: iha2/superlite.
