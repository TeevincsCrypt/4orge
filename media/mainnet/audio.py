"""
4ORGE "we've gone mainnet" soundtrack: original composition, synthesized from scratch.
128 BPM, C major (C – G – Am – F), brighter than the first promo. Every hit lines up
with the video timeline in render.html (same beat grid as media/promo).
"""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
import wave, sys

SR = 44100
BPM = 128
BEAT = 60 / BPM
TOTAL = 32.0
N = int(SR * TOTAL)
rng = np.random.default_rng(1990)

L = np.zeros(N); R = np.zeros(N)            # dry bus
RV = np.zeros(N)                            # reverb send (mono)
SC_TIMES = []                               # kick times for sidechain

def t_of(beat): return beat * BEAT
def idx(t): return int(t * SR)

def add(sig, t, gain=1.0, pan=0.0, rev=0.0):
    i = idx(t)
    if i >= N: return
    sig = sig[: N - i]
    l = gain * np.cos((pan + 1) * np.pi / 4); r = gain * np.sin((pan + 1) * np.pi / 4)
    L[i:i + len(sig)] += sig * l * 1.414
    R[i:i + len(sig)] += sig * r * 1.414
    if rev: RV[i:i + len(sig)] += sig * gain * rev

def filt(x, kind, f, order=2):
    f = np.clip(f, 20, SR / 2 - 100)
    sos = butter(order, f, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, x)

def sweep_filter(x, kind, f0, f1, curve=2.0, block=256):
    out = np.zeros_like(x); zi = None
    n = len(x)
    for s in range(0, n, block):
        p = (s / max(1, n - 1)) ** curve
        f = f0 * (f1 / f0) ** p
        sos = butter(2, np.clip(f, 30, SR / 2 - 200), btype=kind, fs=SR, output="sos")
        if zi is None: zi = np.zeros((sos.shape[0], 2))
        out[s:s + block], zi = sosfilt(sos, x[s:s + block], zi=zi)
    return out

def env(n, a=0.002, d=0.2, s=0.0, curve=1.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * (s + (1 - s) * np.exp(-t / d) ** curve)
    return e

def saw(f, dur, phase=0.0):
    t = np.arange(int(dur * SR)) / SR
    return 2 * ((f * t + phase) % 1) - 1

def note(n): return 440 * 2 ** ((n - 69) / 12)

# ---------------------------------------------------------------- instruments
def kick(gain=1.0):
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 46 + 120 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 5.5)
    click = filt(rng.standard_normal(n), "highpass", 2500) * np.exp(-t * 300) * 0.35
    return np.tanh((body + click) * 1.6) * gain

def clap():
    n = int(0.35 * SR); t = np.arange(n) / SR
    nz = filt(rng.standard_normal(n), "bandpass", [900, 3200])
    e = np.zeros(n)
    for off in (0, 0.010, 0.021):
        e += np.where(t >= off, np.exp(-(t - off) / 0.012), 0) * (t < off + 0.03)
    e += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.11), 0)
    return nz * e * 0.9

def hat(open_=False):
    n = int((0.28 if open_ else 0.06) * SR); t = np.arange(n) / SR
    nz = filt(rng.standard_normal(n), "highpass", 7500)
    return nz * np.exp(-t / (0.09 if open_ else 0.014)) * 0.5

def supersaw(freqs, dur, cutoff=2400, voices=7, detune=0.18):
    out = np.zeros(int(dur * SR))
    for f in freqs:
        for v in range(voices):
            d = (v - (voices - 1) / 2) / ((voices - 1) / 2) * detune
            out += saw(f * 2 ** (d / 12), dur, rng.random()) / voices
    out /= max(1, len(freqs))
    return filt(out, "lowpass", cutoff)

def pluck(f, dur=0.18):
    n = int(dur * SR); t = np.arange(n) / SR
    x = (saw(f, dur) * 0.6 + np.sign(np.sin(2 * np.pi * f * t)) * 0.4)
    x = sweep_filter(x, "lowpass", 6000, 500, curve=0.5)
    return x * np.exp(-t / 0.09)

def sub_bass(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * 0.8 + saw(f, dur) * 0.25
    x = filt(x, "lowpass", 380)
    return x * env(n, a=0.004, d=dur * 0.9, s=0.6)

def impact(big=True):
    n = int((2.2 if big else 1.0) * SR); t = np.arange(n) / SR
    f = 34 + 60 * np.exp(-t * 6)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (1.6 if big else 4))
    nz = filt(rng.standard_normal(n), "lowpass", 3000) * np.exp(-t * 9) * 0.6
    return np.tanh((sub * 1.3 + nz) * 1.4)

def whoosh(dur=0.5, up=False):
    nz = rng.standard_normal(int(dur * SR))
    x = sweep_filter(nz, "bandpass" if False else "lowpass", 400 if up else 9000, 9000 if up else 300, curve=1.0)
    e = np.sin(np.linspace(0, np.pi, len(x))) ** 2
    return x * e * 0.6

