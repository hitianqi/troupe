# Plan: <mission title>

Intent: <one paragraph: what the user wants and why; link the issue>

Done when:
- <observable acceptance criterion>
- <observable acceptance criterion>

Out of scope: <what this mission deliberately does not do>

## Decisions for the human

<Each question the code cannot answer, with the options and your
recommendation. Approve in the /troupe dialog accepts the recommendations; a
different answer is a Change. Leave the section out when there is none.>

## How the work is split

<Why the orders are cut where they are. Files that change together sit in one
order. A hub file (shared helpers, types, config, a central registry) is owned
by exactly one order. Where two orders would share a file, say whether the
sharing was removed first (e.g. the file was split) or serialized.>

## Orders

The orders block below is checked before dispatch (the troupe pane lists its
problems). Keep each value on one line. Every `code` order declares
the files or directories it will change in `touches`, and in `why` why it is
needed and what in the codebase it reuses, or why nothing there fits. Two
orders whose `touches` overlap must be connected by `depends_on`; everything
else runs in parallel. With one or two orders the mission is light: they run
one after the other, whatever `depends_on` says. If an order turns out to need
a file it did not declare, update this plan in the same commit; a changed plan
is approved again before the next dispatch.

```yaml
goal: "<the mission in one sentence: what it delivers>"   # the pane's first line; else Intent's first sentence
roles:                    # optional; the pane flags a skill the session lacks
  orchestrator:
    model: opus           # opus | sonnet | haiku | fable; an order's own model overrides it
    effort: high          # low | medium | high | xhigh | max
    duty:                 # bullet lines
      - "Writes the plan and gets it approved"
      - "Dispatches each order and merges it onto the mission branch"
    skills: []
  builder:
    model: opus
    effort: high
    duty:
      - "Builds its order in its own worktree"
    skills: []            # e.g. [verify-<app>] when the project has that skill
  reviewer: []            # the short form: skills only, default model, effort and duty
orders:
  - id: o1
    kind: code            # code | research (research orders change no files)
    goal: "<one sentence>"
    why: "<why it is needed; what it reuses, or why nothing existing fits>"
    touches:
      - src/example/      # a trailing slash means the whole directory
      - src/types.ts
    depends_on: []
    model: opus           # opus | sonnet | haiku | fable: who does the order's work (see below)
    risks: "<what could break, and who else depends on these files>"
    proof: "<how the builder shows it works: a command, or an app path to drive>"

  - id: o2
    kind: code
    goal: "<one sentence>"
    why: "<...>"
    touches:
      - src/types.ts      # overlaps o1, so it must depend on o1
      - src/feature/
    depends_on: [o1]
    model: sonnet
    risks: "<...>"
    proof: "<...>"
```

`model` is the orchestrator's call per order, shown to the human at plan
approval: `opus` where the work needs judgement, `sonnet` where it is well
bounded. It is the model of the builder that does the order; the role window
runs `claude --model <model> --effort <the builder role's effort>`. An order
that decides how something looks is always `opus`.

## Review

Each order is reviewed as it lands (`REVIEW-<id>.md`), and the integrated
mission once more, across orders, after the slim cuts (`REVIEW.md`); with one
or two orders there is no slim pass, and the last order review is also the
final review. Findings go to
a fixer: one fix round and one re-review per review, then the orchestrator
rules.
