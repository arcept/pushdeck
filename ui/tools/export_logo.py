import subprocess, sys
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "design" / "exports"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FPS, DUR, K = 25, 5.6, 4          # frames per second, loop length (s), scale
N = int(round(FPS * DUR))
TW, TH, COLS = 230 * K, 48 * K, 4
ROWS = (N + COLS - 1) // COLS
font = (ROOT / "design/fonts/Quicksand-VF.ttf").as_uri()
html = f'''<!doctype html><meta charset="utf-8"><style>
@font-face {{ font-family:Quicksand; src:url("{font}"); font-weight:300 700; }}
:root {{ --tx:#eeeef3; --ease:cubic-bezier(.16,1,.3,1); }}
html,body {{ margin:0; background:transparent; }}
#sheet {{ display:grid; grid-template-columns:repeat({COLS},{TW}px); grid-auto-rows:{TH}px; }}
.tile {{ width:{TW}px; height:{TH}px; overflow:hidden; position:relative; }}
.brand {{ position:absolute; left:{10*K}px; top:{9*K}px; transform:scale({K}); transform-origin:0 0; display:flex; align-items:center; gap:14px;
  font:700 17px/1 Quicksand, sans-serif; letter-spacing:-.01em; color:var(--tx); white-space:nowrap; }}
.mark {{ width:30px; height:30px; display:grid; grid-template-columns:repeat(3,1fr); gap:3px; }}
.mark i {{ background:var(--tx); opacity:.16; border-radius:3px; animation:padwave {DUR}s var(--ease) infinite; animation-delay:calc(var(--i) * .18s); }}
.mark i:nth-child(5) {{ opacity:.9; animation-name:padcore; }}
@keyframes padwave {{ 0%,100% {{ opacity:.16; box-shadow:none; }} 12% {{ opacity:.95; box-shadow:0 0 8px rgba(255,255,255,.22); }} 30% {{ opacity:.16; box-shadow:none; }} }}
@keyframes padcore {{ 0%,100% {{ opacity:.9; }} 12% {{ opacity:1; box-shadow:0 0 10px rgba(255,255,255,.28); }} 40% {{ opacity:.75; }} }}
</style><div id="sheet"></div><script>
const N={N}, DUR={DUR*1000};
const sheet=document.getElementById('sheet');
for(let f=0; f<N; f++) {{
  const t=f*DUR/N, tile=document.createElement('div'); tile.className='tile';
  tile.innerHTML='<div class="brand"><span class="mark">'+Array.from({{length:9}},(_,i)=>'<i style="--i:'+((i%3)+Math.floor(i/3))+'"></i>').join('')+'</span><span>Push Deck</span></div>';
  sheet.appendChild(tile);
}}
document.fonts.ready.then(()=>requestAnimationFrame(()=>{{
  const tiles=[...document.querySelectorAll('.tile')];
  tiles.forEach((tile,f)=>{{
    const t=f*DUR/N;
    tile.querySelectorAll('.mark i').forEach((el,i)=>{{
      const d=((i%3)+Math.floor(i/3))*180, a=el.getAnimations()[0];
      a.pause(); a.currentTime = d + ((((t-d)%DUR)+DUR)%DUR);
    }});
  }});
  document.title='ready';
}}));
</script>'''
page = Path("/tmp/logo_sheet.html"); page.write_text(html)
sheet = Path("/tmp/logo_sheet.png")
subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={TW*COLS},{TH*ROWS}", "--default-background-color=00000000",
                "--virtual-time-budget=4000", f"--screenshot={sheet}", str(page)], check=True, capture_output=True)
im = Image.open(sheet).convert("RGBA"); print(im.size, N, "frames")
frames = [im.crop(((f % COLS) * TW, (f // COLS) * TH, (f % COLS) * TW + TW, (f // COLS) * TH + TH)) for f in range(N)]
# crop to the artwork with a small margin
bbox = None
for fr in frames[::10]:
    b = fr.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if b: bbox = b if bbox is None else (min(bbox[0], b[0]), min(bbox[1], b[1]), max(bbox[2], b[2]), max(bbox[3], b[3]))
m = 14 * K
box = (max(0, bbox[0] - m), max(0, bbox[1] - m), min(TW, bbox[2] + m), min(TH, bbox[3] + m)); print("crop", box)
frames = [f.crop(box) for f in frames]
frames[0].save(OUT / "pushdeck-logo-transparent.png", save_all=True, append_images=frames[1:], duration=int(1000 / FPS), loop=0, disposal=1)   # animated PNG with transparency
BG = (16, 16, 18)
def flat(f):
    bg = Image.new("RGB", f.size, BG); bg.paste(f, mask=f.getchannel("A")); return bg
g = [flat(f).resize((f.width * 3 // K, f.height * 3 // K), Image.LANCZOS) for f in frames]
g[0].save(OUT / "pushdeck-logo.gif", save_all=True, append_images=g[1:], duration=int(1000 / FPS), loop=0, optimize=True)
flat(frames[int(0.9 / (DUR / N))]).save(OUT / "pushdeck-logo-still.png")
print("done")
