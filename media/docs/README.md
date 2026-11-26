# Whitepaper and pitch deck

| Output | Source |
|---|---|
| `docs/4ORGE-Whitepaper.pdf` (A4, 14 pages) | `whitepaper.html` |
| `docs/4ORGE-Pitch-Deck.pdf` (16:9, 11 slides) | `pitch.html` |

Rebuild both from the repository root with `node media/docs/build.cjs` (needs Playwright's Chromium and Python's `pypdf`). The whitepaper's cover is printed without a footer and merged with the numbered body pages.
