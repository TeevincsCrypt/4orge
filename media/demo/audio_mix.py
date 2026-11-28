"""Demo soundtrack: original background music + sound effects + voice-over, ducked and mixed.

Usage: audio_mix.py <timeline.json> <vo-dir> <out.wav>
Music is synthesized here (no samples or licensed audio): 100 BPM, C major
(C – G – Am – F), calm and upbeat, softer under the review/sign section and
lifting at the verified moment. It is ducked under every voice line.
"""
import json
import sys
import wave

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
rng = np.random.default_rng(1990)
tl = json.load(open(sys.argv[1]))
VO_DIR, OUT = sys.argv[2], sys.argv[3]
TOTAL = tl["total"] + 0.5
N = int(SR * TOTAL)
BPM = 100
BEAT = 60 / BPM


def filt(x, kind, f, order=2):
    f = np.clip(f, 20, SR / 2 - 100)
    return sosfilt(butter(order, f, btype=kind, fs=SR, output="sos"), x)


def saw(f, dur, phase=0.0):
    t = np.arange(int(dur * SR)) / SR
    return 2 * ((f * t + phase) % 1) - 1


def note(n):
    return 440 * 2 ** ((n - 69) / 12)


def env(n, a=0.01, d=0.3, s=0.0):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * (s + (1 - s) * np.exp(-t / d))


class Bus:
    def __init__(self):
        self.L = np.zeros(N)
        self.R = np.zeros(N)

    def add(self, sig, t, gain=1.0, pan=0.0):
        i = int(t * SR)
        if i >= N or i < 0:
            return
        sig = sig[: N - i]
        self.L[i:i + len(sig)] += sig * gain * np.cos((pan + 1) * np.pi / 4) * 1.414
        self.R[i:i + len(sig)] += sig * gain * np.sin((pan + 1) * np.pi / 4) * 1.414


music, sfx = Bus(), Bus()

# ---------------------------------------------------------------- instruments
def pad(freqs, dur, cutoff=1500):
    out = np.zeros(int(dur * SR))
    for f in freqs:
        for v in range(5):
            out += saw(f * 2 ** ((v - 2) * 0.07 / 12), dur, rng.random()) / 5
    out = filt(out / len(freqs), "lowpass", cutoff)
    n = len(out)
    return out * np.minimum(1, np.arange(n) / (0.6 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.5 * SR))


def pluck(f, dur=0.35):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * 0.7 + np.sin(2 * np.pi * 2 * f * t) * 0.2 + saw(f, dur) * 0.1
    return filt(x, "lowpass", 3500) * np.exp(-t / 0.12)


def kick(g=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 48 + 90 * np.exp(-t * 30)
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * 1.4) * g


def hat():
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    return filt(rng.standard_normal(n), "highpass", 8000) * np.exp(-t / 0.012) * 0.4


def bass(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return filt(np.sin(2 * np.pi * f * t) + 0.2 * saw(f, dur), "lowpass", 300) * env(n, 0.01, dur * 0.8, 0.5)


def whoosh(dur=0.45):
    n = int(dur * SR)
    nz = rng.standard_normal(n)
    out = np.zeros(n)
    for s in range(0, n, 512):  # rising band
        p = s / n
        seg = nz[s:s + 512]
        out[s:s + 512] = filt(seg, "bandpass", [300 + 3500 * p, 900 + 7000 * p]) if len(seg) > 30 else 0
    return out * np.sin(np.linspace(0, np.pi, n)) ** 2 * 0.5


def pop(f=1180):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t * (1 + 0.5 * np.exp(-t * 60))) * np.exp(-t / 0.025) * 0.5


def chime():
    out = np.zeros(int(1.6 * SR))
    for k, n_ in enumerate([84, 88, 91, 96]):  # C6 E6 G6 C7
        n = int(1.2 * SR)
        t = np.arange(n) / SR
        tone = (np.sin(2 * np.pi * note(n_) * t) + 0.3 * np.sin(2 * np.pi * 2 * note(n_) * t)) * np.exp(-t / 0.35)
        i = int(k * 0.09 * SR)
        out[i:i + n] += tone * 0.3
    return out


def impact():
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    f = 40 + 50 * np.exp(-t * 8)
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3) + filt(rng.standard_normal(n), "lowpass", 2000) * np.exp(-t * 12) * 0.3) * 0.8


