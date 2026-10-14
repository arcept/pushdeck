"""What Claude Code is doing right now, for the Claude session widget. Reads only files Claude writes locally; nothing is sent anywhere.

~/.claude/sessions/<pid>.json   one per running session: its chat title, status (busy / idle), working folder, which app started it.
~/.claude/projects/*/<id>.jsonl the session's transcript: the newest entries say which tool it is using, what it last said, its task list.
"""
import calendar
import json
import os
import time
from pathlib import Path

HOME = Path.home() / ".claude"
FOLLOW = ["busy", "front", "recent"]                 # the session the widget follows: the one working, the one in front, the latest
FOLLOW_LABEL = {"busy": "Busy", "front": "Front", "recent": "Latest"}
DESKTOP = "com.anthropic.claudefordesktop"
_cache: dict = {}
_paths: dict = {}


def _alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except (OSError, ValueError, TypeError):
        return False


def sessions():
    out = []
    for f in (HOME / "sessions").glob("*.json"):
        try:
            d = json.loads(f.read_text())
        except (OSError, ValueError):
            continue
        if isinstance(d, dict) and d.get("sessionId") and _alive(d.get("pid")):
            out.append(d)
    return out


def pick(follow, front, items):
    """The session to show: busy = one that is working (else the latest); front = one started by the app in front; recent = the latest."""
    if not items:
        return None
    latest = lambda xs: max(xs, key=lambda s: s.get("updatedAt") or 0)   # noqa: E731
    if follow == "busy":
        busy = [s for s in items if s.get("status") == "busy"]
        return latest(busy or items)
    if follow == "front":
        same = [s for s in items if (s.get("entrypoint") == "claude-desktop") == (front == DESKTOP)]
        return latest(same or items)
    return latest(items)


def _tail(path, size=300_000):
    with open(path, "rb") as f:
        f.seek(0, os.SEEK_END)
        n = f.tell()
        f.seek(max(0, n - size))
        return f.read().decode("utf-8", "ignore")


def _transcript(sid):
    p = _paths.get(sid)
    if not p or not p.exists():
        hits = list((HOME / "projects").glob(f"*/{sid}.jsonl"))
        p = _paths[sid] = hits[0] if hits else None
    return p


def _name(path):
    return os.path.basename(str(path or "").rstrip("/")) if path else ""


_PROGS = {"python": "Python", "python3": "Python 3", "node": "Node", "npm": "npm", "npx": "npx", "git": "git", "sed": "sed", "grep": "grep", "rg": "grep", "cat": "cat", "ls": "ls",
          "curl": "curl", "pkill": "pkill", "pip": "pip", "swift": "Swift", "make": "make", "cargo": "Cargo", "rsync": "rsync", "tsc": "TypeScript"}


def _command(cmd):
    """A shell command in plain words: the program it runs (skipping cd, env vars, sudo, paths)."""
    import shlex
    try:
        words = shlex.split(str(cmd or ""))
    except ValueError:
        words = str(cmd or "").split()
    skip = False
    for w in words:
        if skip:
            skip = False
        elif w in ("cd", "export", "source"):
            skip = w == "cd"
        elif w in ("&&", ";", "|", "||", "sudo", "time", "nohup", "env", "bash", "zsh", "sh", "-c", "(") or "=" in w.split("/")[0] or w.startswith("-"):
            continue
        else:
            name = os.path.basename(w).strip("();")
            if not name:
                continue
            return "Running " + _PROGS.get(name, name)
    return "Running a command"


def _action(name, inp):
    """A tool call in the app's own plain words (the same ones Claude's chat shows), without file names or command details."""
    if name in ("Edit", "MultiEdit", "NotebookEdit", "Write"):
        return "Editing a file"
    if name == "Read":
        return "Reading a file"
    if name in ("Bash", "BashOutput", "KillShell"):
        return "Running a command"
    if name in ("Grep", "Glob", "LS"):
        return "Searching files"
    if name in ("WebFetch", "WebSearch"):
        return "Searching the web"
    if name in ("Task", "Agent"):
        return "Running a sub-agent"
    if name == "TodoWrite":
        return "Updating tasks"
    if name == "AskUserQuestion":
        return "Asking you a question"
    if name.startswith("mcp__"):
        return "Using " + name.split("__")[-1].replace("_", " ")
    return f"Using {name}"


_was_busy, _done_at = {}, {}   # per session: was it busy at the last look; when it last finished


