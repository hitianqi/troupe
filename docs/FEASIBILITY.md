# troupe — Phase 0 feasibility

Run on 2026-10-20 in the OpenRig seat dev.b1 (rig tianqi-troupe-p0), on
`claude --version`: **2.1.304 (Claude Code)**. The questions are those of
ROADMAP.md, "Uncertain, check first (Phase 0)". Raw evidence is under
`docs/feasibility/`.

The mod under test is this repository: `.claude-plugin/plugin.json`
(`troupe`), `hooks/hooks.json`, `hooks/register.tsx`, `types/index.d.ts`,
`tests/deny.test.ts`, `tsconfig.json`. It was written in the session's mods
folder (`~/.claude/dev-mods/<session>/troupe/`) and copied here; the two
copies are identical apart from `.claude-plugin/types/`, which the engine
lays and git ignores (`diff -r --exclude=types <dev-mods copy> .` lists
only repo-only files). `./check.sh` runs `claude plugin validate`, `claude
plugin test` and `tsc -p .` once the types are laid.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Does the engine load a mod on this build? | **Yes**, after the person's one-time "Turn them on" |
| 2 | Does it load for someone else? | Not run, by decision (Tianqi, 2026-10-20) |
| 3 | Can the Agent call be intercepted and refused? | **Yes**, live and in a test; description and model are readable |
| 4 | Does `$.ui.ask` take free text, and can it come back? | **Yes, from the types**; not run live |
| 5 | Can the mod list the skills a subagent will get? | **Partly**: the mod can list the session's skills, but the engine checks nothing |
| 6 | Parallel worktree subagents, merged back? | **Yes**, but the base and the merge are the model's job |

## Q1 — the engine loads a mod

Writing the first file under the mods folder, after loading the
`plugin-authoring` skill, raised the engine's question in the seat's tile
at once, while the turn went on (`docs/feasibility/q1-question.txt`):

```
│ Turn on the mods Claude writes in this
│ session?
│ They'll load when this turn ends, and
│ they'll reload whenever they change. A mod
│ is code, and it runs with the same access
│ you have here.

❯ 1. How does this work?
  2. Turn them on
  3. Not now
  4. Type something.
  5. Chat about this
```

Tianqi chose "Turn them on". When the turn ended the transcript said
`troupe: This mod is now loaded.` and the engine laid the types in
`.claude-plugin/types/` (`claude-code/`, `claude-code-tools/`,
`claude-code-mcp/`, `tsconfig.json`, `.gitignore`), the first line
`// Written by Claude Code 2.1.304.`. No "turned off in this process" line
appeared, unlike 2026-10-02. Later edits reloaded the mod at the end of
the turn, or before a call of a tool it registered.

**The pane was not placed.** `session.start` opens it unasked; the engine
answered (`docs/feasibility/q1-loaded.txt`), verbatim:

```
troupe: pane not placed: unasked below 144 columns (76 now): placed when
the person opens it, or when the terminal is widened to 144 columns
```

