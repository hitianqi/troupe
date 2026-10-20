# Re-review: p1 — Phase 1, the pane reads plan.md (order o1, round 2)

Reviewer: rev.r1. Re-review of `order/p1/o1` at tip adda3c4 (feature/NO-JIRA-p1
base 1237162; main f0d05e6). On this light rig it is **also the final review**
of the whole `feature/NO-JIRA-p1` diff against `main`: one order, so there are
no cross-order contracts; every changed file sits in o1's declared `touches`
(`plan_lint --order o1 --base f0d05e6`: ok).
Previous report: `REVIEW-o1.md` (FAIL: 1 Act-on).

`claude --version` 2.1.304 as recorded by the builder. I did not load the mod
live (needs Tianqi's answer in a seat's own tile); I relied on the engine-kit
tests, the builder's captures in `docs/missions/p1/`, and my own scratch
harnesses.

## How I reviewed

- Own worktree `../troupe-p1-r1`, detached at adda3c4, nothing committed.
  `./check.sh` in my run: validate passes, **19 pass / 0 fail**, `tsc: clean`.
- Read every changed hook (`plan.ts`, `read-state.ts`, `view.ts`, `graph.ts`,
  `draw-pane.tsx`, `register.tsx`, `yaml.ts` diff), the tests, the mock, the plan's
  amendments, README, RECORD.
- **Is the mock test strict?** Mutation run: 24 one-line mutations in a scratch
  copy, each followed by `claude plugin test`. 16 are caught; 8 survive (7 listed
  under Consider 1; the eighth, how a triple duplicate id is reported, does not matter).
- plan_lint parity again, on the new `plan.ts`: all 55 real `plan.md` files in
  `~/repos` agree with `plan_lint.py` on problem counts (the earlier 61 included
  the p1 worktrees, now left out), plus the 14 variants from round 1.
- Roles forms, goal fallback, step inference: scratch probes (below).
- Layout fuzz: 11,000 mission shapes (0–12 orders, long goals/ids, missing skills,
  every step, widths 30–200) through `graph`, both tables and DETAIL: no throw,
  no ragged box, no overflow from 90 columns up except the one in Noted.
- Diff against main: stray files, size, language, trailers.
- Siblings looked for: other places a skill verdict or listing is cached
  (`read-state.ts` only), other `void` promises (`tick` and `openPane` both
  caught), other YAML escapes, the same width bug in the second table.

## Round 1 findings: addressed?

| Finding | Status |
| --- | --- |
| Act on 1: skill verdict cached with the plan version | **Addressed.** `skillNames` asks again at the next poll after a failure or empty listing and every 30 s; the verdict is rebuilt on every refresh. Test "the skill verdict follows the session" exists; removing the 30 s staleness (`now - skills.at >= SKILLS_MS` → `false`) fails it. |
| Consider 1: `hasSkill` over-matches | **Addressed.** Only `shared:x` ≡ `x`; mutating it back to "compare after the colon" fails a test. |
| Consider 2: `void openPane` without `.catch` | **Addressed** (`register.tsx`). |
| Consider 3: `\u`, `\x` silently misread | **Addressed.** `"→"` and `"\x41"` now throw with the line; `\n \t \\ \" \/` still read. |
| Consider 4: "newest" is by mtime | **Addressed** in README and in the `newestMission` comment. |

## Done-when, point by point

