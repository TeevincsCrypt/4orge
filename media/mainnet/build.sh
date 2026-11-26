#!/usr/bin/env bash
# Render the 4ORGE "we've gone mainnet" video (1920x1080, 30 fps, 32 s, light scenes only) with its original soundtrack.
# Needs: Python 3 with numpy + scipy, ffmpeg, Node with Playwright/Chromium. Run from the repo root:
#   bash media/mainnet/build.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$DIR/../.." && pwd)"
mkdir -p "$DIR/assets" "$DIR/out"
cp "$ROOT"/docs/screenshots/{dashboard,build,landing,tests,execution-success,execution-review,execution-wallet,deploy-wizard,qie-mainnet-deployment,deployment-record}.png "$DIR/assets/"
cp "$ROOT"/node_modules/geist/dist/fonts/geist-sans/Geist-{Regular,Medium,SemiBold,Bold,Black}.woff2 "$DIR/assets/"
cp "$ROOT"/node_modules/geist/dist/fonts/geist-mono/GeistMono-Medium.woff2 "$DIR/assets/"
python3 "$DIR/audio.py" "$DIR/out/mainnet_audio.wav"
node "$DIR/capture.js" "$DIR/out/4orge-mainnet.mp4"
echo "Video: $DIR/out/4orge-mainnet.mp4"
