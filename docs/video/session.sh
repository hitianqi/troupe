#!/usr/bin/env bash
# The recording session: a 156×45 window with no status line, the orchestrator
# in it. Run by the person, since it starts Claude Code skipping permissions.
set -euo pipefail
tmux new-session -d -s demo -x 156 -y 45 -c "$HOME/repos/projects/troupe-demo" 'claude --dangerously-skip-permissions'
tmux set -t demo status off
tmux set -t demo mouse on
tmux set -w -t demo window-size manual
tmux resize-window -t demo -x 156 -y 45
