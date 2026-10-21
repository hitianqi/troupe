# troupe — feasibility (Phase 0, Phase 2, Phase 2 part 2)

## Phase 0

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

### Q1 — the engine loads a mod

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

### Q2 — outside account

Not run, by decision (Tianqi, 2026-10-20). No marketplace file or install
line was prepared.

### Q3 — refusing an Agent call

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

### Q4 — the approval dialog

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

### Q5 — skills

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

### Q6 — parallel worktree subagents

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

### Seats cannot type into a tile

To run Q4 and the person-opened pane live, the seat tried to type
`/troupe` into its own tile with `tmux send-keys`. The auto mode
classifier refused it: `Permission for this action was denied by the
Claude Code auto mode classifier. Reason: [Tmux Self Drive].` The
orchestrator, a peer seat, met the same refusal. Only a person can type
into the tile, so these two checks wait for one (decision of 2026-10-20:
not run live in Phase 0).

### Recommendation

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

## Phase 2 — the tmux checks

Run on 2026-10-20 in the OpenRig seat dev.b1 (rig tianqi-troupe-p2, mission
p2, order o1), on `claude --version`: **2.1.304 (Claude Code)**, Node
v22.23.2, tmux 3.4. The checks are those of ROADMAP.md, "Phase 2 — Windows
and dispatch". Raw evidence is under `docs/feasibility/p2-*`.

The probe mod, `tprobe`, was written in the session's mods folder and is
kept as evidence (`p2-c1-tprobe-register.ts`); it is not part of troupe. It
registers one tool, `mcp__tprobe__probe`, whose `tool.call` hook runs fixed
tmux and process commands through `$.process`, never a model Bash call.
Tianqi turned the mods on in the seat's tile (`p2-c0-question.txt`).

| # | Check | Answer |
| --- | --- | --- |
| 1 | `tmux send-keys` from a hook into another pane | **Yes**: exit 0, nothing refused it, the text arrived |
| 1b | What kills a `$.process.spawn` child | Reload, unload and session end (`/exit`, SIGHUP, even SIGKILL): **each one kills it** |
| 2 | The mod finds its own pane and splits right | **Yes, by process ancestry**: the engine has no `$TMUX`, and `tmux display -p` names the wrong pane |
| 3 | The pane's text drawn by plain Node on a poll | **Yes**, identical to the p1 golden. It needs a flag and a loader today, or a small change to the hooks (for o2) |

**The classifier reads the mod's code when it is written.** The first
draft of the probe had a generic "run this argv" action. The auto-mode
classifier refused to write the file: `Permission for this action was
denied by the Claude Code auto mode classifier. Reason: [Create RCE
Surface]`. The probe that passed runs only fixed commands. Keys go only to a
test pane it made itself, which runs `cat` into a file, not a shell, and it
closes only the panes it made. p3's `troupe_dispatch` types a free-text
brief into a window that runs Claude. Writing that tool may draw the same
refusal, so its design should keep the surface narrow: one fixed target
kind, and a window the tool opened itself.

### Check 1 — send-keys and a spawned child, from a hook

`p2-c12-results.txt` has the full results and `p2-c1-live.txt` the tile
capture. `testpane` ran `tmux new-session -d -s tprobe-target … 'cat >
received.txt'`: exit 0, pane `%128`. `sendkeys` then ran:

```
tmux send-keys -t %128 "hello from a troupe hook 1" Enter   -> exitCode 0, stderr ""
cat ~/scratch/troupe/p2-o1/received.txt                     -> "hello from a troupe hook 1\n"
```

