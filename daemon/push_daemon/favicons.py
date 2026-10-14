"""Site icons for the browser widget. Fetched once per site straight from the site itself (/favicon.ico, else the icon its home page names),
the same address the browser already asked, and kept as 64 px PNGs in the app's data folder. No third party is asked."""
import asyncio
import io
import re
import sqlite3
import time
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlparse

from PIL import Image

from .registry import DATA

FOLDER = DATA / "favicons3"      # (older folders hold icons picked by an earlier, worse rule; they are not reused)
RETRY = 6 * 3600          # a site that gave no icon is not asked again for this long
UA = {"User-Agent": "Mozilla/5.0 (Macintosh) PushDeck"}
TAG = re.compile(r"<link\b[^>]*>", re.I)
ATTR = re.compile(r"""([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.I)


def origin(url):
    p = urlparse(url or "")
    return f"{p.scheme}://{p.netloc}" if p.scheme in ("http", "https") and p.netloc else ""


def _get(url, limit=600_000):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=4) as r:
        return r.read(limit)


def _svg_png(data):
    """Draw an SVG into a transparent 128 px picture with the system's own renderer (AppKit); None when it cannot."""
    try:
        from AppKit import NSBitmapImageRep, NSCalibratedRGBColorSpace, NSGraphicsContext, NSImage, NSMakeRect, NSPNGFileType, NSCompositingOperationSourceOver
        img = NSImage.alloc().initWithData_(data)
        if img is None or img.size().width <= 0:
            return None
        n = 128
        rep = NSBitmapImageRep.alloc().initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel_(None, n, n, 8, 4, True, False, NSCalibratedRGBColorSpace, 0, 0)
        ctx = NSGraphicsContext.graphicsContextWithBitmapImageRep_(rep)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.setCurrentContext_(ctx)
        img.drawInRect_fromRect_operation_fraction_(NSMakeRect(0, 0, n, n), NSMakeRect(0, 0, 0, 0), NSCompositingOperationSourceOver, 1.0)
        NSGraphicsContext.restoreGraphicsState()
        return bytes(rep.representationUsingType_properties_(NSPNGFileType, {}))
    except Exception:  # noqa: BLE001
        return None


def _image(data):
    """A 64 px square PNG filled by the icon (an SVG is drawn first), or raises when the bytes are not a picture."""
    if data.lstrip()[:5] in (b"<?xml", b"<svg ", b"<svg\n") or b"<svg" in data[:400]:
        data = _svg_png(data) or b""
    im = Image.open(io.BytesIO(data))
    if getattr(im, "n_frames", 1) > 1 and im.format == "ICO":     # the biggest picture inside an .ico
        sizes = im.ico.sizes()
        im.size = max(sizes)
    im = im.convert("RGBA")
    box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()      # drop the empty margin some icons carry
    if box:
        im = im.crop(box)
    k = 64 / max(im.size)                                   # fill the 64 px square: small icons (16 px) are scaled up, not left tiny in it
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    out.paste(im, ((64 - im.width) // 2, (64 - im.height) // 2))
    buf = io.BytesIO()
    out.save(buf, "PNG")
    return buf.getvalue()


def _candidates(html, base):
    """The icons a page names, best first: an SVG, then the largest picture, apple-touch icons last of the named ones."""
    found = []
    for tag in TAG.findall(html):
        at = {m.group(1).lower(): (m.group(2) if m.group(2) is not None else m.group(3)) for m in ATTR.finditer(tag)}
        rel, href = (at.get("rel") or "").lower(), at.get("href")
        if not href or "icon" not in rel or "mask" in rel:
            continue
        sizes = re.findall(r"(\d+)x\d+", at.get("sizes") or "")
        size = max((int(x) for x in sizes), default=0)
        svg = "svg" in (at.get("type") or "") or href.split("?")[0].lower().endswith(".svg")
        found.append((0 if svg else 1, 1 if "apple" in rel else 0, -size, urljoin(base, href)))
    return [u for *_, u in sorted(found)]


def fetch(org):
    """PNG bytes of the site's icon, or None: the icons its home page names first (as the browser would pick), then /favicon.ico."""
    urls = []
    try:
        urls += _candidates(_get(org + "/").decode("utf-8", "ignore"), org + "/")
    except Exception:  # noqa: BLE001
        pass
    urls.append(org + "/favicon.ico")
    for u in urls:
        try:
            return _image(_get(u))
        except Exception:  # noqa: BLE001
            continue
    return chrome_icon(org)


CHROME = Path.home() / "Library/Application Support/Google/Chrome"


def chrome_icon(org):
    """The biggest icon Chrome itself saved for a page on this site (its Favicons files, opened read-only), for sites that turn our fetch away."""
    best = None
    for db in CHROME.glob("*/Favicons"):
        try:
            con = sqlite3.connect(f"file:{db}?mode=ro&immutable=1", uri=True, timeout=1)
            try:
                row = con.execute("select b.image_data, b.width from icon_mapping m join favicon_bitmaps b on b.icon_id=m.icon_id "
                                  "where m.page_url like ? and length(b.image_data) > 0 order by b.width desc limit 1", (org + "/%",)).fetchone()
            finally:
                con.close()
            if row and (best is None or row[1] > best[1]):
                best = row
        except Exception:  # noqa: BLE001
            continue
    if best:
        try:
            return _image(bytes(best[0]))
        except Exception:  # noqa: BLE001
            pass
    return None


class Favicons:
    def __init__(self):
        self.failed = {}          # origin -> when it last failed
        self.busy = set()

    @staticmethod
    def key(org):
        return "fav-" + re.sub(r"[^a-z0-9.]+", "_", org.split("://", 1)[-1].lower())

    def get(self, eng, org):
        """The icon cache key for a site, or '' while it is not there yet (a fetch starts in the background)."""
        if not org:
            return ""
        key, cache = self.key(org), eng.media.icon_cache
        if key in cache:
            return key
        path = FOLDER / (key + ".png")
        if path.exists():
            self._load(eng, key, path.read_bytes())
            return key
        if org not in self.busy and time.time() - self.failed.get(org, 0) > RETRY:
            self.busy.add(org)
            asyncio.ensure_future(self._fetch(eng, org, key, path))
        return ""

    def _load(self, eng, key, png):
        eng.media.icon_cache[key] = (png, Image.open(io.BytesIO(png)).convert("RGBA"))

    async def _fetch(self, eng, org, key, path):
        try:
            png = await asyncio.get_event_loop().run_in_executor(None, fetch, org)
            if png:
                FOLDER.mkdir(parents=True, exist_ok=True)
                path.write_bytes(png)
                self._load(eng, key, png)
                eng._leds_for = None
            else:
                self.failed[org] = time.time()
        finally:
            self.busy.discard(org)
