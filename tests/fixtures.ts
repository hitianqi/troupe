// Plans the tests read, in the shape of templates/plan.md.

const plan = (block: string) => `# Plan: demo — a sample mission

Intent: Draw the \`demo\` pane. It shows a sample mission
for the tests.

## Orders

\`\`\`yaml
${block}\`\`\`
`

/** Valid: both roles forms (the mapping one in full and in part), skills in both spellings, o2 after o1 and o3 in parallel with o1. */
export const VALID = plan(`roles:
  orchestrator:
    model: fable
    effort: max
    duty:
      - "Runs the demo: plans and merges"
      - Opens the MR
    skills: []
  builder: [plugin-authoring, shared:systematic-debugging]
  reviewer:
    skills: []
orders:
  - id: o1
    kind: code            # a comment
    goal: "Add the parser: it reads plan.md"
    why: 'Reuses plan_lint''s rules'
    touches:
      - hooks/read-state.ts
      - types/
    depends_on: []
    model: opus
  - id: o2
    kind: code
    goal: Draw the pane
    why: "Reuses the spike's layering"
    touches: [hooks/draw-pane.tsx, types/index.d.ts]
    depends_on: [o1]
    model: sonnet
  - id: o3
    kind: research
    goal: "Check the engine's widths"
    depends_on: []
    model: opus
`)

/** o1 and o2 share types/ and neither depends on the other. */
export const OVERLAP = plan(`orders:
  - id: o1
    kind: code
    goal: "Types"
    why: "x"
    touches: [types/]
    depends_on: []
    model: opus
  - id: o2
    kind: code
    goal: "More types"
    why: "x"
    touches: [types/index.d.ts]
    depends_on: []
    model: sonnet
`)

/** An unquoted value holding ": ", which YAML refuses (plan_lint says to quote it). */
export const BAD_YAML = plan(`orders:
  - id: o1
    kind: code
    goal: Draw it: the pane
    why: "x"
    touches: [hooks/]
    model: opus
`)

/** The builder names two skills; the goal comes from the block's goal: key. */
export const NAMED_SKILLS = plan(`goal: "Show the demo mission in a pane"
roles:
  builder: [plugin-authoring, troupe-no-such-skill]
orders:
  - id: o1
    kind: code
    goal: "Anything"
    why: "x"
    touches: [hooks/]
    depends_on: []
    model: opus
`)
