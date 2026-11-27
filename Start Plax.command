#!/bin/bash
# Double-click to start Plax on a Mac. Needs Node.js 22.18+ from https://nodejs.org
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Plax needs Node.js. Install the LTS version from https://nodejs.org, then double-click this file again."
  open "https://nodejs.org"
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
node scripts/start.mjs
read -n 1 -s -r -p "Plax stopped. Press any key to close."
