#!/usr/bin/env python3
"""Cut a cast to [start, end] seconds: everything before start is replayed at 0 so the screen is whole."""
import json, sys

src, start, end, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
with open(src) as f:
    header = json.loads(f.readline())
    before, kept = [], []
    for line in f:
        t, kind, data = json.loads(line)
        if kind != 'o' or t > end:
            continue
        (before if t < start else kept).append((t, data))
with open(out, 'w') as f:
    f.write(json.dumps(header) + '\n')
    f.write(json.dumps([0.0, 'o', ''.join(d for _, d in before)]) + '\n')
    for t, data in kept:
        f.write(json.dumps([round(t - start, 6), 'o', data]) + '\n')
