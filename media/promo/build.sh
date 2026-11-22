#!/usr/bin/env bash
# Re-render the 4ORGE promo video (1920x1080, 30 fps, 32 s) with its original soundtrack.
# Needs: Python 3 with numpy + scipy, ffmpeg, Node with Playwright/Chromium. Run from the repo root:
#   bash media/promo/build.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$DIR/../.." && pwd)"
mkdir -p "$DIR/assets" "$DIR/out"
cp "$ROOT/public/brand/4orge-mark.svg" "$ROOT"/public/landing/{dashboard,execution}.png "$DIR/assets/"
cp "$ROOT"/docs/screenshots/{build,tests,execution-review,deploy-wizard,deployment-record,execution-success}.png "$DIR/assets/"
cp "$ROOT"/node_modules/geist/dist/fonts/geist-sans/Geist-{Regular,Medium,SemiBold,Bold,Black}.woff2 "$DIR/assets/"
python3 "$DIR/audio.py" "$DIR/out/promo_audio.wav"
node "$DIR/capture.js" "$DIR/out/4orge-preview.mp4"
echo "Video: $DIR/out/4orge-preview.mp4"
