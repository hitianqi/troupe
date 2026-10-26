#!/usr/bin/env python3
"""Contact sheet of a source: sheet.py name start end step [out]"""
import sys, glob
from PIL import Image, ImageDraw
name, a, b, step = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
out = sys.argv[5] if len(sys.argv) > 5 else f'/home/tizh/repos/projects/troupe-video-takes/film2/check/sheet-{name}.jpg'
fs = sorted(glob.glob(f'/home/tizh/repos/projects/troupe-video-takes/film2/src/{name}/*.jpg'))
ts = []; t = a
while t <= b + 1e-6: ts.append(t); t += step
cols = 4; w, h = 640, 435
sheet = Image.new('RGB', (cols * w, ((len(ts) + cols - 1) // cols) * (h + 24)), (255, 255, 255))
for i, t in enumerate(ts):
    im = Image.open(fs[min(len(fs) - 1, round(t * 30))]).resize((w, h))
    x, y = (i % cols) * w, (i // cols) * (h + 24)
    sheet.paste(im, (x, y)); ImageDraw.Draw(sheet).text((x + 6, y + h + 4), f'{t:.2f}s', fill=(0, 0, 0))
import os; os.makedirs(os.path.dirname(out), exist_ok=True); sheet.save(out, quality=85); print(out)
