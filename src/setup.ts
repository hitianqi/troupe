import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { Refusal } from './command-context.ts'
import type { Reply, Runtime } from './command-context.ts'

export const INSTALL_MARKER = '.troupe-install.json'
export const skillTarget = (r: Runtime, agent: string): string => join(r.home, agent === 'claude' ? '.claude/skills/troupe-mission' : '.agents/skills/troupe-mission')
export const available = (r: Runtime, command: string): boolean => r.run('which', [command]).code === 0

const marked = (path: string): boolean => {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink()) return false
  try {
    return JSON.parse(readFileSync(join(path, INSTALL_MARKER), 'utf8')).owner === '@troupe/cli'
  } catch {
    return false
  }
}

export const installSkill = (r: Runtime, agent: string, remove = false): string => {
  const target = skillTarget(r, agent)
  if (existsSync(target) && !marked(target)) throw new Refusal(`will not ${remove ? 'remove' : 'overwrite'} ${target}: no troupe install marker`)
  if (remove) {
    if (marked(target)) {
      rmSync(target, { recursive: true })

      return `Removed ${target}\n`
    }

    return `Not installed: ${target}\n`
  }
  const source = join(r.packageRoot, 'skills/troupe-mission')
  if (!existsSync(join(source, 'SKILL.md'))) throw new Refusal(`package skill is missing: ${source}`)
  mkdirSync(dirname(target), { recursive: true })
  const staging = mkdtempSync(join(dirname(target), '.troupe-install-'))
  const backup = `${staging}-old`
  try {
    cpSync(source, staging, { recursive: true })
    writeFileSync(join(staging, INSTALL_MARKER), `${JSON.stringify({ owner: '@troupe/cli', source })}\n`)
    if (existsSync(target)) renameSync(target, backup)
    try {
      renameSync(staging, target)
    } catch (error) {
      if (existsSync(backup)) renameSync(backup, target)
      throw error
    }
    if (existsSync(backup)) rmSync(backup, { recursive: true })
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true })
  }

  return `Installed ${target}\n`
}

export const setup = (r: Runtime, remove = false): Reply => {
  const agents = remove ? ['claude', 'codex'] : [
    ...(available(r, 'claude') || existsSync(join(r.home, '.claude')) ? ['claude'] : []),
    ...(available(r, 'codex') ? ['codex'] : []),
  ]
  const lines: string[] = []
  let code = 0
  for (const agent of agents) {
    try {
      lines.push(installSkill(r, agent, remove))
    } catch (error) {
      lines.push(`${(error as Error).message}\n`)
      code = 1
    }
  }

  return { code, out: lines.join('') || 'No supported harness found; nothing installed.\n' }
}
