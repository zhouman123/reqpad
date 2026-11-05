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
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/reqpad.app"
  cp -R "$APP" "$HOME/Applications/"
  echo "installed: $HOME/Applications/reqpad.app"
fi
