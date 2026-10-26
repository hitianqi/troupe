import { StringDecoder } from 'node:string_decoder'

import { fit, paint, textOf } from './canvas.ts'
import type { Line } from './canvas.ts'
import type { Reply, Runtime } from './command-context.ts'
import { draw } from './draw.ts'
import type { Drawn } from './draw.ts'
import { deliverNotices } from './notices.ts'
import { flushAnswers } from './orchestrator.ts'
import { panelEffect } from './panel-actions.ts'
import { initialUi, parseInput, transition } from './panel-input.ts'
import type { Input, PanelUi } from './panel-input.ts'
import { readPanel } from './panel-model.ts'
import type { Reading } from './panel-model.ts'

export type PanelOptions = { mission: string; once?: boolean; plain?: boolean; width?: number; height?: number }
export type Terminal = {
  input: Pick<NodeJS.ReadStream, 'on' | 'off' | 'resume' | 'pause' | 'readableFlowing' | 'setRawMode' | 'isRaw'>
  output: Pick<NodeJS.WriteStream, 'on' | 'off' | 'columns' | 'rows'>
}
export const ENTER_PANEL = '\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[?1000h\x1b[?1006h\x1b[?2004h'
export const LEAVE_PANEL = '\x1b[?2004l\x1b[?1006l\x1b[?1000l\x1b[0m\x1b[?7h\x1b[?25h\x1b[?1049l'

const usable = (width: number, height: number) => width >= 40 && height >= 10
export const frameOf = (reading: Reading, ui: PanelUi, width: number, height: number): Drawn => {
  if ('missing' in reading || !usable(width, height)) return {
    lines: [[{ text: fit('missing' in reading ? reading.missing : 'Panel needs 40 columns and 10 rows.', width).trimEnd() }]], hits: [], maxScroll: 0,
  }

  return draw(reading.model, ui, width, height)
}

const lineOf = (line: Line, plain: boolean): string => {
  const safe = line.map(run => ({ ...run, text: run.text.replace(/[\x00-\x1f\x7f-\x9f]/g, '') }))

  return plain ? textOf(safe).trimEnd() : paint(safe)
}

/** Every row is addressed and cleared before writing; no newline can scroll it. */
export const terminalFrame = (drawn: Drawn, plain = false): string => '\x1b[?25l\x1b[?7l\x1b[H\x1b[2J' + drawn.lines.map((line, index) => `\x1b[${index + 1};1H\x1b[2K${lineOf(line, plain)}`).join('')

