# Re-review: p2 o2 — also the final re-review of mission p2

Re-review of `order/p2/o2` at `d17b398` (one commit on the `1b992e4` I reviewed:
"o2: count no earlier mission's commits as this mission's orders"), against
`REVIEW-o2.md` (FAIL: 1 Act-on). This is the last review: it is also the final
re-review of the whole mission. `claude --version` 2.1.304, Node v22.23.2, tmux 3.4.
My own scratch tmux servers only; no split of any seat's window.

## The previous Act-on

**Finding 1 (git order state wrong when the local `main` lags `origin/main`): addressed.**

- *Rerun of my repro* (scratch clone, `gitFacts` from the `d17b398` tree, mission `p2`,
  orders `o1`, `o2`; local `main` set back to `5761d26`, `origin/main` at `c3433a7`):

  | State | Before the fix (`1b992e4`) | Now |
  | --- | --- | --- |
  | stale `main`, no local order branches | `merged: [o1, o2]` (o2 wrongly) | `{running: [], merged: [o1]}` |
  | stale `main`, order branches present | not measured | `{running: [o2], merged: [o1]}` |
  | `main` current | `{running: [o2], merged: [o1]}` | the same |
  | stale `main`, plus a pushed copy of the mission branch | not measured | the same |
  | the real repo (`troupe-p2-o2`) | `{running: [o2], merged: [o1]}` | the same |

  A stale `main` now gives the same answer as a current one, and a pushed
  `origin/<mission branch>` and `origin/order/*` do not hide a real merge.
- *The new test* (`tests/panel.node.mjs`, a real repository with a lagging `main`)
  passes, and it fails on the old rule: in a scratch copy with the old `log`
  arguments, test 5 fails (`merged` has the earlier mission's orders). A second mutant,
  `--remotes` kept but the `*/<base>` and `*/order/*` exclusions dropped, fails
  it too, so both halves of the rule are pinned.
- `./check.sh` in my worktree at `d17b398`: exit 0 (36 plugin tests, 5 Node tests,
  the workflow check "all checks hold", `tsc: clean`, with the engine types laid).

## What the commit could have broken

- **The alternate screen** (`bin/troupe-panel` enters `ESC[?1049h` before the mouse
  modes and leaves with `ESC[?1049l` in `quit()`):
  - at 30x27, 63x57, 79x57, 117x57, 20x10 and 10x3, with Down, Down, PageDown, End, Up,
    PageUp, Home and End sent at each size and the raw output recorded: the highest row
    address is ≤ the rows (27, 57, 57, 55, 10, 3), no line is wider than the pane,
    no newline written. `history_size` is 0 at every size and `alternate_on` is 1: the
    old frames no longer land in the scrollback.
  - `kill -TERM` of the panel: `pane_dead_status=0`, `alternate_on=0` afterwards.
  - a control run in one pane: with `echo MARK1 … node bin/troupe-panel …`, the lines
    written before the panel are back on the main screen after it quits (`MARK1`,
    `AFTER1`, `MARK2`, `AFTER2`).
- **The live split** (`claude --plugin-dir` on `d17b398`, a 158x57 scratch window,
  no `$TMUX` in the engine): `/troupe docs/missions/p2` opens the panel at 79 columns
  (`%0 78x57 active=1`, `%1 79x57 alt=1 hist=0`); an End key sent to the panel
  scrolls it (`↑ 22 more`); `/troupe close` returns the window to 158 columns; `/troupe`
  again, then `/exit`: the panel pane is gone and no `troupe-panel` process is left.
- The other changes: `README.md` and `RECORD.md` (below), the `panel-probe.mjs` header, and
  one line in `tests/read-state.test.ts`. Nothing else moved in `hooks/` or `bin/`.

## The Consider and Noted items

- README: the `…` line is gone and the view's description says the panel scrolls; the
  OpenRig-seat warning is there ("a split beside the seat's pane cuts that seat off
  from `rig send` and queue wakes … `/troupe close` before you leave"); "tested on 3.4";
  the old-state-file sentence is there. Addressed.
- `panel-probe.mjs` carries a HISTORICAL header (what it ran on, and that it no longer
  runs). Addressed in the script. `FEASIBILITY.md` check 3 still names the script as the
  evidence and still says nothing of it (the builder left that file alone, as it is outside
  o2's files): Noted below.
- The alternate screen (my Noted c): done, measured above.
- My Noted a, b, d, e are left as they are, and `RECORD.md` says so.

## Findings

### Act on

None.

### Consider

None new.

### Noted

- `FEASIBILITY.md` check 3 still presents `docs/missions/p2/panel-probe.mjs` with its
  run command and no word that the script no longer runs; only the script's own header says
  so. One line in the doc would close it; not needed for this mission.
- `gitFacts` treats any remote-tracking ref as "another branch", including a
  `refs/remotes/origin/HEAD` that points at something other than `origin/main`. In my
  scratch clone `origin/HEAD` pointed at `origin/order/p2/o2` (an artifact of cloning from a
  checked-out order branch), which hid o1's merge until I reset it. The failure is
  in the safe direction (it under-reports `merged`; a `REVIEW-<id>.md` still wins), and the real repo
  has no `origin/HEAD`.

### Dismissed

- The new `.troupe-state.json` sentence in the README shows the stale-file case honestly;
  nothing to change.
- My worktree shows `✓ o2 reviewed`: that is my own untracked `REVIEW-o2.md` in the mission
  folder, not a defect.

## Manual acceptance still open

1. **The real mouse wheel**: in a tmux with `set -g mouse on`, `/troupe docs/missions/p2`,
   scroll the wheel over the panel: the rows move three at a time, the header stays,
   `↑ N more` appears. I checked the keys and the SGR decoding, not a wheel.
2. **The no-tmux fallback in a plain terminal**: run the mod with no tmux anywhere above
   the session: `/troupe` answers `no tmux: showing the in-session pane`. The plugin test covers the
   decision; I could not make a live session without a tmux ancestor.

Also never run by me, as before: macOS (the `/proc` route is Linux only) and tmux older than 3.4.

## Verdict

PASS, 2 items for manual acceptance
