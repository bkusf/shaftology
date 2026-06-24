# Shaftology

**An aftermarket driver shaft lab — profile a shaft, then find similar alternatives by its "DNA."**

Shaftology is a single-page web app for golf shaft nerds. Pick the shaft that's in your driver, see its profile visualized, and get ranked alternatives with similar characteristics — or work backwards from a launch/spin goal. The database covers ~48 shafts across 11 major aftermarket makers, current to the 2026 season.

No build step, no dependencies — just vanilla HTML, CSS, and JavaScript.

## Features

- **The Fitting Bench** — select Manufacturer → Model → Weight → Flex to profile your current shaft, visualized with a radar chart, an animated spec strip, and a bend-profile "spine."
- **Profile-DNA matching** — ranked alternatives by a weighted nearest-neighbour search across 8 shaft characteristics, with a match %, color-coded trade-off pills, and an "other makers only" toggle. Click the ⓘ next to *profile DNA* for the full methodology.
- **Goal Finder** — no shaft in mind? Dial a flight window (launch / spin / weight / feel) and rank the whole database by how closely each shaft delivers it.
- **The Vault** — a filterable grid of every shaft; hover the mini bar chart to read each spec's label and value.
- **Product photos on hover** — hover a card's photo icon to see a real product image (hotlinked from manufacturer/retailer CDNs), with a branded color swatch as a fallback.
- **Light / dark themes** — a carbon-lab dark mode and a "lab paper" light mode; your choice persists and respects your OS preference.

## Running it

It's a static site — no build, no install.

```bash
# from the project root
python3 -m http.server 4173
# then open http://localhost:4173
```

Or just open `index.html` directly in a browser. (An internet connection is needed for the Google Fonts and the hotlinked product photos.)

## Project structure

| File | What's in it |
|------|--------------|
| `index.html` | Page structure |
| `styles.css` | All styling + the light/dark theme tokens |
| `data.js` | The shaft database, plus image / color / verified-spec maps |
| `app.js` | Selection logic, the similarity engine, SVG charts, goal finder, and UI wiring |

## How matching works

Each shaft is reduced to an 8-dimension fingerprint (launch, spin, tip / mid / butt stiffness, balance, feel, stability) on a 1–5 scale. Matches are ranked by a **weighted Euclidean distance** plus weight/flex penalties, converted to a 0–100% score via exponential decay. It's transparent and deterministic — no machine learning. The in-app methodology modal documents the exact formula and weights.

## A note on the data

The 1–5 profile values are **curated relative estimates** for most shafts — directional fitting characteristics for comparison, **not OEM lab numbers**. Shafts marked **✓ Verified specs** use published manufacturer figures (length, weight, torque, tip/butt diameter). Measured EI profiles aren't used: the real datasets are paywalled (Fit2Score / golfshaftreviews) and manufacturers only publish relative bend guides.

The recommendation engine matches **shaft-to-shaft, not player-to-shaft** — it knows nothing about your swing speed, tempo, or attack angle. Use it to build a shortlist, then **get fit by a professional** before buying.

## Disclaimer

Not affiliated with, endorsed by, or sponsored by any shaft manufacturer. All product names, images, and trademarks belong to their respective owners. Shaft profiles are opinions for comparison only.
