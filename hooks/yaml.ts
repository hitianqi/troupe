// The YAML subset plan.md uses: block mappings and sequences, quoted and
// plain scalars, flow lists of scalars, comments. Anything else is refused
// with its line, never misread.

export type Yaml = string | null | Yaml[] | { [key: string]: Yaml }
type Line = { no: number; indent: number; text: string }

class YamlError extends Error {
  constructor(readonly line: number, message: string) {
    super(`line ${line}: ${message}`)
  }
}

/** The double-quoted escapes read; any other (`→`, `\x41`) is refused, not misread. */
const ESCAPES: Record<string, string | undefined> = { n: '\n', t: '\t', '\\': '\\', '"': '"', '/': '/' }

const isItem = (text: string) => text === '-' || text.startsWith('- ')

const stripComment = (raw: string): string => {
  let quote = ''
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i]
    if (quote !== '') {
      if (c === '\\' && quote === '"') i += 1
      else if (c === quote) quote = ''
    } else if ((c === '"' || c === "'") && /(^|[\s:[,-])$/.test(raw.slice(Math.max(0, i - 1), i))) {
      quote = c
    } else if (c === '#' && (i === 0 || /\s/.test(raw[i - 1] ?? ''))) {
      return raw.slice(0, i)
    }
  }

  return raw
}

const splitFlow = (inner: string, no: number): string[] => {
  const parts: string[] = []
  let quote = ''
  let start = 0
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i]
    if (quote !== '') {
      if (c === '\\' && quote === '"') i += 1
      else if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '[' || c === '{') throw new YamlError(no, 'nested flow collections are not supported')
    else if (c === ',') {
      parts.push(inner.slice(start, i))
      start = i + 1
    }
  }
  parts.push(inner.slice(start))

  return parts.map(part => part.trim()).filter((part, index, all) => part !== '' || index < all.length - 1)
}

const scalar = (text: string, no: number): Yaml => {
  const head = text[0]
  if (head === '"' || head === "'") {
    let out = ''
    for (let i = 1; i < text.length; i += 1) {
      const c = text[i]
      if (head === "'" && c === "'" && text[i + 1] === "'") {
        out += "'"
        i += 1
      } else if (c === head) {
        if (text.slice(i + 1).trim() !== '') throw new YamlError(no, 'text after a closing quote')

        return out
      } else if (head === '"' && c === '\\') {
        const next = text[i + 1] ?? ''
        const escaped = ESCAPES[next]
        if (escaped === undefined) throw new YamlError(no, `the escape "\\${next}" is not supported; write the character itself`)
        out += escaped
        i += 1
      } else out += c
    }
    throw new YamlError(no, 'a quoted value is not closed on its line')
  }
  if (head === '[') {
    if (!text.endsWith(']')) throw new YamlError(no, 'a flow list is not closed on its line')

    return splitFlow(text.slice(1, -1), no).map(part => {
      if (part === '') throw new YamlError(no, 'an empty entry in a flow list')

      return scalar(part, no)
    })
  }
  if (text === '{}') return {}
  if (head !== undefined && '{|>&*!%@`'.includes(head)) {
    throw new YamlError(no, `values starting with "${head}" are not supported; quote the value`)
  }
  if (/:(\s|$)/.test(text)) throw new YamlError(no, `a value holding ": " must be quoted`)

  return text === '~' || text === 'null' ? null : text
}

export const parseYaml = (source: string, firstLine = 1): Yaml => {
  const lines: Line[] = source.split('\n').flatMap((raw, index) => {
    const text = stripComment(raw).trimEnd()
    if (text.trim() === '') return []
    const lead = /^\s*/.exec(text)?.[0] ?? ''
    if (lead.includes('\t')) throw new YamlError(firstLine + index, 'a tab in the indentation')

    return [{ no: firstLine + index, indent: lead.length, text: text.trimStart() }]
  })
  let i = 0

  const block = (): Yaml => {
    const line = lines[i]

    return line !== undefined && isItem(line.text) ? seq(line.indent) : map(line?.indent ?? 0)
  }
  const nested = (indent: number, no: number): Yaml => {
    const next = lines[i]
    if (next === undefined || next.indent < indent || (next.indent === indent && !isItem(next.text))) return null
    if (next.indent === indent || next.indent > indent) return block()
    throw new YamlError(no, 'unexpected indentation')
  }
  const seq = (indent: number): Yaml[] => {
    const out: Yaml[] = []
    for (let line = lines[i]; line !== undefined && line.indent === indent && isItem(line.text); line = lines[i]) {
      const rest = line.text.slice(1).trimStart()
      if (rest === '') {
        i += 1
        out.push(lines[i] !== undefined && (lines[i]?.indent ?? 0) > indent ? block() : null)
      } else if (/^[^\s"'[{][^:]*:(\s|$)/.test(rest)) {
        lines[i] = { no: line.no, indent: indent + line.text.length - rest.length, text: rest }
        out.push(map(lines[i]?.indent ?? 0))
      } else {
        out.push(scalar(rest, line.no))
        i += 1
      }
    }
    if (lines[i] !== undefined && (lines[i]?.indent ?? 0) > indent) throw new YamlError(lines[i]?.no ?? 0, 'unexpected indentation')

    return out
  }
  const map = (indent: number): { [key: string]: Yaml } => {
    const out: { [key: string]: Yaml } = {}
    for (let line = lines[i]; line !== undefined && line.indent === indent && !isItem(line.text); line = lines[i]) {
      const match = /^([^\s"'[{][^:]*?):(?:\s+(.*))?$/.exec(line.text)
      if (match === null) throw new YamlError(line.no, 'expected "key: value"')
      const key = (match[1] ?? '').trim()
      if (key in out) throw new YamlError(line.no, `duplicate key "${key}"`)
      i += 1
      const rest = match[2]?.trim() ?? ''
      out[key] = rest === '' ? nested(indent, line.no) : scalar(rest, line.no)
    }
    if (lines[i] !== undefined && (lines[i]?.indent ?? 0) > indent) throw new YamlError(lines[i]?.no ?? 0, 'unexpected indentation')

    return out
  }

  const root = block()
  const left = lines[i]
  if (left !== undefined) throw new YamlError(left.no, 'unexpected indentation')

  return root
}
