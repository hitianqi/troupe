// Check 3 evidence (o1): a Node resolve hook so the hooks' extensionless
// relative imports ('./plan') find their .ts files, with no change to hooks/.
export async function resolve(specifier, context, nextResolve) {
  if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    for (const ext of ['.ts', '/index.d.ts']) {
      try {
        return await nextResolve(specifier + ext, context)
      } catch {}
    }
  }

  return nextResolve(specifier, context)
}
