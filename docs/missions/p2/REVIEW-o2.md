# Review: p2 o2 — troupe-panel and the split-right (also the FINAL review of mission p2)

This is the order review of `order/p2/o2` at `1b992e4` **and the final review of
mission p2** (light rig: the o2 review is also the final review). Judged against
`docs/missions/p2/plan.md`: Done when, the o2 entry, and all six amendments
(they supersede the original look rules). Order diff `feature/NO-JIRA-p2..order/p2/o2`
(34 files); mission diff `origin/main..order/p2/o2` (54 files, with o1's evidence
and the plan). `claude --version` 2.1.304, Node v22.23.2, tmux 3.4.

The look is Tianqi's and approved (look 4); I judged behaviour only.

## How I verified

My own scratch tmux servers (`tmux -L …`), never a window of an OpenRig seat,
`~/.claude/settings.json` untouched, scratch under `~/scratch/troupe/p2-r1/`. My
worktree `troupe-p2-r1` is detached at `1b992e4`.

- `./check.sh` in my worktree: exit 0 (validate; 36 plugin tests; 4 Node tests; the
  workflow walkthrough check "all checks hold"; `tsc: clean`). I laid the engine
  types by copying `.claude-plugin/types/` from the builder's worktree, so `tsc`
  really ran.
- **The real split**, `claude --plugin-dir <my worktree>` in a 158x57 scratch window,
  started with the OpenRig/Claude variables unset, so the engine has no `$TMUX` and the
  pane's shell has it (the same shape as a seat), on a non-default socket
  (`-L rev-r1-live`):
  `/troupe docs/missions/p2` → `troupe panel opened on the right (79 columns, pane %1)`;
  `list-panes`: `%0 78x57 claude` (active) and `%1 79x57 node` (50%, `-d` kept the
  focus, and the width is the one tmux gave). The in-session pane was gone (one view).
  `.troupe-state.json` written in the mission folder, and `git status` shows it
  ignored.
  - second `/troupe docs/missions/p2` → `already open (pane %1)`, no new pane;
    `/troupe docs/missions/workflow` → same pane, now showing workflow;
  - `kill-pane` by hand, then `/troupe` → a new split (`%2`), no stale id;
  - `/troupe close` → `panel closed; the in-session pane is back`, window back to 158
    columns; again → `no troupe panel is open.`;
  - `/reload-plugins` with the panel open, then `/troupe` → `already open`, still one split;
  - `/exit` → the panel pane gone, no `troupe-panel` process left;
  - `kill -KILL` of claude → the panel pane gone within 5 s (the `--owner` check), no
    stray node.
- **The panel never emits more rows than the pane**: `bin/troupe-panel docs/missions/p2`
  in tmux, resized to 30x27, 63x57, 79x57, 117x57, 20x10, 40x5 and 10x3, with Down, Down,
  PageDown, End, Up, PageUp, Home and End sent at each size, the raw output recorded with
  `pipe-pane`: the highest row address is ≤ the pane's rows at every size, no newline is
  written, and no line is wider than the pane. `kill -TERM` of the panel → `pane_dead_status=0`.
- **The leftovers**, through `troupe-panel --once --plain`: an effort `ultra` is a plan
  problem and shows no meter fill; a plan with an unreadable YAML block has no "light" in
  its header; a 19-character order id is cut with `…` in ORDERS and shown whole in
  `← deps` and DETAIL; ROLES and ORDERS are one line each.
- Git order state, by reading `mission.ts` and running `gitFacts` against the real
  repo and a scratch clone (finding 1).
