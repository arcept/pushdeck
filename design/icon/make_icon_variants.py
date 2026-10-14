#!/usr/bin/env python3
"""Draws three app-icon directions between the flat 3x3 logo and the glossy cream one: A (closer to our logo), B (midpoint), C (closer to the glossy one).
Writes icon-A/B/C.svg and 1024 px PNGs (Chrome headless), plus a comparison sheet."""
import subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
COLS = [("#bcd4ff", "#8fb3ff", "#3f6fe8"), ("#c9f3ff", "#8fdcff", "#2fb4e6"), ("#d6caff", "#a794ff", "#6a4fe0")]   # face top, face, lip: blue, cyan, violet
PW, PH, GAP, R = 190, 176, 30, 44
X0, Y0 = (1024 - (3 * PW + 2 * GAP)) / 2, 196
GEOM = {"B2": (158, 146, 28, 38)}   # smaller pads with more air around them: pad width, height, gap, corner radius
def geom(kind):
    global PW, PH, GAP, R, X0, Y0
    PW, PH, GAP, R = GEOM.get(kind, (190, 176, 30, 44))
    lip = 22 if kind in GEOM else 14
    X0 = (1024 - (3 * PW + 2 * GAP)) / 2
    Y0 = 512 - (3 * PH + 2 * (GAP + 6) + lip) / 2 if kind in GEOM else 196

def pads(kind):
    out = []
    for r in range(3):
        for c in range(3):
            x, y = X0 + c * (PW + GAP), Y0 + r * (PH + GAP + 6)
            centre = (r, c) == (1, 1)
            if kind == "A":     # flat pads in the logo's white-at-varying-opacity, one lit
                op = [[.30, .55, .30], [.55, 1, .55], [.30, .55, .30]][r][c] if not centre else 1
                fill = "url(#litA)" if centre else "#eeeef3"
                out.append(f'<rect x="{x}" y="{y}" width="{PW}" height="{PH}" rx="{R-8}" fill="{fill}" opacity="{op if not centre else 1}"/>')
                if centre: out.append(f'<rect x="{x}" y="{y}" width="{PW}" height="{PH}" rx="{R-8}" fill="none" stroke="#bff3ff" stroke-opacity=".7" stroke-width="3"/>')
            else:
                top, face, lip = COLS[c]
                dim = 1 if (kind == "C" or centre) else [[.62, .78, .62], [.78, 1, .78], [.62, .78, .62]][r][c]
                if centre: top, face, lip = "#d9fbff", "#8ff0ff", "#17c3e8"
                gl = 22 if kind == "B" else 18
                if centre and kind == "B":   # the centre pad throws light: a blurred cyan copy behind it
                    out.append(f'<rect x="{x-14}" y="{y-6}" width="{PW+28}" height="{PH+34}" rx="{R+14}" fill="#46e4ff" opacity=".9" filter="url(#bloom)"/>')
                if kind == "B":   # the pad stands on the tray floor: a soft contact shadow under it
                    out.append(f'<rect x="{x+4}" y="{y+gl+16}" width="{PW-8}" height="{PH}" rx="{R}" fill="#000" opacity=".6" filter="url(#padshadow)"/>')
                out.append(f'<g opacity="{dim}"><rect x="{x}" y="{y+gl}" width="{PW}" height="{PH}" rx="{R}" fill="{lip}"/>'
                           f'<rect x="{x}" y="{y}" width="{PW}" height="{PH}" rx="{R}" fill="url(#f{c}{"c" if centre else ""}{kind})"/>'
                           f'<rect x="{x+10}" y="{y+8}" width="{PW-20}" height="{PH*0.42}" rx="{R-14}" fill="url(#gloss)" opacity="{.55 if kind=="B" else .8}"/>'
                           + (f'<rect x="{x+1.5}" y="{y+1.5}" width="{PW-3}" height="{PH-3}" rx="{R-1}" fill="none" stroke="url(#edge)" stroke-width="3"/><rect x="{x}" y="{y+PH-26}" width="{PW}" height="{26+gl}" rx="{R}" fill="url(#lipshade)" opacity=".5"/>' if kind == "B" else "") + '</g>')
    return "".join(out)

