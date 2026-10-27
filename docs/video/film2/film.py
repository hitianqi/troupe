#!/usr/bin/env python3
"""troupe — the demo film, v1. Every shot is real footage from the takes (asciinema
casts rendered with agg), framed in a Mac window on a dark stage; the three starts
and the missions shot tilt the windows into 3D with a tilt-shift lens. Pointer,
captions and titles are drawn after the lens so they stay sharp.

    python3 film.py stills 6,9.5,20        one PNG per time in check/
    python3 film.py render [--from T --to T]   frames → build/, then audio, then film.mp4
"""
import json
import math
import os
import subprocess
import sys
from functools import lru_cache
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import core
from core import (CH, CW, FPS, FONT_CAP, FONT_HEAD, FONT_MONO, FONT_UI, H, PX, PY, SRC_W, W, WIN_H, WIN_W, M, TITLE,
                  at, backdrop, caption, cell, draw_pointer, font, keyed, lens_params, over, place_window, project,
                  remap, shade_left, smooth, glide, stage_point)

HERE = Path(__file__).parent


def inv(segments, s):
    """Source seconds -> output seconds, for the first segment that holds s."""
    for o0, o1, s0, s1 in segments:
        if s0 <= s <= s1 and s1 > s0:
            return o0 + (o1 - o0) * (s - s0) / (s1 - s0)
    raise ValueError(s)


def framed(col, row, scale, left):
    """A camera with column `col`'s left edge at stage x `left`, row `row` at mid height."""
    x = M + PX + col * CW
    return dict(x=x + (W / 2 - left) / scale, y=cell(0, row)[1], s=scale)


def cam_keys(keys, t, ease=smooth):
    """[(t, {cam})] -> cam at t."""
    if t <= keys[0][0]:
        return dict(keys[0][1])
    for (ta, a), (tb, b) in zip(keys, keys[1:]):
        if t <= tb:
            e = ease((t - ta) / (tb - ta))
            return {k: a.get(k, 0) + (b.get(k, 0) - a.get(k, 0)) * e for k in set(a) | set(b)}
    return dict(keys[-1][1])


FIT = dict(x=WIN_W / 2, y=WIN_H / 2, s=0.505)
OVERVIEW = dict(x=WIN_W / 2, y=WIN_H / 2 + 92 / 0.44, s=0.44)
PANEL = framed(66, 22, 0.6, 800)          # the panel on the right, a caption on the left
PANEL_MID = framed(66, 22, 0.6, 506)
LIVE = framed(93, 36.5, 1.05, 760)
LEFT_HALF = framed(0, 30, 0.82, 120)      # the orchestrator's pane


# ---- shots ------------------------------------------------------------------------
class Shot:
    """A shot: length, render(t) -> (RGB float base, lens params, overlay(img, t)), cues."""
    length = 0
    cues = ()

    def frame(self, t):
        raise NotImplementedError


class Words(Shot):
    """Words on black, each blurring in after the last."""
    def __init__(self, text, length, size=84, at=0.25, stagger=0.16):
        self.text, self.length, self.size, self.at, self.stagger = text, length, size, at, stagger
        words = text.split()
        self.cues = [(at + i * stagger, 'tick', 0.18) for i in range(len(words))]

    def frame(self, t):
        base = backdrop('black').copy()

        def overlay(img, t=t):
            f = font(FONT_HEAD, self.size)
            words = self.text.split()
            d = ImageDraw.Draw(img)
            widths = [d.textlength(w, font=f) for w in words]
            space = d.textlength(' ', font=f) * 0.9
            x = W / 2 - (sum(widths) + space * (len(words) - 1)) / 2
            fade_out = 1 - smooth((t - (self.length - 0.35)) / 0.3)
            for i, (w, wd) in enumerate(zip(words, widths)):
                p = smooth((t - self.at - i * self.stagger) / 0.42)
                if p > 0:
                    layer = Image.new('RGBA', (int(wd) + 80, self.size * 2), (0, 0, 0, 0))
                    ImageDraw.Draw(layer).text((40, self.size), w, font=f, fill=(238, 238, 242, int(255 * p * fade_out)), anchor='lm')
                    if p < 1:
                        layer = layer.filter(ImageFilter.GaussianBlur(14 * (1 - p)))
                    img.alpha_composite(layer, (int(x - 40), int(H / 2 - self.size + (1 - p) * 10)))
                x += wd + space
        return base, lens_params(vignette=0.4, grain=0.04), overlay