- The repo and the dev-mods copy (`~/.claude/dev-mods/bc6ef3fd-…/troupe`, the newest;
  I take it to be dev-b1's): every shared path identical; only
  `.claude-plugin/types/claude-code-mcp/index.d.ts` differs, which is the allowed path.

## Done-when, point by point

| Criterion | Result |
| --- | --- |
| FEASIBILITY Phase 2 section, checks answered | Met (o1 review: PASS). One evidence script no longer runs, see finding 3. |
| `troupe-panel` engine-free, one shared drawing path | Met: `lines.ts`, `mission.ts`, `ansi.ts` are imported by both `draw-pane.tsx` and `bin/troupe-panel`. |
| The mod splits right, keeps and reuses the id, closes on `/troupe close` and at session end, no second split on reload, fallback outside tmux | Met live, all but the fallback, which I could not drive live (my scratch claude always has a tmux ancestor); the plugin test `with no tmux above the session` covers it and its message text matches the plan. |
| 50% with a 30-column floor; focus kept (`-d`); real width reported | Met live (79 of 158; `active=1` on the seat pane). |
| One view at a time | Met live. |
| Never more rows than the pane, every offset; clean SIGTERM | Met (above). |
| The Phase 1 leftovers | Met (above). The "tables degrade to the detail form" wording became compact lines per the rulings. |
| Order state from git; the builder working while an order runs | Works as written, with finding 1 and Noted a. |
| Tests: split decision, id reuse, fallback; Node test at two widths; `check.sh` exit 0 with `tsc` | Met. |
| README (tmux required, `/troupe`, `/troupe close`, usage, mouse needs `set -g mouse on`, the state file) | Met, with finding 2 for two stale or missing lines. |
| RECORD.md (`claude --version`, verdicts, seen live, known limit, p3, Phase 3 progress) | Met: the OpenRig-seat limit, the p3 list and "live progress stays Phase 3" are all there. |
| Repo and dev-mods copies in step | Met (above). |

## Findings

### Act on

1. **Order state from git reads other missions' orders as merged when the local `main`
   is behind `origin/main`.** `gitFacts` (`hooks/mission.ts`) finds the orders merged
   onto the mission branch with
   `git log <base> --not --exclude=<base> --exclude=order/* --branches`, so a commit
   counts as "on the mission branch alone" only if no local branch has it. This
   project's own convention fetches into `refs/remotes/origin/*` only; the local
   `main` moves only when someone pulls it, and a mission branch is rebased onto
   `origin/main`. Then the earlier missions' commits (`o1: …`, `o2: …` from p1 and
   workflow) are "on the mission branch alone", and every order whose id matches a
   subject there is `done` before it exists.
   *Reproduction* (`~/scratch/troupe/p2-r1/stale`, a clone of this repo; script
   `…/scratchpad/gf.mjs` calls `gitFacts(run, 'p2', ['o1','o2'])` from the o2 tree):
   with local `main` = `origin/main` (c3433a7) and the order branches present the answer is
   `{"running":["o2"],"merged":["o1"]}` (correct); with local `main` set back to `5761d26`
   (everything else the same, order branches deleted) it is
   `{"running":[],"merged":["o1","o2"]}`: o2, which has no commits on the mission branch,
   is drawn `done`. The same happens to p3's o1 and o2 the day p2 is merged and the
   local `main` is not pulled. In the panel this shows as `● o2 done` and the reviewer
   `working`, the opposite of what amendment 5 asks for ("honest on rig-built missions").
   *Fix, bounded:* also exclude what the remotes have: `--not --branches --remotes`
   with `--exclude=origin/<base>` and `--exclude='origin/order/*'` (after a push,
   `origin/<mission branch>` holds the same commits and must stay out of the exclusion).
   Add a test with a repository whose local `main` lags. Siblings I looked for: the
   same `--branches`-only reading appears once (`gitFacts`; `troupe-panel` and the mod
   both call it); the `running` rule uses `rev-list base..order/<mission>/<id>` and is
   not affected.

### Consider

2. **README: two stale lines and one missing warning.** (a) "What the pane shows"
   still says the view is "cut from the bottom to the rows there are (the last row `…`)".
   The panel now scrolls with `↑ N more` / `↓ N more rows`; the `…` rule is gone from
   the panel (RECORD says so). (b) The README never says that a split in an OpenRig
   seat's window makes the seat unreachable by `rig send` and queue wakes. That is in
   RECORD.md ("Known limit") only; a person who installs the mod in a seat reads the
   README. One sentence under "The panel" would do. (c) "tmux (3.0 or later)": I
   ran 3.4 only, and the split passes the command as several arguments; if 3.0 is
   a guess, say "tested on 3.4".
