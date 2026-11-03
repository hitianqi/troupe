# Contributing

Thanks for helping. Issues and pull requests are both welcome.

## Before you start

- For a bug, open an issue with what you ran, what you expected and what
  happened. `troupe status --json` and the panel's `4 LOG` tab usually say a
  lot; paste what is relevant.
- For a larger change (a new command, a new built-in agent, a change to the
  plan format), open an issue first so we can agree on the shape.
- Read [ROADMAP.md](ROADMAP.md): the rule there decides what goes in code and
  what goes in the workflow skill.

## Working on troupe

```sh
npm ci
npm run build && npm link   # your build of `troupe` on the PATH
./check.sh                  # type-check, build and run every test
```

The real-tmux tests need tmux; they are skipped without it. CI runs everything
on macOS and Linux with Node 20 and 22, without a UTF-8 locale.

- Keep a pull request to one change, with a test where the logic has a clear
  assertion. The panel's drawing is covered by plain-text goldens in `tests/`.
- Match the code around you; `src/` is small, plain TypeScript with no
  runtime dependencies.
- Do not weaken a test to make it pass. If a test is wrong, say why in the PR.

## Adding an agent

Any terminal agent can be a role through an adapter file (see "Agents" in the
README). A built-in adapter in `src/agents.ts` needs its screen patterns
taken from the agent's real screens, with captures in `tests/fixtures/agents/`.
