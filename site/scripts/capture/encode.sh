#!/bin/bash
# Turns the frames recorded by rec.py into the page's videos.
#   scripts/capture/encode.sh FRAMES_DIR OUT_DIR
# FRAMES_DIR has one folder per profile id (terminal = Claude Code, browser, chatgpt-codex), as rec.py writes them.
# OUT_DIR is site/public/video. hero.mp4 is the Claude loop dissolving into the Browser loop.
set -e
S="$1"; O="$2"
enc() { ffmpeg -loglevel error -y -framerate 6.5 -i "$1/%04d.jpg" -c:v libx264 -pix_fmt yuv420p -crf 20 -preset slow -r 13 -movflags +faststart -an "$2"; }
enc "$S/terminal" "$O/claude.mp4"; enc "$S/browser" "$O/browser.mp4"; enc "$S/chatgpt-codex" "$O/codex.mp4"
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$O/claude.mp4")
ffmpeg -loglevel error -y -i "$O/claude.mp4" -i "$O/browser.mp4" -filter_complex "[0][1]xfade=transition=fade:duration=0.5:offset=$(python3 -c "print($D-0.5)"),format=yuv420p" -c:v libx264 -crf 20 -preset slow -movflags +faststart -an "$O/hero.mp4"
ls -la "$O"
