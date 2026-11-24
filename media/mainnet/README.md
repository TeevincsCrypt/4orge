# 4ORGE "we've gone mainnet" video

A 32-second, beat-synced announcement (128 BPM) in the style of `media/promo`, with **light scenes only**: white, lavender and pastel backgrounds, brand-blue accents, and colour strobes instead of dark inverts. Every frame is at least 166/255 average brightness. The on-screen data is the real first QIE Mainnet deployment (AtlasGovernor, block 12128375).

| File | What it is |
|---|---|
| `render.html` | Deterministic frame renderer: `render(t)` draws the frame for time *t*. |
| `audio.py` | Original soundtrack synthesized from code (C major, C–G–Am–F), with hits on the same beats as the visuals. |
| `capture.js` | Captures 960 frames with Playwright and encodes H.264 + AAC with ffmpeg. |
| `build.sh` | Copies screenshots and fonts, then builds audio and video into `out/4orge-mainnet.mp4`. |

Rebuild with `bash media/mainnet/build.sh` (about 3 minutes).

## Post

```text
We've gone mainnet. 🚀

4ORGE just shipped its first contract to QIE Mainnet: imported from GitHub, 114 tests passed, signed in our own wallet, checked on-chain and source-verified on QIE's explorer.

No testnet. No mockups. Real.

https://mainnet.qie.digital/address/0x8b9e799f6bb4b9b120de4293f8482c6112fac366?tab=contract
```