| Point | Result |
| --- | --- |
| Goal: `goal:` key, else first sentence of Intent | Works: key wins; an empty or non-string `goal:` falls back; no Intent gives `—`. Quirk in Noted (abbreviation). |
| Roles, both forms | `name: [skills]` and `{model, effort, duty, skills}` both read; a missing field takes the default for the three named roles; a custom role takes `—`; no block gives the three defaults; `roles:` as a list or scalar is flagged. See Noted for odd effort values. |
| Step inference | Matches the plan: no orders or any plan problem → Plan; all planned → Plan OK?; any planned/running → Build; some done not reviewed → Order review; light and all reviewed → MR OK?; heavy → Slim, then Cut once SLIM.md exists, then MR OK? once REVIEW.md exists. Light skips Slim/Cut/Final review. It never passes MR OK?. Each branch is covered by a test that fails when the branch is mutated. |
| The look = the approved mock | At 110 columns the pane equals the mock cell for cell (docked, inline, inline-with-rows) — see strictness below. |
| Below 107 columns the graph stacks | Boundary is `gw >= 22` ⇒ width ≥ 107, as ruled. Stacked layout renders cleanly down to 30 columns; matches the builder's live capture. |
| Inline fit | `rows >= docked.length` gives the docked pane (GRAPH first); otherwise header, DETAIL, TABLES (42 rows at 110). It does not cut lines to the rows; the engine's inline frame scrolls (RECORD) — consistent with the approved inline order. |
| plan_lint parity | Holds (above). |
| One timer; no unguarded tool hook | `poll?.cancel()` present; removing it fails the poll test (3 vs 6). No tool hook remains. |
| Line limits | register.tsx 63 (≤100); plan.ts 242, view.ts 225, graph.ts 165, read-state.ts 108, draw-pane.tsx 63, yaml.ts 160 (all <300). |
| dev-mods copy | `~/.claude/dev-mods/04a95594-…/troupe`: `hooks/`, `tests/`, `types/`, `plugin.json` identical to the repo. |
| `./check.sh` green | Yes, in my run. |
| Diff against main | 23 files, +2560/−344. Nothing in it from `~/scratch`; `docs/missions/p1/` holds plan, RECORD, mock (17 KB) and two captures (5–8 KB). `package-lock.json`/`node_modules` not in the diff. Trailers present. See Noted for language and history. |

## Is `tests/mock.test.ts` strict enough?

For what it covers, yes: it compares all 66 docked lines and all 42 inline lines
of the pane to arrays generated from the approved mock, as text, so any change in
a glyph, spacing, wrap, truncation, border, rule, label or column fails. A
separate test checks the key colours and the strikethrough. Mutations to the loop
text, the layer number, the effort meter, the light rule, every `stepOf` branch,
the skill match and the inline order all fail.

It covers **one mission state** (p1, one order, at "Plan OK?", every skill found,
110 columns). Mutations that survive (19/19 still pass):

- the stacked graph's `▼` and its "↑ fix ≤ 2 → back to build" line (the layout
  Tianqi actually gets in a 50-column dock) — only a few lines of the 100-column
  engine test are asserted;
- the 107 boundary itself (`GW_ROW` 22→20);
- the reviewer's "working while an order is `done`" row;
- the red `✗` tone of a missing skill in the tables;
- the inline switch point (`rows >= docked.length`);
- `REVIEW-o1-10.md` (two-digit fix rounds) as reviewed.

## Act on

None.

## Consider