def _kind(name):
    """What the newest tool call means for the widget's little worker: which prop it holds."""
    if name in ("Read", "Grep", "Glob", "WebFetch", "WebSearch", "LS") or name.startswith("mcp__") and ("search" in name or "read" in name or "get" in name):
        return "read"
    if name in ("Edit", "MultiEdit", "Write", "NotebookEdit"):
        return "edit"
    if name in ("Bash", "BashOutput", "KillShell"):
        return "run"
    if name in ("TodoWrite", "ExitPlanMode", "EnterPlanMode", "AskUserQuestion"):
        return "plan"
    if name in ("Task", "Agent"):
        return "agent"
    return "think"


def _ask_of(x):
    """An AskUserQuestion call as plain data (up to 4 questions, each with its options)."""
    qs = []
    for q in ((x.get("input") or {}).get("questions") or [])[:4]:
        if not isinstance(q, dict):
            continue
        opts = [{"label": str(o.get("label", "")), "description": str(o.get("description", ""))} for o in q.get("options") or [] if isinstance(o, dict)]
        qs.append({"question": str(q.get("question", "")), "header": str(q.get("header", "")), "multi": bool(q.get("multiSelect")), "options": opts})
    return {"id": x.get("id"), "questions": qs} if qs else None


ASKS = {}   # session id -> the question card it is waiting on


def _read(path):
    """From the end of the transcript: what it is doing, its last words, its task list, how long since your last message."""
    action = reply = ""
    todos = None
    todos_now = False             # the task list was written during this turn
    steps, seen = 0, set()        # tools used this turn
    pending = {}                  # tool_use id -> action, until its result arrives
    activity, agents = "", 0      # the newest tool's kind; sub-agents started this turn that have not answered yet
    asked_at = None
    ask = None                    # a question card waiting for an answer: {id, questions: [{question, header, multi, options: [{label, description}]}]}
    step_at = None                # when the newest tool call of this turn started
    phase, ctx = "", 0            # what the newest entry says it is doing; tokens in the context at the last answer
    for line in reversed(_tail(path).splitlines()):
        if asked_at is not None and reply and todos is not None:
            break
        try:
            r = json.loads(line)
        except ValueError:
            continue
        t, msg = r.get("type"), r.get("message") or {}
        content = msg.get("content")
        if t == "user":
            if isinstance(content, list) and any(isinstance(x, dict) and x.get("type") == "tool_result" for x in content):
                phase = phase or "result"
                for x in content:
                    if isinstance(x, dict) and x.get("type") == "tool_result":
                        pending.setdefault(x.get("tool_use_id"), None)   # answered: no longer "doing" it
                continue
            if not r.get("isMeta") and (isinstance(content, str) or any(isinstance(x, dict) and x.get("type") == "text" for x in content or [])):
                try:
                    asked_at = calendar.timegm(time.strptime(r["timestamp"][:19], "%Y-%m-%dT%H:%M:%S"))
                except (KeyError, ValueError):
                    pass
                asked_at = asked_at or 0.0   # the turn starts here; earlier entries only supply the last words and the task list
                continue
        elif t == "assistant" and isinstance(content, list):
            u = msg.get("usage") or {}
            ctx = ctx or u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
            for x in reversed(content):
                if not isinstance(x, dict):
                    continue
                if asked_at is None and not phase and x.get("type") in ("text", "thinking"):
                    phase = "reply" if x["type"] == "text" else "think"
                if x.get("type") == "tool_use":
                    if asked_at is None and x.get("name") == "AskUserQuestion" and x.get("id") not in pending and ask is None:
                        ask = _ask_of(x)
                    if asked_at is None and not action:
                        phase = phase or "tool"
                        action = _action(x.get("name") or "", x.get("input"))
                        try:
                            step_at = calendar.timegm(time.strptime(r["timestamp"][:19], "%Y-%m-%dT%H:%M:%S"))
                        except (KeyError, ValueError):
                            step_at = None
                    if asked_at is None and not activity and x.get("id") not in pending:
                        activity = _kind(x.get("name") or "")
                    if asked_at is None and x.get("name") in ("Task", "Agent") and x.get("id") not in pending:
                        agents += 1
                    if asked_at is None and x.get("id") not in seen:
                        seen.add(x.get("id"))
                        steps += 1
                    if x.get("name") == "TodoWrite" and todos is None:
                        todos = (x.get("input") or {}).get("todos")
                        todos_now = asked_at is None
                elif x.get("type") == "text" and not reply and (x.get("text") or "").strip():
                    reply = " ".join(x["text"].split())[:800]   # the whole last message on one line; the widget wraps it
    out = {"action": action, "reply": reply, "asked_at": asked_at, "steps": steps, "activity": activity or "think", "agents": min(agents, 4), "phase": phase, "ctx": ctx, "step_at": step_at, "ask": ask}
    if isinstance(todos, list) and todos:
        done = sum(1 for x in todos if isinstance(x, dict) and x.get("status") == "completed")
        active = next((x for x in todos if isinstance(x, dict) and x.get("status") == "in_progress"), None)
        out.update(todo_done=done, todo_total=len(todos), todo_active=(active or {}).get("activeForm") or (active or {}).get("content") or "",
                   todo_states="".join("c" if (x or {}).get("status") == "completed" else "a" if (x or {}).get("status") == "in_progress" else "p" for x in todos),
                   todo_live=todos_now or done < len(todos))   # a finished list from an earlier turn says nothing about this one
    return out


