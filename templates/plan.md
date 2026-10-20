# Plan: <mission title>

Intent: <one paragraph: what the user wants and why; link the issue>

Done when:
- <observable acceptance criterion>
- <observable acceptance criterion>

Out of scope: <what this mission deliberately does not do>

## How the work is split

<Why the orders are cut where they are. Files that change together sit in one
order. A hub file (shared helpers, types, config, a central registry) is owned
by exactly one order. Where two orders would share a file, say whether the
sharing was removed first (e.g. the file was split) or serialized.>

## Orders

`scripts/plan_lint.py` reads the YAML block below. Every `code` order declares
the files or directories it will change in `touches`, and in `why` why it is
needed and what in the codebase it reuses, or why nothing there fits. Two
orders whose `touches` overlap must be connected by `depends_on`; everything
else runs in parallel. If an order turns out to need a file it did not declare, update this
plan in the same commit.

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
    skills: [plugin-authoring]
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
    model: opus           # opus | sonnet: who does the order's work (see below)
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
bounded. It changes who writes the order's code, not the builder seat. An
order that decides how something looks is always `opus`.

## Review

Each order is reviewed as it lands, and the integrated mission once more,
across orders, after the slim cuts (`REVIEW.md`). Findings go to a fixer, at
most two rounds per review; then the orchestrator rules.
