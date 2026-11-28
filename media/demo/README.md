# 4ORGE demo video (3½ minutes)

Built from two screen recordings of the live app (4orge.xyz): the full GitHub → QIE Mainnet deployment of AtlasGovernor, and a tour of the explorer and workspace.

| File | What it does |
|---|---|
| `script.json` | The edit: footage ranges per segment, and narration lines (spoken text + caption text). |
| `vo.py` | Voice-over with Piper TTS (`en_US-lessac-medium`), one WAV per caption line. |
| `timeline.py` | Fits footage to narration: each segment lasts as long as its lines, footage is sped up to fit (max 2.4×). |
| `graphics.js` | Background frame, title and closing cards, step chips (Chromium → PNG). |
| `audio_mix.py` | Original synthesized music (100 BPM, C major), sound effects, voice-over, ducking. |
| `build_video.py` | Cuts, crops above the taskbar, blurs the sidebar corner (recorder controls, account e-mail), composes, burns in captions, encodes (1080p30, H.264/AAC, −16 LUFS). |

Rebuild order: `vo.py` → `timeline.py` (as a module) → `graphics.js` → `audio_mix.py` → `build_video.py`. The recordings and the voice model are not in the repository.