def _since(secs):
    secs = int(max(0, secs))
    return f"{secs}s" if secs < 60 else f"{secs // 60}m" if secs < 3600 else f"{secs // 3600}h {secs % 3600 // 60:02d}m"


def snapshot(follow, front):
    """The widget's data: {title, state, action, reply, elapsed, todo_done, todo_total, todo_active}. Cached for 1.5 s."""
    key = (follow, front)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < 1.5:
        return hit[1]
    try:
        s = pick(follow, front, sessions())
        if not s:
            val = {"title": "No Claude session", "state": "none", "action": "", "reply": "Start Claude Code to see it here", "elapsed": ""}
        else:
            busy = s.get("status") == "busy"
            sid, now = s["sessionId"], time.time()
            if _was_busy.get(sid) and not busy:        # it just finished a task: the widget celebrates for a few seconds
                _done_at[sid] = now
            _was_busy[sid] = busy
            d = {}
            p = _transcript(s["sessionId"])
            if p:
                d = _read(p)
            quiet = time.time() - p.stat().st_mtime if p else 0
            ph = d.get("phase", "")
            if busy and ph in ("reply", "think", "result") and quiet > 20 and d.get("ctx", 0) > 140000:
                label, act = "Compacting session", "compact"   # nothing is written while it compacts: a long silence with a nearly full context
            else:
                label = d.get("action") or "Thinking"
                act = d.get("activity", "think")
            val = {"title": s.get("name") or _name(s.get("cwd")) or "Claude", "state": "working" if busy else "idle",
                   "action": label if busy else "", "reply": d.get("reply", ""),
                   "elapsed": _since(time.time() - d["asked_at"]) if busy and d.get("asked_at") else ""}
            val["done_at"] = round(_done_at[sid], 1) if now - _done_at.get(sid, 0) < 4.5 else 0
            ep = s.get("entrypoint") or ""
            val["app"] = "desktop" if "desktop" in ep else "code" if ("vscode" in ep or "jetbrains" in ep or "ide" in ep) else "terminal"
            val["mode"] = "cowork" if "cowork" in json.dumps(s).lower() else "chat" if "chat" in ep.replace("claude-desktop", "") else "code"   # Claude Code unless the session says otherwise
            val["host"] = "cloud" if any(x in str(s.get("hostSessionId") or "") for x in ("cloud", "remote")) else "local"
            val["step_elapsed"] = _since(now - d["step_at"]) if busy and d.get("step_at") else ""
            ASKS[sid] = d.get("ask")                  # a session waiting on a question card reports idle, so this ignores the status
            val["asking"] = len((d.get("ask") or {}).get("questions") or [])
            if val["asking"] and not busy:
                val["state"], val["action"] = "working", "Asking you a question"
            val["sid"] = sid
            val["steps"] = d.get("steps", 0)
            val["activity"], val["agents"] = act, d.get("agents", 0)
            for k in ("todo_done", "todo_total", "todo_active", "todo_states", "todo_live"):
                if k in d:
                    val[k] = d[k]
    except Exception:  # noqa: BLE001
        val = {"title": "Claude", "state": "none", "action": "", "reply": "", "elapsed": ""}
    _cache[key] = (time.time(), val)
    return val


class Scroll:
    """Which line of the last reply the widget shows (the encoder over it scrolls); starts over when the reply changes."""
    TICKS = 4

    def __init__(self):
        self.key, self.line, self.acc = "", 0, 0

    def line_for(self, reply):
        if reply != self.key:
            self.key, self.line, self.acc = reply, 0, 0
        return self.line

    def turn(self, ticks):
        self.acc += ticks
        steps = int(self.acc / self.TICKS)
        if steps:
            self.acc -= steps * self.TICKS
            self.line = max(0, self.line + steps)   # the renderers stop at the last line
