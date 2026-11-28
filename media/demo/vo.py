"""Synthesize the demo voice-over, one WAV per caption line, and write timings.

Usage: vo.py <piper-voice.onnx> <out-dir>
Writes <out-dir>/line_<seg>_<n>.wav and <out-dir>/vo.json with each line's duration.
"""
import json
import sys
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

HERE = Path(__file__).resolve().parent
model, out = sys.argv[1], Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
voice = PiperVoice.load(model)
# Slightly slower than default for clarity; a little variation keeps it natural.
cfg = SynthesisConfig(length_scale=1.06, noise_scale=0.6, noise_w_scale=0.8)

script = json.loads((HERE / "script.json").read_text())
timings = []
for seg in script["segments"]:
    lines = []
    for n, (spoken, caption) in enumerate(seg["lines"]):
        path = out / f"line_{seg['id']}_{n}.wav"
        with wave.open(str(path), "wb") as w:
            voice.synthesize_wav(spoken, w, syn_config=cfg)
        with wave.open(str(path)) as r:
            dur = r.getnframes() / r.getframerate()
        lines.append({"file": path.name, "caption": caption, "duration": round(dur, 3)})
    timings.append({"id": seg["id"], "lines": lines})
    print(seg["id"], [l["duration"] for l in lines])
(out / "vo.json").write_text(json.dumps(timings, indent=1))
