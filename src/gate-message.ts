export const afterMrApproval = (mission: string): string => `Open the PR, then run troupe stage teardown -m ${mission} and troupe teardown -m ${mission} before reporting completion.`
