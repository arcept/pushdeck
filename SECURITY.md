# Security

Push Deck runs on your Mac and listens on `127.0.0.1` only. It has no server and no accounts.

## Reporting a problem

Please report security problems **privately**, not in a public issue: open the repository's **Security** tab and choose **Report a vulnerability**. Include what you found, how to reproduce it and the macOS and Push Deck versions. You will get a reply as soon as one person can look at it; this is a small project, so please be patient.

## What is worth reporting

- Anything that lets another app, another user or a web page control the daemon on port 8472, read its data or run actions.
- Credentials or tokens that are stored, logged or sent anywhere they should not be. By design, the live Claude usage token is held in memory only, and Spotify tokens stay in `private/spotify.json` on your Mac.
- A way to make an imported profile run something its author did not write. Shell-command actions run exactly what a profile says, so only import profiles you trust; that is documented behaviour, not a vulnerability.

## About the app's signature

Push Deck is signed ad hoc, without a paid Apple Developer ID, so macOS shows an "unidentified developer" prompt the first time. The release `.dmg` comes with a SHA-256 checksum file; the one-line installer checks it for you.

## Supported versions

Only the latest release gets fixes.
