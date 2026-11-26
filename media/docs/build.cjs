// Renders the whitepaper (A4) and the pitch deck (16:9) to PDF with Chromium.
// Usage (repo root): node media/docs/build.cjs
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "docs");
const footer = (label) => `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;color:#8b8d9a;padding:0 20mm;display:flex;justify-content:space-between"><span>${label}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // The cover is printed without a footer, the body with page numbers; the two are merged below.
  const tmp = require("node:fs").mkdtempSync(path.join(require("node:os").tmpdir(), "4orge-pdf-"));
  await page.goto("file://" + path.join(__dirname, "whitepaper.html"), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => document.querySelectorAll("body > section").forEach((s) => s.remove()));
  await page.pdf({ path: path.join(tmp, "cover.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  await page.goto("file://" + path.join(__dirname, "whitepaper.html"), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    document.querySelector(".cover").remove();
    // Drop the cover's zero-margin first-page rule so page 1 of the body gets normal margins.
    for (const st of document.querySelectorAll("style")) st.textContent = st.textContent.replace("@page:first{margin:0}", "");
  });
  await page.pdf({
    path: path.join(tmp, "body.pdf"),
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: footer("4ORGE Whitepaper · v1.0 · November 2026"),
  });

  const { execFileSync } = require("node:child_process");
  execFileSync("python3", ["-c", "import sys\nfrom pypdf import PdfWriter\nw=PdfWriter()\nfor f in sys.argv[2:]: w.append(f)\nw.add_metadata({'/Title':'4ORGE Whitepaper','/Author':'4ORGE','/Subject':'Verifiable smart-contract deployment for QIE Blockchain'})\nw.write(sys.argv[1])", path.join(OUT, "4ORGE-Whitepaper.pdf"), path.join(tmp, "cover.pdf"), path.join(tmp, "body.pdf")]);
  require("node:fs").rmSync(tmp, { recursive: true, force: true });

  await page.goto("file://" + path.join(__dirname, "pitch.html"), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(OUT, "4ORGE-Pitch-Deck.pdf"), width: "1600px", height: "900px", printBackground: true, preferCSSPageSize: true });

  await browser.close();
  console.log("errors", JSON.stringify(errors));
})();
