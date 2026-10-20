# Review: p2 o1 — the Phase 2 tmux checks

Order review by rev.r1 of `order/p2/o1` at `89eb623` (base `feature/NO-JIRA-p2`
`763a4c8`), judged against `docs/missions/p2/plan.md` (o1 entry, Done when,
checks 1–3). `claude --version` 2.1.304, Node v22.23.2, tmux 3.4.

## What the order touches, and how deep I looked

Docs only: `docs/FEASIBILITY.md`, `docs/feasibility/p2-*`, `docs/missions/p2/`
(two `.mjs` files). Nothing in `hooks/`, `bin/` or `tests/` changed, as the plan
requires. Row "docs, CI config, tests" of the depth table, plus the evidence
audit the orchestrator asked for: for each verdict, does it follow from the
commands, exit codes and output that are committed?

Reran, in my own scratch copy (`~/scratch/troupe/p2-r1/copy`, archive of
`89eb623`, no engine, no shared tmux server):

- `node --experimental-transform-types --no-warnings docs/missions/p2/panel-probe.mjs --golden`
  → `57 lines drawn, 57 in tests/mock-p1.ts DOCKED, identical: true`, exit 0.
- `--once --plain --width 60` on `docs/missions/p2`: identical to
  `p2-c3-p2-60.txt`.
- The panel on a poll in my own tmux server (60×40): drew, then
  `kill -TERM` → `pane_dead=1 pane_dead_status=0`.
- `docs/feasibility/p2-c3-variant.diff` applied to the scratch copy: plain
  `node` with no flag and no loader draws the golden (exit 0, only the
  `MODULE_TYPELESS_PACKAGE_JSON` warning); `claude plugin test` → `22 pass, 0 fail`.
- `grep` for non-erasable syntax in `hooks/` and `tests/`: only the two
  parameter properties (`yaml.ts:9`, `graph.ts:29`), as claimed.
- Read `/proc/<pid>/environ` for my own seat: the shell above my claude
  process has `TMUX`, `TMUX_PANE` and `HERDR_*`; the claude process has none of
  them. This agrees with the builder's check-2 finding for dev-b1.

Not rerun, by instruction: checks 1 and 2 (they need a person to turn mods
on). Not rerun for lack of means: the variant's `tsc` runs (my copy has no
`node_modules`, and no types are laid).

## Verdicts, against the evidence

