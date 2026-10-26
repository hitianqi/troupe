#!/usr/bin/env python3
"""The 'real windows' beat of the troupe demo: two shots from take A, framed
in a Mac window on a dark stage, with a Mac pointer placed from the action log
and one English caption per shot. Renders frames with Pillow into ffmpeg.

    python3 film.py out.mp4 [--only SHOT] [--frames 1.0,2.5]   (stills for checking)
"""
import math
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
W, H, FPS = 1920, 1080, 30

# The agg render: 156×45 cells at font 28.
CW, CH, PX, PY = 16.81, 39.31, 16, 17
SRC_W, SRC_H = 2654, 1803
TITLE = 64          # title bar height, in source pixels
M = 120             # margin around the window for its shadow
WIN_W, WIN_H = SRC_W + 2 * M, SRC_H + TITLE + 2 * M
RADIUS = 26

FONT = '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'
FONT_UI = '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'


def cell(col, row):
    """A terminal cell's centre in window-image pixels."""
    return M + PX + (col + 0.5) * CW, M + TITLE + PY + (row + 0.5) * CH


# ---- the timeline -----------------------------------------------------------------
# The cast runs about 1.0 s behind the action log (its header keeps whole seconds).
# map: output seconds -> source seconds, piecewise linear [(o0, o1, s0, s1)].
# camera: [(t, x, y, scale)], x/y a window-image point put at the stage centre.
# pointer: [(t, x, y)] positions; clicks: [t]; pointer_alpha: [(t, a)].
FIT = 0.505
WHOLE = (WIN_W / 2, WIN_H / 2)


def framed(col, row, scale, left):
    """Camera with cell column `col`'s left edge at stage x `left` and row `row` at mid height."""
    x = M + PX + col * CW
    return x + (W / 2 - left) / scale, cell(0, row)[1], scale


PANEL = framed(66, 22, 0.6, 800)        # the panel on the right two thirds; the caption on the left
PANEL_MID = framed(66, 22, 0.6, 506)    # the panel centred
LIVE = framed(93, 36.5, 1.05, 760)      # the selected role's live window

SHOTS = [
    dict(
        name='roles', src='roles', length=6.0,
        map=[(0.0, 0.9, 1.4, 2.3), (0.9, 1.5, 2.3, 2.9), (1.5, 1.9, 3.9, 4.3), (1.9, 4.9, 4.3, 10.3), (4.9, 6.0, 10.3, 11.4)],
        camera=[(0.0, *PANEL_MID), (0.95, *PANEL_MID), (1.6, *WHOLE, FIT), (2.6, *cell(78, 36), 0.72), (6.0, *cell(78, 36), 0.74)],
        pointer=[(0.0, *cell(118, 30)), (0.75, *cell(101, 42)), (1.2, *cell(101, 42)), (1.9, *cell(118, 40))],
        clicks=[0.9],
        pointer_alpha=[(0.0, 1), (1.9, 1), (2.3, 0)],
        shade=[(0.0, 1.0), (0.9, 1.0), (1.3, 0.0)],
        caption=('Every role in a real window. Talk to any of them.', 1.2, 5.7, 'bottom'),
    ),
    dict(
        name='cards', src='cards', length=9.0,
        map=[(0.0, 1.0, 0.3, 1.3), (1.0, 2.2, 1.3, 2.5), (2.2, 2.4, 3.2, 3.4), (2.4, 3.6, 3.4, 4.6), (3.6, 3.8, 5.2, 5.4), (3.8, 9.0, 5.4, 10.6)],
        camera=[(0.0, *PANEL_MID), (0.8, *PANEL), (4.1, *PANEL), (5.3, *LIVE), (9.0, *LIVE[:2], 1.08)],
        shade=[(0.0, 1.0), (9.0, 1.0)],
        pointer=[(0.0, *cell(110, 38)), (0.85, *cell(105, 11)), (1.4, *cell(105, 11)), (2.25, *cell(105, 18)), (2.7, *cell(105, 18)), (3.65, *cell(137, 15)), (4.1, *cell(140, 22))],
        clicks=[1.0, 2.4, 3.8],
        pointer_alpha=[(0.0, 1), (4.1, 1), (4.5, 0)],
        caption=('Click a role. Watch it work, live.', 0.3, 8.6, 'left'),
    ),
]
DISSOLVE = 0.3


# ---- helpers ----------------------------------------------------------------------
def smooth(p):
    p = max(0.0, min(1.0, p))
    return p * p * (3 - 2 * p)


