"""Checks that the YouTube Music script finds the page's client key wherever YouTube keeps it (needs node).
Usage: PYTHONPATH=daemon .venv/bin/python tools/test_ytm_config.py
Run it when YouTube Music stops loading playlists: it tells you which layouts the script still understands. The sample pages are made up."""
import json
import subprocess
import sys

from push_daemon.media import ytm

KEY, VER = "AIzaFAKEKEY", "1.20260101.00.00"
HTML = '<html><script>ytcfg.set({"INNERTUBE_API_KEY":"%s","INNERTUBE_CLIENT_VERSION":"%s"})</script></html>' % (KEY, VER)

CASES = {
    "window.ytcfg": ("{ytcfg:{get:function(k){return {INNERTUBE_API_KEY:'%s',INNERTUBE_CLIENT_VERSION:'%s'}[k]}}}" % (KEY, VER), "", ("ytcfg", KEY, VER)),
    "window.yt.config_": ("{yt:{config_:{INNERTUBE_API_KEY:'%s',INNERTUBE_CLIENT_VERSION:'%s'}}}" % (KEY, VER), "", ("yt.config_", KEY, VER)),
    "page html only (what YouTube Music does now)": ("{}", HTML, ("page html", KEY, VER)),
    "nothing anywhere": ("{}", "<html></html>", (None, None, None)),
}


def run(window: str, html: str) -> tuple:
    js = ("var window=%s;var document={documentElement:{innerHTML:%s}};console.log(JSON.stringify(%s))"
          % (window, json.dumps(html), ytm.CFG_JS))
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, timeout=20)
    if out.returncode:
        raise RuntimeError(out.stderr)
    r = json.loads(out.stdout)
    return r.get("from"), r.get("key"), r.get("ver")


bad = 0
for name, (window, html, want) in CASES.items():
    got = run(window, html)
    print(("ok   " if got == want else "FAIL ") + name + ("" if got == want else f"  got {got}, wanted {want}"))
    bad += got != want
sys.exit(1 if bad else 0)