def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    nz = sweep_filter(rng.standard_normal(n), "lowpass", 300, 12000, curve=1.6)
    f = 110 * 2 ** (t / dur * 3)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    return (nz * 0.5 + tone) * (t / dur) ** 1.8

def glitch(dur=0.12, base=None):
    n = int(dur * SR); t = np.arange(n) / SR
    f = base or rng.choice([220, 330, 880, 1760, 2640])
    x = np.sign(np.sin(2 * np.pi * f * t * (1 + 3 * (t / dur))))
    x = np.round(x * 4) / 4
    gate = (np.floor(t / 0.018) % 2 == 0)
    return x * gate * np.exp(-t / (dur * 0.7)) * 0.35

def tick(f=2200, dur=0.05):
    n = int(dur * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.012) * 0.6

def stamp():
    return impact(big=False) * 0.7 + np.pad(tick(1600, 0.06), (0, int(1.0 * SR) - int(0.06 * SR)))

def reverse_swell(dur=0.9):
    x = supersaw([note(60), note(67), note(72)], dur, cutoff=5000) * 0.6
    x = x * np.linspace(0, 1, len(x)) ** 2.5
    return x

# ---------------------------------------------------------------- arrangement
CH = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]   # C G Am F
ROOT = [48, 43, 45, 41]
BAR = 4