def keyed(keys, t):
    """Smoothstep between keyframes [(t, *values)]."""
    if t <= keys[0][0]:
        return keys[0][1:]
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            e = smooth((t - a[0]) / (b[0] - a[0]))
            return tuple(x + (y - x) * e for x, y in zip(a[1:], b[1:]))
    return keys[-1][1:]


def source_time(shot, t):
    for o0, o1, s0, s1 in shot['map']:
        if t <= o1:
            return s0 + (s1 - s0) * max(0.0, (t - o0) / (o1 - o0))
    return shot['map'][-1][3]


@lru_cache(maxsize=8)
def frame(src, index):
    files = sorted((HERE / 'src' / src).glob('*.jpg'))
    return Image.open(files[max(0, min(index, len(files) - 1))]).convert('RGB')


@lru_cache(maxsize=1)
def chrome():
    """The window's shadow and title bar, drawn once; the terminal goes in the hole."""
    win = Image.new('RGBA', (WIN_W, WIN_H), (0, 0, 0, 0))
    shadow = Image.new('L', (WIN_W, WIN_H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((M, M + 30, WIN_W - M, WIN_H - M + 30), RADIUS, fill=150)
    shadow = shadow.filter(ImageFilter.GaussianBlur(48))
    win.paste((0, 0, 0, 255), (0, 0), shadow)
    d = ImageDraw.Draw(win)
    d.rounded_rectangle((M, M, WIN_W - M, WIN_H - M), RADIUS, fill=(30, 29, 45, 255), outline=(70, 70, 92, 255), width=2)
    d.rectangle((M + 2, M + TITLE - 1, WIN_W - M - 2, M + TITLE), fill=(20, 20, 30, 255))
    for i, color in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        x, y = M + 34 + i * 36, M + TITLE / 2
        d.ellipse((x - 11, y - 11, x + 11, y + 11), fill=color + (255,))
    font = ImageFont.truetype(FONT_UI, 26)
    label = 'troupe — tmux'
    d.text((WIN_W / 2, M + TITLE / 2), label, font=font, fill=(150, 152, 170, 255), anchor='mm')
    mask = Image.new('L', (WIN_W, WIN_H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((M, M, WIN_W - M, WIN_H - M), RADIUS, fill=255)
    return win, mask


@lru_cache(maxsize=1)
def stage():
    """Near-black, a faint violet glow top left and teal bottom right."""
    bg = Image.new('RGB', (W, H), (8, 9, 11))
    glow = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse((-500, -600, 1000, 600), fill=(70, 40, 120))
    d.ellipse((1100, 500, 2500, 1700), fill=(20, 90, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    return Image.blend(bg, Image.eval(glow, lambda v: v), 0.55).convert('RGBA')


def window_at(src, t_src):
    win, mask = chrome()
    win = win.copy()
    term = frame(src, round(t_src * FPS))
    content = Image.new('RGBA', (WIN_W, WIN_H), (0, 0, 0, 0))
    content.paste(term, (M, M + TITLE))
    hole = Image.new('L', (WIN_W, WIN_H), 0)
    hole.paste(mask.crop((M, M + TITLE, M + SRC_W, M + TITLE + SRC_H)), (M, M + TITLE))
    win.paste(content, (0, 0), hole)
    return win


def pointer(scale):
    """A Mac arrow: white with a dark edge, its tip at (0, 0)."""
    h = 34 * scale
    pts = [(0, 0), (0, 0.84), (0.22, 0.66), (0.37, 0.99), (0.52, 0.93), (0.37, 0.61), (0.62, 0.61)]
    pad = int(h * 0.4)
    size = int(h * 1.1) + 2 * pad
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    poly = [(pad + x * h, pad + y * h) for x, y in pts]
    sh = Image.new('L', (size, size), 0)
    ImageDraw.Draw(sh).polygon([(x + 2, y + 3) for x, y in poly], fill=110)
    img.paste((0, 0, 0, 255), (0, 0), sh.filter(ImageFilter.GaussianBlur(3)))
    d = ImageDraw.Draw(img)
    d.polygon(poly, fill=(255, 255, 255, 255), outline=(10, 10, 10, 255), width=max(2, int(2.2 * scale)))
    return img, pad


def caption(img, text, alpha, where, shade=0.0):
    if max(alpha, shade) <= 0:
        return
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    words_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(words_layer)
    font = ImageFont.truetype(FONT, 54)
    a = int(255 * alpha)
    if shade > 0:
        band = Image.new('L', (900, 1), 0)
        for x in range(900):
            band.putpixel((x, 0), 252 if x < 700 else int(252 * (1 - smooth((x - 700) / 200))))
        band = band.resize((900, H))
        layer.paste(Image.new('RGBA', (900, H), (5, 6, 8, 255)), (0, 0), Image.eval(band, lambda v: int(v * shade)))
    if where == 'bottom':
        band = Image.new('L', (W, 260), 0)
        for y in range(260):
            band.putpixel((0, y), int(200 * (y / 260) ** 1.4))
        band = band.resize((W, 260))
        fill = Image.new('RGBA', (W, 260), (5, 6, 8, 255))
        layer.paste(fill, (0, H - 260), Image.eval(band, lambda v: int(v * alpha)))
        d.text((W / 2, H - 92), text, font=font, fill=(245, 246, 250, a), anchor='mm')
    else:
        words, lines, line = text.split(), [], ''
        for w in words:
            trial = f'{line} {w}'.strip()
            if d.textlength(trial, font=font) > 560 and line:
                lines.append(line)
                line = w
            else:
                line = trial
        lines.append(line)
        y = H / 2 - (len(lines) - 1) * 36
        for one in lines:
            d.text((110, y), one, font=font, fill=(245, 246, 250, a), anchor='lm')
            y += 72
    img.alpha_composite(layer)
    if alpha > 0:
        img.alpha_composite(words_layer)


def render_shot(shot, t):
    win = window_at(shot['src'], source_time(shot, t))
    x, y, s = keyed(shot['camera'], t)
    # The stage viewport in window pixels, cropped then scaled.
    vw, vh = W / s, H / s
    box = (x - vw / 2, y - vh / 2, x + vw / 2, y + vh / 2)
    view = win.crop(tuple(round(v) for v in box)).resize((W, H), Image.LANCZOS)
    img = stage().copy()
    img.alpha_composite(view)

    def to_stage(px, py):
        return (px - box[0]) * s, (py - box[1]) * s

    # Click ripples, in window space so they scale with the camera.
    for c in shot['clicks']:
        p = (t - c) / 0.45
        if 0 <= p <= 1:
            cx, cy = to_stage(*keyed(shot['pointer'], c)[:2])
            r = (14 + 46 * p) * s / 0.6
            layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(layer).ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 255, 255, int(200 * (1 - p))), width=max(2, int(4 * s / 0.6)))
            img.alpha_composite(layer)
    alpha = keyed(shot['pointer_alpha'], t)[0]
    if alpha > 0.01:
        press = min((abs(t - c) for c in shot['clicks']), default=9)
        squash = 0.86 if press < 0.08 else 1.0
        arrow, pad = pointer(max(0.9, s / 0.6) * squash)
        if alpha < 1:
            arrow.putalpha(Image.eval(arrow.getchannel('A'), lambda v: int(v * alpha)))
        px, py = to_stage(*keyed(shot['pointer'], t)[:2])
        img.alpha_composite(arrow, (int(px - pad), int(py - pad)))
    text, t_in, t_out, where = shot['caption']
    fade = min(smooth((t - t_in) / 0.35), smooth((t_out - t) / 0.35))
    shade = keyed(shot['shade'], t)[0] if 'shade' in shot else 0.0
    caption(img, text, fade, where, shade)
    return img


def render(t):
    """The whole beat at time t; shots back to back with a short dissolve."""
    start = 0.0
    for i, shot in enumerate(SHOTS):
        end = start + shot['length']
        if t < end or i == len(SHOTS) - 1:
            img = render_shot(shot, min(t - start, shot['length']))
            nxt = SHOTS[i + 1] if i + 1 < len(SHOTS) else None
            if nxt and t > end - DISSOLVE:
                img = Image.blend(img, render_shot(nxt, 0.0), smooth((t - (end - DISSOLVE)) / DISSOLVE))
            return img
        start = end
    raise AssertionError


def total():
    return sum(shot['length'] for shot in SHOTS)


def main():
    out = sys.argv[1]
    if '--frames' in sys.argv:
        for one in sys.argv[sys.argv.index('--frames') + 1].split(','):
            render(float(one)).convert('RGB').save(f'{out}-{one}.png')
        return
    n = round(total() * FPS)
    ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', 'faststart', out], stdin=subprocess.PIPE)
    for i in range(n):
        ff.stdin.write(render(i / FPS).convert('RGB').tobytes())
        if i % 60 == 0:
            print(f'{i}/{n}', file=sys.stderr)
    ff.stdin.close()
    ff.wait()


if __name__ == '__main__':
    main()
