import type { EngineInterface } from 'claude-code'

import type { TroupeApproval } from '../types'
import { APPROVAL_FILE, planHash, recordOf } from '../src/mission.ts'
import { readPlan } from '../src/plan.ts'

// The file, the hash and the record's reading live in mission.ts, which
// troupe-panel imports too: one rule for "approved" in both views.
export { APPROVAL_FILE, planHash }

// The approval record: the human's yes to one plan.md, kept beside it in the
// mission folder as the plan's hash and the time. An edited plan (a
// whitespace edit too) has another hash, so the record no longer holds.
// troupe_dispatch refuses without a record that holds (dispatch.ts). The
// one writer is the Approve / Change dialog that /troupe raises (gate).

/** The record in mission folder `dir`, or null when there is none or it cannot be read. */
export async function readApproval($: EngineInterface, dir: string): Promise<TroupeApproval | null> {
  return recordOf(await $.fs.read(`${dir}/${APPROVAL_FILE}`).catch(() => undefined))
}

/** Records the human's yes to `plan`, the text they were shown; answers the record. */
export async function writeApproval($: EngineInterface, dir: string, plan: string): Promise<TroupeApproval> {
  const record = { planHash: await planHash(plan), approvedAt: new Date(await $.clock.now()).toISOString() }
  await $.fs.write(`${dir}/${APPROVAL_FILE}`, `${JSON.stringify(record, null, 2)}\n`)

  return record
}

export type Approved = { isApproved: true; record: TroupeApproval } | { isApproved: false; reason: string }

/** Whether plan.md in `dir` is approved as it is now: a record whose hash is the plan's. */
export async function approvalOf($: EngineInterface, dir: string): Promise<Approved> {
  const record = await readApproval($, dir)
  if (record === null) return { isApproved: false, reason: `the plan is not approved: no ${APPROVAL_FILE} in ${dir}` }
  const plan = await $.fs.read(`${dir}/plan.md`).catch(() => undefined)
  if (plan === undefined) return { isApproved: false, reason: `no plan.md in ${dir}` }
  if ((await planHash(plan)) !== record.planHash) {
    return { isApproved: false, reason: `plan.md changed since it was approved at ${record.approvedAt}: it must be approved again` }
  }

  return { isApproved: true, record }
}

const APPROVE = 'Approve'
const CHANGE = 'Change'
const NOT_NOW = 'Not now'

// One dialog at a time: a second /troupe while one is up answers without asking.
let isAsking = false

// A reason that opens with a file name keeps its spelling (`plan.md changed …`).
const sentence = (reason: string) => (reason.startsWith('plan.md') ? `${reason}.` : `${reason[0]?.toUpperCase()}${reason.slice(1)}.`)

/**
 * What the person answered: the label picked or the words typed, trimmed;
 * undefined when the dialog was dismissed or came back empty. A dialog that
 * auto-resolves while the person is away submits only the answers already
 * given (2.1.306), so a lone question comes back empty and approves nothing.
 * The engine refuses a plugin's own AskUserQuestion call ("that is $.ui.ask"),
 * so the result's afkTimeoutMs cannot be read here.
 */
async function askOnce($: EngineInterface, question: string, header: string, options: string[]): Promise<string | undefined> {
  const answer = (await $.ui.ask(question, { options, header }).catch(() => undefined))?.trim()

  return answer === '' ? undefined : answer
}

/** A typed answer counts as the label it spells, in any case. */
const is = (answer: string | undefined, label: string) => answer?.toLowerCase() === label.toLowerCase()

/** The person's answer: Approve, Not now, the words of a change, or undefined. */
async function ask($: EngineInterface): Promise<string | undefined> {
  const first = await askOnce($, 'Approve the plan?', 'Plan', [APPROVE, CHANGE])
  if (!is(first, CHANGE)) return first

  // Not now first, so a second Enter after Change does not approve.
  return askOnce($, 'What should change in the plan? Type it under Other.', 'Change', [NOT_NOW, APPROVE])
}

/**
 * Run by `/troupe` once the plan is shown, once per call: what the command
 * answers about approval. A plan that passes the checks and has no record
 * that holds raises the Approve / Change dialog: Approve writes the record;
 * Change hands the person's words to the conversation as a prompt, and the
 * next /troupe asks again. A plan with problems, or an approved one, is not
 * asked about.
 */
export async function gate($: EngineInterface, dir: string): Promise<string> {
  const approved = await approvalOf($, dir)
  if (approved.isApproved) return `The plan is approved (${approved.record.approvedAt}).`
  const why = sentence(approved.reason)
  const plan = await $.fs.read(`${dir}/plan.md`).catch(() => undefined)
  if (plan === undefined) return why
  if (readPlan(plan).problems.length > 0) return `${why} Not asked: the plan has problems; fix plan.md first.`
  if (isAsking) return `${why} The approval dialog is already open.`
  isAsking = true
  try {
    const answer = await ask($)
    if (is(answer, APPROVE)) return `The plan is approved (${(await writeApproval($, dir, plan)).approvedAt}).`
    if (answer === undefined || is(answer, NOT_NOW)) return `${why} Not approved; /troupe asks again.`
    // The engine refuses a submit from the command's own hook (it would wait on
    // the turn the hook holds), so it goes from a timer once the command has
    // answered. The words are in the answer too, so a refused prompt loses nothing.
    $.clock.after(0, () =>
      $.prompt.submit({ text: `Change asked in the plan dialog: ${answer}; edit ${dir}/plan.md, then /troupe again` }).catch(error => $.ui.log(`could not hand the change to the conversation: ${String(error)}`)),
    )

    return `${why} Change asked: ${answer}`
  } finally {
    isAsking = false
  }
}
