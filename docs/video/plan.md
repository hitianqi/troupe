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
> sonnet.

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
there, so the `review` role opens on Codex's "Trust this folder?" dialog:
the panel turns it yellow, `o`, answer, back. Check in the rehearsal that it
appears; if Codex was run in the repo before, it will not.

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
  terminal, Tianqi resizes it until the split and the zoomed panel both read
  well, and that size (cols×rows, read with `tmux display -p
  '#{client_width}x#{client_height}'`) is kept for every take. A cell is
  about 0.47 as wide as it is tall, so about 160×45 is 16:9. Do not resize
  during a take.
- The panel opens at 45% of the orchestrator's pane.

## The panel is portrait, the video is landscape

Beside the orchestrator the panel is a portrait half. That is the right shot
where both halves matter (the ask, the change-plan moment, the PR link).
Where the beat is the panel itself, **zoom the panel pane** with tmux
`prefix z`: it fills the window, redraws at that width (the panel
redraws on resize), and the MISSION tab lays out landscape: the left column,
FLOW with the reviewer in its side lane, the selected role's live window
beside it. `prefix z` again goes back to the split. The zoom can stay in the
cut as a push-in, or be cut on.

The `roles` window (`o`) is a full window already: the four panes tiled.

Check the zoomed MISSION and ROLES tabs while setting the size.

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

## Storyboard (at most 75 s, 1920×1080, bilingual captions)

Captions are drafts; they are polished after the footage is in.

| time | beat | shot | caption (en) |
|---|---|---|---|
| 0–4 s | pain | several terminals each running an agent, one stuck on a permission dialog nobody sees (staged, or text on the dark stage) | "Five agents. Five terminals. Who's stuck?" |
| 4–6 s | brand | icon (Signal, faded navy, level 2) + TROUPE wordmark | — |
| 6–16 s | three ways to start | three columns, each only its input line cropped from its take, typing at once: a shell `troupe up`, Claude Code `/troupe-mission …`, Codex `$troupe-mission …`; Enter; the Claude column grows into the full window and its panel slides in | "Start from the CLI, or from the agent you already have open." |
| 16–25 s | plan first | split: approval card (high) beside the orchestrator → "Medium is plenty" typed on the left → the card refreshes (medium) → click Approve | "A plan first. Just tell it what to change." |
| 25–38 s | real windows | `prefix z` on the panel; click each role in FLOW, the right column follows its live window; `o` → the `roles` window, tiled panes, Claude and Codex side by side | "Every role in its own window, worktree and branch." |
| 38–45 s | who's waiting | `review` turns yellow (Codex trust dialog) → `o` → answer → back | "It tells you who's waiting on you." |
| 45–52 s | the whole picture | zoomed ROLES tab (ctx bars, tokens, effort cells), FLOW edges to the reviewer turning green | "Context, tokens, reviews, live." |
| 52–63 s | land it | split: MR gate approved → PR link in the orchestrator → (cut: the PR merged on GitHub) → merged gate approved → the roles window closes → the orchestrator's cleanup report (worktrees, branches, panes removed) | "Approve, merge, and it cleans up." |
| 63–67 s | several missions | the tilted card splits into three | "Run several missions at once." |
| 67–75 s | CTA | icon, TROUPE, `npm i -g troupe-cli`, GitHub link | "One command, a whole troupe." |

## Takes

- **A, full run** (Claude Code orchestrator, `/troupe-mission`, skipping
  permissions): ask → plan gate (high) → change by talking to the
  orchestrator → approve → dispatch → zoom, click through roles + `o` →
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
