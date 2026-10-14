#!/usr/bin/env python3
"""Claude Code PreToolUse hook for AskUserQuestion: shows the question on the Push 2 and returns the answers you pick there.

Reads the hook JSON on stdin and hands the questions to the Push Deck daemon (127.0.0.1:8472). If the Push is not connected, the daemon is not
running, you press Close, or 90 seconds pass, it prints nothing and Claude shows its normal question card. Standard library only."""
import json
import sys
import urllib.request

MIRROR = True      # the laptop card always shows too; the Push answer is typed into the prompt (see asks.submit)
if MIRROR:
    sys.exit(0)
try:
    data = json.load(sys.stdin)
    req = urllib.request.Request("http://127.0.0.1:8472/api/ask", method="POST", headers={"Content-Type": "application/json"},
                                 data=json.dumps({"session_id": data.get("session_id"), "tool_use_id": data.get("tool_use_id"), "tool_input": data.get("tool_input"), "wait": 90}).encode())
    res = json.load(urllib.request.urlopen(req, timeout=100))
except Exception:  # noqa: BLE001  (daemon not running, bad input: fall back to the normal card)
    sys.exit(0)
if res.get("status") == "answered":
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow",
                                              "updatedInput": {"questions": (data.get("tool_input") or {}).get("questions", []), "answers": res["answers"]}}}))
