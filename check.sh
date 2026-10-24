#!/usr/bin/env bash
# The one check: validate the mod, run its tests and troupe-panel's, type-check it.
set -euo pipefail
cd "$(dirname "$0")"

claude --version
claude plugin validate .
claude plugin test .
# The CLI package: build it, then its tests (CI runs the same as npm test).
npm run build
node --test tests/cli.node.mjs tests/plan.node.mjs tests/state.node.mjs tests/draw.node.mjs
# troupe-panel under plain Node (22.18 or later), against the Phase 1 goldens.
node --test tests/panel.node.mjs
# The workflow walkthrough: the sample mission read by the pane's own reader
# (docs/missions/workflow/RECORD.md); register.mjs stands in for the engine.
node --import ./docs/missions/workflow/register.mjs --no-warnings docs/missions/workflow/check-sample.mjs

# The engine lays the API types in .claude-plugin/types/ when it loads the
# mod from this folder (claude --plugin-dir, or the session's mods folder).
if [ ! -f .claude-plugin/types/claude-code/index.d.ts ]; then
  echo "tsc skipped: no types laid in .claude-plugin/types/ (load the mod once with claude --plugin-dir . to lay them)"
  exit 0
fi
if [ ! -x node_modules/.bin/tsc ]; then
  echo "tsc missing: run npm install" >&2
  exit 1
fi
node_modules/.bin/tsc -p .
echo "tsc: clean"
