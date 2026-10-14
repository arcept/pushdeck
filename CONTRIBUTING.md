# Contributing

Thanks for your interest in Push Deck.

- **Issues are open.** Bug reports, ideas, hardware notes and profile suggestions are welcome. Use the templates.
- **Pull requests are by invitation only for now.** Please open an issue first. If we agree on a change, you will get an invitation to send it.
- **Security problems** go through the private route in [SECURITY.md](SECURITY.md), not a public issue.

If you are invited to work on code: `./dev.sh` runs the test version at <http://127.0.0.1:8472> and rebuilds the UI on every save (see the Development section of the [README](README.md)). The Push display is drawn twice on purpose, in `daemon/push_daemon/display/render.py` and `ui/src/display/render.ts`, so change both together. Keep `CHANGELOG.md` up to date, and keep personal information (names, paths, emails, tokens) out of commits.
