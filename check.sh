#!/usr/bin/env bash
# The one check: type-check src/, then build and run every test (CI runs npm test).
# npm test includes the transcript fixtures in tests/usage.node.mjs.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x node_modules/.bin/tsc ]; then
  echo "tsc missing: run npm ci" >&2
  exit 1
fi
node_modules/.bin/tsc -p tsconfig.json --noEmit
echo "tsc: clean"
npm test
