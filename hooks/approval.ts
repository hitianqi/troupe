import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { TroupeApproval } from '../types'

// The approval record: the human's yes to one plan.md, kept beside it in the
// mission folder as the plan's hash and the time. An edited plan (a
// whitespace edit too) has another hash, so the record no longer holds.
// troupe_dispatch refuses without a record that holds (dispatch.ts).

/** In the mission folder, beside plan.md. */
export const APPROVAL_FILE = 'APPROVAL.json'

const approval = atom({ plugin: 'troupe', key: 'approval' } as const, null)

/** `sha256:<hex>` of the plan's text, as read. */
export async function planHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))

  return `sha256:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

/** The record in mission folder `dir`, or null when there is none or it cannot be read. */
export async function readApproval($: EngineInterface, dir: string): Promise<TroupeApproval | null> {
  const text = await $.fs.read(`${dir}/${APPROVAL_FILE}`).catch(() => undefined)
  if (text === undefined) return null
  try {
    const record: unknown = JSON.parse(text)
    if (typeof record !== 'object' || record === null) return null
    const { planHash: hash, approvedAt } = record as Record<string, unknown>

    return typeof hash === 'string' && typeof approvedAt === 'string' ? { dir, planHash: hash, approvedAt } : null
  } catch {
    return null
  }
}

/** Records the human's yes to plan.md as it is now; answers the record. */
export async function writeApproval($: EngineInterface, dir: string): Promise<TroupeApproval> {
  const record = { planHash: await planHash(await $.fs.read(`${dir}/plan.md`)), approvedAt: new Date(await $.clock.now()).toISOString() }
  await $.fs.write(`${dir}/${APPROVAL_FILE}`, `${JSON.stringify(record, null, 2)}\n`)
  await update($, approval, () => ({ dir, ...record }))

  return { dir, ...record }
}

export type Approved = { isApproved: true; record: TroupeApproval } | { isApproved: false; reason: string }

/** Whether plan.md in `dir` is approved as it is now: a record whose hash is the plan's. */
export async function approvalOf($: EngineInterface, dir: string): Promise<Approved> {
  const record = await readApproval($, dir)
  await update($, approval, () => record)
  if (record === null) return { isApproved: false, reason: `the plan is not approved: no ${APPROVAL_FILE} in ${dir}` }
  const plan = await $.fs.read(`${dir}/plan.md`).catch(() => undefined)
  if (plan === undefined) return { isApproved: false, reason: `no plan.md in ${dir}` }
  if ((await planHash(plan)) !== record.planHash) {
    return { isApproved: false, reason: `plan.md changed since it was approved at ${record.approvedAt}: it must be approved again` }
  }

  return { isApproved: true, record }
}

/**
 * Run by `/troupe` once the plan is shown: what the command answers about
 * approval. A stand-in for the Approve / Change dialog (o3), which asks when
 * the plan has no record that holds and writes it with writeApproval.
 */
export async function gate($: EngineInterface, dir: string): Promise<string> {
  const approved = await approvalOf($, dir)

  return approved.isApproved ? `The plan is approved (${approved.record.approvedAt}).` : `${approved.reason[0]?.toUpperCase()}${approved.reason.slice(1)}.`
}
