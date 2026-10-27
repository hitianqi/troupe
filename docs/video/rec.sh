#!/usr/bin/env bash
# Record a tmux session as a cast with a hidden recorder (156×45 unless COLS/ROWS say otherwise).
#   rec.sh start <session> <cast>    attach a recorder to <session>
#   rec.sh stop <session>            detach it, which ends the cast
set -euo pipefail
verb=$1 session=$2
sock="rec-$session"
cols=${COLS:-156} rows=${ROWS:-45}
case $verb in
  start)
    tmux -L "$sock" kill-server 2>/dev/null || true
    tmux -L "$sock" new-session -d -s rec -x $cols -y $rows "env -u TMUX asciinema rec -q --cols $cols --rows $rows '$3' -c 'tmux attach -t $session'"
    tmux -L "$sock" set -t rec status off >/dev/null
    ;;
  stop)
    for c in $(tmux list-clients -t "$session" -F '#{client_name}'); do
      pid=$(tmux display -p -c "$c" '#{client_pid}')
      if ps -o args= -p "$(ps -o ppid= -p "$pid")" | grep -q asciinema; then tmux detach-client -t "$c"; fi
    done
    sleep 1
    tmux -L "$sock" kill-server 2>/dev/null || true
    ;;
esac
