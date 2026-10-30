"""Checks the usage-limit alert settings (first level, step, which limits) without a Push. Usage:
  PYTHONPATH=daemon .venv/bin/python tools/test_limit_levels.py"""
import sys
from types import SimpleNamespace

from push_daemon import limits

ok = True


def check(name, got, want):
    global ok
    good = got == want
    ok &= good
    print(("ok   " if good else "FAIL ") + name + ("" if good else f"  got {got!r}, wanted {want!r}"))


def cfg(**c):
    return limits.Limits(SimpleNamespace(settings={"limit_alert": c})).cfg()


check("default levels", cfg()["levels"], [70, 75, 80, 85, 90, 95, 100])
check("start 80, every 10", cfg(start=80, step=10)["levels"], [80, 90, 100])
check("start 90, every 5", cfg(start=90, step=5)["levels"], [90, 95, 100])
check("only the start and 100", cfg(start=70, step=100)["levels"], [70, 100])
check("only at 100", cfg(start=100)["levels"], [100])
check("junk falls back", cfg(start=7, step=3)["levels"], [70, 75, 80, 85, 90, 95, 100])
check("windows", cfg(windows=["seven_day"])["windows"], ["seven_day"])
check("switched off", cfg(on=False)["on"], False)
check("old saved settings keep the old behaviour", cfg(on=True, levels=[80, 90, 95], sound=True)["levels"], [70, 75, 80, 85, 90, 95, 100])
sys.exit(0 if ok else 1)