export const panel = async (r: Runtime, options: PanelOptions, terminal: Terminal = { input: process.stdin, output: process.stdout }): Promise<Reply> => {
  const { input, output } = terminal
  const dimensions = () => ({ width: options.width ?? output.columns ?? 96, height: options.height ?? output.rows ?? 40 })
  let reading = readPanel(r, options.mission)
  let missionName = 'mission' in reading ? reading.mission.name : undefined
  let ui = initialUi()
  const normalize = () => {
    if ('model' in reading && !reading.model.roles.some(role => role.name === ui.selected)) ui = { ...ui, selected: reading.model.roles[0]?.name ?? '' }
  }
  normalize()
  if (options.once || !r.inputTTY || !r.outputTTY) {
    const { width, height } = dimensions()
    const frame = frameOf(reading, ui, width, height)

    return { code: 0, out: frame.lines.map(line => lineOf(line, !!options.plain)).join('\n') + '\n' }
  }
  if (r.signal?.aborted) return { code: 0, out: '' }

  return new Promise(resolve => {
    const decoder = new StringDecoder('utf8')
    const wasRaw = !!input.isRaw
    const wasFlowing = input.readableFlowing === true
    let timer: ReturnType<typeof setInterval> | undefined
    let escape: ReturnType<typeof setTimeout> | undefined
    let pending = ''
    let finished = false
    let raw = false
    let entered = false
    let messageUntil = 0
    let frame: Drawn = { lines: [], hits: [], maxScroll: 0 }
    let queue = Promise.resolve()
    const finish = (code = 0, out = '') => {
      if (finished) return
      finished = true
      clearInterval(timer)
      clearTimeout(escape)
      input.off('data', onData).off('end', onEnd).off('close', onEnd).off('error', onError)
      output.off('resize', onResize).off('close', onEnd).off('error', onError)
      r.signal?.removeEventListener('abort', onEnd)
      try {
        if (raw) input.setRawMode(wasRaw)
        if (!wasFlowing) input.pause()
      } catch {
        // A closing terminal may no longer accept a raw-mode change.
      } finally {
        try { if (entered) r.write(LEAVE_PANEL) } catch { /* The pane may already be closed. */ }
        resolve({ code, out })
      }
    }
    const paintFrame = () => {
      if (finished) return
      if (ui.message && r.now() >= messageUntil) ui = { ...ui, message: undefined }
      const { width, height } = dimensions()
      frame = frameOf(reading, ui, width, height)
      ui = { ...ui, scroll: Math.max(0, Math.min(frame.maxScroll, ui.scroll ?? 0)) }
      r.write(terminalFrame(frame, !!options.plain))
    }
    const refresh = () => {
      reading = readPanel(r, options.mission)
      const nextMission = 'mission' in reading ? reading.mission.name : undefined
      if (missionName !== nextMission) {
        if (missionName !== undefined) {
          const typing = ui.input !== undefined
          ui = { ...ui, selected: '', scroll: 0, input: undefined, help: false, ...(typing ? { message: 'Mission changed; input cancelled.' } : {}) }
          if (typing) messageUntil = r.now() + 4000
        }
        missionName = nextMission
      }
      if ('mission' in reading) { flushAnswers(r, reading.mission); deliverNotices(r, reading.mission) }
      normalize()
      paintFrame()
    }
    const enqueue = (job: () => Promise<void> | void) => {
      queue = queue.then(async () => { if (!finished) await job() }).catch(error => finish(1, `${(error as Error).message}\n`))
    }
    const dispatchInput = (actions: Input[]) => {
      // Bind a packet's clicks and approvals to the frame the person saw.
      const shown = reading
      const shownFrame = frame
      const { width, height } = dimensions()
      enqueue(async () => {
        for (const action of actions) {
          if (finished) return
          if (!usable(width, height)) {
            if (action.kind === 'key' && (action.key === 'q' || action.key === 'quit')) { finish(); return }
            continue
          }
          const model = 'model' in shown ? shown.model : undefined
          const next = transition(ui, action, model, shownFrame.hits, height, shownFrame.maxScroll)
          if (next.ui.message !== ui.message && next.ui.message) messageUntil = r.now() + 4000
          ui = next.ui
          if (next.quit) { finish(); return }
          if (next.effect !== undefined && 'mission' in shown) {
            const message = await panelEffect(r, shown.mission.name, next.effect)
            if (finished) return
            ui = { ...ui, message: message.replace(/\s+/g, ' ').trim() }
            messageUntil = r.now() + 4000
            refresh()
          } else paintFrame()
        }
      })
    }
    const onData = (chunk: Buffer | string) => {
      clearTimeout(escape)
      const parsed = parseInput(pending + (typeof chunk === 'string' ? chunk : decoder.write(chunk)))
      pending = parsed.rest
      dispatchInput(parsed.actions)
      if (pending === '\x1b') escape = setTimeout(() => { pending = ''; dispatchInput([{ kind: 'key', key: 'escape' }]) }, 40)
    }
    const onResize = () => enqueue(paintFrame)
    const onEnd = () => finish()
    const onError = (error: Error) => finish(1, `${error.message}\n`)
    try {
      input.on('data', onData).on('end', onEnd).on('close', onEnd).on('error', onError)
      output.on('resize', onResize).on('close', onEnd).on('error', onError)
      r.signal?.addEventListener('abort', onEnd, { once: true })
      input.setRawMode(true)
      raw = true
      entered = true
      r.write(ENTER_PANEL)
      paintFrame()
      timer = setInterval(() => enqueue(refresh), 2000)
      input.resume()
    } catch (error) {
      finish(1, `${(error as Error).message}\n`)
    }
  })
}
