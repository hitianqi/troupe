# Review: p0 — Phase 0 feasibility (order o1)

**This one review is both the order review of o1 and the final review of the
whole `feature/p0` diff against `main`** (light rig, ruling from 大博士贴).
One order, so there are no cross-order contracts; the cross-order pass reduces
to "does the whole diff meet the plan's Done-when".

- Reviewed: `order/p0/o1` @ `adef1bd` (base `main` e363bbd, plan commit 88eeae6),
  19 files, +849/-2 against `main` (including `docs/missions/p0/plan.md`).
- `claude --version`: 2.1.304 (Claude Code).
- Bounds (ruling): not driven live. Q4 and the person-opened pane are "not run
  live" and accepted. Reviewed from the diff, `./check.sh`, the evidence under
  `docs/feasibility/`, and offline experiments in a scratch copy (deleted).
- Judged against `plan.md` "Done when", not against the builder's hand-back.

## What I ran

- `npm install`, laid the engine's types, `./check.sh`: **exit 0**. validate
  passes, `claude plugin test` 1 pass / 0 fail, `tsc: clean`.
- Mutation 1 (scratch copy): `e.description.startsWith(PROBE_PREFIX)` replaced
  by `false`. `deny.test.ts` fails (`Expected: 0, Received: 1`). The builder's
  claim holds.
- Mutation 2 (scratch copy): the `.catch` guard removed from the Agent hook.
  `deny.test.ts` still **passes**. See Act-on 1.
