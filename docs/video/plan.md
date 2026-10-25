# troupe demo video — plan (2026-10-25)

The plan for the one-minute demo video (Phase 7). An earlier recording was
discarded; start from a clean demo repo.

## Constraints

- Every take is a real run, so keep it cheap: **3 builders (two in sequence)
  + 1 reviewer**, all at medium after the change, only **one Claude role**.
  Code quality does not matter; the roles only act.
- The tasks must be tiny so each role finishes in a few minutes.
- Selling line: your agents in real windows you can watch, talk to and
  approve; plan first; Claude and Codex mixed; one command to install.

## The new task: a link page

A fresh repo `troupe-demo` (private GitHub repo so the MR gate opens a real
PR): one `index.html` that says "Tianqi's links" and nothing else, a
`package.json` with `"test": "node --test"` and one trivial passing test.

Mission ask (typed on camera, English):

> Turn this into a small link page: the links live in a links.json file, the
> page renders them as a list, and it gets a clean look with a dark mode. One
> role for the data, one for the page (after the data), one for the style,
> plus a reviewer. Style on Claude sonnet; the rest on Codex, mixing
> gpt-6.1-sol and gpt-5.6-sol.

Expected plan:

| role | agent | depends_on | touches |
|---|---|---|---|
| `data` | Codex gpt-5.6-sol | — | links.json, links.js, tests/links.test.js |
| `page` | Codex gpt-6.1-sol | data | index.html, render.js, tests/render.test.js |
| `style` | Claude sonnet | — | style.css |
| `review` | Codex gpt-5.6-sol | reviews all | — |

FLOW then shows a chain (data → page), a parallel branch (style) and the
reviewer.

## The change-plan moment

Do not mention effort in the ask. The skill's template profiles say
`effort: high`, so the first plan comes out high (it did in both earlier
runs). At the plan gate, press `c` and type:

> It's a tiny page. Medium effort for every role is plenty.

The plan comes back with five `■■□□□ medium`; press `a`. If the
orchestrator happens to pick medium already, change something else that
reads well: "Put review on gpt-6.1-sol."

## Fix before shooting (or the take shows workarounds)

- **#27** panel answers must wake the orchestrator; otherwise the person has
  to type "Approved. Go." after every gate, and a cut hides a real gap.
- **#29** brief inside the worktree, so the Claude role does not stop to
  read it.
- **#28** Codex roles' git writes (or launch the roles with full-access
  flags, below).
- **#30** teardown after the PR (or keep "Tear it down." on camera; it reads
  as natural).

Keep exactly one "waits on you" moment: the Claude `style` role's first-run
trust dialog in the new repo. Everything else should not prompt, so: the
orchestrator in full access (Codex `/permissions` → Full Access before the
take, or start it with `--dangerously-bypass-approvals-and-sandbox`), and
roles with bypass flags requested in the ask if #28 is not fixed ("roles run
with full permissions").

## How to record

- A clean macOS Terminal at its normal laptop size (163×49 worked; the panel
  then gets ~73 columns) for the orchestrator take, plus the wide panel
  window above. Do not resize during a take.
- `asciinema rec -i 2 <take>.cast -c 'tmux attach -t demo'` on a detached
  `tmux new-session -d -s demo -c <repo>`; one `.cast` per take. Render with
  `agg`, cut and zoom with `ffmpeg` (all installed via brew).
- The driving session types with a per-character script (25 ms) so typing
  looks human.

## The panel is portrait, the video is landscape

The panel is half a laptop terminal (about 73×48 cells, roughly 3:4), and
most beats are about the panel, not the orchestrator. Three ways out, used
together:

1. **Record a second, wide panel.** The panel only reads the log and tmux, so
   during take A open a second Terminal at a 16:9 size (about 190×54) running
   `troupe panel -m <mission>`, and record it as its own `.cast`. At that
   width the MISSION tab lays out landscape: the left column, FLOW with the
   reviewer in its side lane, and the selected role's live window beside it.
   Press the panel keys (`c`, `a`, clicking roles) in this wide panel; they
   write the same log. `o` switches the tmux client that shows the roles, so
   film `o` in the orchestrator's terminal, not here. This is the main source
   for 15–46 s.
2. **Pair the panel with what it points at.** Where a beat is "the panel
   shows X", put the half-width panel on one side and the thing on the other:
   the plan gate beside the orchestrator writing the plan, the yellow
   "waits on you" beside the role's real pane with its dialog. Two portraits
   make one landscape.
3. **Panel plus caption.** The reference film's layout: the portrait panel
   on the right two thirds, a large caption on the left third of the dark
   stage. For short beats where nothing else is needed.

The orchestrator appears only where it acts: typing the ask, the PR link.

## Storyboard (~62 s, 1920×1080, bilingual captions)

| time | beat | shot | caption (en) |
|---|---|---|---|
| 0–4 s | pain | several terminals each running an agent, one stuck on a permission dialog nobody sees (staged, or text on the dark stage) | "Five agents. Five terminals. Who's stuck?" |
| 4–6 s | brand | icon (Signal, faded navy, level 2) + TROUPE wordmark | — |
| 6–15 s | three ways to start | one frame, three rows playing at once: a plain terminal typing `troupe up`, Claude Code typing `/troupe-mission …`, Codex typing `$troupe-mission …`, each as a typewriter; then each row's panel slides in | "Start from the CLI, or from the agent you already have open." |
| 15–22 s | plan first | plan gate in the panel, zoom on the effort cells (high) → `c` "Medium is plenty" → revised gate (medium) → `a` | "A plan first. Change it, then approve." |
| 22–34 s | real windows | in the MISSION panel, click each role in FLOW; the right column scrolls to its live window; pick one and press `o` → the `roles` window, tiled panes, Claude and Codex side by side | "Every role in its own window, worktree and branch." |
| 34–40 s | who's waiting | `style` turns yellow (trust dialog) → `o` → answer → back | "It tells you who's waiting on you." |
| 40–46 s | the whole picture | ROLES tab (ctx bars, tokens, effort cells), FLOW edges to the reviewer turning green | "Context, tokens, reviews, live." |
| 46–54 s | land it | MR gate `a` → PR link in the orchestrator → `troupe teardown`, the roles window closes | "Approve the MR. Clean up in one command." |
| 54–62 s | CTA | icon, TROUPE, `npm i -g troupe-cli`, GitHub link | "One command, a whole troupe." |

## Takes

- **A, full run** (Codex orchestrator, full access): ask → plan gate (high)
  → change → approve → dispatch → click through roles + `o` → trust dialog →
  ROLES tab, PLAN tab → review → MR → PR → teardown. Covers 15–54 s.
- **B, C, D, the three starts**: a plain terminal with `troupe up`, Claude
  Code with `/troupe-mission <ask>`, Codex with `$troupe-mission <ask>`; each
  recorded until the panel appears (~20 s), at the same terminal size so the
  three rows line up. D can be the opening of take A. The three are stacked
  into one frame in the edit.
- **E, pain shot** (optional): several agents in plain terminals.
- Stills: the finished page, light and dark, for a beat before the CTA if
  time allows.

Reset the demo repo between takes: delete `mission/*` and `role/*` branches,
`.git/troupe`, `.troupe`, `docs/missions`.