def chord_at(beat): return CH[int(beat // BAR) % 4]
def root_at(beat): return ROOT[int(beat // BAR) % 4]

# A — intro (beats 0-7): dark pad, ticking hats, glitch on "chaos"
for b in range(0, 8, 4):
    add(supersaw([note(n - 12) for n in chord_at(b)], BAR * BEAT, cutoff=600) * env(int(BAR * BEAT * SR), a=0.4, d=3, s=0.7), t_of(b), 0.45, rev=0.4)
for i in range(16):
    add(hat(), t_of(i * 0.5), 0.25 if i % 2 else 0.4, pan=0.3)
for b in (0, 1, 1.5, 2, 3, 3.5, 4):          # word hits
    add(tick(1800 + 200 * (b % 2)), t_of(b), 0.5, rev=0.3)
add(whoosh(0.35), t_of(4), 0.6)              # strike-through swipe
add(impact(False), t_of(5), 0.8, rev=0.5)
for k in range(6):
    add(glitch(0.08), t_of(5) + k * 0.06, 0.6, pan=rng.uniform(-0.8, 0.8))
add(whoosh(0.9, up=True), t_of(6.1), 0.7)

# B — chaos montage (beats 8-13): stutters on every cut, snare roll, riser; 14-15 silence + words
for b in np.arange(8, 14, 0.5):
    add(kick(0.8), t_of(b) if b % 1 == 0 else t_of(b), 0.75 if b % 1 == 0 else 0.0)
    if b % 1 == 0: SC_TIMES.append(t_of(b))
    add(glitch(0.1), t_of(b), 0.7, pan=rng.uniform(-1, 1))
    add(sub_bass(note(root_at(b) - 12), BEAT * 0.45), t_of(b + 0.25), 0.55)
roll = np.concatenate([np.arange(8, 12, 0.5), np.arange(12, 13, 0.25), np.arange(13, 13.875, 0.125)])
for j, b in enumerate(roll):
    add(clap(), t_of(b), 0.25 + 0.6 * j / len(roll), pan=rng.uniform(-0.3, 0.3), rev=0.2)
add(riser(BEAT * 6), t_of(8), 0.9)
# beats 14-15: dead silence except the words "So we forged it."
add(tick(900, 0.08), t_of(14), 0.8, rev=0.6)
add(tick(1200, 0.08), t_of(14.5), 0.8, rev=0.6)
add(reverse_swell(BEAT * 1.0), t_of(15), 0.9)

# C/D — drop (beats 16-39) and F (48-55): full groove
def groove(b0, b1, arp=True, chords_gain=0.5):
    for b in range(b0, b1):
        add(kick(), t_of(b), 1.0); SC_TIMES.append(t_of(b))
        if b % 2 == 1: add(clap(), t_of(b), 0.75, rev=0.25)
        for s in (0, 0.25, 0.5, 0.75):
            add(hat(open_=(s == 0.5)), t_of(b + s), 0.28 if s != 0.5 else 0.32, pan=0.35 if s in (0.25, 0.75) else -0.2)
        add(sub_bass(note(root_at(b) - 12), BEAT * 0.45), t_of(b + 0.5), 0.8)
        add(sub_bass(note(root_at(b) - 12), BEAT * 0.2), t_of(b + 0.75), 0.5)
        if arp:
            notes = chord_at(b) + [chord_at(b)[0] + 12]
            for k, s in enumerate((0, 0.25, 0.5, 0.75)):
                add(pluck(note(notes[(k + b) % 4] + 12)), t_of(b + s), 0.22, pan=-0.5 + (k % 2), rev=0.3)
    for b in range(b0, b1, 4):
        add(supersaw([note(n) for n in chord_at(b)] + [note(chord_at(b)[0] + 12)], BAR * BEAT, cutoff=3200), t_of(b), chords_gain, rev=0.35)

groove(16, 40)
groove(48, 56, chords_gain=0.55)
add(impact(), t_of(16), 1.0, rev=0.6)
for k in range(16):                           # confetti sparkle on the drop
    add(tick(2400 + 140 * (k % 7), 0.03), t_of(16) + 0.05 + k * 0.045, 0.28, pan=rng.uniform(-1, 1), rev=0.4)
for b in (18, 20, 21, 22):
    add(tick(2600), t_of(b), 0.5, pan=0.4)
for b in (24, 28, 32, 36):                    # Compile / Test / Review / Sign
    add(whoosh(0.45), t_of(b) - 0.42, 0.75)
    add(impact(False), t_of(b), 0.45)
for b in np.arange(24, 40, 1):                # UI chip pops
    add(tick(3000 if b % 2 else 2400, 0.03), t_of(b + 0.5), 0.35, pan=rng.uniform(-0.7, 0.7))
add(riser(BEAT * 2), t_of(38), 0.6)

# E — receipts break (beats 40-47): half-time, stamps per check, VERIFIED hit
for b in range(40, 48, 2):
    add(kick(0.9), t_of(b), 0.9); SC_TIMES.append(t_of(b))
for b in range(40, 48):
    add(hat(), t_of(b + 0.5), 0.2)
add(supersaw([note(n) for n in CH[0]], 8 * BEAT, cutoff=1400) * env(int(8 * BEAT * SR), a=0.05, d=4, s=0.5), t_of(40), 0.45, rev=0.5)
add(tick(1500), t_of(40), 0.6, rev=0.4); add(tick(1900), t_of(41), 0.6, rev=0.4)
for b in (42, 43, 44, 45, 45.5):
    add(stamp(), t_of(b), 0.75, pan=rng.uniform(-0.3, 0.3), rev=0.2)
add(impact(), t_of(46), 1.0, rev=0.7)
add(whoosh(0.9, up=True), t_of(47) - 0.2, 0.6)

# F — counters on stats
for b in (52, 53, 54):
    for k in range(8):
        add(tick(1500 + 180 * k, 0.025), t_of(b) + k * 0.025, 0.35)
    add(impact(False), t_of(b + 0.25), 0.5)

# G — outro (beats 56-63): filtered build-down, final hit, tail
for b in range(56, 60):
    add(kick(0.7), t_of(b), 0.8); SC_TIMES.append(t_of(b))
    for s in (0, 0.5): add(hat(), t_of(b + s), 0.2)
add(whoosh(1.6, up=True), t_of(57.5), 0.6)
for k in range(10):                            # letter assembly sparkle
    add(tick(2000 + 150 * k, 0.04), t_of(56) + k * 0.12, 0.3, pan=rng.uniform(-1, 1), rev=0.5)
add(impact(), t_of(60), 1.1, rev=0.9)
add(supersaw([note(n) for n in [60, 67, 72, 76]], 4.2, cutoff=2600) * env(int(4.2 * SR), a=0.01, d=1.6, s=0.0), t_of(60), 0.7, rev=0.8)
add(tick(2400, 0.06), t_of(62), 0.5, rev=0.7)

# ---------------------------------------------------------------- sidechain, reverb, master
sc = np.ones(N); tt = np.arange(N) / SR
for ts in SC_TIMES:
    i = idx(ts); n = int(0.28 * SR)
    seg = 1 - 0.65 * np.exp(-np.arange(n) / SR / 0.09)
    sc[i:i + n] = np.minimum(sc[i:i + n], seg[: max(0, min(n, N - i))])
# duck the music bus (everything except kicks would be ideal; approximate with full-bus duck lighter on low end)
L *= 0.75 + 0.25 * sc; R *= 0.75 + 0.25 * sc

ir_n = int(2.4 * SR)
ir_t = np.arange(ir_n) / SR
irL = rng.standard_normal(ir_n) * np.exp(-ir_t * 2.6); irR = rng.standard_normal(ir_n) * np.exp(-ir_t * 2.6)
irL = filt(irL, "lowpass", 6000); irR = filt(irR, "lowpass", 6000)
rv = filt(RV, "highpass", 250)
wetL = fftconvolve(rv, irL)[:N]; wetR = fftconvolve(rv, irR)[:N]
wet_norm = max(np.abs(wetL).max(), np.abs(wetR).max(), 1e-9)
L += wetL / wet_norm * 0.35; R += wetR / wet_norm * 0.35

# silence gap before the drop (beats 14-16) except the dedicated word hits — handled by arrangement
L = filt(L, "highpass", 28); R = filt(R, "highpass", 28)
mix = np.stack([L, R])
mix /= np.abs(mix).max()
mix = np.tanh(mix * 1.8) / np.tanh(1.8)              # soft-clip glue
fade = np.ones(N); fl = int(1.2 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 2
mix *= fade * 0.89                                     # ≈ -1 dBFS peak

out = sys.argv[1] if len(sys.argv) > 1 else "mainnet_audio.wav"
pcm = (np.clip(mix.T, -1, 1) * 32767).astype(np.int16)
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("wrote", out, f"{TOTAL}s")
