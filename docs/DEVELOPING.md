# Developing Push Deck

For people who want to build the app from source or work on the code. If you only want to use Push Deck, the [README](../README.md#install) has the easy ways to install it.

## Build from source

You need Python 3.9+, Node 18+, [Homebrew](https://brew.sh) (for `libusb`) and the Xcode command line tools (`xcode-select --install`).

```bash
./install.sh                # builds Push Deck.app into build/ and installs it in /Applications (asks before replacing)
```

To run only the daemon and the browser UI, without the app:

```bash
brew install libusb && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd ui && npm install && npm run build && cd ..
./run_daemon.sh             # then open http://127.0.0.1:8472  (another port: set PUSH_PORT)
```

## Development mode

**Dev mode is the test version.** `./dev.sh` runs the daemon from this folder (its own `settings.json` and `profiles/`) and rebuilds the UI on every save, at <http://127.0.0.1:8472>. Test there, then run `./install.sh`.

```bash
./dev.sh                    # daemon + UI rebuilt on save
cd ui && npm run dev        # alternative: UI with hot reload, proxying /ws to the daemon
cd ui && npm run build      # type-check, then build ui/dist
PYTHONPATH=daemon .venv/bin/python -m push_daemon.display.tokens   # rewrite ui/src/display/tokens.json
```

The display is drawn twice on purpose: `daemon/push_daemon/display/render.py` draws what the Push shows and `ui/src/display/render.ts` draws the same scene in the browser. Change both together, and restart the daemon after any Python change.

The project layout is in the [README](../README.md#project-layout).
