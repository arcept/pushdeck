"""Look up an installed Mac app by bundle id: its display name and icon (PNG), cached in memory."""
_cache: dict = {}


def _icon_png(path: str, px: int = 128):
    """An app's icon as a small PNG. Drawn straight into a px x px bitmap: asking the icon for its TIFF would decode every size it has
    (up to 1024 px, several MB each) and PyObjC would keep them all, which grew the daemon by about 40 MB per app."""
    import objc
    from AppKit import (NSBitmapImageRep, NSCompositingOperationSourceOver, NSDeviceRGBColorSpace, NSGraphicsContext, NSPNGFileType, NSWorkspace)
    with objc.autorelease_pool():
        img = NSWorkspace.sharedWorkspace().iconForFile_(path)
        rep = NSBitmapImageRep.alloc().initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel_(
            None, px, px, 8, 4, True, False, NSDeviceRGBColorSpace, 0, 0)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.setCurrentContext_(NSGraphicsContext.graphicsContextWithBitmapImageRep_(rep))
        img.drawInRect_fromRect_operation_fraction_(((0, 0), (px, px)), ((0, 0), img.size()), NSCompositingOperationSourceOver, 1.0)
        NSGraphicsContext.restoreGraphicsState()
        return bytes(rep.representationUsingType_properties_(NSPNGFileType, None))


def glyph_png(name: str, accent: str, px: int = 128):
    """A profile's abstract glyph as a PNG: the same tile the browser draws (display/glyphs.json is shared with it). SVG is rendered by AppKit."""
    import json
    import objc
    from pathlib import Path
    from AppKit import (NSBitmapImageRep, NSCompositingOperationSourceOver, NSDeviceRGBColorSpace, NSGraphicsContext, NSImage, NSPNGFileType)
    from Foundation import NSData
    glyphs = json.loads((Path(__file__).parent / "display" / "glyphs.json").read_text())
    n = int((accent or "#d97757").lstrip("#").ljust(6, "0")[:6], 16)
    tile = "#" + "".join(f"{round(v * 0.16 + b * 0.84):02x}" for v, b in zip((n >> 16, (n >> 8) & 255, n & 255), (0x14, 0x15, 0x1a)))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="{px}" height="{px}"><rect width="128" height="128" rx="36" fill="{tile}"/>'
           f'<g transform="translate(24.3 24.3) scale(3.31)" fill="{accent}" color="{accent}">{glyphs.get(name, glyphs["orbit"])}</g></svg>').encode()
    with objc.autorelease_pool():
        img = NSImage.alloc().initWithData_(NSData.dataWithBytes_length_(svg, len(svg)))
        rep = NSBitmapImageRep.alloc().initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel_(
            None, px, px, 8, 4, True, False, NSDeviceRGBColorSpace, 0, 0)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.setCurrentContext_(NSGraphicsContext.graphicsContextWithBitmapImageRep_(rep))
        img.drawInRect_fromRect_operation_fraction_(((0, 0), (px, px)), ((0, 0), img.size()), NSCompositingOperationSourceOver, 1.0)
        NSGraphicsContext.restoreGraphicsState()
        return bytes(rep.representationUsingType_properties_(NSPNGFileType, None))


def info(bundle: str) -> dict:
    """{"name": str, "icon": bytes | None}. Falls back to the bundle id's last part when the app isn't installed."""
    if bundle in _cache:
        return _cache[bundle]
    fallback = bundle.split(".")[-1] if bundle else ""
    out = {"name": fallback, "icon": None, "installed": False}
    try:
        from AppKit import NSWorkspace
        ws = NSWorkspace.sharedWorkspace()
        url = ws.URLForApplicationWithBundleIdentifier_(bundle)
        if url is not None:
            path = str(url.path())
            name = path.rsplit("/", 1)[-1]
            out["name"] = name[:-4] if name.endswith(".app") else name
            out["installed"] = True
            out["icon"] = _icon_png(path)
    except Exception:  # noqa: BLE001
        pass
    _cache[bundle] = out
    return out


def exists(name: str) -> bool:
    """Would `open -a <name>` find an app? Same lookup Launch Services does for a name."""
    if not name.strip():
        return False
    try:
        from AppKit import NSWorkspace
        return NSWorkspace.sharedWorkspace().fullPathForApplication_(name.strip()) is not None
    except Exception:  # noqa: BLE001
        return True  # can't tell: don't claim it is wrong


def icon_png(bundle: str = "", path: str = ""):
    """PNG bytes of an app's icon, by bundle id or by .app path. None when it can't be found."""
    if path:
        key = "path:" + path
        if key not in _cache:
            out = None
            try:
                out = _icon_png(path)
            except Exception:  # noqa: BLE001
                pass
            _cache[key] = {"icon": out}
        return _cache[key]["icon"]
    return info(bundle)["icon"] if bundle else None
