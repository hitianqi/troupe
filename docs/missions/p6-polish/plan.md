# p6-polish: stale command lock recovery, executable build

## Intent

Two small fixes. First, `locked` in `src/command-context.ts` uses the
`command.lock` directory as its lock. If the holder is killed with SIGKILL,
the directory stays, and every later troupe command for the mission is
refused until someone deletes it by hand. The lock should record its holder's
pid and clear itself when that process is gone. Second, `npm run build`
leaves `dist/cli.js` without the executable bit, so a `troupe` installed with
`npm link` fails with `Permission denied`. The README's Known limits entry
about `command.lock` is rewritten to match the new behaviour.

## Done when

- `locked` writes the holder's pid into the lock. When a lock's recorded pid
  is no longer running, the lock is removed, one line explaining that is
  printed, and the command goes on.
- A lock whose pid is still alive is refused exactly as it is today.
- New tests in `tests/commands.node.mjs` cover a dead-pid lock being
  recovered and a live-pid lock still being refused; `./check.sh` is green.
- After `npm run build`, `dist/cli.js` is executable (`test -x dist/cli.js`).
- The README's Known limits entry for `command.lock` describes the new
  behaviour.

## Out of scope

Other locking changes (timeouts, waiting for the lock to free), anything
else in the README, and publishing the package.

## Decisions for you

1. **A lock with no readable pid** (left by an older troupe, or a holder
   killed between creating the directory and writing its pid). **Recommended:
   refuse as today**, with a message that names the directory to remove by
   hand. A fresh lock always looks like this for a moment, and clearing it
   could let two commands run at once.
2. **How the build sets the bit.** **Recommended: `tsc -p
   tsconfig.build.json && chmod +x dist/cli.js`**. It is simple, and the
   package only runs on macOS and Linux, since it needs tmux.
3. **Who reviews.** **Recommended: Claude Opus, effort high.** It differs
   from both builders (Codex, and Claude Sonnet), and the lock logic has a
   race to check: two commands that both find the same dead lock.

## How the work is split

The lock code and its tests change together, so they form one role (`lock`,
Codex). The build script and the README form a second role (`build`,
Claude). It depends on `lock` because the README must describe what `lock`
actually ships. The two roles touch no files in common.

```yaml
troupe: 1
goal: "A command lock left by a killed process clears itself, and the built troupe CLI is executable"
why: "A SIGKILLed command blocks the mission until someone deletes the lock by hand, and npm link gives a CLI that cannot run"
workflow: troupe-mission
base: mission/p6-polish
roles:
  lock:
    agent: codex
    model: gpt-6.1-sol
    effort: high
    flags: [-a, on-request, -s, workspace-write]
    text: workflow:builder
    goal: "command.lock records its holder's pid and is cleared, with one line saying so, when that pid is gone"
    touches: [src/command-context.ts, tests/commands.node.mjs]
  build:
    agent: claude
    model: sonnet
    effort: medium
    flags: [--permission-mode, acceptEdits]
    text: workflow:builder
    goal: "npm run build leaves dist/cli.js executable; README Known limits describes the self-clearing lock"
    touches: [package.json, README.md]
    depends_on: [lock]
  review:
    agent: claude
    model: opus
    effort: high
    flags: [--permission-mode, acceptEdits]
    goal: "Review each branch as it lands"
    touches: []
    reviews: [lock, build]
    text: workflow:reviewer
```

## Role: lock

In `src/command-context.ts`, change `locked`:

- After `mkdirSync(dir)` succeeds, write `process.pid` to a file inside the
  lock (for example `dir/pid`).
- If `mkdirSync` fails because the lock exists, read the pid. If it is a
  valid integer and that process is not running (`process.kill(pid, 0)`
  throws `ESRCH`; `EPERM` means it is alive), remove the lock, write one line
  with `r.write` or another existing output path, then take the lock with
  `mkdirSync` once more. Only one of two racing commands may win that
  `mkdirSync`; the loser is refused as today. Do not loop.
- If the pid file is missing or unreadable, or the pid is alive, refuse as
  today. The message names the lock directory.

`locked` does not take a `Runtime` today. If it needs one in order to print,
add the parameter and update its callers, and add those caller files to
`touches` (tell the orchestrator in your result). Do not change other
behaviour.

Tests go in `tests/commands.node.mjs`, next to the existing lock test:

- A lock holding the pid of a process that has exited (spawn one and wait for
  it to exit) is cleared: the command succeeds and its output includes the
  explanation line.
- A lock holding a live pid (`process.pid`) is still refused.
- A lock without a pid file is still refused.

Proof: `./check.sh` is green.

## Role: build

- In `package.json`, change `build` so that `dist/cli.js` ends up executable,
  as decided (`... && chmod +x dist/cli.js`). Prove it with `rm -rf dist &&
  npm run build && test -x dist/cli.js`.
- In `README.md` under Known limits, rewrite the `command.lock` entry to
  describe what `lock` merged. Read the merged `locked` code; do not copy it
  from this plan. Keep the entry as short as its neighbours. Mention the case
  that still needs a hand removal: a lock with no pid.

Do not touch any other part of the README. Proof: `./check.sh` is green.

## Role: review

Review each branch as it lands. For `lock`: check the race where two
commands find the same dead lock (exactly one may proceed), that `EPERM`
counts as alive, that the lock is still always removed in `finally`, and
that the tests really kill or exit a process rather than inventing a pid.
For `build`: check that the README matches the merged code.
