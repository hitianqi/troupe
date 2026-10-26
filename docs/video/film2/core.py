"""The film's machinery: sources, the Mac window, a camera that can tilt the window
into 3D, the launch-film lens pass, and an overlay drawn after the lens (pointer,
captions, title cards) so it stays sharp.

Shots live in film.py; this file knows nothing about the story.
"""
import math
import sys
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
sys.path.insert(0, '/home/tizh/.claude/skills/tianqi-launch-film/scripts')
import lens  # noqa: E402  (process: tilt-shift DOF, bloom, vignette, grain)

W, H, FPS = 1920, 1080, 30

# An agg render at font 28 of a 156×45 terminal.
CW, CH, PX, PY = 16.81, 39.31, 16, 17
SRC_W, SRC_H = 2654, 1803
TITLE = 64
M = 120
WIN_W, WIN_H = SRC_W + 2 * M, SRC_H + TITLE + 2 * M
RADIUS = 26

FONT_HEAD = '/usr/share/fonts/opentype/inter/InterDisplay-Light.otf'
FONT_CAP = '/usr/share/fonts/opentype/inter/Inter-Medium.otf'
FONT_UI = '/usr/share/fonts/opentype/inter/Inter-Regular.otf'
FONT_MONO = '/home/tizh/.local/share/fonts/JetBrainsMonoNerdFont-Regular.ttf'


def cell(col, row):
    """A terminal cell's centre in window-image pixels."""
    return M + PX + (col + 0.5) * CW, M + TITLE + PY + (row + 0.5) * CH


def smooth(p):
    p = max(0.0, min(1.0, p))
    return p * p * (3 - 2 * p)


def glide(p):
    """Slow in, long glide, soft landing."""
    p = max(0.0, min(1.0, p))
    return (1 - (1 - p) ** 3) * 0.6 + smooth(p) * 0.4


def keyed(keys, t, ease=smooth):
    """Interpolate [(t, *values)] keyframes."""
    if t <= keys[0][0]:
        return keys[0][1:]
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            e = ease((t - a[0]) / (b[0] - a[0]))
            return tuple(x + (y - x) * e for x, y in zip(a[1:], b[1:]))
    return keys[-1][1:]


def remap(segments, t):
    """Output seconds -> source seconds, piecewise linear [(o0, o1, s0, s1)]."""
    for o0, o1, s0, s1 in segments:
        if t <= o1:
            return s0 + (s1 - s0) * max(0.0, (t - o0) / (o1 - o0))
    return segments[-1][3]


# ---- sources ----------------------------------------------------------------------
@lru_cache(maxsize=None)
def frame_list(name):
    return sorted((HERE / 'src' / name).glob('*.jpg'))


@lru_cache(maxsize=12)
def source(name, index):
    files = frame_list(name)
    return cv2.imread(str(files[max(0, min(index, len(files) - 1))]))


def at(name, t):
    return source(name, round(t * FPS))


