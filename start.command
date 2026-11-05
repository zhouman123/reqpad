#!/bin/bash
# Double-click launcher for macOS/Linux: start the server, then open the page.
cd "$(dirname "$0")" || exit 1
( sleep 1; open "http://127.0.0.1:4599" 2>/dev/null || xdg-open "http://127.0.0.1:4599" 2>/dev/null ) &
exec node server.mjs
