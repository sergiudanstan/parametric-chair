> **Superseded by furniture-quotation** → <https://github.com/sergiudanstan/furniture-quotation> · <https://sergiudanstan.github.io/furniture-quotation/>
> It offers the same ten-parameter chair with 3MF/STL/OBJ export, plus a live price and PDF quote, and a table.
> This repository is archived; the text below is kept as history.

# parametric-chair

[![CI](https://github.com/sergiudanstan/parametric-chair/actions/workflows/ci.yml/badge.svg)](https://github.com/sergiudanstan/parametric-chair/actions/workflows/ci.yml)
[![CodeQL](https://github.com/sergiudanstan/parametric-chair/actions/workflows/codeql.yml/badge.svg)](https://github.com/sergiudanstan/parametric-chair/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/sergiudanstan/parametric-chair/badge)](https://scorecard.dev/viewer/?uri=github.com/sergiudanstan/parametric-chair)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Parametric 3D-printable chair configurator that runs entirely in the browser. Ten sliders change
the chair live; the model is built with the Manifold WASM geometry kernel, previewed with
three.js, and can be downloaded as 3MF, STL or OBJ.

**Live:** https://sergiudanstan.github.io/parametric-chair/

## What it configures

Ten parameters in millimetres (degrees for the tilt), each with a slider range from
`src/main.ts`:

| Parameter | Range | Default |
|---|---|---|
| Seat width | 300-600 | 440 |
| Seat depth | 300-550 | 360 |
| Seat height | 380-520 | 450 |
| Seat thickness | 15-40 | 20 |
| Backrest height (0 = no backrest) | 200-700 | 520 |
| Backrest tilt | 0-25 deg | 8 |
| Leg thickness | 20-60 | 30 |
| Armrest height (0 = no armrests) | 0-300 | 0 |
| Armrest thickness | 15-40 | 22 |
| Corner radius | 0-20 | 3 |

The chair is a union of boxes (seat, aprons, legs, front stretcher, optional backrest and armrests)
built in `src/model/manifold.ts`. Dragging the preview rotates it. There is no pricing in this
variant; see [chair-quotation](https://github.com/sergiudanstan/chair-quotation) for the version with live
price and PDF quote.

## Deployment

`.github/workflows/deploy.yml` builds with `--base /parametric-chair/` and publishes `dist/` to GitHub Pages on
every push to `main`. `netlify.toml` (build `npm run build`, publish `dist`, SPA redirect and
security headers) is only used if the site is also connected to Netlify; GitHub Pages ignores it.

## Development

```bash
npm ci
npm run dev        # Vite dev server
npm run build      # tsc type-check + production build into dist/
npm test           # headless Chrome smoke test of dist/ (run the build first)
```

`npm test` needs Google Chrome installed (set `PW_CHANNEL=chromium` to use Playwright's Chromium).
CI runs the type-check and build, the smoke test, `npm audit`, `pip-audit` on the CI toolchain,
CodeQL and `zizmor` on the workflows.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [CHANGELOG.md](CHANGELOG.md).
