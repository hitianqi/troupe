# wake-on-answer: tell the orchestrator when a waiting role is answered

## Intent

When a role waits on the person (a trust dialog, a permission prompt) and the
person answers it in the role's window, the orchestrator is never told and sits
idle until the person types to it
([#53](https://github.com/tianqizhao0704/troupe/issues/53)). The role's own
report of the answer should wake it, the same way a finish does (#43). The
Codex trust dialog that started it should not appear at all.

## Done when

- A Codex role opens without the "Trust this folder?" dialog, and `~/.codex/config.toml` is not changed.
- A Claude role's hooks record when it starts and stops waiting on a permission prompt.
- When a waiting Claude role is answered, troupe types one line into the orchestrator naming the role.
- Each answered wait is reported once; a role that finished since is reported only by its finish.
- Tests cover the trust flag, the waiting record, and the answered notice.

## Out of scope

- Codex roles waiting mid-turn on an approval: Codex reports those only through
  its hooks, which come with #54. Once #54 lands they feed the same notice.
- Telling the orchestrator when a role *starts* waiting.
- The herdr panel bug (#56).

## Decisions for you

1. **If Codex ignores the trust flag.** The plan passes
   `-c projects."<repository>".trust_level="trusted"` on the role's command
   line, which changes no file. If Codex still shows the dialog, either write
   that same entry into `~/.codex/config.toml` (what answering the dialog
   writes anyway), or leave the dialog in place. **Recommended: write the
   entry**, because it is exactly what the person's answer would write, for
   the repository they are already working in.
2. **Which answers wake the orchestrator.** Every answered wait, or only waits
   the orchestrator was told about. **Recommended: every answered wait**,
   because troupe has no reliable record of what the orchestrator saw; a notice
   costs it one short turn, and it is dropped when the role finished meanwhile.

## How the work is split

One builder. The trust flag sits in the role's command line
(`src/agents.ts` / `src/role-commands.ts`), the waiting record in the hook
recorder (`src/activity.ts`) and its hook list (`src/role-commands.ts`), and
the notice in `src/notices.ts`, which reads the record. All of it shares
`src/role-commands.ts` and the activity tests, and it is small. The reviewer is
Codex, on a different model from the builder.

```yaml
troupe: 1
goal: "Wake the orchestrator when a role waiting on the person is answered; open Codex roles without the trust dialog"
why: "A role answered in its own window leaves the orchestrator idle until the person types (#53)"
workflow: troupe-mission
base: mission/wake-on-answer
roles:
  wake:
    agent: claude
    model: claude-opus-5-5
    effort: high
    flags: [--permission-mode, acceptEdits]
    text: workflow:builder
    goal: "Pre-trust Codex roles; record waits from Claude hooks; notice the orchestrator on each answer"
    touches: [src/, tests/, README.md, skills/troupe-mission/SKILL.md]
  review:
    agent: codex
    model: gpt-5.6-sol
    effort: high
    flags: [-a, on-request, -s, workspace-write]
    goal: "Review the wake branch"
    touches: []
    reviews: [wake]
    text: workflow:reviewer
```

## Role: wake

Read issues #53 and #43 (commit 4d23d9d) first, then `src/notices.ts`,
`src/activity.ts`, `turnOf` and `roleSettings` in `src/role-commands.ts`, and
`argvOf` in `src/agents.ts`. Signals come from the agent's own report (hooks,
session log), never from new screen patterns or polling.

**1. Codex trust.** Codex keys folder trust by the main repository root: in the
demo, answering the dialog in a role worktree wrote
`[projects."/home/tizh/repos/projects/troupe-demo"] trust_level = "trusted"`.
Add `-c projects."<main repository root>".trust_level="trusted"` to every Codex
role's argv. Prove it against a real Codex in a scratch tmux server
(`tmux -L <name>`) on a fresh repository under `$HOME` that Codex has never
trusted, with a role worktree under `.troupe/worktrees/`: first show the dialog
appears without the flag, then that it does not with it, and that
`~/.codex/config.toml` is unchanged. Codex may first show other dialogs (an
update notice, a background-server settings prompt); get past them without
changing settings, and do not let them stand in for the trust result. If the
flag does not suppress the dialog, write the entry into `~/.codex/config.toml`
at dispatch instead (decision 1), touching only that one table, and say so in
your result. Remove the scratch repository and tmux server when done.

**2. Waiting record (Claude).** Claude's `PermissionRequest` hook fires when
its permission dialog is shown; record that the role waits on the person, with
its time. The next hook that shows the turn moved on (the tool ran or failed,
a new prompt, the turn stopped) ends the wait: keep, alongside the current
turn, when the last wait was answered, so it survives later hook writes. Pick
the fewest extra hook events that cover approve, deny and interrupt; each one
starts a process per tool call, so say which you added and why. `turnOf` should
read the recorded wait directly; the screen stays the fallback before the first
report.

**3. Answered notice.** In `pendingNotices`, for each open role whose record
holds an answered wait not yet told, add one notice, e.g. `Role review was
answered in its window and is working again.` Key it by the answer's time so it
is said once and survives a panel restart. Drop it when the role has finished
since (its result is newer than the answer, or its turn is ready): the finish
notice says it. Gate answers and finishes keep their order and behaviour.

Update the README and the mission skill where they describe what the
orchestrator is told. Run `npm test` and `npm run check`; the panel timing tests
can be flaky under load, so rerun a failing one on the base before blaming the
change.

## Role: review

Review the `wake` branch when it lands. Beyond the reviewer rules, check that
the waiting state comes only from hooks (no new screen patterns or timers),
that a Claude role answered by deny or interrupt still ends its wait, that no
notice is lost or repeated across a panel restart, that the trust flag is
quoted correctly for a path with spaces, and that nothing writes
`~/.codex/config.toml` unless decision 1 required it.
