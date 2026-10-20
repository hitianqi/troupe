# Review: p1 — Phase 1, the pane reads plan.md (order o1)

Reviewer: rev.r1. Order review of `order/p1/o1` (tip 8cc3960, base 7966662).
On this light rig it is **also the final review** of the whole
`feature/NO-JIRA-p1` diff against `main` (f0d05e6): one order, so there are no
cross-order contracts to check; every changed file sits in o1's declared
`touches`.

`claude --version`: 2.1.304 (as recorded by the builder; I did not load the mod live).

## How I reviewed

- Own worktree `../troupe-p1-r1` (detached at 8cc3960, no commits). `npm ci`,
  `.claude-plugin/types/` copied from the builder's worktree (gitignored).
- `./check.sh`: validate passes, `claude plugin test` 10 pass / 0 fail, `tsc: clean`.
  Only advice: README has no marketplace install line (not applicable yet).
- Read `read-state.ts`, `yaml.ts`, `draw-pane.tsx`, `register.tsx`, types, tests,
  README, RECORD.md line by line.
- Parity against `plan_lint.py`: ran both on 61 real `plan.md` files across
  `~/repos` plus 14 hand-made variants (globs, trailing slash, `./` prefix,
  same-indent lists, transitive dependency, triple duplicate id, self-dependency,
  blank `why`, scalar `touches`, missing ids, empty `kind`). Problem counts agree
  on all 61 real plans; the variants are listed below.
- Parser fidelity: ~1,500 generated YAML snippets and every scalar shape in the
  template, compared with PyYAML (`safe_load`). Outside scalar typing
  (`yes`/`0x1F` stay strings, which the pane wants), I found the two silent
  misreads below; everything else either parses the same or is refused with a
  line number.
- Scratch engine-kit test (deleted afterwards) for the stale-skills finding.
- Siblings looked for: every other place a skill list is computed or cached
  (`refresh` is the only one); every other `void`-ed promise in hooks
  (`tick` is caught, `openPane` is not, finding 2); every other hook
  (`session.start`, `command.run`, `ui.render`; no tool hook remains).

## Done-when, point by point

| Point | Result |
| --- | --- |
| plan_lint parity | Same scope/overlap semantics (trailing slash, globs, `./` stripped), duplicates, unknown deps, cycles, missing touches/why, transitive `depends_on` all agree. See Noted for the two divergences. |
| Bad YAML never crashes the drawing | Yes: `readPlan` returns `orders: []` plus one problem with the line; pane draws the problem. |
| `yaml.ts` never silently misreads | Two exceptions, both rare (Consider/Noted below). Multi-line plain scalars, `>`/`|`, nested flow lists, unquoted `: `, tabs, duplicate keys, unclosed quotes/lists are all refused with a line. Same-indent block lists, comments, quoted `: `, `''` escapes, flow lists all read correctly. |
| Skills, both spellings, missing flag | `shared:x` ↔ `x` works and a missing one shows red. But see Act on 1 and Consider 1. |
| One timer across reloads | `poll?.cancel()` before `clock.every`; the test shows one tick-set after a second `session.start`. Reload behaviour rests on the engine cancelling the old module's waits, as p0 found; I did not exercise a real hot reload. |
| No tool hook without `.catch` | No tool hook remains. |
| `/troupe` name or folder | Both work in the test (`docs/missions/<name>` from cwd; `../other/docs/missions/p9/` with trailing slash; unknown name says "no plan.md in …"). |
| Line limits | register.tsx 60 (≤100); read-state.ts 241, draw-pane.tsx 163, yaml.ts 155 (all <300). |
| Repo vs dev-mods copy | dev.b1's folder is `~/.claude/dev-mods/04a95594-…/troupe`: `hooks/`, `tests/`, `types/`, `plugin.json` identical to the repo. (The other folder, `86f94b63-…`, is a stale Phase 0 session; ignore it.) |
| `./check.sh` green | Yes, in my own run. |

## Act on

### 1. Skill check is computed once per plan version and never refreshed; one early failure flags every skill red until plan.md is edited

`refresh()` in `hooks/read-state.ts` rebuilds `base` (including each skill's
`isFound`) only when `dir` or `planMtimeMs` changes; otherwise it reuses
`before`. `skillNames()` returns `undefined` when `$.session.usage` rejects or
has no skill breakdown, and then every skill gets `isFound: false` and the
problem "the session lists no skills to check against" is added.

Failure scenario (reproduced with a scratch engine-kit test, deleted after): plan
with `builder: [plugin-authoring, …]`; `session.usage` rejects on the first
call, then works. Over five polls `session.usage` was called **once**; the pane
kept showing the "no skills to check" problem and no `✓ plugin-authoring`. The
same staleness applies if the session gains skills later (a plugin loaded
mid-session): the pane keeps the old verdict until someone edits plan.md.
`session.start` runs the first `tick` immediately, which is the moment usage is
least likely to be ready. I could not check live whether usage is ready there;
the builder's live evidence only covers `/troupe <path>` after the session was up,
which rebuilt `base`.

Fix (small): don't cache the skill verdict. Either resolve `isFound` from the
parsed roles on every refresh (one `session.usage` call per poll, or
cached for a few polls), or at least don't keep a `base` built while `listed`
was `undefined`. Keep the plan parse cached by mtime. Add a test: usage denies
once, then works, and the pane ends with `✓`.