- `diff -r --exclude=types --exclude=node_modules --exclude=.git
  ~/.claude/dev-mods/86f94b63-…/troupe .`: only repo-only files differ
  (`.gitignore`, `ROADMAP.md`, `check.sh`, `docs`, `package*.json`). `types/`
  (the repo's, not the engine-laid ones) identical. Mod files identical.
- `git ls-files`: none of `.claude/`, `.mcp.json`, `.openrig/`,
  `CLAUDE.local.md`, `.agents/` is tracked; `.gitignore` covers all of them
  plus `node_modules/` and `.claude-plugin/types/`.
- Main checkout: `git worktree list` and `git branch` hold only main,
  feature/p0, order/p0/o1 and this review worktree; `.claude/worktrees/` is
  gone. No Q6 leftovers.
- Q4 and Q5 type claims checked in `index.d.ts`: `$.ui.ask` doc says it
  "resolves to the label they chose, or the text typed under 'Other'" and
  "Rejects when dismissed, and in a `-p` run" (line ~2457); `AgentSpawnArgs` is
  `prompt` plus `description | subagentType | model | name | cwd`, no `skills`;
  the `skill` noun on `$` has only `prompt` (the hook), no list. All match
  FEASIBILITY.md.
- Offline render (scratch test, deleted): `$.ui.render` of `Pane` `troupe` at
  150 columns returns the tree (title, "Claude Code ", "150 cols, body 60,
  dock, opening", Agents (0), Agent calls). So the pane draws offline for the
  empty state. See Noted.

## Act on

### 1. The deny test does not prove the guard (a thrown hook still refuses); Q3 "reliably" has no evidence

Roadmap Q3 asks for "the `.catch` guard pattern … (a thrown hook must still
refuse)". FEASIBILITY.md answers Q3 "Yes, live and in a test" and the plan says
the test "proves the deny rule". The test proves the prefix rule only. The
`.catch` is never exercised: not live, not in `tests/deny.test.ts`; the only
other evidence is `claude plugin validate` printing "gating hook with .catch".

Repro: in a scratch copy delete the `.catch(...)` from the Agent hook in
`hooks/register.tsx`, run `claude plugin test .`: `1 pass 0 fail`. With the
guard removed, a throwing hook fails open (the engine logs "troupe's tool.call
hook was skipped … HooksError" and the call goes through, `ran` = 1).

Siblings looked for: the other `tool.call` hook, `mcp__troupe__probe`, is a
gating hook without `.catch` (validate says so). It is a throw-away probe, so
Noted, not Act on. The `ui.render` hooks and the commands do not gate anything.

Bounded fix (about 15 lines, one commit):
- Add `tests/guard.test.ts` (verified to separate the two cases in my scratch):
  ```ts
  import { expect, test } from 'claude-code/testing'

  test('a hook that throws still refuses the Agent call', async ($, on) => {
    let ran = 0
    on('tool.call', () => {
      ran += 1
      return { result: {} }
    })
    on('ui.log', () => ({ value: undefined }))
    // no description: e.description.startsWith throws inside the hook
    const out = await $.tool.call({ tool: 'Agent', prompt: 'Say hi.' } as never)
    expect(ran).toBe(0)
    expect(JSON.stringify(out)).toContain('guard failed')
  })
  ```
  With the `.catch` it passes (2 pass); without it fails (`Expected: 0,
  Received: 1`).
- In FEASIBILITY.md Q3, add one sentence: the guard is tested offline by a
  call whose hook throws (missing `description`), and without the `.catch`
  the engine skips the hook and lets the call through, which is why the guard
  is needed.

## Consider

- **Roadmap change not stated.** The brief asks for what Phase 1 should change
  in the roadmap. The recommendation says Phase 1 should "expect the pane to
  wait undrawn below 144 columns", but ROADMAP Phase 1 "Done when" still says
  "the pane appears from 110 columns" and CULTURE.md says the same. The
  evidence: 144 unasked, 110 only once the person asked for that pane id
  (types, quoted in FEASIBILITY Q1). Bounded fix: one line in the
  recommendation naming the sentence to change ("from 110 columns, once opened
  with `/troupe`; 144 when the pane opens by itself").
- **Commit `b281c9f` has no `Co-Authored-By` trailer** (its sibling `c9e1c1e`
  has one, Claude Haiku 5.5). The convention is one trailer naming the real
  agent and model. Local, nothing pushed, so a reword of the two cherry-picks
  before the fast-forward is cheap; the orchestrator may also leave it.
- **The pane's agent list and call rows were never seen rendering.** The live
  tile never drew the pane (not placed at 76 columns) and the offline render
  I ran covers only the empty state. The `agents` and `calls` branches
  (`clip`, `agent.description`) are checked by `tsc` only. Cheap
  and in scope if the fix round has room: a render test with the atoms seeded.
  Otherwise it stays in the Phase 2 live list (see manual acceptance).

## Noted

- **Live evidence predates the final code.** `q3-live.txt` and `q1-loaded.txt`
  show the doubled `troupe: troupe:` prefix the mod no longer adds; FEASIBILITY
  says so honestly. The final `register.tsx` was not re-run live. The deny test
  covers the final code's log lines.
- Q3 "the model read the reason": the evidence file shows the tool error text
  the model received, not the model's reply. Reasonable inference from the
  tool-result format; not a gap worth a fix.
- Q6 statements that the engine unlocked and kept the worktrees rest on the
  builder's own observation; `q6-a.txt`, `q6-b.txt` and `q6-during.txt` show the
  `locked` state and branch base (e363bbd = `main`), and the two commits are on
  `order/p0/o1`. Honest about it: FEASIBILITY lists `q6-*.txt` as typed by the
  subagents.
- The Q6 worktrees were made under the shared checkout
  (`/home/tizh/repos/projects/troupe/.claude/worktrees/`), not under the
  builder's order worktree. FEASIBILITY says "the session's own checkout";
  recommendation 3 already tells Phase 3 to run from the mission checkout.
- `refreshAgents` is started with `$.clock.every(2000, …)` inside
  `session.start`; if a hot reload runs `session.start` again, timers may stack.
  Unknown from the evidence; Phase 1 should check when the pane becomes real.
- The deny guard fails closed for ordinary calls too if logging
  (`update($, calls …)`) throws before `next(e)`. Acceptable for a guard;
  worth remembering in Phase 2.
- `mcp__troupe__probe` hook has no `.catch` (validate flags it): probe only.

## Dismissed

- Repo mod differs from dev-mods copy: checked, identical apart from repo-only
  files.
- Ignored files committed: checked, none.
- Q4 "yes from the types": the types say exactly what FEASIBILITY quotes, and it
  is labelled "not run live" in the table and the body.
- Q5 "no `$.skill.list`", "`agent.spawn` takes no skills": confirmed in the
  types.
- Recommendation supported by the evidence: three lines, each tied to an
  evidence item (no file watcher, silent skill drop, worktree base); "with
  changes" follows from Q4/Q5/Q6 and the 144-column finding.

## What I could not verify (manual acceptance, by ruling)

Entry point is a person at a tile running Claude Code 2.1.304 with the mod
loaded (`claude --plugin-dir <repo>` in a real terminal, or the session mods
folder).
1. **Pane placed when the person opens it.** Precondition: terminal about 76
   columns. Action: type `/troupe`. Expected: "troupe pane opened.", pane
   `inline` or `dock`, shows version, columns, "placed", agents.
2. **Pane at 144+ columns in fullscreen.** Expected: pane opens by itself,
   docked; screenshot (none exists).
3. **Q4 round trip.** Action: `/troupe-probe-ask`. Expected: Approve / Change
   dialog; text typed under "Other" is logged as an ask round and the dialog
   returns after about 500 ms; "Change" opens the focused Input pane.
4. **`skill.prompt` behind the managed plugin** `cc-plugin-sec-default`: a
   troupe hook on it runs.

## Siblings I looked for

The other gating hook (`mcp__troupe__probe`), the other `startsWith`/`description`
reads, the other `$.clock` timers, the other places the 110/144 column figure
appears (ROADMAP, CULTURE.md, FEASIBILITY), and the other commits' trailers.

## Verdict

FAIL: 1 Act-on findings (4 manual-acceptance items by ruling, not counted)
