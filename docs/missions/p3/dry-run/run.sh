#!/usr/bin/env bash
# The p3 dry run: troupe's role windows end to end, on a scratch repository
# holding the two-order sample mission and a scratch tmux server of its own.
# An "orchestrator" claude runs the mod (claude --plugin-dir) and is asked,
# in plain sentences, to call its tools; the role windows run claude on the
# login of whoever runs this, with the briefs the mod writes. Every window
# and the server are closed at the end. Nothing here touches the checkout
# under test or any other tmux server.
#
#   docs/missions/p3/dry-run/run.sh <troupe checkout> [scratch folder]
#
# The scratch folder (default ~/scratch/troupe/p3-o1) is wiped and holds
# repo/ (the sample mission on feature/NO-JIRA-sample), its worktrees and
# tmux.sock. claude asks once whether to trust a new repo/ folder: answer it
# by hand (or reuse a folder already trusted), then run this again.
# The transcript is written to output.txt beside this script.
set -euo pipefail

MOD=$(cd "${1:?usage: run.sh <troupe checkout> [scratch folder]}" && pwd)
W=${2:-$HOME/scratch/troupe/p3-o1}
REPO=$W/repo
SOCK=$W/tmux.sock
OUT=$(cd "$(dirname "$0")" && pwd)/output.txt
T=(tmux -S "$SOCK")
M=sample
D=docs/missions/$M
failures=0

say() { printf '%s\n' "$*" | tee -a "$OUT"; }
check() { # check <what> <command...>: PASS or FAIL, counted
  if "${@:2}" >/dev/null 2>&1; then say "PASS  $1"; else say "FAIL  $1"; failures=$((failures + 1)); fi
}
screen() { "${T[@]}" capture-pane -p -J -t "$1" -S -3000 2>/dev/null | grep -v '^$' || true; }
turns() { screen orch:orch | grep -c '· done [0-9]' || true; }
# Types one prompt into the orchestrator and waits (at most 180 s) for its turn to end.
ask() {
  local before; before=$(turns)
  say ""
  say "> $1"
  "${T[@]}" send-keys -t orch:orch -l "$1"
  sleep 0.5
  "${T[@]}" send-keys -t orch:orch Enter
  for _ in $(seq 360); do [ "$(turns)" -gt "$before" ] && break; sleep 0.5; done
  # This turn alone: from the last line that holds the prompt on, the pane's box left out.
  screen orch:orch | awk -v p="${1:0:100}" 'index($0, p) { turn = ""; found = 1 } found { turn = turn $0 "\n" } END { printf "%s", turn }' |
    grep -v '^│\|^╭\|^╰\|^─' > "$W/turn.txt" || true
  tee -a "$OUT" < "$W/turn.txt" >/dev/null
}
answered() { grep -qF -- "$1" "$W/turn.txt"; }
# Waits (at most 90 s) until role window $1 shows claude acting on the pasted prompt.
landed() {
  for _ in $(seq 180); do
    screen "troupe-$M:$1" | awk '/^❯ Read the brief in/ { found = 1; next } found && /^● /' | grep -q . && return 0
    sleep 0.5
  done
  return 1
}
keep_screen() { say "--- role window $1:"; screen "troupe-$M:$1" | head -24 | tee -a "$OUT" >/dev/null; }

: > "$OUT"
say "troupe p3 dry run, $(date -u +%FT%TZ), $(claude --version), $(tmux -V)"
say "mod under test: $MOD at $(git -C "$MOD" rev-parse --short HEAD)"

# ---- the scratch repository: the sample mission on its mission branch ----
"${T[@]}" kill-server 2>/dev/null || true
rm -f "$SOCK"
for wt in "$REPO"-"$M"-*; do [ -d "$wt" ] && rm -rf "$wt"; done
rm -rf "$REPO"
mkdir -p "$REPO/$D"
cp "$MOD/docs/missions/workflow/sample/plan.md" "$REPO/$D/plan.md"
git -C "$REPO" init -q -b main
git -C "$REPO" -c user.email=dry@run -c user.name=dry-run add -A
git -C "$REPO" -c user.email=dry@run -c user.name=dry-run commit -qm "Add the sample mission"
git -C "$REPO" switch -q -c "feature/NO-JIRA-$M"

# ---- the orchestrator: claude with the mod, in a scratch tmux server ----
(cd "$REPO" && env -u TMUX -u TMUX_PANE "${T[@]}" new-session -d -s orch -n orch -x 200 -y 50 -c "$REPO" "claude --plugin-dir $MOD --model haiku")
for _ in $(seq 120); do screen orch:orch | grep -q '^❯' && break; sleep 0.5; done
if screen orch:orch | grep -q 'trust this folder'; then
  say "STOP  claude asks whether to trust $REPO: answer it (tmux -S $SOCK attach), then run this again"
  exit 2
