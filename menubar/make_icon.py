"""Builds the whole icon package from design/icon/icon.svg (drawn by design/icon/make_icon_variants.py) and installs it:
  design/icon/package/   AppIcon.icns, the .iconset PNGs, icon-1024.png, favicons (svg, 16/32/48 png, ico), apple-touch-icon.png, 192/512 PNGs
  menubar/AppIcon.icns (installed app), menubar/AppIcon-Build.icns (test build, with a "B" badge), ui/public/favicon.svg, favicon-32.png, apple-touch-icon.png   (what the app and the browser UI use)
Needs Google Chrome (renders the SVG).  Run: python3 menubar/make_icon.py"""
import re, shutil, subprocess, tempfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "design" / "icon" / "icon.svg"
PKG = ROOT / "design" / "icon" / "package"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

full = SRC.read_text()                                              # 1024 canvas, tile with drop shadow (macOS app icon)
tight = full.replace(' filter="url(#shadow)"', "").replace('viewBox="0 0 1024 1024"', 'viewBox="100 100 824 824"')   # just the tile, for favicons
bleed = tight.replace("</defs>", '</defs><rect x="100" y="100" width="824" height="824" fill="#26272c"/>', 1)             # square, no transparent corners (iOS rounds it)

# The test build ("Push Deck (Build)") wears a badge, like a notification count, so it is never mistaken for the installed app.
BADGE = """<g filter="url(#badgeshadow)"><circle cx="838" cy="190" r="104" fill="#ff9f0a"/></g><circle cx="838" cy="190" r="104" fill="none" stroke="#fff" stroke-width="12"/>
<circle cx="838" cy="190" r="98" fill="url(#badgegloss)"/><text x="838" y="228" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-weight="800" font-size="116" fill="#fff">B</text>"""
BADGE_DEFS = """<filter id="badgeshadow" x="-40%" y="-40%" width="180%" height="190%"><feGaussianBlur in="SourceAlpha" stdDeviation="10"/><feOffset dy="10"/><feComponentTransfer><feFuncA type="linear" slope=".5"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="badgegloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>"""
build = full.replace("</defs>", BADGE_DEFS + "</defs>", 1).replace("</svg>", BADGE + "</svg>")

def render(svg, name):
    with tempfile.TemporaryDirectory() as t:
        page = Path(t) / "p.html"; out = Path(t) / "o.png"
        page.write_text(f'<!doctype html><style>html,body{{margin:0;background:transparent}}svg{{display:block;width:1024px;height:1024px}}</style>{svg}')
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1024,1024", "--default-background-color=00000000",
                        f"--screenshot={out}", str(page)], check=True, capture_output=True)
        return Image.open(out).convert("RGBA")

def at(img, n): return img if n == img.width else img.resize((n, n), Image.LANCZOS)

if PKG.exists(): shutil.rmtree(PKG)
(PKG / "AppIcon.iconset").mkdir(parents=True)
M, T, B, MB = render(full, "full"), render(tight, "tight"), render(bleed, "bleed"), render(build, "build")

for n in (16, 32, 128, 256, 512):                                    # the macOS iconset: each size plus its @2x
    at(M, n).save(PKG / "AppIcon.iconset" / f"icon_{n}x{n}.png")
    at(M, n * 2).save(PKG / "AppIcon.iconset" / f"icon_{n}x{n}@2x.png")
subprocess.run(["iconutil", "-c", "icns", str(PKG / "AppIcon.iconset"), "-o", str(PKG / "AppIcon.icns")], check=True)
(PKG / "AppIcon-Build.iconset").mkdir()
for n in (16, 32, 128, 256, 512):
    at(MB, n).save(PKG / "AppIcon-Build.iconset" / f"icon_{n}x{n}.png"); at(MB, n * 2).save(PKG / "AppIcon-Build.iconset" / f"icon_{n}x{n}@2x.png")
subprocess.run(["iconutil", "-c", "icns", str(PKG / "AppIcon-Build.iconset"), "-o", str(PKG / "AppIcon-Build.icns")], check=True)
MB.save(PKG / "icon-build-1024.png")
M.save(PKG / "icon-1024.png")
T.save(PKG / "icon-tile-1024.png")                                  # tile only, transparent corners, no shadow: for slides, README, stores
(PKG / "favicon.svg").write_text(tight)
for n in (16, 32, 48): at(T, n).save(PKG / f"favicon-{n}.png")
at(T, 64).save(PKG / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
at(B, 180).convert("RGB").save(PKG / "apple-touch-icon.png")
at(B, 192).convert("RGB").save(PKG / "icon-192.png"); at(B, 512).convert("RGB").save(PKG / "icon-512.png")

shutil.copy(PKG / "AppIcon.icns", ROOT / "menubar" / "AppIcon.icns")
shutil.copy(PKG / "AppIcon-Build.icns", ROOT / "menubar" / "AppIcon-Build.icns")
shutil.copy(PKG / "favicon.svg", ROOT / "ui" / "public" / "favicon.svg")
shutil.copy(PKG / "favicon-32.png", ROOT / "ui" / "public" / "favicon-32.png")
shutil.copy(PKG / "apple-touch-icon.png", ROOT / "ui" / "public" / "apple-touch-icon.png")
print("icon package in", PKG)