# ---------------------------------------------------------------- arrangement
CH = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]  # C G Am F
ROOT = [36, 31, 33, 29]
seg = {s["id"]: s for s in tl["segments"]}
calm = (seg["review"]["start"], seg["verified"]["start"])
outro_t = seg["outro"]["start"]
bar = 4 * BEAT
nbars = int(TOTAL / bar) + 1
for b in range(nbars):
    t0 = b * bar
    c = CH[b % 4]
    is_calm = calm[0] <= t0 < calm[1]
    in_title = t0 < tl["title"] - 0.1
    in_outro = t0 >= outro_t
    music.add(pad([note(n) for n in c] + [note(c[0] - 12)], bar + 0.4, cutoff=1300 if is_calm else 1900), t0, 0.32)
    if in_title or in_outro:
        continue
    for k in range(4):
        tb = t0 + k * BEAT
        if not is_calm and k in (0, 2):
            music.add(kick(0.9), tb, 0.55)
        music.add(bass(note(ROOT[b % 4]), BEAT * 0.9), tb, 0.35 if not is_calm else 0.22)
        for s in (0, 0.5):
            if not is_calm:
                music.add(hat(), tb + s * BEAT, 0.22 if s else 0.12, pan=0.3)
        arp = c + [c[0] + 12]
        for j, s in enumerate((0, 0.5)):
            music.add(pluck(note(arp[(k * 2 + j) % 4] + 12)), tb + s * BEAT, 0.16 if not is_calm else 0.11, pan=-0.4 + 0.8 * j)
# final resolve on the outro
music.add(pad([note(n) for n in [60, 64, 67, 72]], TOTAL - outro_t, cutoff=2200), outro_t, 0.35)

# music fades
fade = np.ones(N)
fi = int(1.2 * SR)
fade[:fi] = np.linspace(0, 1, fi) ** 2
fo = int(3.0 * SR)
fade[-fo:] = np.linspace(1, 0, fo) ** 2
music.L *= fade
music.R *= fade

# ---------------------------------------------------------------- sound effects
sfx.add(impact(), 0.15, 0.5)
for s in tl["segments"]:
    sfx.add(whoosh(), max(0, s["start"] - 0.3), 0.32, pan=rng.uniform(-0.3, 0.3))
    if s["chip"]:
        sfx.add(pop(), s["start"] + 0.05, 0.35)
sfx.add(chime(), seg["verified"]["start"] + 0.4, 0.55)
sfx.add(impact(), outro_t, 0.45)
# fast-forward section in "sign": a soft tick per second of skipped time
sign = seg["sign"]
ff_start = sign["start"] + (sign["clips"][0]["out"] - sign["clips"][0]["in"]) / sign["clips"][0]["speed"]
for k in range(6):
    sfx.add(pop(1600), ff_start + 0.3 + k * 0.9, 0.12)

# ---------------------------------------------------------------- voice-over + ducking
vo = np.zeros(N)
duck = np.ones(N)
for s in tl["segments"]:
    for l in s["lines"]:
        with wave.open(f"{VO_DIR}/{l['file']}") as w:
            sr = w.getframerate()
            x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
        if sr != SR:  # resample (piper lessac is 22.05 kHz)
            x = np.interp(np.arange(int(len(x) * SR / sr)) / SR, np.arange(len(x)) / sr, x)
        i = int(l["start"] * SR)
        vo[i:i + len(x)] += x[: N - i]
        a, b = max(0, i - int(0.25 * SR)), min(N, i + len(x) + int(0.35 * SR))
        duck[a:b] = 0.38
# smooth the ducking envelope (~180 ms)
k = int(0.18 * SR)
duck = np.convolve(duck, np.ones(k) / k, mode="same")
vo = filt(vo, "highpass", 80)
# gentle voice warmth: slight low-mid lift via parallel low-pass
vo = vo + 0.15 * filt(vo, "lowpass", 400)
vo /= np.abs(vo).max() + 1e-9

# light room reverb on music only
ir_t = np.arange(int(1.4 * SR)) / SR
ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 4)
wet = fftconvolve(music.L + music.R, filt(ir, "lowpass", 5000))[:N]
wet /= np.abs(wet).max() + 1e-9

m_l = music.L + 0.12 * wet
m_r = music.R + 0.12 * wet
mpk = max(np.abs(m_l).max(), np.abs(m_r).max()) + 1e-9
m_l, m_r = m_l / mpk * duck * 0.32, m_r / mpk * duck * 0.32
L = m_l + sfx.L * 0.5 + vo * 0.85
R = m_r + sfx.R * 0.5 + vo * 0.85
mix = np.stack([L, R])
mix /= np.abs(mix).max() + 1e-9
mix *= 0.89
pcm = (np.clip(mix.T, -1, 1) * 32767).astype(np.int16)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("audio", OUT, round(TOTAL, 2), "s")
