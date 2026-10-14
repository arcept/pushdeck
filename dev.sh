#!/bin/zsh
# Development mode: stops the installed app, runs the daemon from this folder (its own settings.json and profiles/)
# and rebuilds the UI on every save (vite build --watch). One address only: http://127.0.0.1:8472 (reload the page after a save).
# Ctrl-C stops both. Reopen the app afterwards.
cd "$(dirname "$0")"
pkill -f "Push Deck.app" 2>/dev/null; pkill -f push_daemon 2>/dev/null; sleep 1
PYTHONPATH=daemon .venv/bin/python -m push_daemon &
DAEMON=$!
trap 'kill $DAEMON 2>/dev/null' EXIT INT TERM
cd ui && npx vite build --watch
