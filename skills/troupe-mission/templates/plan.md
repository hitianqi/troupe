# <mission>: <title>

## Intent

<One paragraph: what the person wants and why; link the issue.>

## Done when

- <observable acceptance criterion>
- <observable acceptance criterion>

## Out of scope

<What this mission deliberately does not do.>

## Decisions for you

1. <A question the code cannot answer, with the options.> **Recommended:
   <option>**, because <reason>. Approving takes the recommendations; a
   different answer is a change.

<Leave the section out when there is none.>

## How the work is split

<Why the roles are cut where they are. Files that change together sit in one
role. A hub file (shared helpers, types, config) is touched by exactly one
role. Two roles whose `touches` overlap are ordered by `depends_on`;
everything else runs at once.>

```yaml
troupe: 1
goal: "<the mission in one sentence: what it delivers>"
why: "<one line: why now>"
workflow: troupe-mission
base: main
profiles:                       # settings several roles share; a role's own fields win
  claude-build:
    agent: claude
    model: opus
    effort: high
    flags: [--permission-mode, acceptEdits]
  codex-build:
    agent: codex
    model: <model>
    effort: high
    flags: [-a, on-request, -s, workspace-write]
roles:                          # one role = one window, one worktree, one branch
  api:
    use: codex-build
    goal: "<one line: what this role delivers>"
    touches: [src/api/]         # a trailing slash means the whole directory
  web:
    use: claude-build
    model: sonnet
    goal: "<one line>"
    touches: [web/src/]
    depends_on: [api]           # opens once api's result says done
  review:
    agent: claude
    model: sonnet
    effort: high
    flags: [--permission-mode, acceptEdits]
    goal: "Review each branch as it lands"
    touches: []                 # changes no files
    reviews: [api, web]
```

Each role names its `agent` (`claude`, `codex`, or an adapter in
`.troupe/agents/`) and its own `flags`, which must pin the agent's permission
(Claude Code: `--permission-mode`; Codex: `-a` and `-s`): a role never
inherits it. `model` and `effort` are passed as written. Keep each value on
one line. If a role turns out to need a file it did not declare, update this
plan; a changed plan is approved again before the next dispatch.

## Role: api

<What the role does, what it must not change, and how it proves its work: a
command, or an app path to drive.>

## Role: web

<...>

## Role: review

<Review each branch as it lands, in the order they land. What to check beyond
the reviewer rules.>
