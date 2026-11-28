"""Shared timeline for the demo video: where every clip, caption and voice line goes.

Segment length follows the narration: each segment lasts as long as its voice
lines need (plus breathing room), and its footage is sped up to fit, capped at
MAX_SPEED so the screen stays readable. Clips with an explicit speed (e.g. a
long wait) keep it.
"""
import json
from pathlib import Path

TITLE = 4.0          # title card, music only
LEAD = 0.55          # silence before the first line of a segment
GAP = 0.45           # pause between lines
TAIL = 1.1           # breathing room after the last line
MAX_SPEED = 2.4
OUTRO_HOLD = 2.5     # card stays after the last line

HERE = Path(__file__).resolve().parent


def build(vo_json: Path):
    script = json.loads((HERE / "script.json").read_text())
    vo = {s["id"]: s["lines"] for s in json.loads(Path(vo_json).read_text())}
    t = TITLE
    segments = []
    for seg in script["segments"]:
        lines = vo[seg["id"]]
        need = LEAD + sum(l["duration"] for l in lines) + GAP * (len(lines) - 1) + TAIL
        clips = [{"src": c[0], "in": c[1], "out": c[2], "speed": c[3] if len(c) > 3 else None} for c in seg["clips"]]
        fixed = sum((c["out"] - c["in"]) / c["speed"] for c in clips if c["speed"])
        flex_src = sum(c["out"] - c["in"] for c in clips if not c["speed"])
        if not clips:
            dur = need + OUTRO_HOLD
            pad = 0.0
        else:
            lo = fixed + flex_src / MAX_SPEED
            hi = fixed + flex_src
            dur = min(max(need, lo), hi) if flex_src else max(need, fixed)
            pad = max(0.0, need - dur)  # footage too short: hold the last frame
            flex_speed = flex_src / (dur - fixed) if flex_src else 1.0
            for c in clips:
                if not c["speed"]:
                    c["speed"] = flex_speed
            dur += pad
        # voice lines and captions
        cur = t + LEAD
        placed = []
        for l in lines:
            placed.append({"file": l["file"], "caption": l["caption"], "start": round(cur, 3), "end": round(cur + l["duration"], 3)})
            cur += l["duration"] + GAP
        segments.append({"id": seg["id"], "chip": seg["chip"], "start": round(t, 3), "end": round(t + dur, 3), "clips": clips, "pad": round(pad, 3), "lines": placed})
        t += dur
    return {"title": TITLE, "segments": segments, "total": round(t, 3)}


if __name__ == "__main__":
    import sys
    tl = build(Path(sys.argv[1]))
    for s in tl["segments"]:
        sp = ", ".join(f"{c['src']} {c['in']}-{c['out']} @{c['speed']:.2f}x" for c in s["clips"])
        print(f"{s['start']:7.2f}-{s['end']:7.2f}  {s['id']:9} {sp} pad={s['pad']}")
    print("total", tl["total"], "s")