def grads(kind):
    g = ""
    for c, (top, face, lip) in enumerate(COLS):
        g += f'<linearGradient id="f{c}{kind}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{face}"/></linearGradient>'
    g += f'<linearGradient id="f1c{kind}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3fcff"/><stop offset="1" stop-color="#8ff0ff"/></linearGradient>'
    g += '<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
    g += '<linearGradient id="litA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9fbff"/><stop offset="1" stop-color="#7fe7ff"/></linearGradient>'
    return g

def icon(kind):
    geom(kind); kind0, kind = kind, kind[0]
    if kind == "C":
        body = ("#f6f2ea", "#ddd6c8"); tray = ("#e6dfd1", "#f7f3ea"); rim = "#ffffff"; tray_stroke = "#cfc7b6"
    elif kind == "B":
        body = ("#383a42", "#17181c"); tray = ("#0d0e11", "#1d1e23"); rim = "#ffffff"; tray_stroke = "#000000"
    else:
        body = ("#26272c", "#16171a"); tray = ("#101114", "#101114"); rim = "#ffffff"; tray_stroke = "#000000"
    glow = '' if kind == "C" else f'<circle cx="512" cy="{Y0 + PH + GAP + 6 + PH/2 + 8}" r="{330 if kind=="B" else 230}" fill="url(#halo)" opacity="{1 if kind=="B" else .5}"/>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{body[0]}"/><stop offset="1" stop-color="{body[1]}"/></linearGradient>
<linearGradient id="tray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{tray[0]}"/><stop offset="1" stop-color="{tray[1]}"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{rim}" stop-opacity="{.55 if kind=="C" else .22}"/><stop offset=".5" stop-color="{rim}" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="{.08 if kind=="C" else .35}"/></linearGradient>
<radialGradient id="halo"><stop offset="0" stop-color="#5fe3ff" stop-opacity=".7"/><stop offset="1" stop-color="#5fe3ff" stop-opacity="0"/></radialGradient>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="22"/><feOffset dy="22"/><feComponentTransfer><feFuncA type="linear" slope=".45"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="lipshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient><linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="trayrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".8"/><stop offset=".5" stop-color="#000" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity=".16"/></linearGradient><filter id="padshadow" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur stdDeviation="14"/></filter><filter id="soft"><feGaussianBlur stdDeviation="14"/></filter><filter id="bloom" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="26"/></filter>
{grads(kind)}</defs>
<g filter="url(#shadow)"><rect x="100" y="100" width="824" height="824" rx="190" fill="url(#body)"/></g>
<rect x="100" y="100" width="824" height="824" rx="190" fill="url(#sheen)" opacity="{0 if kind=="C" else 1}"/>
<rect x="102" y="102" width="820" height="820" rx="188" fill="none" stroke="url(#rim)" stroke-width="4"/>
<rect x="156" y="156" width="712" height="712" rx="132" fill="url(#tray)" stroke="{"url(#trayrim)" if kind=="B" else tray_stroke}" stroke-opacity="{1 if kind=="B" else .35}" stroke-width="{5 if kind=="B" else 3}"/>
<rect x="158" y="158" width="708" height="{200 if kind=="B" else 140}" rx="132" fill="#000" opacity="{0 if kind=="C" else (.45 if kind=="B" else .18)}" filter="url(#soft)"/>
{glow}{pads(kind)}</svg>'''

sheet = Image.new("RGB", (1024 + 2 * 60, 1024 + 200), (232, 232, 236))
d = ImageDraw.Draw(sheet)
try: f = ImageFont.truetype(str(HERE.parents[1] / "design/fonts/IBMPlexSans-VF.ttf"), 44)
except Exception: f = ImageFont.load_default()
labels = {"B": "B  before", "B2": "B2  smaller pads, more padding"}
for i, k in enumerate(["B2"]):
    svg = HERE / f"icon-{k}.svg"; svg.write_text(icon(k))
    with tempfile.TemporaryDirectory() as t:
        page = Path(t) / "p.html"; page.write_text(f'<!doctype html><style>html,body{{margin:0;background:transparent}}</style>{svg.read_text()}')
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1024,1024", "--default-background-color=00000000",
                        f"--screenshot={HERE / f'icon-{k}.png'}", str(page)], check=True, capture_output=True)
    im = Image.open(HERE / f"icon-{k}.png").convert("RGBA")
    sheet.paste(im, (60 + i * (1024 + 60), 60), im)
    d.text((60 + i * (1024 + 60), 1024 + 90), labels[k], fill=(40, 40, 46), font=f)
sheet.save(HERE / "icon-options.png"); print("ok")
