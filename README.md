# Climate What-If Lens

Pick an address and see what heat and flooding could look like there in 2030,
2040 or 2050, under two emissions scenarios. Same address, two futures — the
data, not a guess, decides which one.

## Run it

No build step, no API key, no server. Open `index.html` in a browser, or serve
the folder with any static host (`python3 -m http.server`, Vercel, GitHub Pages).

## What is real, and what is not

- **Heat is real model data.** Open-Meteo Climate API
  (`climate-api.open-meteo.com/v1/climate`): daily CMIP6 output downscaled to
  ~10 km and bias-corrected against ERA5, 1950–2050. Two models averaged —
  `CMCC_CM2_VHR4` and `EC_Earth3P_HR`. Windows: baseline 1991–2020, and
  10-year windows around 2025 / 2030 / 2040 / 2050. Fetched 23 Nov 2026 and
  cached in `data/cities.json` (model averages + per-model values). A single
  address can differ from a ~10 km model grid cell; these are projections for
  planning, not measurements.
- **Flood is a screening estimate, not an engineering prediction.** There is no
  free public API that returns a 2050 flood depth for an arbitrary address.
  The flood layer is a bathtub overlay: grid cells below the scenario water
  level, from real 90 m elevation data (Open-Meteo Elevation API, 10×10 grid
  per city). It ignores levees, drainage, tides and defences, and it is wrong
  at building level. Scenario water levels are planning levels for a severe
  event — 2025: 1 m; 2030: 1 / 2 m; 2040: 2 / 3 m; 2050: 2 / 4 m (SSP2-4.5 /
  SSP5-8.5) — combining IPCC AR6 global-mean sea-level rise to 2050
  (~0.2–0.3 m) with a local high-tide / storm-surge allowance. Not a mean
  sea-level or local projection. Integer steps are deliberate: the elevation
  data is integer metres. Flooded cells are shaded by depth.
- **The scenario toggle does not change the heat curve.** Open-Meteo documents
  that scenario differences in these high-resolution models are small until
  2050 and the models sit close to RCP8.5. The toggle drives the flood water
  level; the panel says this plainly.
- **The map is schematic.** A 10×10 elevation grid around the city centre,
  coastline simplified, not for navigation. No map tiles are loaded, so the
  app works fully offline on the 8 seeded cities.
- **Gemini summary is optional.** Paste your own free Gemini key in Settings
  (stored in localStorage only, sent only to Google's API) for a live
  one-paragraph summary. Without a key, the summary is computed from the
  numbers on screen and labelled "Cached summary".

## Seeded cities

Mumbai, Chennai, Kolkata, Kochi, Dhaka, Miami, New Orleans, Rotterdam — each
with cached heat data and an elevation grid. Any other address: the app tries
a live Nominatim geocode (max 1 request/second per the usage policy, results
cached) and a live Open-Meteo heat lookup. Heat only — no flood overlay for
unseeded addresses, and the app says so. Offline, seeded cities still work.

## Features

Year slider (2025–2050) · SSP2-4.5 / SSP5-8.5 toggle · Flood / Heat / Both
layers · Compare with 2025 · Days ≥35 °C and ≥40 °C, hottest-month mean,
annual mean change vs 1991–2020 · Flooded share of mapped area · Bar chart ·
Plain-language summary (Gemini or cached) · Copy summary · Download city
data as JSON · Settings (Gemini key, stored locally only).

## Design

Glacier cyan `#0891B2` + Instrument Sans. References: Climate Central Surging
Seas / Risk Finder, Our World in Data, NASA Earth Observatory. No gradients,
no glows, no cliché copy.

## Stack (verified 23 Nov 2026)

- Plain HTML/CSS/vanilla JS — no build step, so the demo runs from `file://`.
- MapLibre GL JS latest is **v6.19.0 (17 Nov 2026)**, ESM-only since v6.0.0
  (UMD bundles no longer published). Not used in this offline-first build;
  wiring MapLibre + CARTO tiles when online is the documented v2 path.
- Open-Meteo Climate API + Elevation API (free, no key), Nominatim
  (1 request/second, cached, no autocomplete).

## Tests

`node --test tests/test.js` — **13 tests, 13 pass, 0 fail.** Tests run the
shipped pure functions (extracted from `app.js`) against the real cached data:
data integrity, model-average consistency, bathtub math, scenario monotonicity,
summary wording, seeded-city matching, and no-fake-data / no-gradient checks.

## Demo script (2 minutes)

0:00–0:15 type a Mumbai address, show today's map. 0:15–0:45 drag to 2050,
SSP5-8.5: flood spreads, heat panel shows the change vs baseline. 0:45–1:20
switch to SSP2-4.5, then heat-only view. 1:20–1:50 read the summary and point
at the sources and the screening-estimate label. 1:50–2:00 close: "Same
address, two futures — the data, not a guess, decides which one."

## Honest limits

- Flood is a bathtub screening estimate (see above).
- Heat is a 2-model average at ~10 km; model windows are non-monotonic in
  places (e.g. Dhaka's days ≥35 °C dip mid-century) — that is model
  variability, shown as fetched, not smoothed.
- Unseeded addresses need a network connection for geocoding + heat; flood
  never appears for them.
- Gemini needs the user's own key and a connection.

## License

MIT — see `LICENSE`.
