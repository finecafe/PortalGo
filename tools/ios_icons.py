#!/usr/bin/env python3
"""Tạo icon app iOS (1024x1024, nền trắng, không trong suốt) từ assets/logo.png.
Dùng:  python3 tools/ios_icons.py [thư_mục_ios]   (mặc định ./ios)
"""
import os, sys
from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ios = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "ios")
target = os.path.join(ios, "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png")
if not os.path.isfile(target):
    sys.exit(f"Không thấy {target} - hãy chạy 'npx cap add ios' trước.")

logo = Image.open(os.path.join(root, "assets", "logo.png")).convert("RGBA")
size = 1024
box = round(size * 0.84)
s = min(box / logo.width, box / logo.height)
logo = logo.resize((round(logo.width * s), round(logo.height * s)), Image.LANCZOS)
canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
canvas.paste(logo, ((size - logo.width) // 2, (size - logo.height) // 2), logo)
canvas.convert("RGB").save(target, "PNG")  # iOS không cho icon có kênh alpha
print("Đã tạo icon iOS:", target)