@lru_cache(maxsize=1)
def icon():
    return Image.open('/home/tizh/repos/projects/troupe/assets/icon-512.png').convert('RGBA')


class Brand(Shot):
    """The icon, then the wordmark beside it."""
    def __init__(self, length, sub=None, cta=False):
        self.length, self.sub, self.cta = length, sub, cta
        self.cues = [(0.25, 'hit', 0.9)] if not cta else [(0.3, 'hit', 0.7), (1.4, 'chime', 0.5), (2.2, 'ding', 0.35)]

    def frame(self, t):
        base = backdrop('glow').copy() * (0.7 if not self.cta else 0.85)

        def overlay(img, t=t):
            p = smooth((t - 0.15) / 0.55)
            fade = 1 - smooth((t - (self.length - 0.35)) / 0.3) if not self.cta else 1
            size = int(170 * (0.9 + 0.1 * p))
            ic = icon().resize((size, size), Image.LANCZOS)
            if p < 1:
                ic = ic.filter(ImageFilter.GaussianBlur(12 * (1 - p)))
            ic.putalpha(ic.getchannel('A').point(lambda v: int(v * p * fade)))
            f = font(FONT_HEAD, 150)
            d = ImageDraw.Draw(img)
            word = 'troupe'
            ww = d.textlength(word, font=f)
            gap = 44
            total = size + gap + ww
            x0 = W / 2 - total / 2
            y = H / 2 - (40 if (self.sub or self.cta) else 0)
            img.alpha_composite(ic, (int(x0), int(y - size / 2)))
            q = smooth((t - 0.45) / 0.5)
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
            ImageDraw.Draw(layer).text((x0 + size + gap + (1 - q) * 30, y + 6), word, font=f, fill=(244, 240, 228, int(255 * q * fade)), anchor='lm')
            img.alpha_composite(layer)
            if self.cta:
                r = smooth((t - 1.2) / 0.5)
                f2 = font(FONT_MONO, 46)
                cmd = 'npm i -g troupe-cli'
                cw = d.textlength(cmd, font=f2)
                box = (W / 2 - cw / 2 - 34, y + 150, W / 2 + cw / 2 + 34, y + 236)
                lay = Image.new('RGBA', img.size, (0, 0, 0, 0))
                dl = ImageDraw.Draw(lay)
                dl.rounded_rectangle(box, 18, fill=(30, 29, 45, int(230 * r)), outline=(90, 92, 120, int(255 * r)), width=2)
                dl.text((W / 2, (box[1] + box[3]) / 2), cmd, font=f2, fill=(236, 236, 242, int(255 * r)), anchor='mm')
                s2 = smooth((t - 2.0) / 0.5)
                dl.text((W / 2, box[3] + 80), 'Claude Code  ·  Codex  ·  tmux', font=font(FONT_UI, 34), fill=(150, 152, 170, int(255 * s2)), anchor='mm')
                img.alpha_composite(lay)
        return base, lens_params(vignette=0.35, grain=0.035, bloom=0.0), overlay


