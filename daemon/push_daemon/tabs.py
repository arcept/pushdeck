"""The active tab of a web browser, for the display's tab widget. Asks the browser through AppleScript, only while a tab widget is on
screen, and never starts a browser that isn't running."""
from urllib.parse import urlparse

from .media.hub_util import osa

SEP = chr(31)
# bundle id -> (application name, scripting dialect)
BROWSERS = {"com.google.Chrome": ("Google Chrome", "chrome"), "com.brave.Browser": ("Brave Browser", "chrome"),
            "com.microsoft.edgemac": ("Microsoft Edge", "chrome"), "company.thebrowser.Browser": ("Arc", "chrome"),
            "com.apple.Safari": ("Safari", "safari")}


def _esc(text):
    return str(text).replace("\\", "\\\\").replace('"', '\\"')


async def active_tab(bundle):
    """{"title", "host", "url", "loading", "secure"} of the front window's active tab, or None (not running, no window, no permission)."""
    app, kind = BROWSERS.get(bundle, (None, None))
    if not app:
        return None
    t, u = ("title of active tab of front window", "URL of active tab of front window") if kind == "chrome" else \
           ("name of current tab of front window", "URL of current tab of front window")
    ld = "loading of active tab of front window" if kind == "chrome" else "false"
    script = (f'if application "{app}" is running then\ntell application "{app}"\ntry\nreturn ({t}) & (ASCII character 31) & ({u}) & (ASCII character 31) & ({ld})\n'
              f'on error\nreturn ""\nend try\nend tell\nelse\nreturn ""\nend if')
    try:
        out = (await osa(script, 3.0)).strip()
    except Exception:  # noqa: BLE001
        return None
    title, _, rest = out.partition(SEP)
    url, _, loading = rest.partition(SEP)
    if not title and not url:
        return None
    host = (urlparse(url).netloc or "").removeprefix("www.")
    return {"title": title.strip(), "host": host, "url": url.strip(), "loading": loading.strip().lower() == "true", "secure": url.startswith("https://")}


async def reload(bundle):
    app, kind = BROWSERS.get(bundle, (None, None))
    if app:
        await osa(f'tell application "{app}" to {"reload active tab of front window" if kind == "chrome" else "set URL of current tab of front window to (URL of current tab of front window)"}', 3.0)


async def open_url(bundle, url):
    """Go to the tab that has exactly this address (any window) and bring its window forward; if there is none, open it in a new tab."""
    app, kind = BROWSERS.get(bundle, (None, None))
    if not app or not url:
        return
    u = _esc(url)
    if kind == "chrome":
        pick = "set active tab index of w to ti\nset index of w to 1"
        new = f'if (count of windows) = 0 then make new window\ntell front window to make new tab with properties {{URL:"{u}"}}'
    else:
        pick = "set current tab of w to tab ti of w\nset index of w to 1"
        new = f'if (count of windows) = 0 then make new document\ntell front window to set current tab to (make new tab with properties {{URL:"{u}"}})'
    script = (f'tell application "{app}"\nactivate\nset found to false\nrepeat with wi from 1 to (count of windows)\nset w to window wi\n'
              f'repeat with ti from 1 to (count of tabs of w)\nif (URL of tab ti of w) is "{u}" then\n{pick}\nset found to true\nexit repeat\nend if\nend repeat\n'
              f'if found then exit repeat\nend repeat\nif not found then\n{new}\nend if\nend tell')
    await osa(script, 6.0)