Nothing refused it. In the tile capture the model's Bash calls each carry
`⎿ Allowed by auto mode classifier`. The probe's MCP tool calls carry no
classifier line at all, and no permission dialog came up. (In passing: a
model Bash `tmux -L tprobe-end send-keys … '/exit' Enter` into the
builder's own scratch tmux server was not refused either. Phase 0's "Tmux
Self Drive" refusal was about typing into a seat's tile, its own or a
peer's.)

**Not covered:** typing into a pane that runs interactive Claude, which is
what p3 does. The target here was `cat`. Whether Claude's prompt takes a
brief sent as one `send-keys` with `Enter` (paste detection, a multi-line
brief) is p3's first thing to see.

**What kills a long-lived `$.process.spawn` child.** The child is `sh -c
'echo $$ > child.pid; exec sleep 3600'`, started from the hook and kept in
a loop that runs after the hook returns. Its parent is the claude process
itself (`p2-c12-results.txt`).

| Event | Child after it | Evidence |
| --- | --- | --- |
| hot reload (a comment line appended to the module, end of turn) | gone; the module's map of children starts over empty | child a, pid 1688461 |
| unload (the mod folder moved out of the dev-mods folder; transcript: "This mod was removed, so it's no longer loaded.") | gone | child b, pid 1710876 |
| session end, `/exit` (`session.end` reason `prompt_input_exit`) | gone, already gone when the `session.end` hook ran | `p2-c1-session-end.txt` |
| session end, the terminal closes (scratch tmux `kill-server`, SIGHUP; reason `other`) | gone, already gone in `session.end` | same |
| `kill -KILL` of the claude process (no `session.end` runs) | gone two seconds later | same |

The session-end runs used a scratch `claude --plugin-dir` session
(`p2-c1-endmod-register.ts`) in the builder's own tmux server
(`-L tprobe-end`), started with `env -u TMUX -u TMUX_PANE`. Tianqi's
settings were not touched. Which mechanism kills the child under SIGKILL
(a parent-death signal, or the pane's hang-up) was not told apart. Either
way, nothing leaked in any of the five runs. The flip side: a child that
must outlive a reload, such as a panel process, cannot be a
`$.process.spawn` child. It has to run in its own tmux pane.

### Check 2 — the session's own pane, and a split beside it

Evidence: `p2-c12-results.txt` (`env`, `split`), `p2-c2-split.txt` and
`p2-c2-window.txt`.

- **The engine has no `$TMUX` here.** `$.env.get('TMUX')` and
  `$.env.get('TMUX_PANE')` both answered `undefined`. The seat's claude
  process was started without them; its parent shell has
  `TMUX=/tmp/tmux-1000/default,3506,126` and `TMUX_PANE=%126` (read from
  `/proc/<pid>/environ`).
- **`tmux display -p '#{pane_id}'` answers the wrong pane.** With no
  `TMUX_PANE` it answered `%113`, 大博士贴's pane in another rig. tmux
  takes the most recent client's pane, so the mod must never use it.
- **The process ancestry finds the right pane.** Walk from the claude
  process's pid up through its parents (`sh -c 'p=$PPID; while …; ps -o
  ppid= …'` through `$.process.run`, so `$PPID` is the claude process).
  Then match each pid against `tmux list-panes -a -F '#{pane_id}
  #{pane_pid}'`: `1668731` → `%126 dev-b1@tianqi-troupe-p2:0 76x27`.
- **The split.** From the hook:

  ```
  tmux split-window -h -d -l 30 -t %126 -P -F '#{pane_id}' sh -c 'printf "tprobe split from a hook\n"; tput cols; sleep 300'
  -> exitCode 0, stdout "%129"
  ```

  Then `tmux list-panes -t dev-b1@tianqi-troupe-p2:0` showed `%126 0,0
  45x27` and `%129 46,0 30x27`, with layout
  `a670,76x27,0,0{45x27,0,0,126,30x27,46,0,129}`. The split pane printed
  its banner and `tput cols` → `30`. The window has exactly one client,
  `/dev/pts/22 76x27 xterm-256color`: the tmux client the Herdr tile runs
  (the seat's environment has `HERDR_PANE_ID=w28:p1`). So the split sits
  inside the seat's window, the one the tile shows. `rig capture` of the
  seat now returned 45 columns. `p2-c2-window.txt` puts the two panes
  side by side as that client draws them. **No person looked at the tile
  while the split stood**, so the visual in Herdr is inferred from tmux,
  not seen.
- **Closed.** `close` ran `tmux kill-pane -t %129` (and `%128`): exit 0.
  The window is back to `%126 76x27`, and the `tprobe-target` session is
  gone.
- **With no `$TMUX`.** In the seat (the live case above), the ancestry
  finds the pane anyway. In a session that is not inside the default
  server (the scratch session, started with `env -u TMUX -u TMUX_PANE`
  in `-L tprobe-end`, `p2-c1-session-end.txt`), `tmux display -p` still
  answered `%113`, and no ancestor pid is a pane pid of the default
  server. So the lookup finds no pane: that is the signal for "no tmux,
  use the in-session pane". With no tmux server at all, `tmux list-panes
  -a` exits 1: `error connecting to /tmp/tmux-1000/… (No such file or
  directory)`. Without `$TMUX`, tmux reaches only the default socket. A
  user on another socket is found only when `$TMUX` is set, and in that
  case `$TMUX_PANE` names the pane directly. That last path was not run
  here, because the seats lack it.
- **Herdr, noted and not built for.** Herdr runs a plain tmux client in
  each tile, so a tmux split shows inside the tile. herdr has its own CLI
  (`herdr api`, `herdr tab`, `herdr agent` and more), which was not used.
- **Width.** The seat's window is 76 columns. A 30-column split left the
  transcript 45, so a 60-column panel does not fit a tile this narrow, and
  o2's width rule has to account for that.

### Check 3 — the pane's text outside the engine

Evidence: `p2-c3-*`. The script is `docs/missions/p2/panel-probe.mjs`,
with its resolve hook `docs/missions/p2/ts-resolve.mjs`. It imports
`hooks/plan.ts`, `view.ts` and `graph.ts`, and nothing of the engine.

**Plain Node on the hooks as they are fails** (`p2-c3-raw-node.txt`, all
exit 1), on three things:

1. `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript parameter property is
   not supported in strip-only mode`, at `graph.ts:29` (`class Canvas`)
   and `yaml.ts:9` (`class YamlError`). These two are the only non-erasable
   syntax in `hooks/`.
2. The relative imports have no extension (`from './plan'`), which Node's
   ESM resolver does not complete.
3. `read-state.ts` imports `claude-code` (`ERR_MODULE_NOT_FOUND`), and
   `draw-pane.tsx` is JSX and imports `read-state`. So `paneLines` (the
   order of the sections) cannot be imported. The probe copies its three
   docked lines.

**With `--experimental-transform-types` and the resolve hook, unchanged
code draws it:**

```
$ node --experimental-transform-types --no-warnings docs/missions/p2/panel-probe.mjs --golden
golden: 57 lines drawn, 57 in tests/mock-p1.ts DOCKED, identical: true      (exit 0)
```

`--once --plain --width 60` and `--width 110` on `docs/missions/p2` are in
`p2-c3-p2-60.txt` and `p2-c3-p2-110.txt`: the stacked and the side-by-side
graph. **On a poll** (`p2-c3-poll.txt`), the panel ran in a scratch tmux
server, 60×40, on a copy of the p2 plan. It clears and redraws when the
mtime of `plan.md` or of the folder changes (polled every 2000 ms, the
pane's `POLL_MS`) and on resize, and clips to the pane's rows (39 rows of
the view and a status line in a 40-row pane, so it never scrolls). Changing the models in the
copy to `sonnet` and adding `REVIEW-o1.md` redrew at the next poll:
`○ o1  opus / planned` became `✓ o1  sonnet / reviewed`, and `◆ Plan OK?`
became `✓ Plan OK?`. `resize-window -x 110` redrew in the side-by-side
layout. `kill -TERM` of the panel: `pane_dead_status=0`.

**What the panel cannot know outside the engine.** `read-state.ts` fills
in two things from the engine: an order's `running` / `done` state, from
`$.agent.list()`, and each skill's `isFound`, from
`$.session.usage()`. A process outside the engine has neither. The probe
shows orders as `planned` or `reviewed` from the review files alone, and
every skill as found. For the panel to draw "the same text as the pane",
o2 must hand those two over (for example, the mod writes them to a file
the panel polls) or show them as unknown.

**The change for o2, tried in a scratch copy** (`p2-c3-variant.txt`,
`p2-c3-variant.diff`, not committed):

- `.ts` / `.tsx` extensions on every relative import in `hooks/` and
  `tests/`;
- the two parameter properties written out as a field and an assignment;
- `"allowImportingTsExtensions": true` and `"erasableSyntaxOnly": true` in
  `tsconfig.json`. The second makes `tsc` refuse what Node cannot strip.

Then `node` with no flag and no loader draws the golden (`identical to
DOCKED: true (57 lines)`, exit 0). `claude plugin validate` passes, and
`claude plugin test` gives `22 pass, 0 fail`, the same as the unchanged
tree. `tsc -p .` exits 0 (without `allowImportingTsExtensions`: `TS5097`
on every such import). **Not run:** the engine hot-loading a live mod
whose imports carry `.ts`. `validate` and `test` read the files the same
way, but o2 should still see the mod load live. o2 also has to move
`paneLines` out of `draw-pane.tsx`, into a module both sides import. Node
warns `MODULE_TYPELESS_PACKAGE_JSON` when it imports `.ts` files under a
`package.json` with no `"type"`; `"type": "module"` silences it.

### Verdict and what it means for p3 and o2

1. **Check 1 passes.** A hook can type into another tmux pane, unrefused.
   p3's dispatch can rest on it. Its open point is typing into a pane that
   runs interactive Claude. Its risk is the classifier reading the tool's
   code when it is written.
2. **Check 2 passes, with a method.** Find the pane by ancestry, never by
   `$TMUX` or `tmux display -p` in an OpenRig seat; the split shows in the
   seat's window. Fall back when no ancestor is a pane.
3. **Check 3 passes.** The same code draws the same text outside the
   engine, on a poll. The cheapest lasting form is the four-point change
   above, plus a shared `paneLines` and a hand-over of agent states and
   skills.
4. A panel that must survive reloads runs in its own tmux pane, not as a
   `$.process.spawn` child: reload, unload and session end each kill the
   child.

## Phase 2 part 2 — typing a brief into an interactive Claude

Run on 2026-10-21 in the OpenRig seat dev.b1 (rig tianqi-troupe-p3, mission
p3, order o1), on `claude --version`: **2.1.306 (Claude Code)**, tmux 3.4.
Raw evidence is under `docs/feasibility/p3-*`.

The probe mod, `tprobe3` (`p3-c1-tprobe3-register.ts`, not part of troupe),
was loaded with `claude --plugin-dir` in a scratch "orchestrator" session on
a scratch tmux server (`tmux -S ~/scratch/troupe/p3-o1/tmux.sock`, started
with `env -u TMUX -u TMUX_PANE`), in a scratch git repository. Its command
`/tprobe <step>` runs fixed tmux argv through `$.process.run` from its
`command.run` hook: `new-session -d -s tprobe-role` (then `new-window`) with
`claude` in the repository, `send-keys -t <pane> -l <brief>` then `send-keys
-t <pane> Enter`, or `load-buffer` + `paste-buffer -p -d` + `Enter`, and
`kill-session`. The briefs are constants in the probe; keys go only to panes
it opened. Every call and its exit code is in `p3-c1-probe-log.txt`; all
exited 0. Role windows ran on the seat's own login ("Claude Team"), with
one-line prompts. The server was killed and its socket removed at the end.

| # | Case | What happened | Evidence |
| --- | --- | --- | --- |
| 1 | One line, typed into an idle claude, then Enter | **Lands and Claude acts**: answered `PONG-ONE` | `p3-c02` |
| 2 | Three lines by `send-keys -l` (with `\n`), then Enter | **Lands whole**: one prompt of three lines, submitted once; answered `MULTI-OK KIWI` | `p3-c03` |
| 3 | Same three lines by `paste-buffer -p` (bracketed paste), then Enter | Lands whole, the same | `p3-c04` |
| 4 | A one-line prompt naming a brief file | Claude read the file and acted on it (`FILE-OK MANGO`) | `p3-c04` |
| 5 | A real brief: 3299 bytes, 57 lines (builder.md), by keys and by paste | **Both land whole**: `BIG-OK 57 instead.` in each window | `p3-c10`, `p3-c11` |
| 6 | Input box not empty (text typed, no Enter), then a brief and Enter | The brief is **appended to the draft** and both go as one prompt: `half typed by a personReply with exactly …` | `p3-c05a`, `p3-c05b` |
| 7 | A permission prompt showing (`--permission-mode manual`, a Bash call pending), then a brief and Enter | **The brief is lost and the Enter approves the pending call**: the dialog's default `1. Yes` was taken, the command ran, the brief never reached the input box | `p3-c06b`, `p3-c06c` |
| 8 | `--permission-mode auto` against no flag, a Bash `touch` brief | Auto ran it with no prompt. **No flag is already auto mode on this account** (status line `⏵⏵ auto mode on`); `manual` is the mode that prompts (case 7) | `p3-c07`, `p3-c01`, `p3-c06a` |
| 9 | Typed at once, right after `new-window`, before claude drew | The text echoed on the raw tty, then **sat in the input box unsent: the Enter was lost** | `p3-c08` |
| 10 | claude in a new folder | The trust dialog: "Is this a project you created or one you trust?", **default `No, exit`**; keys typed then would exit claude | `p3-c00` |
| 11 | claude in a new `git worktree` (a sibling folder) of a trusted repository | **No trust dialog**: the worktree counts as the trusted repository | `p3-c09` |
| 12 | Found while building dispatch: a claude **just started**, typed into as soon as its input box shows, with a prompt longer than a line (about 90 characters and up) by `send-keys -l`, then Enter | **The prompt stays in the box: the Enter is taken as a newline**, and later Enters do not send it either (Esc Esc clears it). 5 of 6 fresh windows; a 34-character prompt was sent; the same long prompt into a claude idle for a minute was sent; waiting 5 s after the box showed was sent, 2 s was not, and no visible change on screen tells the two apart. **A bracketed paste** (`set-buffer` + `paste-buffer -p`, then Enter) **was sent in 5 of 5** fresh windows, at once | `p3-c2-role-o1-unsent-keys.txt`, `p3-c2-ready-screens.txt` |

Notes:

- The cases ran from a `command.run` hook; a `tool.call` hook runs in the same
  module through the same `$.process.run`, and p2's check 1 ran send-keys
  from a tool's hook. Nothing was refused, and no classifier line or dialog
  appeared in the orchestrator session for the probe's calls.
- The classifier refused one of my own Bash calls, not the mod: starting the
  scratch server with a long `env -u` list (every `OPENRIG_*` and
  `CLAUDE_CODE_*` variable) drew `[Create Unsafe Agents]`. p2's form, `env -u
  TMUX -u TMUX_PANE`, passed.
- A hot reload of the probe emptied its module-level map of windows (as p2
  found for spawned children): a dispatch tool must keep its windows in
  `$.state`, not in module variables.
- Readiness: after `new-window` the screen shows the trust dialog (new
  folder), the input box (`❯ ` at column 0, a placeholder `Try "…"`), or
  nothing yet. Dialog options are drawn indented (` ❯ 1. Yes`, ` ❯ No,
  exit`), so the input box is told apart by `❯` in column 0.
- Not tried: `claude "<prompt>"` (the initial prompt as an argument), which
  would skip typing; the ROADMAP decided typed keys, and an argument built
  from a brief is caller text on a command line.

### Verdict and what it means for troupe_dispatch

**Typing into an interactive Claude works**, from a hook, for one line, three
lines and a 3 KB brief, by `send-keys -l` and by bracketed paste alike. The
design holds, with three rules for dispatch:

1. **Type only into a window the tool has just opened, once it is ready.**
   Wait (poll `capture-pane`, bounded) until the input box shows as `❯` in
   column 0 with no dialog on screen; a brief typed before that loses its
   Enter (case 9), and one typed under a dialog is eaten and approves it
   (case 7) or answers the trust question (case 10). If the box does not
   show in time, do not type: report the window as not ready.
2. **Never type into a window already in use**: a person's draft merges into
   the brief (case 6) and a pending permission prompt is approved (case 7).
3. **The brief goes as a short prompt naming a brief file** the mod writes
   where git does not track it (`Read the brief in <path> and follow it.`),
   so what is typed is fixed in shape, the caller's text is never typed raw,
   and the brief stays on disk. **It is pasted, not typed** (`set-buffer`,
   `paste-buffer -p`, Enter): raw keys into a claude that has just started
   leave the Enter as a newline (case 12). Dispatch then looks once more and
   reports a prompt still in the box rather than calling it sent.

Role windows run `claude` with the order's `--model` and no permission flag:
on this account that is auto mode already. Worktrees of the orchestrator's
repository need no trust answer (case 11).

### Known limits

1. **A permission prompt in a role window eats a typed brief, and the Enter
   approves the pending call** (case 7). Dispatch avoids it by typing only
   into a window it has just opened, where no tool call can be pending yet.
2. **Keys typed before claude has drawn lose their Enter**: the brief sits
   unsent in the input box (case 9), and so does a prompt longer than a line
   typed as raw keys just after the box shows (case 12). Dispatch avoids both
   with a bounded wait for the input box (`❯` in column 0, no dialog on
   screen), then a bracketed paste; if the box does not show in time it types
   nothing and says so, and if the prompt is still in the box after the Enter
   it says that, and the person presses Enter in the window.

What stays the human's: a window already in use is never typed into, so a
prompt or a dialog inside a running role window (a permission prompt, a
question from the builder) is answered by the person in that window.

### The scratch dispatch (o1's build)

`troupe_dispatch` as built, in the mod loaded with `claude --plugin-dir` in a
scratch orchestrator on the scratch server, on a scratch repository holding
the sample mission (`docs/missions/sample/plan.md`, a copy of
`docs/missions/workflow/sample/plan.md`) on `feature/NO-JIRA-sample`
(`p3-c2-orchestrator.txt`):

1. Before approval: refused, `the plan is not approved: no APPROVAL.json in
   docs/missions/sample. Nothing was dispatched.`, read by the model as the
   tool's error.
2. `APPROVAL.json` written by hand with `sha256sum plan.md` as the hash (the
   mod's `crypto.subtle` hash agreed), then o1: `Dispatched o1 (opus) to
   window … of tmux session troupe-sample: worktree …/repo-sample-o1, branch
   order/sample/o1, brief …/repo/.git/troupe/sample/o1.md`. The first build
   typed raw keys and the prompt stayed unsent (case 12,
   `p3-c2-role-o1-unsent-keys.txt`); after the change to a paste, the
   prompt was sent and the builder read the brief and the plan in its
   worktree (`p3-c2-role-o1-landed.txt`). It stopped, saying that the sample
   order's files are not in the scratch repository, which is right.
3. o2: refused, `o2 depends on o1, not done yet (not merged onto
   feature/NO-JIRA-sample). Nothing was dispatched.`; `troupe_status`
   listed `o1: order o1, builder, running`.
4. The windows open at the end (`p3-c2-tmux-windows.txt`): the
   orchestrator's and `troupe-sample:o1` in the worktree. The scratch server
   was then killed, its socket removed, and the worktree and branch deleted.
