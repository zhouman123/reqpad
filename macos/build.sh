#!/bin/bash
# Build reqpad.app from source. Usage: ./macos/build.sh [--install]
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
APP="$ROOT/dist/reqpad.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

echo "compiling..."
swiftc -O -o "$APP/Contents/MacOS/reqpad" "$HERE/main.swift" \
  -framework Cocoa -framework WebKit

cp "$HERE/Info.plist" "$APP/Contents/Info.plist"
cp "$ROOT/server.mjs" "$APP/Contents/Resources/"
cp -R "$ROOT/public" "$APP/Contents/Resources/"
chmod +x "$APP/Contents/MacOS/reqpad"

# Ad-hoc signature is enough for a locally built, non-distributed app.
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

echo "built: $APP"

if [ "${1:-}" = "--install" ]; then
  # Prefer the system-wide Applications folder so Launchpad/Finder find it;
  # fall back to the per-user one when that is not writable.
  if [ -w /Applications ]; then
    DEST="/Applications"
  else
    DEST="$HOME/Applications"
    mkdir -p "$DEST"
  fi
  rm -rf "$DEST/reqpad.app"
  cp -R "$APP" "$DEST/"
  echo "installed: $DEST/reqpad.app"
fi
