# Notice

Push Deck is an independent project. It is **not affiliated with, endorsed by, or sponsored by Ableton AG**.
"Ableton" and "Push" are trademarks of Ableton AG. They are used here only to say which hardware this software works with
("for Ableton Push 2").

- The replica drawing in `ui/src/assets/push2.svg` is an original vector drawing made for this project. The Ableton logo that
  appeared in an earlier version has been removed and replaced with this project's own mark.
- The window pads' layout names and repeat-to-cycle behaviour follow Rectangle (https://github.com/rxhanson/Rectangle, MIT License,
  copyright Ryan Hanson and contributors). The code is written for this project and does not include Rectangle's source.
- Fonts in `design/fonts/` are under the SIL Open Font License (Quicksand, IBM Plex Mono, IBM Plex Sans, Instrument Sans).

## Font copyrights

Each font is licensed under the SIL Open Font License 1.1 (https://openfontlicense.org), copyright as embedded in the font files:

- IBM Plex Mono and IBM Plex Sans: Copyright IBM Corp. (2017 and 2019).
- Instrument Sans: Copyright 2022 The Instrument Sans Project Authors (https://github.com/Instrument/instrument-sans).
- Quicksand: Copyright 2019 The Quicksand Project Authors (https://github.com/andrew-paglinawan/QuicksandFamily.git).

## Third-party software

Not bundled in the repo; installed by `pip` / `npm` or built from source on your Mac.

- Python: mido, python-rtmidi, pyusb, Pillow, NumPy, imageio, imageio-ffmpeg, aiohttp, PyObjC (permissive licenses).
- UI: React (MIT), Vite (MIT), GSAP 3.12.7 under GreenSock's "no charge" Standard License (https://gsap.com/standard-license), which is free to use but is not an open-source license.
- `daemon/nowplaying/mr.c` calls Apple's private MediaRemote framework and may stop working on any macOS update.
