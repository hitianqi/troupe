// A resolve hook so plain node can load the hooks as they are.
// - The hooks import each other without extensions ('./yaml'): retry with
//   .ts, .tsx and /index.ts.
// - read-state.ts imports `atom, read, update` from 'claude-code', which only
//   the engine provides. A stub answers it. It stands in only for engine
//   calls that stateOf does not make: stateOf is a pure function of its
//   arguments, and the stub's functions are never called by the check.
const STUB =
  'data:text/javascript,export const atom=()=>({});export const read=async()=>null;export const update=async()=>{}'

export async function resolve(specifier, context, next) {
  if (specifier === 'claude-code') return { url: STUB, shortCircuit: true }
  try {
    return await next(specifier, context)
  } catch (error) {
    if (!specifier.startsWith('.') || /\.[a-z]+$/.test(specifier)) throw error
    for (const tail of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(specifier + tail, context)
      } catch {
        // try the next spelling
      }
    }
    throw error
  }
}
