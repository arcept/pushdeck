#!/usr/bin/env python3
"""Claude Code status line tap for the Push 2 app.

Claude Code runs this after each API response and passes session JSON on stdin.
We copy the plan rate limits (5-hour and 7-day windows) into ~/.claude/push_usage.json so the
Push app can read them without polling anything or using any tokens. Local only, no network, no credentials.
Never raises: a status line must not break Claude Code.
"""
import json
import os
import sys
import tempfile
import time

OUT = os.environ.get("PUSH_USAGE_FILE", os.path.expanduser("~/.claude/push_usage.json"))
WINDOWS = ("five_hour", "seven_day")


def load(path):
    try:
        with open(path) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save(path, data):
    d = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".push_usage.", suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)                      # atomic: the Push app never reads a half-written file


def pct(w):
    try:
        return f"{float(w['used_percentage']):.0f}%"
    except Exception:
        return "--"


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}
    state = load(OUT)
    limits = payload.get("rate_limits") if isinstance(payload, dict) else None
    if isinstance(limits, dict):
        changed = False
        for key in WINDOWS:
            w = limits.get(key)
            if isinstance(w, dict) and "used_percentage" in w:
                state[key] = {"used_percentage": w.get("used_percentage"), "resets_at": w.get("resets_at")}
                changed = True
        if changed:
            state["updated_at"] = int(time.time())
            state["session_id"] = payload.get("session_id")
            state["claude_code_version"] = payload.get("version")
            try:
                save(OUT, state)
            except Exception:
                pass
    if any(k in state for k in WINDOWS):
        print(f"5h {pct(state.get('five_hour', {}))} · wk {pct(state.get('seven_day', {}))}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
