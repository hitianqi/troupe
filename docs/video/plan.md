# troupe demo video — plan (2026-10-26)

The plan for the one-minute demo video (Phase 7). An earlier recording was
discarded; start from a clean demo repo. Recorded on Windows (WSL2) in
Windows Terminal.

## Constraints

- Every take is a real run, so keep it cheap: **3 builders (two in sequence)
  + 1 reviewer**, all at medium after the change. Claude does most of the
  work; **one Codex role**, the reviewer. Code quality does not matter; the
  roles only act.
- The tasks must be tiny so each role finishes in a few minutes.
- Only one mission is recorded in full. The parallel-missions shot needs a
  few seconds of two more, on any small task (see "Several missions").
- Selling line: your agents in real windows you can watch, talk to and
  approve; plan first; Claude and Codex mixed; several missions at once; one
  command to install.

## The mission: a link page

Why this one: the result is something to look at (a page, light and dark,
for a still), and its plan has the shape FLOW is made to show, a chain
(data → page), a parallel branch (style) and a reviewer, in three files a
role finishes in minutes.

A fresh repo `troupe-demo` (private GitHub repo so the MR gate opens a real
PR): one `index.html` that says "My links" and nothing else, a
`package.json` with `"test": "node --test"` and one trivial passing test.

Mission ask (typed on camera, English):

> Turn this into a small link page: the links live in a links.json file, the
> page renders them as a list, and it gets a clean look with a dark mode. One
> role for the data, one for the page (after the data), one for the style,
> and a Codex reviewer on gpt-5.6-sol. Page on opus, data and style on
> sonnet. The builders run with full access.

