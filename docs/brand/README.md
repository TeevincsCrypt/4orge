# 4ORGE brand

The official logo is the **"4F" mark**: a graphite "4" interlocked with a blue "F" (4 + F = *Forge*).

| File | Use |
|---|---|
| `docs/brand/4orge-logo-source.jpg` | Original logo artwork (the source of truth). |
| `public/brand/4orge-mark.svg` | Vector mark on a transparent background, traced 1:1 from the source. Use this wherever possible. |
| `public/icon.svg` | Browser favicon (the mark on a white rounded tile). |
| `public/brand/4orge-icon-512.png`, `public/apple-touch-icon.png` | App icons. |
| `src/app/opengraph-image.png` | Social preview card (1200×630), served automatically as `og:image`. |
| `docs/brand/4orge-banner.png` | Horizontal lockup for the README and slides. |

In the app, use the `<LogoMark />` and `<Logo />` components from `src/components/shell.tsx`.

## Colors

| Token | Hex | Use |
|---|---|---|
| Logo blue (`--brand`) | `#3D89E9` | The "F", brand highlights, large display text, chart emphasis. 3.5:1 on white, so don't use it for small text. |
| Accent blue (`--accent`) | `#2A6FCC` | Links, accent text and small UI elements. The logo blue, deepened to reach 4.95:1 on white. |
| Graphite | `#7B7D83` → `#383B44` | The "4" (a vertical gradient). Wordmark "4": `#2B2D33`. |
| Ink | `#14141B` | Primary buttons. |
| Canvas | `#F1F1F7` | App background. |

## Wordmark

`4ORGE`, set in Geist semibold with +6% letter spacing: **4** in graphite (`#2B2D33`) and **ORGE** in logo blue. It echoes the two-tone mark.

## Usage

- Keep clear space around the mark of at least the width of the F's stem.
- Don't recolor, rotate, stretch or add effects to the mark. On dark backgrounds, place it on a white tile (as in the favicon), because the graphite "4" needs a light surface.
- The smallest size is 16 px tall (favicon). Below that, the 4's counter closes up.
