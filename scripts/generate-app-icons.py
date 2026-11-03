"""Generate Android launcher icons and splash screens from the Meksova mark.

Run from the project root:  python scripts/generate-app-icons.py
Source: public/transparent icon.png (the blue M on transparent).
"""
import glob
import os

from PIL import Image, ImageDraw

SRC = "public/transparent icon.png"
RES = "android/app/src/main/res"
ICON_BG = (30, 30, 30, 255)    # #1E1E1E, matches public/ICON.png
SPLASH_BG = (10, 10, 11, 255)  # #0A0A0B, --bg in tokens.css (dark theme)

mark = Image.open(SRC).convert("RGBA")
mark = mark.crop(mark.getchannel("A").getbbox())


def place(canvas_px, fraction, bg=(0, 0, 0, 0)):
    """Centre the mark so its longest side is `fraction` of the canvas."""
    canvas = Image.new("RGBA", (canvas_px, canvas_px) if isinstance(canvas_px, int) else canvas_px, bg)
    w, h = canvas.size
    scale = fraction * min(w, h) / max(mark.size)
    m = mark.resize((round(mark.width * scale), round(mark.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(m, ((w - m.width) // 2, (h - m.height) // 2))
    return canvas


DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

for name, d in DENSITIES.items():
    folder = f"{RES}/mipmap-{name}"
    # Adaptive foreground: 108dp canvas, launcher masks to the inner 66dp.
    place(round(108 * d), 0.56).save(f"{folder}/ic_launcher_foreground.png")
    # Legacy square + round icons (pre-Android 8 launchers).
    px = round(48 * d)
    square = place(px, 0.62, ICON_BG)
    rounded = Image.new("L", (px, px), 0)
    ImageDraw.Draw(rounded).rounded_rectangle((0, 0, px - 1, px - 1), radius=px * 0.22, fill=255)
    square.putalpha(rounded)
    square.save(f"{folder}/ic_launcher.png")
    circle_img = place(px, 0.58, ICON_BG)
    circle = Image.new("L", (px, px), 0)
    ImageDraw.Draw(circle).ellipse((0, 0, px - 1, px - 1), fill=255)
    circle_img.putalpha(circle)
    circle_img.save(f"{folder}/ic_launcher_round.png")

# Splash images: keep each file's existing size, dark field, mark at ~30% of the short side.
for path in glob.glob(f"{RES}/drawable*/splash.png"):
    size = Image.open(path).size
    place(size, 0.30, SPLASH_BG).convert("RGB").save(path, optimize=True)

print("icons + splash regenerated")