| Check | Builder | Follows from the evidence? |
| --- | --- | --- |
| 1 send-keys from a hook | PASS | Yes. `p2-c12-results.txt`: `testpane` exit 0 (`%128`), `sendkeys` exit 0, `received.txt` holds the text. The probe code (`p2-c1-tprobe-register.ts`) shows the call is a `$.process.run` in a `tool.call` hook, to a pane it made. The tile capture shows no classifier line under the three probe calls. The "not covered" box (target was `cat`, not interactive Claude) is stated. |
| 1b what kills a spawned child | each of reload, unload, session end | Yes. Five runs, each with a pid, a parent (the claude process), and a `ps` result. The two session-end routes and the SIGKILL route are in `p2-c1-session-end.txt`. The doc says which part was not told apart (SIGKILL: parent-death signal or the pane's hang-up). |
| 2 own pane and split right | PASS, by ancestry | Yes. `ancestry` → `1668731` → `%126`; `tmux display -p` → `%113` (wrong pane); split exit 0 `%129`; layout `…{45x27,…30x27…}`; one client `/dev/pts/22 76x27`; close restores `%126 76x27`. "No person looked at the tile" is stated. |
| 3 pane text from plain Node on a poll | PASS | Yes, and I reproduced it. Golden identical; poll redraw and resize redraw are in `p2-c3-poll.txt`. |

The o2 recipe and the gaps it names are accurate: `paneLines` lives in
`draw-pane.tsx` (JSX, imports `read-state.ts`, which imports the engine); the two
engine-only inputs are `$.agent.list` and `$.session.usage` (both appear in the
`claude plugin validate` call list in `p2-c3-variant.txt`); the tile is 76 columns
(`list-panes`). The check-3 scope matches the plan (no engine imports; resolve
hook and flag today, four-point change for o2).

## Findings

### Act on

None.

### Consider

1. **The "own pane" method reaches only the default tmux socket, and the doc's
   fast path for other sockets is probably dead.** `FEASIBILITY.md` check 2 says a
   user on another socket "is found only when `$TMUX` is set, and in that case
   `$TMUX_PANE` names the pane directly. That last path was not run here". Two
   facts from the evidence and from my own seat: the claude process has no `$TMUX`
   even though its parent shell has one, and the lookup is `tmux list-panes -a`
   with no `-L`/`-S`. So whenever claude does not inherit `TMUX`, a person
   running tmux on a named or custom socket gets "no ancestor is a pane" and the
   no-tmux fallback, though they are inside tmux. Whether claude strips `TMUX`
   itself or the OpenRig launcher does was not told apart (the doc says "started
   without them"). The evidence already contains a better route: the pane's own
   shell (an ancestor found by the walk) has `TMUX=<socket>,<pid>,<idx>` and
   `TMUX_PANE` in `/proc/<pid>/environ` (the builder read them that way). o2 can
   take the socket and pane from the nearest ancestor's environ and call
   `tmux -S <socket> …`, which also covers custom sockets. If o2 keeps the plain
   ancestry rule, the README should say "default tmux socket only". Siblings I
   looked for: the "With no `$TMUX`" bullet and Verdict item 2, which both rest on
   the same rule.

2. **One claim is in the doc but not in the committed evidence.** Check 3 says
   `kill -TERM` of the panel gives `pane_dead_status=0`. `grep -rn "pane_dead\|TERM"
   docs/feasibility` finds nothing. I reproduced it (see above), so the claim is
   true; the raw output should be added to `p2-c3-poll.txt` so the record matches
   what the doc says. Siblings I looked for: the other quantitative claims in check
   3 (39 rows plus a status line in 40, the 2000 ms poll, the redraw on resize),
   which are all in `p2-c3-poll.txt`.

### Noted

- `p2-c2-window.txt` is not a capture of what the tile draws. A script pasted
  `capture-pane %126` and `capture-pane %129` side by side (the file says so on
  its first line), and the separator column is mangled in the file. The doc's "as
  that client draws them" reads stronger than that. The conclusion does not
  depend on it, because `list-panes`, the layout string and `list-clients` carry
  it, and the doc itself says the Herdr view is "inferred from tmux, not seen".
- `rig capture` of the seat returned only the 45-column pane `%126`, so it shows
  the narrowing, not the split pane. The plan's proof line says "a rig capture of
  dev.b1's window showing the split"; the tmux listings are what show the split.
  A person looking at the tile is the remaining proof, and o2's "seen live" gate
  covers it.
- The variant's `tsc` results (`TS5097` without `allowImportingTsExtensions`; exit
  0 with it and with `erasableSyntaxOnly`) rest on the builder's output only; I
  could not run `tsc` here. The `node`, `validate` and `plugin test` parts of the
  same file reproduce. `p2-c3-variant.txt` lists five of the `TS5097` lines, not
  all; the doc says "on every such import".
- The classifier's refusal of the generic "run this argv" probe is quoted in the
  doc but has no raw file. It is a record of an earlier attempt, not a verdict
  input, and it matches the design advice (fixed argv, a pane the tool made).
- `git diff --check` reports trailing whitespace in `p2-c3-variant.diff` and a
  blank line at EOF in `p2-c0-question.txt`. Raw evidence; leave it.

### Dismissed

- Renaming the Phase 0 headings to `###` and the title to "feasibility (Phase 0,
  Phase 2)": checked inbound links; `ROADMAP.md` and the p0 reviews name the file,
  none names a heading anchor.
- The commit touching only docs while `plan.md` says the probe mod lives outside the
  repo: the plan's `touches` lists `docs/feasibility/`, and the probe's source
  is kept there as evidence, labelled "not part of troupe".
- Phase 0's "Tmux Self Drive" vs this order's unrefused model-Bash `send-keys` into
  a scratch server: the doc's reading (the refusal was for typing into a seat's
  tile) matches the Phase 0 text, which describes typing `/troupe` into its own tile.

## Not verified

Check 1's open point (typing into a pane that runs interactive Claude) is
p3's, and the doc says so. Nothing in this order needs a manual-acceptance step.

## Verdict

PASS
