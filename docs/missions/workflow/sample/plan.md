# Plan: idcheck — the plan check flags order ids that are not oN

Intent: the pane and the skill both name orders `o1`, `o2`, … and match
`REVIEW-<id>.md` and the agent descriptions (`o2: ...`) by that id, but
nothing checks a plan's ids: a plan with `step-2` or `o01` is read without a
word and its orders never show as reviewed. The plan check should say so
before the plan gate. A made-up mission, the walkthrough's sample; it is never
run against the repo.

Done when:
- `readPlan` reports `o01: order id must be oN` for a plan with that id, and
  nothing for `o1` and `o10`.
- `templates/plan.md` still parses with no problems, and a test says so.
- The README names the rule in the plan-checks line.

Out of scope: renaming ids in existing plans; any change to the pane's drawing.

## How the work is split

o1 owns `hooks/plan.ts` (the reader, a hub file) and the test of its rules.
o2 writes the README line and a test that the plan template obeys the rule;
that test sits in the same test file as o1's, so o2 depends on o1.

## Orders

```yaml
goal: "The plan check flags an order id that is not oN, before the plan gate."
roles:
  orchestrator:
    model: opus
    effort: high
    duty:
      - "Writes the plan and gets it approved"
      - "Dispatches each order and merges it onto the mission branch"
      - "Opens the MR after the human's go, then tears down"
    skills: []
  builder:
    model: opus
    effort: high
    duty:
      - "Builds its order in its own worktree"
      - "Fixes review findings, once per review"
    skills: []
  reviewer:
    model: sonnet
    effort: high
    duty:
      - "Reviews each order as it lands"
      - "On a light rig, the last order review is also the final review"
    skills: []
orders:
  - id: o1
    kind: code
    goal: "checkPlan reports an order id that does not match oN."
    why: "The pane and the skill both key on oN. Reuses checkPlan's problem list in hooks/plan.ts; nothing else reads ids."
    touches:
      - hooks/plan.ts
      - tests/read-state.test.ts
    depends_on: []
    model: opus
    risks: "hooks/plan.ts is the reader every pane read goes through; a wrong pattern flags valid plans. p0 and p1 plans must stay clean."
    proof: "./check.sh passes; readPlan on a plan with o01 lists the new problem, and with o10 lists none."

  - id: o2
    kind: code
    goal: "The README names the rule, and a test pins the plan template to it."
    why: "A rule the template breaks would flag every new plan. Reuses the template as the test's input; no new fixture."
    touches:
      - README.md
      - templates/plan.md
      - tests/read-state.test.ts      # overlaps o1: the test file is shared
    depends_on: [o1]
    model: sonnet
    risks: "templates/plan.md is read by the pane and by tests/fixtures.ts; only a comment may change in it."
    proof: "./check.sh passes; the new test fails when the template's second id is renamed to o02."
```

## Review

Each order is reviewed as it lands (`REVIEW-<id>.md`). With two orders there is
no slim pass and no final review: the review of o2 is also the final review,
and reads the whole mission diff.