So no screenshot of the pane exists from this run. A pane the person opens
(`/troupe`) is placed at any width per the types (`$.ui.open`: "Asked, the
person's command, prompt or press behind it (not `focus`), it is placed at
any width; unasked, from 144 columns, 110 for one once asked"), docked
beside the transcript in fullscreen and `inline` above the prompt
otherwise (`Pane` props, `placement`). **Not run live**: see "Seats cannot
type into a tile" below.

## Q2 — outside account

Not run, by decision (Tianqi, 2026-10-20). No marketplace file or install
line was prepared.

## Q3 — refusing an Agent call

`hooks/register.tsx` hooks `on('tool.call', { tool: 'Agent' })` with the
reference's guard, `.catch(($, e, next) => next.called ? next(e) : { deny })`.
It refuses a call whose `description` starts with `troupe-probe:` and logs
every Agent call's `description`, `model` and `isolation`. `claude plugin
validate` reports it as `gating hook with .catch: tool.call{tool=Agent}`.

Live (`docs/feasibility/q3-live.txt`):

```
● Agent(troupe-probe: refuse me)
  ⎿  Error: troupe: "troupe-probe: refuse me" is a probe call; troupe
     refuses it on purpose.
● troupe: troupe: Agent call description="troupe-probe: refuse me"
  model=haiku isolation=(none) -> denied
● troupe: troupe: Agent call description="o1: hello probe"
  model=haiku isolation=(none) -> passed
```

The model read the refusal as the tool's error; the ordinary subagent ran
and answered "ran". (The doubled `troupe:` came from the mod's own prefix;
the engine prefixes `$.ui.log` lines with the plugin's name, so the mod no
longer adds one.)

Offline, `tests/deny.test.ts` under `claude plugin test`: the probe call
never reaches the Agent tool and its result carries the reason, an
ordinary call does reach it, and both are logged with description and
model. The test fails when the prefix check is broken (mutation in a
scratch copy: `Expected: 0, Received: 1`).

`tests/guard.test.ts` proves the guard itself. It sends an Agent call with
no `description`, so the hook throws, and expects the call to be refused
with "its Agent guard failed". Without the `.catch`, the engine skips the
hook and the call goes through: in a scratch copy the test fails with
`Expected: 0, Received: 1` and the engine reports `troupe's tool.call hook
was skipped: troupe: HooksError: undefined is not an object (evaluating
'e.description.startsWith')`. So a gating hook needs the guard to fail
closed.

The Agent tool's input carries `description`, `prompt`, `subagent_type`,
`model` (`sonnet | opus | haiku | fable`), `effort`, `name` and `isolation`
(`worktree | remote`), so the "o1: …" prefix and the model are both
readable before the call runs.

## Q4 — the approval dialog

**From the types; not run live.** `$.ui.ask(question, { options, header,
multiSelect })` draws the engine's own AskUserQuestion dialog with 2–4
options and **resolves to the label chosen, or to the text typed under
"Other"** (the dialog's "Type something."), so a caller tells free text
from a choice by comparing with its labels. It rejects when dismissed and
under `claude -p`. A button labelled "Change" returns only the word
"Change"; collecting text after it needs a second surface (the probe opens
a focused pane with an `Input`, which the terminal, desktop and vscode
tables have and mobile does not).

Asking again is just another call: there is no "the plan changed" event,
so the mod re-asks from its own code (the probe re-asks 500 ms after a
typed change, from `$.clock.after`). The module has **no file watcher**:
`$.fs` reads, writes, lists and stats, so noticing a plan.md edit means
polling `$.fs.stat` on `$.clock.every`.

The probe is in the mod (`/troupe-probe-ask`, or `mcp__troupe__probe
{ action: "ask" }`) for Phase 2 to run live.

## Q5 — skills

- There is no `$.skill.list`. **The session's skills** come from
  `$.session.usage({ breakdown: 'summary' })`: `context.breakdown.skills`
  is `{ totalSkills, includedSkills, tokens, skillFrontmatter: { name,
  source, pluginName?, tokens }[] }`. Live: 91 in the session, 91 listed,
  sources `userSettings, projectSettings, plugin, built-in, syncedSkills`
  (`docs/feasibility/q5-live.txt`).
- **Names differ by spelling.** The Skill tool lists
  `shared:systematic-debugging` and `codex:rescue`; the breakdown lists the
  first bare (`systematic-debugging`) and the second with its prefix. A
  check has to accept both spellings.
- **`agent.spawn` takes no skills.** `AgentSpawnInput` has no `skills`
  field. Skills are preloaded only through an agent definition
  (`skills?: string[]` in `$.agent.register(spec)`, or a plugin's
  `agents/*.md`).
- **The engine checks nothing.** `$.agent.register` accepted
  `skills: ["tianqi-taste", "troupe-no-such-skill"]`; the type became
  dispatchable on the next turn (same turn: `Agent type 'troupe:probe' not
  found`); the spawned subagent reported `tianqi-taste` preloaded, and the
  missing name was dropped without a word.
- **`skill.prompt` is not a reliable witness.** The event is documented to
  fire for a preload, but here the transcript said `troupe: its
  skill.prompt hook was skipped. "cc-plugin-sec-default" runs first and
  sent the event on past it.`

So the pane can flag a missing skill only by checking the definition's
names against the session listing itself, before the spawn.

## Q6 — parallel worktree subagents

Two `general-purpose` subagents on haiku, each started with
`isolation: "worktree"` and run in the background at the same time, each
told to write and commit one file under `docs/feasibility/`
(`q6-during.txt`, `q6-a.txt`, `q6-b.txt`).

- The engine made one worktree per subagent **inside the session's own
  checkout**, at `.claude/worktrees/agent-<agentId>`, on a new branch
  `worktree-agent-<agentId>`, **cut from the session checkout's HEAD**
  (`main`, e363bbd), not from the order or mission branch. Both were
  `locked` while their agents ran.
- The harness refused a compound shell command it could not verify stayed
  inside the worktree; both subagents split it into plain commands.
- When they finished, the engine unlocked both worktrees and **kept** them
  with their branches, because each held a commit. It merged nothing.
- The model brought the work back: `git cherry-pick` of the two commits
  onto `order/p0/o1` applied cleanly, then `git worktree remove` and `git
  branch -D` cleared both; `git worktree list` and `git branch` show no
  leftovers.

## Seats cannot type into a tile

To run Q4 and the person-opened pane live, the seat tried to type
`/troupe` into its own tile with `tmux send-keys`. The auto mode
classifier refused it: `Permission for this action was denied by the
Claude Code auto mode classifier. Reason: [Tmux Self Drive].` The
orchestrator, a peer seat, met the same refusal. Only a person can type
into the tile, so these two checks wait for one (decision of 2026-10-20:
not run live in Phase 0).

## Recommendation

1. **Go on to Phase 1, with changes.** The engine loads troupe, refuses an Agent call with a reason the model reads, and lists skills.
2. Phase 1 should poll plan.md with `$.fs.stat` on `$.clock.every`, because there is no file watcher. It should flag a skill by checking names against `$.session.usage` in both spellings, since the engine drops a missing one silently. And its "Done when" should change from "the pane appears from 110 columns" to "the pane appears from 144 columns when it opens by itself, and from 110 once the person has opened it with `/troupe`", since the engine leaves it undrawn below that.
3. Phase 3's skill must have the orchestrator run from the mission checkout (or rebase each order branch onto it), merge each order itself and remove its worktree, because worktrees start from the session HEAD and nothing is merged back.

**Phase 2 must first verify live**, with a person at the tile:

- the Q4 round trip: Approve / Change, text typed under "Other" coming
  back to the module, and the dialog raised again from a timer
  (`/troupe-probe-ask`);
- a person-opened pane (`/troupe`) at 76 columns: placed, and `inline` or
  `dock`;
- the pane drawn at 144 columns or more in fullscreen, as a screenshot
  (none exists from Phase 0);
- the pane's agent and Agent-call rows rendering live: they were never
  drawn in Phase 0, live or in a test (only `tsc` checks them);
- the Change pane's `Input` on the terminal surface (typing, submit,
  close);
- that a hook of troupe's on `skill.prompt`, or any event the managed
  plugin `cc-plugin-sec-default` runs first on, still runs, before Phase 2
  relies on it.

**Leftovers from the review** (probe code only, not fixed in Phase 0 by
decision; Phase 1 removes or hardens them):

- the `mcp__troupe__probe` tool's hook has no `.catch` guard; it is a
  probe, but a throw there is not contained;
- the `$.clock.every` timer started on `session.start` may stack if
  `session.start` runs again on a hot reload.
