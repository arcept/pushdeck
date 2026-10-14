#!/bin/bash
# Builds the one and only app: build/Push Deck.app (in the repo's git-ignored build/ folder). It only builds, it never installs;
# ./install.sh calls this and then puts the app in /Applications, and the release .dmg workflow can call it too.
# Everything the build creates lives in build/ (Swift output in build/swift, UI bundle in build/ui). Nothing is created in menubar/.
# Usage: menubar/build_app.sh [output-folder]      (default: <repo>/build)
# The version comes from the VERSION file. Signed ad hoc: macOS lists it by name and icon, but without an Apple Developer ID it still says the developer is unidentified.
set -e
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
OUT="${1:-$ROOT/build}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
swift build -c release --scratch-path "$OUT/swift"
APP="$OUT/Push Deck.app"
VER="$(tr -d '[:space:]' < "$ROOT/VERSION")"   # a clean number from the VERSION file, never a commit hash
NUM="$(git rev-list --count HEAD 2>/dev/null || echo 1)"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$OUT/swift/release/PushMenu" "$APP/Contents/MacOS/PushMenu"
cp AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Push Deck</string>
<key>CFBundleDisplayName</key><string>Push Deck</string>
<key>CFBundleIdentifier</key><string>com.arcept.pushdeck.menubar</string>
<key>CFBundleExecutable</key><string>PushMenu</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$VER</string>
<key>CFBundleVersion</key><string>$NUM</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
<key>NSAppleEventsUsageDescription</key><string>Push Deck presses keys and reads the playing track by talking to System Events, Chrome and Spotify.</string>
<key>NSDownloadsFolderUsageDescription</key><string>Push Deck watches your Downloads folder to show downloads in progress on the display.</string>
<key>NSHumanReadableCopyright</key><string>Push Deck. Not affiliated with Ableton.</string>
</dict></plist>
PLIST

# --- the whole product inside the app: daemon code, UI, its own Python and packages, libusb, the audio helper ---
R="$APP/Contents/Resources"
# the UI goes to build/ui (ui/dist stays the dev-mode output, see dev.sh)
( cd "$ROOT/ui" && npx tsc --noEmit && npx vite build --outDir "$OUT/ui/dist" --emptyOutDir >/dev/null )
mkdir -p "$R/root/daemon" "$R/root/design" "$R/lib"
rsync -a --exclude '__pycache__' --exclude 'audiotap' --exclude 'libmr.dylib' "$ROOT/daemon/" "$R/root/daemon/"
rsync -a "$OUT/ui/dist" "$R/root/ui/"
rsync -a "$ROOT/design/fonts" "$R/root/design/"
rsync -a "$ROOT/profiles" "$R/root/"
cp "$ROOT/push2_registry.json" "$ROOT/button_names.json" "$R/root/"

# Python: a pinned standalone copy that lives inside the app (see tools/fetch_python.sh), with the daemon's packages installed into it.
# Kept lean: no pip, setuptools, tests, tk or the video libraries (imageio) the daemon never uses at run time.
PY="$("$ROOT/tools/fetch_python.sh")"
rsync -a "$PY/" "$R/python/"
grep -viE '^(imageio|imageio-ffmpeg)$' "$ROOT/requirements.txt" > "$OUT/requirements.bundle.txt"
"$R/python/bin/python3" -m pip install --quiet --no-warn-script-location --disable-pip-version-check -r "$OUT/requirements.bundle.txt"
PYLIB="$(echo "$R"/python/lib/python3.*)"
rm -rf "$PYLIB/site-packages/"{pip,pip-*,setuptools,setuptools-*,pkg_resources,_distutils_hack,wheel,wheel-*} "$PYLIB"/{test,idlelib,tkinter,turtledemo,ensurepip} "$PYLIB"/lib-dynload/_tkinter* "$R/python/share"
rm -rf "$R"/python/lib/{tcl*,tk*,itcl*,thread*,libtcl*,libtk*,pkgconfig} "$PYLIB/site-packages/PyObjCTest" "$PYLIB/lib2to3" "$PYLIB/unittest/test" 2>/dev/null || true
rm -f "$R"/python/bin/{pip*,idle*,pydoc*,2to3*,python3-config,python3.*-config}
rm -rf "$PYLIB/site-packages/numpy"/{tests,_core/tests,f2py,distutils} 2>/dev/null || true
cp "$(brew --prefix libusb)/lib/libusb-1.0.0.dylib" "$R/lib/"
install_name_tool -id "@loader_path/libusb-1.0.0.dylib" "$R/lib/libusb-1.0.0.dylib" 2>/dev/null || true
codesign --force --sign - "$R/lib/libusb-1.0.0.dylib" 2>/dev/null || true

# the audio helper is built here, so a Mac without Xcode never has to compile it
AT="$R/root/daemon/audiotap/PushAudioTap.app"
mkdir -p "$AT/Contents/MacOS"
cp "$ROOT/daemon/audiotap/Info.plist" "$AT/Contents/Info.plist"
cp "$ROOT/daemon/audiotap/audiotap.swift" "$R/root/daemon/audiotap/audiotap.swift"
swiftc -O "$ROOT/daemon/audiotap/audiotap.swift" -o "$AT/Contents/MacOS/audiotap"
codesign --force --sign - -r="designated => identifier \"com.arcept.pushdeck.audio\"" "$AT"   # a rule tied to the name, not the build: see the note at the end

# the now-playing helper (a tiny C library) is built here too, so a Mac without the developer tools never has to run clang
NP="$R/root/daemon/nowplaying"
mkdir -p "$NP"
cp "$ROOT/daemon/nowplaying/mr.c" "$NP/mr.c"
clang -dynamiclib -fblocks -framework CoreFoundation -o "$NP/libmr.dylib" "$NP/mr.c"
codesign --force --sign - "$NP/libmr.dylib"

find "$R" -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
# Signed ad hoc (no paid Apple ID). An ad hoc signature normally makes macOS remember the exact build, so Accessibility, Automation and the other
# permissions are forgotten on every update. Giving it an explicit rule, "identifier = the app's name", makes macOS recognise the next build as the same app.
codesign --force --deep --sign - -r="designated => identifier \"com.arcept.pushdeck.menubar\"" "$APP"
echo "built $APP  ($VER)"
