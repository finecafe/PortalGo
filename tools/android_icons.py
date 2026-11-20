#!/usr/bin/env python3
"""Tạo icon launcher Android (mipmap + adaptive icon) từ assets/logo.png.
Dùng:  python3 tools/android_icons.py [thư_mục_android]   (mặc định ./android)
"""
import os, sys
from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
android = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "android")
res = os.path.join(android, "app", "src", "main", "res")
if not os.path.isdir(res):
    sys.exit(f"Không thấy {res} - hãy chạy 'npx cap add android' trước.")

logo = Image.open(os.path.join(root, "assets", "logo.png")).convert("RGBA")

def fit(img, box):
    s = min(box / img.width, box / img.height)
    return img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)

def on_canvas(size, content_ratio, bg):
    c = Image.new("RGBA", (size, size), bg)
    l = fit(logo, round(size * content_ratio))
    c.paste(l, ((size - l.width) // 2, (size - l.height) // 2), l)
    return c

def round_mask(img):
    m = Image.new("L", img.size, 0)
    from PIL import ImageDraw
    ImageDraw.Draw(m).ellipse((0, 0, img.width - 1, img.height - 1), fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0)); out.paste(img, (0, 0), m); return out

# mật độ -> (kích thước launcher, kích thước lớp foreground của adaptive icon)
DENS = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216), "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}
for d, (ls, fs) in DENS.items():
    folder = os.path.join(res, f"mipmap-{d}")
    os.makedirs(folder, exist_ok=True)
    sq = on_canvas(ls, 0.86, (255, 255, 255, 255))
    sq.convert("RGB").save(os.path.join(folder, "ic_launcher.png"))
    round_mask(sq).save(os.path.join(folder, "ic_launcher_round.png"))
    # foreground của adaptive icon: logo nằm trong vùng an toàn (~61% của 108dp)
    on_canvas(fs, 0.60, (0, 0, 0, 0)).save(os.path.join(folder, "ic_launcher_foreground.png"))

# nền trắng cho adaptive icon
vals = os.path.join(res, "values"); os.makedirs(vals, exist_ok=True)
open(os.path.join(vals, "ic_launcher_background.xml"), "w", encoding="utf-8").write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n')
print("Đã tạo icon Android tại", res)
