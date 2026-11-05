@echo off
rem Double-click launcher for Windows.
cd /d "%~dp0"
start "reqpad server" cmd /c "node server.mjs"
timeout /t 2 >nul
start "" http://127.0.0.1:4599
