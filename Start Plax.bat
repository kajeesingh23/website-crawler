@echo off
rem Double-click to start Plax on Windows. Needs Node.js 22.18+ from https://nodejs.org
cd /d "%~dp0"
where node >nul 2>nul || (echo Plax needs Node.js. Install the LTS version from https://nodejs.org, then run this again. & start https://nodejs.org & pause & exit /b 1)
node scripts\start.mjs
pause
