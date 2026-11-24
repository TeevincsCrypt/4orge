// Renders media/thread/slides.html to media/thread/out/post-N.png (1200×675 at 2×).
// Usage: node media/thread/capture.js [page.html] [file-prefix]
// Defaults: slides.html → post-1.png … post-8.png
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

(async () => {
  const out = path.join(__dirname, "out");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 2 });
  const [html = "slides.html", prefix = "post"] = process.argv.slice(2);
  await page.goto("file://" + path.join(__dirname, html));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  const slides = await page.$$(".slide");
  for (let i = 0; i < slides.length; i++) {
    const file = path.join(out, slides.length === 1 ? `${prefix}.png` : `${prefix}-${i + 1}.png`);
    await slides[i].screenshot({ path: file });
    console.log(file);
  }
  await browser.close();
})();
