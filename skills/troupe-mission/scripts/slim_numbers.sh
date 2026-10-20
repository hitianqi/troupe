#!/usr/bin/env bash
# The numbers the slim pass starts from (the plugin's templates/SLIM.md),
# short enough to paste into the slim subagent's prompt: the duplicate blocks
# the mission added (jscpd, compared with the mission base) and the files over
# 1,000 lines that the mission touched. Read-only: jscpd's report goes to a
# temp dir. Needs git, python3 and npx; without npx the duplicates are skipped.
#
#   slim_numbers.sh <project-repo> <base-ref>
set -euo pipefail

JSCPD=jscpd@5.3.3   # pinned; --baseline-from-ref is a v5 flag
LIMIT=1000
SHOW=20             # clones listed; the rest are counted
LOCKS='**/*.lock,**/*-lock.json,**/*-lock.yaml'   # generated; never a cut

[[ $# -eq 2 ]] || { echo "usage: $0 <project-repo> <base-ref>" >&2; exit 64; }
repo="$(cd "$1" && pwd)"
base="$2"
git -C "$repo" rev-parse --verify --quiet "$base^{commit}" >/dev/null \
  || { echo "error: $base is not a commit in $repo" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "New duplicate blocks (jscpd, against $base):"
if (cd "$tmp" && npx --yes "$JSCPD" --baseline-from-ref "$base" --ignore "$LOCKS" \
      --reporters json --output "$tmp" "$repo") >"$tmp/log" 2>&1 && [[ -f "$tmp/jscpd-report.json" ]]; then
  python3 - "$tmp/jscpd-report.json" "$SHOW" <<'PY'
import json, sys
clones = [c for c in json.load(open(sys.argv[1]))["duplicates"] if c.get("isNew")]
show = int(sys.argv[2])
clones.sort(key=lambda c: -c["lines"])
print(f"  {len(clones)} new, {sum(c['lines'] for c in clones)} lines")
for c in clones[:show]:
    a, b = c["firstFile"], c["secondFile"]
    print(f"  {c['lines']:>4}  {a['name']}:{a['start']}-{a['end']} = {b['name']}:{b['start']}-{b['end']}")
if len(clones) > show:
    print(f"  ... and {len(clones) - show} smaller ones")
PY
else
  echo "  jscpd could not run; no duplicate numbers this time:"
  tail -n 3 "$tmp/log" | sed 's/^/  /'
fi

echo "Files over $LIMIT lines that the mission touched:"
git -C "$repo" diff --name-only --diff-filter=d "$base" -- \
  | while IFS= read -r f; do
      case "$f" in *.lock|*-lock.json|*-lock.yaml) continue ;; esac
      p="$repo/$f"
      grep -Iq . "$p" 2>/dev/null || continue   # binary or empty
      n=$(wc -l <"$p")
      if (( n > LIMIT )); then printf '%6d  %s\n' "$n" "$f"; fi
    done | sort -rn | sed 's/^/  /' | grep . || echo "  none"