class Starts(Shot):
    """Three input lines on one tilted plane, typing at once; the camera follows the Claude line."""
    # name, crop rows, label, badge colour, the input row, segments (out -> source)
    STRIPS = [
        ('take_b', (0, 2), 'Terminal', (200, 200, 210), 0, [(0.0, 0.8, 1.6, 2.4), (0.8, 3.4, 2.4, 5.0), (3.4, 9.0, 5.0, 7.0)]),
        ('take_c', (5, 9), 'Claude Code', (240, 138, 126), 6, [(0.0, 7.4, 1.8, 12.0), (7.4, 9.0, 12.0, 12.0)]),
        ('take_d', (39, 45), 'Codex', (101, 203, 212), 41, [(0.0, 7.4, 1.8, 12.0), (7.4, 9.0, 12.0, 12.0)]),
    ]
    GAP, LABEL, PAD = 70, 66, 26

    def __init__(self, length=8.6):
        self.length = length
        y = 0
        self.layout = []
        for name, (r0, r1), label, color, row, seg in self.STRIPS:
            h = round((r1 - r0) * CH) + 2 * self.PAD
            self.layout.append((y, h))
            y += self.LABEL + h + self.GAP
        self.plane_h = y - self.GAP
        self.plane_w = SRC_W + 2 * self.PAD
        keys = []
        rng = np.random.default_rng(3)
        for t in np.arange(0.15, 7.3, 1 / 12.5):
            keys.append((float(t + rng.uniform(-0.02, 0.02)), f'key{rng.integers(1, 7)}', 0.32))
        self.cues = keys + [(7.75, 'click2', 0.5)]

    def plane(self, t):
        img = Image.new('RGBA', (self.plane_w, self.plane_h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        for (name, (r0, r1), label, color, row, seg), (y, h) in zip(self.STRIPS, self.layout):
            src = at(name, remap(seg, t))
            crop = src[round(PY + r0 * CH):round(PY + r1 * CH), :SRC_W, ::-1]
            d.ellipse((self.PAD, y + 18, self.PAD + 22, y + 40), fill=color + (255,))
            d.text((self.PAD + 40, y + 29), label, font=font(FONT_UI, 38), fill=(214, 216, 226, 255), anchor='lm')
            box = (0, y + self.LABEL, self.plane_w, y + self.LABEL + h)
            d.rounded_rectangle(box, 22, fill=(30, 29, 45, 255), outline=(70, 72, 96, 255), width=2)
            img.paste(Image.fromarray(np.ascontiguousarray(crop)), (self.PAD, y + self.LABEL + self.PAD))
        return img

    def caret(self, t):
        """The Claude line's typed width in plane px, from its own pixels."""
        name, (r0, r1), _, _, row, seg = self.STRIPS[1]
        src = at(name, remap(seg, t))
        band = src[round(PY + row * CH):round(PY + (row + 1) * CH), :SRC_W].mean(axis=2)
        ink = np.where((np.abs(band - band[:, -40:].mean()) > 50).any(axis=0))[0]
        return self.PAD + (ink.max() if len(ink) else 0)

    def frame(self, t):
        plane = self.plane(t)
        a = np.asarray(plane).astype(np.float32) / 255
        a[..., :3] *= a[..., 3:]
        y_mid = self.layout[1][0] + self.LABEL + self.layout[1][1] / 2
        # The camera glides along the Claude line, a little behind the caret.
        cx = min(max(self.caret(min(t, 7.4)) - 520, 820), 1500)
        p = t / self.length
        cam = dict(x=cx, y=y_mid - 40, s=0.92 + 0.12 * glide(p), rx=34, rz=-11, f=1700)
        layer, m = project(a, cam)
        base = backdrop('glow').copy() * 0.8
        over(base, layer)
        fx, fy = stage_point(m, cx, y_mid)
        L = lens_params(dof=dict(amount=9, fx=fx / W, fy=fy / H, angle=-11, band=0.11, falloff=0.22), vignette=0.55, grain=0.05)

        def overlay(img, t=t):
            caption(img, 'Start from the CLI, or from the agent you already have open.', smooth((t - 0.8) / 0.4) * (1 - smooth((t - (self.length - 0.4)) / 0.35)))
        return base, L, overlay


class Footage(Shot):
    """One source in the Mac window, with a time map, camera keys, a pointer and a caption."""
    def __init__(self, src, length, segments, cams, pointer=(), clicks=(), pointer_alpha=((0, 0),), caption=None,
                 shade=((0, 0),), cues=(), ease=smooth, sources=None, scrolls=()):
        self.src, self.length, self.segments, self.cams = src, length, segments, cams
        self.pointer, self.clicks, self.pointer_alpha = pointer, clicks, pointer_alpha
        self.cap, self.shade, self.ease, self.sources = caption, shade, ease, sources
        self.cues = list(cues) + [(c, 'click1', 0.55) for c in clicks] + [(c, 'tick', 0.12) for c in scrolls]

    def source_at(self, t):
        if self.sources:  # [(until, name, segments)]
            for until, name, seg in self.sources:
                if t <= until:
                    return at(name, remap(seg, t))
        return at(self.src, remap(self.segments, t))

    def frame(self, t):
        cam = cam_keys(self.cams, t, self.ease)
        layer, m = place_window(self.source_at(t), cam)
        base = backdrop('glow').copy()
        over(base, layer)
        L = lens_params(vignette=0.45, grain=0.04, bloom=0.04)

        def overlay(img, t=t):
            shade_left(img, keyed(self.shade, t)[0])
            if self.pointer:
                a = keyed(self.pointer_alpha, t)[0]
                px, py = keyed(self.pointer, t)
                sx, sy = stage_point(m, px, py)
                near = min((abs(t - c) for c in self.clicks), default=9)
                grow = 1 + 0.35 * (1 - smooth((near - 0.12) / 0.4))
                press = 0.9 if near < 0.05 else 1.0
                draw_pointer(img, sx, sy, grow * press, a)
            if self.cap:
                text, t_in, t_out, where = self.cap
                caption(img, text, smooth((t - t_in) / 0.35) * (1 - smooth((t - t_out) / 0.35)), where)
        return base, L, overlay


class Missions(Shot):
    """Three missions as tilted windows sliding apart along the diagonal."""
    def __init__(self, length=4.6):
        self.length = length
        self.cues = [(0.2, 'whoosh', 0.5), (0.9, 'pop2', 0.4), (1.25, 'pop3', 0.4)]

    def frame(self, t):
        base = backdrop('glow').copy()
        p = glide(t / 2.2)
        windows = [('take_g', 2.0 + t * 0.8, 2), ('take_f', 2.0 + t * 0.8, 1), ('cards', 6.0 + t, 0)]
        rng_fx = 0
        for name, st, depth in windows:
            off = depth * p
            cam = dict(x=WIN_W / 2 + off * 1500, y=WIN_H / 2 + off * 1080, s=0.36 - 0.03 * p, rx=30, rz=-12, f=1700)
            layer, m = place_window(at(name, st), cam)
            dim = 1 - 0.28 * depth * p
            layer = layer * np.float32(dim)
            over(base, layer)
            if depth == 0:
                fx, fy = stage_point(m, WIN_W / 2, WIN_H / 2)
        L = lens_params(dof=dict(amount=10, fx=fx / W, fy=fy / H, angle=-12, band=0.16, falloff=0.25), vignette=0.55, grain=0.05)

        def overlay(img, t=t):
            caption(img, 'Run several missions at once.', smooth((t - 0.6) / 0.35) * (1 - smooth((t - (self.length - 0.4)) / 0.35)))
        return base, L, overlay


# ---- the timeline ---------------------------------------------------------------------
def build():
    plan_seg = [(0.0, 1.6, 2.0, 3.6), (1.6, 6.0, 5.4, 24.0), (6.0, 6.3, 43.6, 43.9), (6.3, 8.4, 43.9, 46.0), (8.4, 10.0, 53.4, 57.0), (10.0, 10.6, 57.0, 57.6)]
    approve_o = inv(plan_seg, 56.5)
    wheel_o = inv(plan_seg, 53.6)
    waits_seg = [(0.0, 1.8, 1.0, 2.8), (1.8, 2.6, 5.25, 6.05), (2.6, 3.4, 6.5, 7.3), (3.4, 4.8, 7.3, 8.7)]
    tour_seg = [(0.0, 0.8, 0.6, 1.4), (0.8, 2.4, 1.4, 4.6), (2.4, 2.6, 6.3, 6.5), (2.6, 4.2, 6.5, 9.8), (4.2, 4.8, 11.0, 11.6),
                (4.8, 5.0, 13.5, 13.7), (5.0, 5.8, 13.7, 14.5), (5.8, 6.0, 16.5, 16.7), (6.0, 7.2, 16.7, 19.5)]
    tab = lambda col: cell(66 + col, 1)  # noqa: E731
    land = [(1.4, 'land1', [(0.0, 1.4, 0.9, 2.3)]), (2.8, 'land1', [(1.4, 2.8, 20.6, 22.0)]),
            (3.6, 'land2', [(2.8, 3.6, 1.7, 2.5)]), (7.4, 'land2', [(3.6, 4.6, 2.5, 3.5), (4.6, 7.4, 9.2, 12.0)])]
    cards_seg = [(0.0, 1.0, 0.3, 1.3), (1.0, 2.2, 1.3, 2.5), (2.2, 2.4, 3.2, 3.4), (2.4, 3.6, 3.4, 4.6), (3.6, 3.8, 5.2, 5.4), (3.8, 9.4, 5.4, 11.0)]
    roles_seg = [(0.0, 0.8, 1.5, 2.3), (0.8, 1.4, 2.3, 2.9), (1.4, 1.8, 3.9, 4.3), (1.8, 4.8, 4.3, 10.3), (4.8, 6.4, 10.3, 11.9)]
    return [
        ('pain', Words("Five agents. Five terminals. Who's stuck?", 3.4)),
        ('brand', Brand(2.2)),
        ('starts', Starts(8.6)),
        ('open', Footage('open', 2.8, [(0.0, 0.5, 2.3, 2.8), (0.5, 1.8, 4.5, 5.8), (1.8, 2.8, 5.8, 5.8)],
                         [(0, FIT | dict(s=0.47)), (2.8, FIT | dict(s=0.5))],
                         cues=[(0.0, 'swish', 0.5), (0.35, 'click2', 0.45), (1.0, 'pop1', 0.5)])),
        ('plan', Footage('plan', 10.6, plan_seg,
                         [(0, FIT), (1.5, FIT), (2.3, LEFT_HALF), (6.0, LEFT_HALF), (6.6, PANEL_MID), (10.6, PANEL_MID)],
                         pointer=[(0, *cell(120, 30)), (8.4, *cell(118, 26)), (wheel_o, *cell(106, 20)), (approve_o - 0.25, *cell(72, 41)), (10.6, *cell(72, 41))],
                         clicks=[approve_o], pointer_alpha=[(0, 0), (8.1, 0), (8.4, 1), (10.6, 1)],
                         caption=('A plan first. Just tell it what to change.', 0.4, 10.2, 'bottom'),
                         cues=[(1.6 + i / 11, f'key{i % 6 + 1}', 0.22) for i in range(int(4.3 * 11))] + [(6.0, 'pop2', 0.55)],
                         scrolls=[wheel_o, wheel_o + 0.1, wheel_o + 0.2])),
        ('waits', Footage('waits', 4.8, waits_seg,
                          [(0, PANEL), (1.9, PANEL), (2.4, OVERVIEW), (4.8, OVERVIEW)],
                          pointer=[(0, *cell(120, 24)), (1.5, *cell(149, 4)), (2.0, *cell(149, 4)), (2.9, *cell(16, 41)), (4.8, *cell(16, 41))],
                          clicks=[1.8, 3.4], pointer_alpha=[(0, 1), (4.0, 1), (4.4, 0)],
                          shade=[(0, 1), (1.9, 1), (2.3, 0)],
                          caption=('It tells you who’s waiting on you.', 0.3, 4.5, 'left'),
                          cues=[(1.95, 'swish', 0.35)])),
        ('cards', Footage('cards', 9.4, cards_seg,
                          [(0.0, PANEL), (4.1, PANEL), (5.3, LIVE), (8.2, LIVE), (9.1, PANEL)],
                          pointer=[(0.0, *cell(110, 38)), (0.85, *cell(105, 11)), (1.4, *cell(105, 11)), (2.25, *cell(105, 18)), (2.7, *cell(105, 18)), (3.65, *cell(137, 15)), (4.1, *cell(140, 22))],
                          clicks=[1.0, 2.4, 3.8], pointer_alpha=[(0.0, 1), (4.1, 1), (4.5, 0)],
                          shade=[(0, 1), (9.4, 1)],
                          caption=('Click a role. Watch it work, live.', 0.3, 8.4, 'left'),
                          cues=[(4.2, 'swell', 0.25)])),
        ('roles', Footage('roles', 6.4, roles_seg,
                          [(0.0, PANEL), (0.85, PANEL), (1.6, OVERVIEW)],
                          pointer=[(0.0, *cell(128, 30)), (0.6, *cell(99, 42)), (1.0, *cell(99, 42))],
                          clicks=[0.8], pointer_alpha=[(0.0, 0), (0.15, 1), (1.1, 1), (1.4, 0)],
                          shade=[(0.0, 1.0), (0.85, 1.0), (1.3, 0.0)],
                          caption=('Every role in a real window. Talk to any of them.', 1.5, 6.1, 'bottom'),
                          cues=[(0.9, 'swish', 0.35)] + [(1.8 + i / 13, f'key{i % 6 + 1}', 0.22) for i in range(39)] + [(4.85, 'space', 0.4)])),
        ('tour', Footage('tour', 7.2, tour_seg, [(0, PANEL), (7.2, PANEL)],
                         pointer=[(0, *cell(110, 20)), (0.6, *tab(16)), (2.2, *tab(16)), (2.5, *tab(26)), (3.7, *tab(26)), (4.9, *tab(35)), (5.85, *tab(43)), (7.2, *tab(43))],
                         clicks=[0.8, 2.6, 5.0, 6.0], pointer_alpha=[(0, 1), (7.2, 1)], shade=[(0, 1), (7.2, 1)],
                         caption=('Context, tokens, plan, log and diff. Live.', 0.3, 6.9, 'left'),
                         scrolls=[1.6, 1.7, 1.8, 4.4, 4.5, 6.6, 6.7])),
        ('land', Footage('land1', 7.4, None, [(0, PANEL_MID), (3.6, PANEL_MID), (4.4, LEFT_HALF | dict(y=cell(0, 33)[1])), (7.4, LEFT_HALF | dict(y=cell(0, 34)[1]))],
                         sources=land,
                         pointer=[(0, *cell(110, 20)), (1.1, *cell(72, 9)), (1.6, *cell(72, 9)), (3.2, *cell(72, 7)), (3.6, *cell(72, 7))],
                         clicks=[1.3, 3.4], pointer_alpha=[(0, 1), (3.6, 1), (3.9, 0)],
                         caption=('Approve, merge, and it cleans up.', 0.3, 7.1, 'bottom'),
                         cues=[(1.45, 'swish', 0.35), (2.85, 'pop1', 0.4), (6.0, 'ding', 0.35)])),
        ('missions', Missions(4.6)),
        ('cta', Brand(7.0, cta=True)),
    ]


SHOTS = build()
STARTS = []
_t = 0.0
for _name, _shot in SHOTS:
    STARTS.append(_t)
    _t += _shot.length
TOTAL = _t
DISSOLVE = 0.25


def render_at(t, idx=0):
    """The finished frame at time t: base through the lens, then the overlay."""
    for i, ((name, shot), start) in enumerate(zip(SHOTS, STARTS)):
        if t < start + shot.length or i == len(SHOTS) - 1:
            local = min(t - start, shot.length - 1e-6)
            base, L, overlay = shot.frame(local)
            rgb = core.lensed(base, L, idx)
            img = Image.fromarray(rgb).convert('RGBA')
            overlay(img)
            out = np.asarray(img.convert('RGB'))
            # A short dissolve into the next shot, except into the title cards.
            if i + 1 < len(SHOTS) and t > start + shot.length - DISSOLVE and SHOTS[i + 1][0] not in ('brand', 'cta', 'starts'):
                nb, nL, no = SHOTS[i + 1][1].frame(0.0)
                nimg = Image.fromarray(core.lensed(nb, nL, idx)).convert('RGBA')
                no(nimg)
                k = smooth((t - (start + shot.length - DISSOLVE)) / DISSOLVE)
                out = (out * (1 - k) + np.asarray(nimg.convert('RGB')) * k).astype(np.uint8)
            return out
    raise AssertionError


def cue_list():
    cues = []
    for (name, shot), start in zip(SHOTS, STARTS):
        cues += [(start + t, kind, gain) for t, kind, gain in shot.cues]
    return sorted(cues)


# ---- rendering -------------------------------------------------------------------
BUILD = HERE / 'build'


def _one(i):
    path = BUILD / 'frames' / f'{i:05d}.jpg'
    if path.exists():
        return i
    rgb = render_at(i / FPS, i)
    cv2.imwrite(str(path), rgb[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 94])
    return i


def audio(out):
    """The launch-film music bed under earshot effects placed on the cues."""
    from scipy.io import wavfile

    def read(path):
        sr, d = wavfile.read(path)
        scale = {np.dtype('int16'): 2 ** 15, np.dtype('int32'): 2 ** 31}.get(d.dtype, 1)
        d = d.astype(np.float64) / scale
        return (d[:, None] if d.ndim == 1 else d), sr
    man = BUILD / 'manifest.json'
    breath = STARTS[-1] - 0.6
    json.dump({'duration': TOTAL, 'music': {'bpm': 100, 'drop': STARTS[2] + 0.1, 'breaths': [[breath, breath + 0.5]], 'hit': STARTS[-1] + 0.3, 'mood': 'warm'}, 'cues': []}, open(man, 'w'))
    bed = BUILD / 'bed.wav'
    subprocess.run([sys.executable, '/home/tizh/.claude/skills/tianqi-launch-film/scripts/soundtrack.py', str(man), str(bed), '--no-sfx'], check=True, stdout=subprocess.DEVNULL)
    music, sr = read(bed)
    music = music[:, :2] if music.shape[1] >= 2 else np.repeat(music, 2, 1)
    mix = music * 0.55
    sfx = {}
    for t, kind, gain in cue_list():
        if kind not in sfx:
            d, r = read(HERE / 'assets' / 'sfx' / f'{kind}.wav')
            if r != sr:
                d = cv2.resize(d.astype(np.float32), (d.shape[1], round(len(d) * sr / r))).astype(np.float64)
            sfx[kind] = d[:, :2] if d.shape[1] >= 2 else np.repeat(d, 2, 1)
        s = sfx[kind] * gain
        i = int(t * sr)
        if i >= len(mix):
            continue
        j = min(len(mix), i + len(s))
        mix[i:j] += s[:j - i]
    mix /= max(1e-9, np.abs(mix).max()) / 0.8
    wavfile.write(out, sr, (mix * 32767).astype(np.int16))


def main():
    verb = sys.argv[1]
    if verb == 'stills':
        os.makedirs(HERE / 'check', exist_ok=True)
        for one in sys.argv[2].split(','):
            Image.fromarray(render_at(float(one))).save(HERE / 'check' / f'still-{one}.png')
            print('still', one)
        return
    if verb == 'times':
        for (name, shot), start in zip(SHOTS, STARTS):
            print(f'{start:6.2f}  {name:9s} {shot.length:.1f}s')
        print(f'{TOTAL:6.2f}  total')
        return
    (BUILD / 'frames').mkdir(parents=True, exist_ok=True)
    n = round(TOTAL * FPS)
    lo = round(float(sys.argv[sys.argv.index('--from') + 1]) * FPS) if '--from' in sys.argv else 0
    hi = round(float(sys.argv[sys.argv.index('--to') + 1]) * FPS) if '--to' in sys.argv else n
    todo = list(range(lo, hi))
    with Pool(8) as pool:
        for k, _ in enumerate(pool.imap_unordered(_one, todo, chunksize=4)):
            if k % 60 == 0:
                print(f'{k}/{len(todo)}', flush=True)
    audio(BUILD / 'audio.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-i', str(BUILD / 'frames' / '%05d.jpg'), '-i', str(BUILD / 'audio.wav'),
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest',
                    '-movflags', '+faststart', str(HERE / 'film.mp4')], check=True)
    print('film →', HERE / 'film.mp4')


if __name__ == '__main__':
    main()
