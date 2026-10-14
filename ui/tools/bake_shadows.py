#!/usr/bin/env python3
"""Bakes the soft shadows of src/assets/push2.svg into src/assets/shadows.png.

The live SVG filters on 141 shadow uses cost the app's web view well over 100 MB of graphics memory. The shadows never change, so they are
drawn once here (with Chrome headless, which renders the SVG filters) and shown as a single image. The two cable shadows stay live because
the USB cable moves. Run again after editing the shadows in push2.svg:   python3 ui/tools/bake_shadows.py [scale]   (default scale 2)
"""
import re, subprocess, sys, tempfile
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / "src" / "assets"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 2
TX, TY, S = -33.803, 12.366, 1.042253521                 # the device-space transform of push2.svg
X0, Y0, W, H = (0 - TX) / S, (0 - TY) / S, 1600 / S, 1500 / S   # the area of the file's 1600 x 1500 canvas, in device-space units

svg = (ASSETS / "push2.svg").read_text()
USE = re.compile(r'<use [^>]*filter="url\(#(?:button|pad-inner|knob|body)-shadow\)"[^>]*/>')
uses = USE.findall(svg)
ids = {m for u in uses for m in re.findall(r'href="#([^"]+)"', u)}

def element(i):   # the full source of the element with this id (it is a self-closing tag or has children)
    m = re.search(r'<(\w+)\b[^>]*\bid="%s"[^>]*?(/>|>)' % re.escape(i), svg)
    assert m, i
    if m.group(2) == "/>":
        return m.group(0)
    tag, depth, pos = m.group(1), 1, m.end()
    for t in re.finditer(r'<(/?)%s\b[^>]*?(/?)>' % tag, svg[pos:]):
        depth += -1 if t.group(1) else (0 if t.group(2) else 1)
        if depth == 0:
            return svg[m.start():pos + t.end()]
    raise ValueError(i)

defs = re.search(r"<defs>.*?</defs>", svg, re.S).group(0)
body = "".join(element(i) for i in sorted(ids))
doc = f'''<!doctype html><meta charset="utf-8"><style>html,body{{margin:0;background:transparent}}</style>
<svg xmlns="http://www.w3.org/2000/svg" width="{W:.2f}" height="{H:.2f}" viewBox="{X0:.3f} {Y0:.3f} {W:.3f} {H:.3f}">
{defs[:-7]}<g id="src" display="none">{body}</g></defs>
<g id="shadows">{"".join(uses)}</g></svg>'''
# <use> of an element inside a display:none group renders in Chrome only if it is not itself hidden: put the sources in defs instead
doc = doc.replace('<g id="src" display="none">', "<g>")
with tempfile.TemporaryDirectory() as d:
    page = Path(d) / "shadows.html"; page.write_text(doc)
    out = ASSETS / "shadows.png"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--force-device-scale-factor={SCALE}",
                    f"--window-size={int(W + 1)},{int(H + 1)}", "--default-background-color=00000000", f"--screenshot={out}", str(page)], check=True, capture_output=True)
print("wrote", out, f"({len(uses)} shadows, area {X0:.1f} {Y0:.1f} {W:.1f} {H:.1f})")
