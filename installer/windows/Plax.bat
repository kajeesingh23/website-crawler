@echo off
rem What the Plax shortcut runs. Your library lives in %LOCALAPPDATA%\Plax\data, so updates and uninstalling never touch it.
title Plax
cd /d "%~dp0"
set "PDI_DATA_DIR=%LOCALAPPDATA%\Plax\data"
where /q node || (echo Plax needs Node.js. Install the LTS version from https://nodejs.org, then open Plax again. & start https://nodejs.org & pause & exit /b 1)
node scripts\start.mjs
pause