fi

# ---- 1. no approval record: refused ----
ask "Call the mcp__troupe__troupe_dispatch tool once with mission \"$M\" and order \"o1\". Report its answer verbatim and do nothing else."
check "o1 before approval: refused (the mod is loaded and answers)" answered 'the plan is not approved: no APPROVAL.json'

# ---- 2. approved (by hand: the stand-in for /troupe's dialog), o1 dispatched ----
printf '{\n  "planHash": "sha256:%s",\n  "approvedAt": "%s"\n}\n' "$(sha256sum "$REPO/$D/plan.md" | cut -d' ' -f1)" "$(date -u +%FT%T.000Z)" > "$REPO/$D/APPROVAL.json"
ask "Call mcp__troupe__troupe_dispatch once with mission \"$M\" and order \"o1\". Report its answer verbatim and do nothing else."
check "o1 dispatched: the role session and window opened" answered "Dispatched o1 (opus) to o1 in troupe-$M"
check "the session troupe-$M is a session of its own" "${T[@]}" has-session -t "=troupe-$M"
check "o1's brief landed: claude acts on it" landed o1
keep_screen o1
pid=$("${T[@]}" display -p -t "troupe-$M:o1" '#{pane_pid}')
say "--- environment names in o1's claude (OPENRIG*, CLAUDE_CODE_SESSION*, TMUX): $(tr '\0' '\n' < "/proc/$pid/environ" | cut -d= -f1 | grep -E '^(OPENRIG|CLAUDE_CODE_SESSION|TMUX)' | tr '\n' ' ')"

# ---- 3. o2 depends on o1: refused ----
ask "Call mcp__troupe__troupe_dispatch once with mission \"$M\" and order \"o2\". Report its answer verbatim and do nothing else."
check "o2 while o1 is not done: refused" answered 'o2 depends on o1, not done yet'

# ---- 4. o1's done marker, written in its worktree as the brief says, comes into the mission folder ----
printf 'o1 (dry run): the builder would write what it built here.\n' > "$REPO-$M-o1/$D/DONE-o1.md"
for _ in $(seq 20); do [ -f "$REPO/$D/DONE-o1.md" ] && break; sleep 0.5; done
check "DONE-o1.md copied from o1's worktree into the mission folder" test -f "$REPO/$D/DONE-o1.md"

# ---- 5. the reviewer of o1, the same way ----
ask "Call mcp__troupe__troupe_dispatch once with mission \"$M\", order \"o1\" and role \"reviewer\". Report its answer verbatim and do nothing else."
check "the review of o1 dispatched, detached at its branch" answered "Dispatched the review of o1 (sonnet) to review-o1 in troupe-$M"
check "the reviewer's brief landed" landed review-o1
keep_screen review-o1

# ---- 6. o1 marked done (merged onto the mission branch), o2 allowed ----
ask "Call mcp__troupe__troupe_close once with mission \"$M\" and window \"o1\", then once with mission \"$M\" and window \"review-o1\". Report both answers verbatim and do nothing else."
check "troupe_close o1 closed its window" answered "Closed o1 ("
git -C "$REPO" -c user.email=dry@run -c user.name=dry-run commit -q --allow-empty -m "o1: the dry run's stand-in for o1's merge"
ask "Call mcp__troupe__troupe_dispatch once with mission \"$M\" and order \"o2\". Report its answer verbatim and do nothing else."
check "o2 once o1 is merged: dispatched" answered "Dispatched o2 (sonnet) to o2 in troupe-$M"
check "o2's brief landed" landed o2

# ---- 7. status, then close the role session ----
ask "Call mcp__troupe__troupe_status once, then mcp__troupe__troupe_close once with mission \"$M\" and no window. Report both answers verbatim and do nothing else."
check "troupe_status lists o2 running" answered 'o2: order o2, builder, running'
check "troupe_close closed the role session" answered "Closed the role session troupe-$M"
check "the role session is gone" bash -c "! ${T[*]} has-session -t =troupe-$M"

# ---- the end: the scratch server and its worktrees go ----
"${T[@]}" kill-server
rm -f "$SOCK"
check "the scratch tmux server is gone" bash -c "! ${T[*]} ls"
for wt in "$REPO"-"$M"-*; do git -C "$REPO" worktree remove --force "$wt"; done
say "worktrees left: $(git -C "$REPO" worktree list | wc -l) (the repository itself)"
say ""
say "$([ "$failures" -eq 0 ] && echo "dry run: all checks passed" || echo "dry run: $failures check(s) failed")"
exit $((failures > 0))