## Consider

1. **`hasSkill` matches on the part after the first colon, so a plugin-qualified
   name matches any plugin's skill of that name.** `bare('codex:rescue') ===
   bare('rescue')`, so a plan asking for `rescue` is shown ✓ when the session only
   has `codex:rescue`; `shared:setup` is satisfied by `codex:setup`. The spec is
   two spellings: `shared:x` equals listed `x`; any other prefix must match as
   listed. Hides exactly what the flag is for. Fix: compare with
   `name === one || (name.startsWith('shared:') && name.slice(7) === one) ||
   (one.startsWith('shared:') && one.slice(7) === name)`. The existing test
   asserts `codex:rescue` is found, which stays true.
2. **`void openPane($)` in `session.start` has no `.catch`.** If `$.ui.open`
   rejects (it is the one engine call here that can refuse), that is an
   unhandled rejection in the hooks worker, the same class of leftover as the p0
   tool hook. `tick` right above it is caught. Same fix: `.catch(error =>
   $.ui.log(...))`. Sibling: `command.run` awaits `openPane` without a try; an
   engine rejection there surfaces as a failed command, probably fine.
3. **Double-quoted `→`, `\x41` etc. are silently misread** (`"→ arrow"`
   becomes `u2192 arrow`; PyYAML gives `→`). `scalar()` keeps the character after
   a backslash for any escape except `\n`/`\t`. Fix: throw on any other escape
   except `\\`, `\"`, `\/`, and the `\n`, `\t` already handled (matches the
   "refuse, don't misread" rule). Low likelihood (plans usually carry the
   literal `→`), but this is the one path that breaks the stated contract.
4. **"Newest mission" is the newest `plan.md` mtime, not the newest directory.**
   Editing an old mission's plan, or a rebase that rewrites it, flips the pane
   to that mission. The tiebreak on equal mtimes is numeric name descending
   (p1 over p0), which is right for a fresh checkout. The plan says "the newest
   dir"; the README says "newest mission". Fine to keep, but say it in the README.

## Noted

- Divergences from `plan_lint.py` that make the pane more lenient: an empty
  `kind:` (null) is read as `code` (plan_lint flags it); a scalar `touches:
  hooks/` is read as one entry (plan_lint iterates its characters, so neither
  is useful). Triple duplicate ids are reported once, not three times. Any
  non-`orders` yaml block that is invalid is skipped (plan_lint aborts).
- `- - x` (a sequence item that is itself `- x`) reads as the string `- x`;
  PyYAML reads a nested list. No plan shape uses it.
- Plans that plan_lint accepts but the pane can't read: multi-line plain `why:`
  and `>`/`|` blocks, and flow lists spanning lines. The pane flags "the orders
  block cannot be read: line N …" and shows no orders. Across the 61 real plans
  in `~/repos` none hits this (all 61 agree on problem counts), so it is
  consistent with "flag as unparseable". The README could tell plan authors to keep values on one line.
- `stripComment` treats `'` after a space inside a plain scalar as a quote start,
  so `why: a ' b # c` keeps ` # c` in the value. Needs an unbalanced apostrophe
  and a trailing comment.
- The roles and skill lists are also not re-read when only the session's skill
  list changes (see Act on 1); the mission name from `/troupe` stays set until
  another `/troupe`.
- README's `/troupe <path>` for a bare name that contains `/` (`p1/`) is treated
  as a path, not a mission name; the pane says "no plan.md in p1". Harmless.

## Dismissed

- *Second timer after reload / second `session.start`:* the test fails
  (3 vs 6 stats) without the cancel; the cancel is there.
- *Cycle / overlap logic differs from plan_lint:* ported faithfully; agrees on
  the 61 real plans and the variants (transitive dependency, self-dependency, glob
  against file, `./` prefix, trailing slash).
- *Probe leftovers in `register.tsx`:* none left (no tool hook, probe command or deny rule).
- *`tests/` deletions of the two probe tests:* intended; Phase 2 brings real deny tests.
- *dev-mods copy drift:* none (see table).

## What I could not verify

I did not load the mod in a session (needs Tianqi's answer in a seat's own
tile), so nothing here is a live observation; the pane tests run through the
engine kit and the builder's recorded captures are what I relied on.

Manual acceptance (Tianqi, via dev.b1's tile or 大博士贴):

1. **Look and the full pane.** Entry: `/troupe ../troupe-p1-o1/docs/missions/p1`
   (or from a checkout holding p1, `/troupe`). Expect title, roles, "plan checks
   clean", one order in layer 1 with `○ o1 opus planned`, three gate rows
   `? plan / MR / merged  unknown`. Inline at 76 columns about nine rows show, so
   orders and gates need a scroll of the focused pane.
2. **Dock at 110 columns fullscreen** after `/troupe`: `isPlaced` true, the
   whole pane visible.
3. **Unasked at 144 columns:** the pane opens by itself.

## Verdict

FAIL: 1 Act-on finding (skill verdict cached once; fixable in a few lines),
plus 3 items for manual acceptance. Consider 1–3 are cheap to fix in the same round.
