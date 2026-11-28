"""Cut the screen recordings to the timeline and compose the final demo video.

Usage: build_video.py <timeline.json> <gfx-dir> <mix.wav> <work-dir> <out.mp4> <recA.mp4> <recB.mp4>

- Each clip is cropped above the screen-recorder toolbar and the Windows
  taskbar (1280x616), the sidebar's account card is blurred (e-mail), it is
  sped up per the timeline and scaled to 1600x770 at 30 fps.
- The screen sits in a rounded window on the branded canvas, with a step chip,
  burned-in captions (ASS, Geist), title and closing cards, and the mixed audio
  normalised to -16 LUFS.
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

FPS = 30
W, H = 1600, 770
X, Y = 160, 80
ROOT = Path(__file__).resolve().parents[2]
FONTDIR = ROOT / "node_modules/geist/dist/fonts/geist-sans"

tl_path, gfx, mix, work, out, rec_a, rec_b = sys.argv[1:8]
tl = json.loads(Path(tl_path).read_text())
gfx, work = Path(gfx), Path(work)
work.mkdir(parents=True, exist_ok=True)
SRC = {"A": rec_a, "B": rec_b}


def run(args):
    subprocess.run(args, check=True)


# ---------------------------------------------------------------- 1. clips
frame = lambda t: round(t * FPS)
clips = []
for s in tl["segments"]:
    t = s["start"]
    for k, c in enumerate(s["clips"]):
        dur = (c["out"] - c["in"]) / c["speed"]
        last = k == len(s["clips"]) - 1
        end = s["end"] if last else t + dur  # last clip absorbs rounding and any hold
        nframes = frame(end) - frame(t)
        path = work / f"clip_{s['id']}_{k}.mp4"
        vf = (
            "crop=1280:616:0:0,split[a][b];[b]crop=262:62:0:554,boxblur=14:3[bl];[a][bl]overlay=0:554,"
            f"setpts=(PTS-STARTPTS)/{c['speed']:.5f},fps={FPS},scale={W}:{H}:flags=lanczos,"
            "tpad=stop_mode=clone:stop_duration=5,format=yuv420p"
        )
        run(["ffmpeg", "-v", "error", "-y", "-ss", str(c["in"]), "-t", str(c["out"] - c["in"]), "-i", SRC[c["src"]],
             "-filter_complex", vf, "-frames:v", str(nframes), "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "15", str(path)])
        clips.append(path)
        t = end
        print("clip", path.name, nframes, "frames", flush=True)
(work / "clips.txt").write_text("".join(f"file '{p}'\n" for p in clips))
screen = work / "screen.mp4"
run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(work / "clips.txt"), "-c", "copy", str(screen)])

# ---------------------------------------------------------------- 2. rounded-corner mask
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, H - 1], radius=18, fill=255)
mask.save(work / "mask.png")

# ---------------------------------------------------------------- 3. captions (ASS)
def ts(x):
    h, r = divmod(max(0, x), 3600)
    m, s = divmod(r, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


ass = [
    "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1920", "PlayResY: 1080", "WrapStyle: 0", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    # dark ink on the light canvas below the window
    "Style: Cap,Geist Medium,40,&H001D1614,&H001D1614,&H00F7F1F1,&H00F7F1F1,0,0,0,0,100,100,0,0,1,0,0,2,240,240,78,1",
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
]
for s in tl["segments"]:
    for l in s["lines"]:
        text = l["caption"].replace("{", "(").replace("}", ")")
        ass.append(f"Dialogue: 0,{ts(l['start'])},{ts(l['end'] + 0.25)},Cap,,0,0,0,,{{\\fad(120,120)}}{text}")
(work / "captions.ass").write_text("\n".join(ass) + "\n", encoding="utf-8")

# ---------------------------------------------------------------- 4. compose
total = tl["total"]
title_end = tl["title"]
segs = tl["segments"]
outro = next(s for s in segs if s["id"] == "outro")
sign = next(s for s in segs if s["id"] == "sign")
ff_start = sign["start"] + (sign["clips"][0]["out"] - sign["clips"][0]["in"]) / sign["clips"][0]["speed"]
ff_end = sign["end"]

inputs = ["-loop", "1", "-framerate", str(FPS), "-t", str(total), "-i", str(gfx / "bg.png"),
          "-i", str(screen),
          "-loop", "1", "-framerate", str(FPS), "-t", str(total), "-i", str(work / "mask.png"),
          "-loop", "1", "-framerate", str(FPS), "-t", str(title_end + 1.5), "-i", str(gfx / "title.png"),
          "-loop", "1", "-framerate", str(FPS), "-t", str(total - outro["start"] + 1), "-i", str(gfx / "outro.png")]
chips = [s for s in segs if s["chip"]]
for s in chips:
    inputs += ["-loop", "1", "-framerate", str(FPS), "-t", str(total), "-i", str(gfx / f"chip_{s['id']}.png")]
inputs += ["-loop", "1", "-framerate", str(FPS), "-t", str(total), "-i", str(gfx / "chip_ff.png")]
inputs += ["-i", mix]
n_chip0 = 5
ff_idx = n_chip0 + len(chips)
audio_idx = ff_idx + 1

f = []
f.append(f"[1:v]setpts=PTS-STARTPTS+{title_end}/TB,format=rgba[scr0];[2:v]format=gray[m];[scr0][m]alphamerge[scr]")
f.append(f"[0:v][scr]overlay={X}:{Y}:eof_action=pass[v0]")
cur = "v0"
for i, s in enumerate(chips):
    nxt = f"vc{i}"
    f.append(f"[{cur}][{n_chip0 + i}:v]overlay=x=(main_w-overlay_w)/2:y=19:enable='between(t,{s['start'] + 0.05},{s['end'] - 0.05})'[{nxt}]")
    cur = nxt
f.append(f"[{cur}][{ff_idx}:v]overlay=x=(main_w-overlay_w)/2:y={Y + H - 70}:enable='between(t,{ff_start + 0.1},{ff_end - 0.1})'[vff]")
# The title fades out over the first half-second of footage (no empty window).
f.append(f"[3:v]format=rgba,fade=out:st={title_end - 0.05}:d=0.5:alpha=1[ti]")
f.append(f"[vff][ti]overlay=0:0:eof_action=pass[vt]")
f.append(f"[4:v]format=rgba,fade=in:st=0:d=0.6:alpha=1,setpts=PTS-STARTPTS+{outro['start'] - 0.3}/TB[ou]")
f.append(f"[vt][ou]overlay=0:0:eof_action=pass[vo]")
f.append(f"[vo]ass={work / 'captions.ass'}:fontsdir={FONTDIR},format=yuv420p[v]")
f.append(f"[{audio_idx}:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]")

run(["ffmpeg", "-v", "error", "-stats", "-y", *inputs, "-filter_complex", ";".join(f), "-map", "[v]", "-map", "[a]",
     "-t", str(total), "-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
     "-profile:v", "high", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k", out])
print("video", out)
