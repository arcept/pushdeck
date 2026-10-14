#!/bin/bash
# Fetches the Python that goes inside Push Deck.app, so the app never depends on Xcode or a Python you installed.
# A pinned, relocatable CPython from python-build-standalone, checked against its published SHA-256, cached in build/cache.
# Usage: tools/fetch_python.sh            prints the folder it unpacked to (contains bin/python3)
set -e
cd "$(dirname "$0")/.."
TAG=20261013; VER=3.12.15
case "$(uname -m)" in
  arm64)  ARCH=aarch64; SUM=ba32036ad8f4c434d97a1ee7feef8b7edc0fac16777639b97e39c74a108e4440 ;;
  x86_64) ARCH=x86_64;  SUM=9686ddd8639b855905447ea4a16eb54a804a9ef12afbe7c9ecb1412d9c1fbc98 ;;
  *) echo "unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac
NAME="cpython-$VER+$TAG-$ARCH-apple-darwin-install_only.tar.gz"
DIR="build/cache/python-$VER-$ARCH"
if [ ! -x "$DIR/python/bin/python3" ]; then
  mkdir -p build/cache; rm -rf "$DIR"; mkdir -p "$DIR"
  curl -fsSL -o "build/cache/$NAME" "https://github.com/astral-sh/python-build-standalone/releases/download/$TAG/${NAME//+/%2B}" >&2
  echo "$SUM  build/cache/$NAME" | shasum -a 256 -c - >&2
  tar -xzf "build/cache/$NAME" -C "$DIR"
fi
echo "$PWD/$DIR/python"