The builders' plan flags are then `--dangerously-skip-permissions`, so they
never stop. The reviewer keeps the skill's Codex default (`-a on-request -s
workspace-write`), so it stops for approvals: the first stop is the filmed
"waits on you" beat, and the driver answers every later one at once (cut in
the edit). Check the flags on the approval card before approving.

Expected plan:

| role | agent | depends_on | touches |
|---|---|---|---|
| `data` | Claude sonnet | — | links.json, links.js, tests/links.test.js |
| `page` | Claude opus | data | index.html, render.js, tests/render.test.js |
| `style` | Claude sonnet | — | style.css |
| `review` | Codex gpt-5.6-sol | reviews all | — |

Claude builds, Codex reviews: the mix reads in one line and puts the one
Codex role where its output (review notes) is short.

## The change-plan moment

Do not mention effort in the ask. The skill's template profiles say
`effort: high`, so the first plan comes out high. While the plan gate is
open, tell the orchestrator in its own pane:

> It's a tiny page. Medium effort for every role is plenty.

It edits the plan and opens the gate again; the panel's approval card
refreshes with four `■■□□□ medium`; press `a` in the panel. This shows that
talking to the orchestrator is all it takes, and the panel follows. If the
orchestrator happens to pick medium already, ask for something else that
reads well: "Put data on haiku."

This beat is shot in the plain split: the orchestrator on the left, the panel
on the right, both in frame.

## The one "waits on you" moment

The orchestrator is Claude Code started in the demo repo, so the repo is
trusted for Claude and its role worktrees do not ask. Codex has never run
there, and the reviewer keeps Codex's approvals, so it is certain to stop
(the trust dialog, then approvals): the panel turns it yellow, `o`, answer,
back.

Everything else must not prompt: start the orchestrator with
`claude --dangerously-skip-permissions`.

## Before shooting

- #27–#30, #32 merged (#31, #33). Since then: role state from hooks (#42),
  the orchestrator woken when a role finishes (#43), parallel missions
  (#47), the merged gate (#48). None has been through a full run with all
  of them together, so **the first run is a rehearsal, recorded**: if it is
  clean, it is take A.
- Fresh `troupe-demo` repo, local and private on GitHub.

## The terminal: a laptop-sized window, about 16:9

Viewers watch on an ordinary screen, so the frame is a normal laptop window,
not a strip. tmux runs in WSL; Windows Terminal is only the window.

- The size is set by eye before the rehearsal: the driving session opens the
  terminal, Tianqi resizes it until the split reads well, and that size (cols×rows, read with `tmux display -p
  '#{client_width}x#{client_height}'`) is kept for every take. A cell is
  about 0.47 as wide as it is tall, so about 160×45 is 16:9. Do not resize
  during a take.
- **Set (2026-10-26): 156×45**, the orchestrator 65 columns, the panel 90.
  troupe opens the panel at 45% of the orchestrator's pane, so right after
  it opens the driver sets it back: `tmux resize-pane -t <panel> -x 90`.
- Start the orchestrator in a pane already at its final size; a Claude Code
  resized after it started can leave its screen half redrawn.

## The panel is portrait, the video is landscape

The terminal stays split for the whole take: the orchestrator on the left,
the panel on the right, as a person uses it. Zoomed to the full window the
panel left its right side empty, so it is not zoomed; the framing is done in
the edit with camera moves on the rendered take:

- Render each cast with agg at about twice the output size (3840 wide), so a
  2× push-in on one half stays sharp.
- Where both halves matter (the ask, the change-plan moment, the PR link,
  the cleanup report): the full frame.
- Where the beat is the panel: push in on the right half and pan along it
  (the approval card, FLOW, a role's live window); the portrait crop sits on
  the dark stage with the caption in the space beside it.
- A slow drift or a slight tilt between beats keeps it moving, in the
  `tianqi-launch-film` style.

The `roles` window (`o`) is a full window already: the four panes tiled.

## Several missions

Missions run at once, each bound to its own orchestrator pane and worktree
(#47). The shot: take A's terminal as a tilted card, the camera pulls back
and two more cards slide out of it along the diagonal, staggered in depth,
each a different mission running.

Only the front card must be readable. The two behind are a few seconds each
of any small mission in the same terminal size (a README section, a test),
recorded once roles are working and FLOW moves; no need to finish them.

The 3D cards are beyond ffmpeg: render the casts to video with agg, then
build the shot with the `tianqi-launch-film` approach (real UI on tilted
planes, a gliding camera, depth of field).

## Take A, second run (after the first, 2026-10-26)

The first full run worked end to end; it is redone for these:

- **FLOW joined up.** FLOW draws an arrow only to a role right below the one
  it depends on, and puts the reviewer in its side lane only when FLOW is at
  least 61 columns, which needs the panel at 90 (89 gave 60). So: two
  builders in a chain and the panel at 90.
- **The ask stays short**; the shape is given at the change-plan moment:
  > Make it two builders in a chain: a data role for links.json first, then
  > the page with its styles, which waits on data. Codex reviews each as it
  > lands. Builders run with full access, and medium effort is plenty.
- **The live window beat**, while the reviewer works and every role window is
  still open: click each card in FLOW (orchestrator, data, page, review) and
  hold each for about 8 s; the detail and the live window under FLOW follow
  the card. With two builders FLOW is 17 rows and the live window about 9,
  both on screen at once; a selection resets the column's scroll, so a
  taller FLOW pushes the live window off screen. Zoomed in the edit.
- **The tour**, late, when the panel holds the most (the MR gate open,
  before approving): every tab in turn, MISSION, ROLES, PLAN (and `f` for the
  full text), LOG, DIFF, scrolling where there is more, about 5 s each.
- The orchestrator is not woken when a waiting role is answered (#53) or
  when the reviewer finishes a later branch (#54); nudge it in a line if it
  sits idle.
- Merging the PR on GitHub is the person's step.

Reset before it: the first run's merge reverted on main (PR #2),
`mission/*` branches, `.git/troupe`, `.troupe`, and the repo's entry in
`~/.codex/config.toml` removed so Codex asks to trust it again.

## Storyboard (at most 75 s, 1920×1080, bilingual captions)

Captions are drafts; they are polished after the footage is in.

| time | beat | shot | caption (en) |
|---|---|---|---|
| 0–4 s | pain | several terminals each running an agent, one stuck on a permission dialog nobody sees (staged, or text on the dark stage) | "Five agents. Five terminals. Who's stuck?" |
| 4–6 s | brand | icon (Signal, faded navy, level 2) + TROUPE wordmark | — |
| 6–16 s | three ways to start | three columns, each only its input line cropped from its take, typing at once: a shell `troupe up`, Claude Code `/troupe-mission …`, Codex `$troupe-mission …`; Enter; the Claude column grows into the full window and its panel slides in | "Start from the CLI, or from the agent you already have open." |
| 16–25 s | plan first | split: approval card (high) beside the orchestrator → "Medium is plenty" typed on the left → the card refreshes (medium) → click Approve | "A plan first. Just tell it what to change." |
| 25–38 s | real windows | push in on the panel; click each role in FLOW, the right column follows its live window; `o` → the `roles` window, tiled panes, Claude and Codex side by side | "Every role in its own window, worktree and branch." |
| 38–45 s | who's waiting | `review` turns yellow (Codex trust dialog) → `o` → answer → back | "It tells you who's waiting on you." |
| 45–52 s | the whole picture | push in on the ROLES tab (ctx bars, tokens, effort cells), FLOW edges to the reviewer turning green | "Context, tokens, reviews, live." |
| 52–63 s | land it | split: MR gate approved → PR link in the orchestrator → (cut: the PR merged on GitHub) → merged gate approved → the roles window closes → the orchestrator's cleanup report (worktrees, branches, panes removed) | "Approve, merge, and it cleans up." |
| 63–67 s | several missions | the tilted card splits into three | "Run several missions at once." |
| 67–75 s | CTA | icon, TROUPE, `npm i -g troupe-cli`, GitHub link | "One command, a whole troupe." |

## Takes

- **A, full run** (Claude Code orchestrator, `/troupe-mission`, skipping
  permissions): ask → plan gate (high) → change by talking to the
  orchestrator → approve → dispatch → click through roles + `o` →
  trust dialog → ROLES tab, PLAN tab → review → MR → merge on GitHub →
  merged gate → teardown and the orchestrator's cleanup report. Covers
  16–63 s.
- **B, C, D, the three starts**: a plain terminal with `troupe up`, Claude
  Code with `/troupe-mission <ask>`, Codex with `$troupe-mission <ask>`; B
  and D only until Enter, since the edit keeps just their input line. C is
  the opening of take A, so it runs on into the panel.
- **F, G, the missions behind**: a few seconds each, any small task.
- **E, pain shot** (optional): several agents in plain terminals.

Reset the demo repo between takes: delete `mission/*` and `role/*` branches,
`.git/troupe`, `.troupe`, `docs/missions`.

## How to record (WSL2)

- `asciinema rec <take>.cast -c 'tmux attach -t demo'` on a detached
  `tmux new-session -d -s demo -c <repo>`; one `.cast` per take. Take A is
  one unbroken cast from the ask to the cleanup report; the waits are cut in
  the edit. No `-i` at record time, so the cast keeps the action log's
  clock; idle is capped when rendering (`agg --idle-time-limit`). asciinema
  and agg run in WSL (`pipx install asciinema`; agg from its release
  binary); `ffmpeg` from apt for cuts and zooms.
- The driving session does all the input, from a script, so every take is
  repeatable and every action is on a timeline:
  - Typing goes in with `tmux send-keys -l`, one character at a time with a
    varied delay and short pauses between words, so it reads as a person
    typing.
  - Clicks go in the same way, as SGR mouse sequences
    (`send-keys -l $'\e[<0;COL;ROWM\e[<0;COL;ROWm'`, pane-relative); the
    panel reads them as real clicks. Tested on tmux: the bytes arrive intact.
  - Each action is logged with its time and its cell (pane offset plus
    row, col) in `<take>.actions.jsonl`.
- asciinema records no pointer. The cursor is added in the edit from the
  action log: a pointer gliding to each click's cell and a small ripple on
  the click, placed exactly because agg's cell size is known.
