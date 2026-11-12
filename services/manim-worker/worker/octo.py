"""
Helpers every generated scene imports (`from octo import *`): the frame size
for the orientation, a dark theme, a palette, and captions. They keep the
code the model writes short, which keeps it correct.
"""

import os

from manim import (
    DOWN,
    UP,
    BackgroundRectangle,
    FadeIn,
    FadeOut,
    Scene,
    Text,
    VGroup,
    config,
)

ORIENTATION = os.environ.get("OCTO_ORIENTATION", "landscape")
PORTRAIT = ORIENTATION == "portrait"

# A clean sans-serif for every Text (the container's default fallback is a serif).
Text.set_default(font="DejaVu Sans")

if PORTRAIT:
    # Same scene units on the short side as landscape, so layouts carry over.
    config.frame_width = 9
    config.frame_height = 16

BACKGROUND = "#0f1115"
INK = "#f2f2ef"
MUTED = "#a09f9b"
BLUE = "#5aa2ff"
GREEN = "#4fcf95"
ORANGE = "#f2a04e"
PURPLE = "#a98bff"
RED = "#ff7b73"
TEAL = "#3fc9c9"
YELLOW = "#f0c050"
PALETTE = [BLUE, GREEN, ORANGE, PURPLE, TEAL, RED, YELLOW]

# Big enough to read on a phone; long captions wrap to two lines rather than shrinking.
CAPTION_SIZE = 40 if PORTRAIT else 34
CAPTION_WIDTH = 8.4 if PORTRAIT else 13


class OctoScene(Scene):
    """Dark background, plus caption helpers. Subclass it and write construct()."""

    def setup(self):
        self.camera.background_color = BACKGROUND
        self._caption = None

    def caption(self, text: str, run_time: float = 0.4):
        """Shows a caption at the bottom, replacing the previous one."""
        label = Text(wrap(text, 34 if PORTRAIT else 64), font_size=CAPTION_SIZE, color=INK, line_spacing=0.8)
        if label.width > CAPTION_WIDTH:
            label.scale_to_fit_width(CAPTION_WIDTH)
        label.to_edge(DOWN, buff=0.45)
        box = BackgroundRectangle(label, color=BACKGROUND, fill_opacity=0.75, buff=0.15)
        group = VGroup(box, label)
        animations = [FadeIn(group, shift=0.1 * UP)]
        if self._caption is not None:
            animations.append(FadeOut(self._caption))
        self.play(*animations, run_time=run_time)
        self._caption = group
        return group

    def clear_caption(self, run_time: float = 0.3):
        if self._caption is not None:
            self.play(FadeOut(self._caption), run_time=run_time)
            self._caption = None

    def clear(self, run_time: float = 0.5):
        """Fades out everything on screen: end each scene with it."""
        if self.mobjects:
            self.play(*[FadeOut(m) for m in self.mobjects], run_time=run_time)
        self._caption = None


def wrap(text: str, width: int) -> str:
    """Breaks a caption into at most two balanced lines."""
    if len(text) <= width:
        return text
    words = text.split()
    best, best_gap = text, len(text)
    for i in range(1, len(words)):
        first, second = " ".join(words[:i]), " ".join(words[i:])
        gap = abs(len(first) - len(second))
        if gap < best_gap:
            best, best_gap = first + "\n" + second, gap
    return best


def title_text(text: str, size: int = 48, color: str = INK) -> Text:
    label = Text(text, font_size=size, color=color, weight="BOLD")
    limit = 8.2 if PORTRAIT else 12
    if label.width > limit:
        label.scale_to_fit_width(limit)
    return label
