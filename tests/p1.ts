import type { TroupeMission } from '../types'
import { STEPS } from '../src/plan.ts'

// p1 as the approved mock shows it: its plan's goal, roles and o1, o1
// planned, the mission at "Plan OK?". A literal, so a later plan edit does
// not move the mock.
export const P1: TroupeMission = {
  dir: 'docs/missions/p1',
  name: 'p1',
  title: 'Plan: p1 — Phase 1, the pane reads plan.md',
  goal: 'Show a mission in a pane: its goal, the workflow and where it stands, the roles, and the orders.',
  step: STEPS.findIndex(step => step.label === 'Plan OK?'),
  hasRoles: true,
  roles: [
    {
      name: 'orchestrator',
      model: 'opus',
      effort: 'high',
      duty: [
        'Writes the plan and gets it approved',
        'Dispatches each order and merges it onto the mission branch',
        "Opens the MR after the human's go, then tears down",
      ],
      skills: [
        'messaging-the-human',
        'queue-handoff',
      ],
    },
    {
      name: 'builder',
      model: 'opus',
      effort: 'high',
      duty: ['Builds its order in its own worktree', 'Keeps ./check.sh green and the dev-mods copy in step', 'Fixes review findings, once per review'],
      skills: ['plugin-authoring'],
    },
    {
      name: 'reviewer',
      model: 'sonnet',
      effort: 'high',
      duty: ['Reviews each order for behaviour as it lands', 'On a light rig, that review is also the final review'],
      skills: [],
    },
  ],
  orders: [
    {
      id: 'o1',
      kind: 'code',
      goal: 'Turn the troupe pane into a read-only view of the mission plan: read-state.ts parses and checks plan.md and resolves role skills, draw-pane.tsx draws four parts (goal, workflow key steps with gates and the current step, roles with model/effort/duty/skills, orders in layers) and stays in place as the transcript scrolls, register.tsx only wires; probes removed, p0 leftovers fixed, tests, README, and the pane seen by Tianqi.',
      model: 'opus',
      dependsOn: [],
      state: 'planned',
    },
  ],
  problems: [],
}
