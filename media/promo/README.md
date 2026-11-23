# 4ORGE promo video

A 32-second, beat-synced preview (128 BPM, 16 bars) with an original soundtrack synthesized from code. No samples or licensed music, so it's free to post anywhere.

| File | What it is |
|---|---|
| `render.html` | Deterministic frame renderer: `render(t)` draws the exact frame for time *t* (kinetic type, glitches, shakes, real app screenshots). |
| `audio.py` | Composes and mixes the soundtrack and sound effects (A minor, Am–F–C–G). Every hit is placed on the same beats as the visuals. |
| `capture.js` | Captures 960 frames with Playwright and encodes H.264 + AAC with ffmpeg. |
| `build.sh` | Copies brand assets and screenshots, then builds audio and video into `out/`. |

Rebuild with `bash media/promo/build.sh`. It takes about 3 minutes. To change copy or timing, edit the scene for the relevant beats in `render.html`. Beats convert to seconds as `beat × 60 / 128`.
