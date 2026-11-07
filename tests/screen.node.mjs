// The live panel's cell diff (dist/screen.js) and the tokens/s it keeps in memory (dist/motion.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sample } from '../dist/motion.js'
import { diff, full, RGB, Screen } from '../dist/screen.js'

const screen = (...lines) => Screen.of(lines.map(text => [{ text }]), 8, lines.length)

test('a diff writes only the cells that changed, and nothing when none did', () => {
  const before = screen('abc', 'xyz')
  assert.equal(diff(before, screen('abc', 'xyz')), '')
  assert.equal(diff(before, screen('abd', 'xyz')), '\x1b[1;3Hd')
  // Two changes in one row with a gap move the cursor twice; a colour change rewrites the same character.
  assert.equal(diff(before, screen('Xbc', 'xyQ')), '\x1b[1;1HX\x1b[2;3HQ')
  const tinted = before.clone()
  tinted.cells[0][1] = { ch: 'b', fg: RGB.ok, bg: RGB.warn }
  assert.equal(diff(before, tinted), `\x1b[1;2H\x1b[0;38;2;${RGB.ok.join(';')};48;2;${RGB.warn.join(';')}mb\x1b[0m`)
})

test('a wide character is written from its left half, and replacing either half rewrites both', () => {
  const wide = screen('a中b')
  assert.equal(wide.cells[0][2].ch, '')
  assert.equal(diff(screen('axyb'), wide), '\x1b[1;2H中')
  assert.equal(diff(wide, screen('a中c')), '\x1b[1;4Hc')
  // A narrow character over the right half clears the wide one, so its left half is rewritten too.
  assert.equal(diff(wide, screen('a?zb')), '\x1b[1;2H?z')
})

test('a full screen clears each row and stops at its last shown cell', () => {
  const out = full(screen('ab', ''))
  assert.ok(out.startsWith('\x1b[?25l\x1b[?7l\x1b[H\x1b[2J'))
  assert.ok(out.endsWith('\x1b[1;1H\x1b[2Kab\x1b[2;1H\x1b[2K'))
  assert.ok(!out.includes('\n'))
})

test('tokens/s comes from the output count between reads, at least a second apart', () => {
  let rates = sample(undefined, 1000, 0)
  assert.deepEqual(rates.rates, [])
  rates = sample(rates, 1400, 2000)
  assert.deepEqual(rates.rates, [200])
  assert.equal(sample(rates, 1500, 2500), rates, 'too close for a rate')
  rates = sample(rates, 1400, 4000)
  assert.deepEqual(rates.rates, [200, 0])
  // A new session starts its count again; the history stays and the next rate is from the new count.
  rates = sample(rates, 50, 6000)
  assert.deepEqual([rates.output, rates.rates], [50, [200, 0]])
  assert.deepEqual(sample(rates, 250, 8000).rates, [200, 0, 100])
  for (let at = 10000; at < 200000; at += 2000) rates = sample(rates, rates.output + 10, at)
  assert.equal(rates.rates.length, 64)
})

test("the terminal's colour answers are read, never typed as keys, and may arrive split", async () => {
  const { parseInput } = await import('../dist/panel-input.js')
  assert.deepEqual(parseInput('\x1b]11;rgb:ffff/8080/0000\x1b\\\x1b]10;rgb:00/00/00\x07q').actions, [
    { kind: 'colour', which: 'background', rgb: [255, 128, 0] }, { kind: 'colour', which: 'text', rgb: [0, 0, 0] }, { kind: 'key', key: 'q' },
  ])
  const half = parseInput('\x1b]11;rgb:1515/1818')
  assert.deepEqual(half.actions, [])
  assert.deepEqual(parseInput(`${half.rest}/2121\x1b\\`).actions, [{ kind: 'colour', which: 'background', rgb: [21, 24, 33] }])
  assert.deepEqual(parseInput('\x1b]4;1;rgb:ff/00/00\x071').actions, [{ kind: 'key', key: '1' }])
})