3. **o1's check-3 evidence script no longer runs on this tree.**
   `docs/missions/p2/panel-probe.mjs` (named in FEASIBILITY.md check 3 with its command
   line) copies the old `docked` order and calls `rolesTable` / `ordersTable`, which o2 removed:
   `node --experimental-transform-types docs/missions/p2/panel-probe.mjs --golden` →
   `TypeError: rolesTable is not a function or its return value is not iterable`.
   `troupe-panel` and `tests/panel.node.mjs` supersede it, so this is a stale record,
   not a defect. Either delete the script and `ts-resolve.mjs` and point the doc at
   `troupe-panel`, or add one line to FEASIBILITY.md ("run on `89eb623`; the panel
   replaced it"). Carry-over from the o1 review: its Consider 2 (the SIGTERM line missing
   from `p2-c3-poll.txt`) is moot now; `tests/panel.node.mjs` pins the exit and I
   reproduced it on `bin/troupe-panel`.

### Noted

- a. **The reviewer never shows "working" in a rig-built mission, and the builder shows
  "working" while the order is under review.** Review comes before the merge, so during
  an order review git still says `running` and there is no `REVIEW-<id>.md` yet. Seen live
  while I reviewed this order: `● builder working o2`, `· reviewer idle`. By design of
  amendment 5; no signal exists for it without the engine's agent list.
- b. **Stale `.troupe-state.json` is believed.** A panel run by hand after a session reads the
  last file the mod wrote: I put one `o1: … running` agent in it and the panel drew
  `◐ o1 running` and the builder `working`. The README says what a missing file does, not
  what an old one does.
- c. **No alternate screen.** `troupe-panel` repaints with `ESC[2J` on the main screen, so
  tmux moves each old frame into the pane's scrollback (`history_size` reached hundreds of
  lines in my run, bounded by `history-limit`). Nothing scrolls on screen, and with the
  mouse on the wheel goes to the panel, so the person does not see it; copy mode in the
  panel's pane would.
- d. **Line widths are string lengths** (`fit`, `cut`, `clip`): a CJK or emoji character in a
  plan's goal would misalign the right edge of a box. The cursor-addressed rows keep it
  from scrolling, and repository content is English.
- e. The panel and the mod each run `git for-each-ref`, `git log` and one `rev-list` per
  unmerged order every 10 s; fine for a mission of a handful of orders.

### Dismissed

- Split width 79 where the 40% in the first amendment says otherwise: the fourth amendment
  sets 50%.
- A second split on reload, or a stale pane id after the pane is closed by hand: both
  checked live, neither happens.
- The panel overflowing the pane at some offset, which the first look reported: not
  reproduced at seven sizes with eight scroll actions each (raw output checked).
- Both views open at once: the in-session pane is closed while the panel is open
  (live), and a reload with the panel open does not reopen it (plugin test).
- The `/proc` route needing Linux: README and RECORD both say so.

## Cross-order checks (the final-review pass)

- o1's finding that the engine has no `$TMUX` and `tmux display -p` names the wrong
  pane is what o2 builds on, and it works on a non-default socket: my scratch server's
  socket is `/tmp/tmux-1000/rev-r1-live`, found only through the ancestor's environment.
  The o1 review's Consider 1 (the socket, from the ancestor's `/proc` environ) is adopted.
- The shared module is used by both sides (`lines.ts`, `mission.ts`, `ansi.ts`); no
  logic is duplicated except o1's probe script (finding 3).
- `read-state.ts` re-exports `stateOf` and `hasSkill` for the workflow mission's check
  (`check.sh` runs it and it holds).
- Plan amendments 1–6 are all reflected in code or RECORD.md.

## Not verified, and manual acceptance

- A real mouse wheel in tmux with `set -g mouse on`; I checked the key paths and the SGR
  decoding in the tests, not a wheel.
- The no-tmux fallback live (plugin test only), macOS, tmux older than 3.4, and Herdr's tile
  as a person sees it (look 4 was approved there by Tianqi).

Manual-acceptance items: **(1)** in a tmux with `set -g mouse on`, `/troupe docs/missions/p2`,
click the panel, scroll the wheel: the rows move three at a time, the header stays, `↑ N more`
appears; expected: no pane redraw glitch. **(2)** run the mod in a plain terminal with no tmux
anywhere above it: `/troupe` answers `no tmux: showing the in-session pane`.

## Verdict

FAIL: 1 Act-on finding
