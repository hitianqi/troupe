// What the plan checks need from each agent: the flags that pin a role's
// permission. Each inner list is one setting, satisfied by any of its flags;
// a role's `flags` must set every one. Step 3 grows this into the adapters
// (start command, screen patterns, paste) and reads user adapter files.

export type Agent = { permission: string[][] }

export const AGENTS: Record<string, Agent> = {
  claude: { permission: [['--permission-mode', '--dangerously-skip-permissions']] },
  codex: {
    permission: [
      ['-a', '--ask-for-approval', '--dangerously-bypass-approvals-and-sandbox'],
      ['-s', '--sandbox', '--dangerously-bypass-approvals-and-sandbox'],
    ],
  },
}

/** Whether `flags` hold `flag`, alone or as `flag=value`. */
const sets = (flags: string[], flag: string): boolean => flags.some(one => one === flag || one.startsWith(`${flag}=`))

/** The permission settings `flags` leave unset, each as its flags joined with " or ". */
export const unsetPermission = (agent: Agent, flags: string[]): string[] =>
  agent.permission.filter(setting => !setting.some(flag => sets(flags, flag))).map(setting => setting.join(' or '))