1. **Add goldens for what the mock test does not pin** (cheap): the stacked graph
   (the builder's `capture-docked-50cols.txt` is already the expected text), one
   mid-flow heavy mission (build running, a done order awaiting review, a
   missing skill), the 106/107 boundary, and a `REVIEW-oN-10.md` file name.
2. **"Needs you" at "Plan OK?" shows through the whole build on this rig.** Orders
   are built by seats, not by subagents the pane can see, so every order stays
   `planned` until its `REVIEW-<id>.md` appears; `stepOf` therefore stays at
   "Plan OK?" and the orchestrator row reads orange "needs you ◆ Plan OK?" for the
   entire build. The mock's own footnote admits it. A Tianqi who reads the pane
   mid-mission will think the plan is waiting for him. Phase 2/3 fix it; until
   then say so in the README next to the state rules, or show gates as "unknown"
   (the plan's own wording) when nothing but the plan file backs the claim.
   Related: a FAIL review also leaves `REVIEW-<id>.md`, so the order shows
   `reviewed` and a light mission jumps to "MR OK?" while a fix round runs.
3. **Below about 90 columns the tables drop columns.** At the 50-column dock the
   roles table shows ROLE, MODEL, EFFORT and STATE; SKILLS becomes `…` and NOW is
   cut (see `capture-docked-50cols.txt`); the orders table cuts GOAL to nothing.
   Nothing is lost (DETAIL below repeats them), but STATE/NOW are the live part.
   The engine ignored the 110 columns the pane asks for, so this is the
   realistic docked width. Fix idea: below ~90 columns, make the tables
   two-line rows or leave them out and let DETAIL carry the information.
4. **Language rule.** `CLAUDE.local.md` says all repository content is English.
   This branch adds Chinese quotations of Tianqi in `plan.md` (the amendments),
   `RECORD.md` and the comment in `tests/mock-p1.ts`
   ("太丑了", "这太简陋了…", "可以，就这样做"). The seat name 大博士贴 is already on
   main (p0) and can stay as a name. The quotes should be English.

## Noted

- Roles/DETAIL: an unknown `effort` (`ultra`, `3`) is printed with an empty meter
  `▫▫▫▫▫` and no problem; a role named in `roles:` that is not one of the three
  gets `—` for model and no duty; naming only some of the three roles shows only
  those (defaults apply only with no block). Not flagged anywhere.
- A header reads "light" for a plan that could not be read (0 orders).
- A detail row whose label is longer than 12 characters (an order or role id)
  runs one character over; `truncate-end` hides it. The word of a state in an
  order's goal text is painted like the state.
- A transient "the session lists no skills to check against" is counted in the
  header as a plan problem.
- `goalOf` cuts at the first `.`+space, so an Intent opening "Add e.g. a thing."
  gives "Add e.g.".
- A plan with the orders block unreadable (multi-line or `|`/`>` values) shows no
  orders; README now says to keep values on one line.
- Branch history: 11 commits including two superseded designs (the "cards" look)
  and plan amendments with long verbatim rulings, with absolute `/tmp/claude-1000/…`
  screenshot paths in `plan.md`. Squash at the MR if a clean history matters.
- RECORD.md's "What was built" and "Third look" sections still describe the
  withdrawn cards design and 60-line `register.tsx`; the "Round 4" section is the
  current one.

## Dismissed

- *Hang in `wrap` for a tiny width:* `drawPane` floors the width at 40, and 30 ran
  without a hang in my fuzz.
- *Two timers after a second `session.start`:* tested and mutation-checked.
- *Skill listing asked every poll:* only after a failure; otherwise every 30 s.
- *Roles form `- builder` list:* flagged as a problem, not silently ignored.
- *Stray or oversized files in the diff:* none.

## What I could not verify

- The side-by-side graph in a ≥107-column dock live: the engine gave the dock 50 of
  160 columns, so only the 110-column text (the test) and 114-column inline
  capture exist.
- Role/order STATE with live subagents (Phase 3); my probes feed `stepOf`
  and `stateOf` the data directly.
- Docked placement at 110 columns fullscreen and unasked at 144 columns by the
  engine's own `isPlaced`/`reason` (the builder saw docked only at 160 columns).

Manual acceptance (Tianqi, via 大博士贴):

1. Dock at ≥107 columns (fullscreen): `/troupe` shows the four groups side by side;
   expected to match `docs/missions/p1/mock-p1.txt`.
2. A seat running an order as a subagent named `o1: …`: builder row "working o1",
   graph box `◐ o1 … running`.
3. Docked placement: fullscreen from 110 columns (`/troupe`) and unasked at 144
   columns: `isPlaced` true.

## Verdict

PASS, 3 items for manual acceptance. All five round-1 findings are addressed;
there are no open Act-on findings. Consider 1–4 are cheap and can ride along or
be filed for Phase 2.
