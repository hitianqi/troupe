import { spawnSync } from 'node:child_process'

export type Ran = { code: number; out: string; err: string }
export type RunOptions = { cwd?: string; input?: string; inherit?: boolean; env?: NodeJS.ProcessEnv }
export type Run = (command: string, args: string[], options?: RunOptions) => Ran

export const run: Run = (command, args, options = {}) => {
  const child = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  })

  return { code: child.status ?? 1, out: child.stdout ?? '', err: child.error?.message ?? child.stderr ?? '' }
}

/**
 * All CLI tmux calls, including live-state reads, go through this helper. `-u` keeps tmux from
 * replacing tabs and non-ASCII with `_` in format output when the caller's locale is not UTF-8.
 */
export const tmux = (args: string[], runner: Run = run, env = process.env, options: RunOptions = {}): Ran =>
  runner('tmux', ['-u', ...(env.TROUPE_TMUX_SOCKET ? ['-L', env.TROUPE_TMUX_SOCKET] : []), ...args], { ...options, env })

/** Each element stays one shell word, including quotes, newlines and dollars. */
export const shellOf = (argv: string[]): string => argv.map(arg => `'${arg.replaceAll("'", "'\\''")}'`).join(' ')
