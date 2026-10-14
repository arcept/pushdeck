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
<key>NSHumanReadableCopyright</key><string>Push Deck. Not affiliated with Ableton.</string>
</dict></plist>
PLIST

# --- the whole product inside the app: daemon code, UI, python environment, libusb ---
R="$APP/Contents/Resources"
# the UI goes to build/ui (ui/dist stays the dev-mode output, see dev.sh)
( cd "$ROOT/ui" && npx tsc --noEmit && npx vite build --outDir "$OUT/ui/dist" --emptyOutDir >/dev/null )
mkdir -p "$R/root/daemon" "$R/root/design" "$R/lib"
rsync -a --exclude '__pycache__' --exclude 'audiotap' "$ROOT/daemon/" "$R/root/daemon/"
rsync -a "$OUT/ui/dist" "$R/root/ui/"
rsync -a "$ROOT/design/fonts" "$R/root/design/"
rsync -a "$ROOT/profiles" "$R/root/"
cp "$ROOT/push2_registry.json" "$ROOT/button_names.json" "$R/root/"
rsync -a --exclude '__pycache__' --exclude 'pip*' --exclude '_distutils_hack' --exclude 'setuptools*' --exclude 'pkg_resources' --exclude 'imageio*' --exclude 'share' "$ROOT/.venv/" "$R/venv/"
cp "$(brew --prefix libusb)/lib/libusb-1.0.0.dylib" "$R/lib/"
codesign --force --sign - "$R/lib/libusb-1.0.0.dylib" 2>/dev/null || true
find "$R" -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
codesign --force --deep --sign - "$APP"
echo "built $APP  ($VER)"