# ---- the window -------------------------------------------------------------------
@lru_cache(maxsize=1)
def chrome_full():
    """RGBA chrome (shadow, frame, title bar) and the terminal's hole mask, uint8."""
    win = Image.new('RGBA', (WIN_W, WIN_H), (0, 0, 0, 0))
    shadow = Image.new('L', (WIN_W, WIN_H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((M, M + 34, WIN_W - M, WIN_H - M + 34), RADIUS, fill=165)
    win.paste((0, 0, 0, 255), (0, 0), shadow.filter(ImageFilter.GaussianBlur(52)))
    d = ImageDraw.Draw(win)
    d.rounded_rectangle((M, M, WIN_W - M, WIN_H - M), RADIUS, fill=(30, 29, 45, 255), outline=(74, 74, 98, 255), width=2)
    d.rectangle((M + 2, M + TITLE - 1, WIN_W - M - 2, M + TITLE), fill=(18, 18, 28, 255))
    for i, color in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        x, y = M + 36 + i * 38, M + TITLE / 2
        d.ellipse((x - 12, y - 12, x + 12, y + 12), fill=color + (255,))
    d.text((WIN_W / 2, M + TITLE / 2), 'troupe — tmux', font=ImageFont.truetype(FONT_UI, 27), fill=(150, 152, 172, 255), anchor='mm')
    hole = Image.new('L', (WIN_W, WIN_H), 0)
    ImageDraw.Draw(hole).rounded_rectangle((M, M, WIN_W - M, WIN_H - M), RADIUS, fill=255)
    ImageDraw.Draw(hole).rectangle((M, M, WIN_W - M, M + TITLE), fill=0)
    return np.asarray(win), np.asarray(hole)


@lru_cache(maxsize=8)
def chrome(q):
    """The chrome at scale q, as premultiplied float RGBA plus the hole mask."""
    win, hole = chrome_full()
    size = (round(WIN_W * q), round(WIN_H * q))
    if q < 1:
        win = cv2.resize(win, size, interpolation=cv2.INTER_AREA)
        hole = cv2.resize(hole, size, interpolation=cv2.INTER_AREA)
    a = win.astype(np.float32) / 255
    a[..., :3] *= a[..., 3:]
    return a, (hole.astype(np.float32) / 255)[..., None]


def window(term_bgr, q=1.0):
    """The Mac window around one terminal frame at scale q: premultiplied float RGBA."""
    base, hole = chrome(q)
    t = np.zeros(base.shape[:2] + (3,), np.float32)
    x0, y0 = round(M * q), round((M + TITLE) * q)
    tw, th = round(SRC_W * q), round(SRC_H * q)
    term = term_bgr[:SRC_H, :SRC_W, ::-1]
    if q < 1:
        term = cv2.resize(np.ascontiguousarray(term), (tw, th), interpolation=cv2.INTER_AREA)
    tw, th = min(tw, t.shape[1] - x0), min(th, t.shape[0] - y0)
    t[y0:y0 + th, x0:x0 + tw] = term[:th, :tw].astype(np.float32) / 255
    rgb = base[..., :3] * (1 - hole) + t * hole
    alpha = np.maximum(base[..., 3:], hole)
    return np.concatenate([rgb, alpha], axis=2)


def mip(s):
    """The pre-shrink for a camera scale: the warp then never minifies much."""
    return min(1.0, max(0.15, round(s * 1.5 / 0.05) * 0.05))


def place_window(term_bgr, cam):
    """A terminal frame in its Mac window, on the stage through cam: (layer, matrix in full-window px)."""
    q = mip(cam['s'])
    img = window(term_bgr, q)
    return project(img, cam, q=q)


# ---- the camera ------------------------------------------------------------------
def project(img, cam, out=(W, H), q=1.0):
    """Put a premultiplied RGBA image (at scale q of its full size) on the stage.

    cam, in full-size px: x, y = the point at the stage centre; s = scale;
    rx = tilt back (deg); rz = roll (deg); f = focal length. With rx = rz = 0 it
    is a plain sub-pixel zoom and pan. Returns the layer and the matrix that maps
    full-size px to the stage."""
    rx, rz, f = math.radians(cam.get('rx', 0)), math.radians(cam.get('rz', 0)), cam.get('f', 1700)
    x, y, s = cam['x'] * q, cam['y'] * q, cam['s'] / q
    h, w = img.shape[:2]

    def to_stage(px, py):
        X, Y = (px - x) * s, (py - y) * s
        X, Y = X * math.cos(rz) - Y * math.sin(rz), X * math.sin(rz) + Y * math.cos(rz)
        Z = -Y * math.sin(rx)
        Y = Y * math.cos(rx)
        k = f / (f + Z)
        return out[0] / 2 + X * k, out[1] / 2 + Y * k

    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([to_stage(*p) for p in src])
    m = cv2.getPerspectiveTransform(src, dst)
    layer = cv2.warpPerspective(img, m, out, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    return layer, m @ np.diag([q, q, 1.0])


def stage_point(m, px, py):
    v = m @ np.array([px, py, 1.0])
    return v[0] / v[2], v[1] / v[2]


@lru_cache(maxsize=4)
def backdrop(kind='glow'):
    """Near black with a faint violet glow top left and teal bottom right (RGB float)."""
    bg = np.zeros((H, W, 3), np.float32)
    bg[:] = (11 / 255, 9 / 255, 8 / 255)
    if kind == 'black':
        return bg
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    for (cx, cy, r, col, a) in [(250, 0, 900, (120, 60, 70), 0.30), (1750, 1080, 950, (90, 95, 20), 0.22)]:
        g = np.exp(-(((xs - cx) ** 2 + (ys - cy) ** 2) / (r * r)))
        bg += g[..., None] * np.float32(col) / 255 * a
    return bg


def over(dst, layer):
    """Composite premultiplied RGBA over RGB, in place."""
    dst *= 1 - layer[..., 3:]
    dst += layer[..., :3]
    return dst


# ---- overlay (after the lens) -------------------------------------------------------
@lru_cache(maxsize=1)
def arrow_png():
    im = Image.open(HERE / 'assets' / 'arrow.png').convert('RGBA')
    return im


ARROW_TIP = (336.4, 194.2)   # the hotspot in the 1024 px raster of left_ptr.svg


def draw_pointer(img, x, y, scale=1.0, alpha=1.0):
    """The macOS arrow (ful1e5/apple_cursor, GPL-3.0), ~46 px tall at scale 1."""
    if alpha <= 0.01:
        return
    k = 46 / 804 * scale * 1.0   # the arrow's body is 804 px of the 1024 raster
    src = arrow_png()
    size = max(1, round(1024 * k))
    a = src.resize((size, size), Image.LANCZOS)
    if alpha < 1:
        a.putalpha(a.getchannel('A').point(lambda v: int(v * alpha)))
    img.alpha_composite(a, (round(x - ARROW_TIP[0] * k), round(y - ARROW_TIP[1] * k)))


@lru_cache(maxsize=16)
def font(path, size):
    return ImageFont.truetype(path, size)


def caption(img, text, alpha, where='bottom', size=52):
    if alpha <= 0.01:
        return
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = font(FONT_CAP, size)
    a = int(255 * alpha)
    if where == 'bottom':
        band = np.linspace(0, 1, 280) ** 1.5 * 210 * alpha
        g = Image.fromarray(np.repeat(band[:, None], img.size[0], 1).astype(np.uint8), 'L')
        layer.paste((6, 7, 9, 255), (0, img.size[1] - 280), g)
        img.alpha_composite(layer)
        layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((img.size[0] / 2, img.size[1] - 96), text, font=f, fill=(246, 247, 250, a), anchor='mm')
    else:
        lines, line = [], ''
        for w in text.split():
            trial = f'{line} {w}'.strip()
            if d.textlength(trial, font=f) > 580 and line:
                lines.append(line)
                line = w
            else:
                line = trial
        lines.append(line)
        y = img.size[1] / 2 - (len(lines) - 1) * size * 0.7
        for one in lines:
            d.text((112, y), one, font=f, fill=(246, 247, 250, a), anchor='lm')
            y += size * 1.4
    img.alpha_composite(layer)


def shade_left(img, amount, edge=700, ramp=220):
    """Darken the left side of the frame, for a caption over a cropped-out area."""
    if amount <= 0.01:
        return
    xs = np.arange(img.size[0], dtype=np.float32)
    col = np.where(xs < edge, 1.0, 1 - np.clip((xs - edge) / ramp, 0, 1) ** 1.0) * 0.96 * amount
    g = Image.fromarray(np.repeat((col * 255).astype(np.uint8)[None, :], img.size[1], 0), 'L')
    layer = Image.new('RGBA', img.size, (6, 7, 9, 255))
    layer.putalpha(g)
    img.alpha_composite(layer)


# ---- the lens --------------------------------------------------------------------
def lensed(rgb, L, idx):
    """Run the launch-film lens on an RGB float frame; returns RGB uint8."""
    bgr = (np.clip(rgb[..., ::-1], 0, 1) * 255 + 0.5).astype(np.uint8)
    out = lens.process(bgr, L, H / 1080, idx)
    return out[..., ::-1]


def lens_params(dof=None, vignette=0.5, grain=0.045, bloom=0.05):
    d = {'amount': 0, 'fx': .5, 'fy': .5, 'angle': 0, 'band': .15, 'falloff': .2}
    if dof:
        d.update(dof)
    return {'dof': d, 'vignette': vignette, 'grain': grain, 'bloom': bloom}
