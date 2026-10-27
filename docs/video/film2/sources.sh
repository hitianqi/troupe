#!/usr/bin/env bash
# Render each source segment once: cut the cast, agg at font 28, 30 fps JPEG frames.
set -euo pipefail
cd "$(dirname "$0")/src"
CUT=/home/tizh/repos/projects/troupe-video-plan/docs/video/cut.py
T=/home/tizh/repos/projects/troupe-video-takes
TH=1e1e2e,cdd6f4,45475a,f38ba8,a6e3a1,f9e2af,89b4fa,f5c2e7,94e2d5,bac2de,585b70,f38ba8,a6e3a1,f9e2af,89b4fa,f5c2e7,94e2d5,a6adc8
one() {  # name cast start end
  [ -d "$1" ] && [ -n "$(ls "$1")" ] && return
  python3 $CUT "$2" "$3" "$4" "$1.cast"
  agg --font-family "JetBrainsMono Nerd Font,DejaVu Sans Mono" --font-size 28 --fps-cap 30 --theme $TH "$1.cast" "$1.gif" >/dev/null 2>&1
  mkdir -p "$1"; ffmpeg -loglevel error -y -i "$1.gif" -vf fps=30 -q:v 2 "$1/%05d.jpg"; rm -f "$1.gif"
  echo "$1 $(ls "$1" | wc -l)"
}
one open  $T/take-a.cast 11 24
one plan  $T/take-a.cast 58 118
one waits $T/take-a.cast 176 186
one tour  $T/take-a.cast 1372 1396
one land1 $T/take-a.cast 1402 1428
one land2 $T/take-a.cast 1512 1532
one take_b $T/take-b.cast 0 9
one take_c $T/take-c.cast 0 12
one take_d $T/take-d.cast 0 12
one take_f $T/take-f.cast 1 8
one take_g $T/take-g.cast 1 8
ln -sfn ../../film/src/roles roles; ln -sfn ../../film/src/cards cards
echo done
