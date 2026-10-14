#!/bin/zsh
# Start the Push daemon (UI served at http://127.0.0.1:8472). Build the UI first: cd ui && npm run build
cd "$(dirname "$0")"
PYTHONPATH=daemon exec .venv/bin/python -m push_daemon
