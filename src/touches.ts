/** A touches entry as the literal path it covers, and whether it covers a whole directory. */
const scope = (path: string): [string, boolean] => {
  const clean = path.trim().replace(/^[./]+/, '')
  const glob = /[*?[]/.exec(clean)
  if (glob === null) return [clean, clean.endsWith('/')]
  const literal = clean.slice(0, glob.index)

  return [literal.includes('/') ? `${literal.slice(0, literal.lastIndexOf('/'))}/` : '', true]
}

/** Whether two touches entries can name the same file. */
export const overlaps = (a: string, b: string): boolean => {
  const [pa, da] = scope(a)
  const [pb, db] = scope(b)

  return pa === pb || (da && pb.startsWith(pa)) || (db && pa.startsWith(pb))
}
