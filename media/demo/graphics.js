// Renders the demo video's graphics to PNG with Chromium:
// background frame, title card, closing card, and one chip per segment.
// Usage: node graphics.js <timeline.json> <out-dir>
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const FONTS = path.join(ROOT, "node_modules/geist/dist/fonts");
const MARK = fs.readFileSync(path.join(ROOT, "public/brand/4orge-mark.svg"), "utf8");
const base = `
@font-face{font-family:G;src:url(file://${FONTS}/geist-sans/Geist-Regular.woff2);font-weight:400}
@font-face{font-family:G;src:url(file://${FONTS}/geist-sans/Geist-Medium.woff2);font-weight:500}
@font-face{font-family:G;src:url(file://${FONTS}/geist-sans/Geist-SemiBold.woff2);font-weight:600}
@font-face{font-family:G;src:url(file://${FONTS}/geist-sans/Geist-Bold.woff2);font-weight:700}
@font-face{font-family:M;src:url(file://${FONTS}/geist-mono/GeistMono-Medium.woff2);font-weight:500}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:G,sans-serif;color:#14141b;-webkit-font-smoothing:antialiased}
.lock{display:flex;align-items:center;gap:12px;font-weight:600;letter-spacing:.06em}
.lock svg{height:1.25em;width:auto}
.four{color:#2b2d33}.orge{color:#3d89e9}
.canvas{width:1920px;height:1080px;position:relative;overflow:hidden;background:#f1f1f7}
.canvas::before{content:"";position:absolute;inset:0;background-image:radial-gradient(#c9c9d6 1.4px,transparent 1.7px);background-size:34px 34px;opacity:.55}
.glow{position:absolute;border-radius:50%}
`;
const lockup = (size) => `<div class="lock" style="font-size:${size}px">${MARK.replace("<svg", '<svg height="1.25em"')}<span><span class="four">4</span><span class="orge">ORGE</span></span></div>`;

const pages = {
  // Behind the screen recording: soft canvas, window shadow, logo top-left.
  bg: { w: 1920, h: 1080, html: `<div class="canvas">
      <div class="glow" style="width:1100px;height:1100px;right:-380px;top:-520px;background:radial-gradient(circle,rgba(61,137,233,.22),rgba(61,137,233,0) 65%)"></div>
      <div class="glow" style="width:900px;height:900px;left:-380px;bottom:-480px;background:radial-gradient(circle,rgba(246,200,220,.5),rgba(246,200,220,0) 65%)"></div>
      <div style="position:absolute;left:160px;top:80px;width:1600px;height:770px;border-radius:18px;background:#fff;box-shadow:0 2px 6px rgba(22,22,40,.08),0 40px 80px -30px rgba(22,22,40,.35)"></div>
      <div style="position:absolute;left:160px;top:22px">${lockup(28)}</div>
      <div style="position:absolute;right:160px;top:30px;font-family:M;font-size:17px;color:#8a8d96">4orge.xyz · live demo</div>
    </div>` },
  title: { w: 1920, h: 1080, html: `<div class="canvas" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
      <div class="glow" style="width:1200px;height:1200px;left:50%;top:50%;transform:translate(-50%,-55%);background:radial-gradient(circle,rgba(61,137,233,.22),rgba(61,137,233,0) 62%)"></div>
      <div style="position:relative">${lockup(64)}</div>
      <div style="position:relative;margin-top:44px;font-size:22px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#2a6fcc">Live product demo</div>
      <div style="position:relative;margin-top:18px;font-size:72px;font-weight:650;letter-spacing:-.03em;line-height:1.08">From GitHub to <span style="color:#3d89e9">QIE Mainnet</span><br>in one workspace.</div>
      <div style="position:relative;margin-top:30px;font-size:26px;color:#5d606a">Import · compile · test · review · sign · verify</div>
    </div>` },
  outro: { w: 1920, h: 1080, html: `<div class="canvas" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
      <div class="glow" style="width:1200px;height:1200px;left:50%;top:50%;transform:translate(-50%,-55%);background:radial-gradient(circle,rgba(61,137,233,.24),rgba(61,137,233,0) 62%)"></div>
      <div style="position:relative">${MARK.replace("<svg", '<svg height="150"')}</div>
      <div style="position:relative;margin-top:36px;font-size:76px;font-weight:650;letter-spacing:-.03em;line-height:1.08">Compile, test &amp; deploy on QIE.<br><span style="color:#3d89e9">Your wallet signs. The chain confirms.</span></div>
      <div style="position:relative;display:flex;gap:18px;margin-top:48px">
        <span style="font-family:M;font-size:30px;background:#14141b;color:#fff;border-radius:999px;padding:16px 34px">4orge.xyz</span>
        <span style="font-family:M;font-size:30px;background:#fff;border:1px solid #e3e3ec;border-radius:999px;padding:16px 34px">github.com/TeevincsCrypt/4orge</span>
      </div>
      <div style="position:relative;margin-top:30px;font-size:22px;color:#8a8d96">Built for QIE Blockchain Hackathon 3.0</div>
    </div>` },
};

function chip(label, badge, tone = "#3d89e9") {
  return `<div style="display:inline-flex;align-items:center;gap:12px;background:#fff;border:1px solid #e3e3ec;border-radius:999px;padding:9px 18px 9px 14px;font-size:20px;font-weight:600;box-shadow:0 8px 22px -10px rgba(30,40,90,.35)">
    <span style="width:11px;height:11px;border-radius:50%;background:${tone};box-shadow:0 0 0 4px ${tone}33"></span>${label}
    ${badge ? `<span style="font-family:M;font-size:15px;font-weight:500;color:#5d606a;background:#f1f1f7;border-radius:999px;padding:3px 10px">${badge}</span>` : ""}</div>`;
}

(async () => {
  const [timelinePath, outDir] = process.argv.slice(2);
  const tl = JSON.parse(fs.readFileSync(timelinePath, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const shot = async (name, html, w, h, transparent) => {
    await p.setViewportSize({ width: w, height: h });
    // Rendered from a file so the file:// fonts load (they don't from about:blank).
    const file = path.join(outDir, `_${name}.html`);
    fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${base} html,body{background:${transparent ? "transparent" : "#f1f1f7"}}</style></head><body>${html}</body></html>`);
    await p.goto("file://" + file, { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    if (transparent) {
      const el = await p.$("body > div");
      await el.screenshot({ path: path.join(outDir, `${name}.png`), omitBackground: true });
    } else {
      await p.screenshot({ path: path.join(outDir, `${name}.png`) });
    }
    fs.rmSync(file);
  };
  for (const [name, pg] of Object.entries(pages)) await shot(name, pg.html, pg.w, pg.h, false);
  for (const [i, seg] of tl.segments.entries()) {
    if (!seg.chip) continue;
    const speed = seg.clips[0]?.speed ?? 1;
    const badge = speed > 1.2 ? `${speed.toFixed(1)}×` : null;
    await shot(`chip_${seg.id}`, chip(`${i + 1} · ${seg.chip}`, badge), 900, 120, true);
  }
  await shot("chip_ff", chip("Waiting for QIE to confirm", "fast-forward 6×", "#1f9d63"), 900, 120, true);
  await b.close();
  console.log("graphics ok");
})();
