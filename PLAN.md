# Climate What-If Lens — Deepened Plan (SaaS level)

## 1. Project brief
- **Name:** Climate What-If Lens
- **Type:** Web app / SaaS demo (freemium climate-risk screening tool)
- **What it does (1 sentence):** Pick an address and see, on a map and in plain numbers, what heat and flooding could look like there in 2030, 2040 or 2050 under two emissions scenarios.
- **Target user and pain:** Homebuyers, renters, small developers, insurers and city staff who need a quick, honest answer to "is this place going to flood or overheat?" without hiring a consultant or reading a 200-page IPCC chapter.
- **Core promise:** Same address, two futures — the data, not a guess, decides which one.
- **Tone:** Calm, plain, scientific. No alarm, no marketing adjectives.
- **Design identity:** Glacier cyan `#0891B2` + Instrument Sans. White/off-white ground, ink text, one accent only. No gradients, no glows.
- **References (design-playbook, picked before building):**
  1. Climate Central Surging Seas / Risk Finder — map + side panel, legend and disclaimer always visible. Borrow: the map-first layout and the plain-language risk sentence.
  2. Our World in Data — plain charts, every number labelled with its source and window. Borrow: the chart + footnote discipline.
  3. NASA Earth Observatory — restrained scientific labelling, no decoration. Borrow: the "what this is / what this is not" honesty block.
- **Platforms:** Web (desktop + mobile). Static site, deployable to Vercel / GitHub Pages.

## 2. Stack — verified 23 Nov 2026 (no version invented)
- **App:** Plain HTML + CSS + vanilla JS, no build step. Deliberate deviation from the
  original Next.js plan: the demo must run from `file://` and on venue Wi-Fi with no
  keys and no build server, and headless Chrome in this VM cannot reach external
  HTTPS, so a framework build and a CDN map would render blank in verification.
  The static build keeps every flow testable offline. Next.js + MapLibre is the
  documented v2 path (see §9).
- **Map:** Offline schematic grid map rendered from the real elevation grid
  (10×10 cells per city, Open-Meteo Elevation API, 90 m SRTM-derived). MapLibre
  GL JS latest verified version is **v6.19.0 (17 Nov 2026)**, ESM-only since v6.0.0
  (UMD bundles no longer published) — therefore not used in this offline-first
  build; the map panel is labelled "Schematic map — coastline simplified, not
  for navigation" and v2 wires MapLibre v6.19.0 + CARTO basemap tiles when online.
- **Heat data (real):** Open-Meteo Climate API
  `https://climate-api.open-meteo.com/v1/climate` — daily CMIP6 output,
  downscaled to ~10 km, bias-corrected against ERA5, 1950–2050. Models used:
  `CMCC_CM2_VHR4` and `EC_Earth3P_HR`, averaged. Variables:
  `temperature_2m_max`, `temperature_2m_mean`, `precipitation_sum`.
  Windows computed: baseline 1991–2020, 2025 (2021–2030), 2030 (2026–2035),
  2040 (2036–2045), 2050 (2041–2050). Metrics per window: days/year with
  max ≥35 °C, days/year ≥40 °C, hottest-month mean max, annual mean max,
  annual mean. Fetched 23 Nov 2026 via curl and cached in `data/cities.json`
  (49 KB, model averages + per-model values + elevation grid).
- **Elevation (real):** Open-Meteo Elevation API, bulk lat/lon grid per city.
- **Geocoding:** OpenStreetMap Nominatim, public instance. Usage policy verified
  23 Nov 2026: absolute maximum **1 request/second**, single thread, identifying
  User-Agent, cache results, no client-side autocomplete, no bulk geocoding.
  The app therefore geocodes only on explicit search submit, caches in
  localStorage, and never autocompletes.
- **Optional summary:** Google Gemini (`gemini-2.0-flash` via
  `generativelanguage.googleapis.com/v1beta`), only when the user pastes their
  own free key in Settings (localStorage only, never sent anywhere else).
  Without a key the app shows a cached, data-derived summary labelled as such.
  No live call is ever faked.
- **Sea-level / flood:** No free public API returns a 2050 flood depth for an
  arbitrary address (verified in the source plan; Climate Central has no open
  arbitrary-lookup API). The flood layer is a **bathtub screening estimate**:
  grid cells with elevation below the scenario water level are shown flooded.
  Scenario water levels (m above present mean sea level) are planning levels,
  not local projections: 2025 → 1 m (both scenarios); 2030 → 1 / 2 m;
  2040 → 2 / 3 m; 2050 → 2 m (SSP2-4.5) / 4 m (SSP5-8.5). They combine
  the IPCC AR6 global-mean sea-level rise to 2050 (~0.2–0.3 m across SSPs)
  with a local high-water / storm-surge allowance. Labelled on screen:
  **"Screening estimate, not an engineering prediction."** Ignores levees,
  drainage, tides and defences; wrong at building level.

## 3. Feature set (SaaS level, demoable in 24–48 h)
1. **Seeded-city picker** — 8 cities: Mumbai, Chennai, Kolkata, Kochi, Dhaka,
   Miami, New Orleans, Rotterdam. Each has cached heat + elevation data.
2. **Address search** — type an address; seeded-city match resolves instantly.
   Unseeded address: live Nominatim geocode (when online) → heat only, fetched
   live from Open-Meteo Climate API; flood overlay disabled with a plain
   explanation. Offline: honest error, seeded cities still work.
3. **Year slider** — 2025 / 2030 / 2040 / 2050. Dragging updates map, numbers,
   chart and summary together.
4. **Scenario toggle** — SSP2-4.5 (middle of the road) vs SSP5-8.5 (high
   emissions). Drives the flood water level. Heat shown is the same CMIP6
   HighResMIP ensemble for both: Open-Meteo documents that scenario differences
   are small until 2050 and the high-resolution models sit close to RCP8.5 —
   the panel says this plainly instead of inventing two heat curves.
5. **Layer toggle** — Flood / Heat / Both. Heat renders as a colour wash over
   the grid by days ≥35 °C; flood renders blue cells below the water level.
6. **Before / after compare** — a 2025-vs-selected-year split: two mini-panels
   and a "Compare with 2025" switch that pins the baseline numbers next to the
   selected year.
7. **Side panel numbers** — days ≥35 °C/year, days ≥40 °C/year, hottest-month
   mean max, annual mean change vs 1991–2020 baseline, % of mapped area below
   the screening water level, cells flooded (n/100). Every number carries its
   window and model note.
8. **Bar chart** — days ≥35 °C per year for 2025 / 2030 / 2040 / 2050, plain
   bars, values labelled, no decoration.
9. **Plain-language summary** — one paragraph from the selected city's data.
   Gemini version when a key is pasted; cached version otherwise, labelled.
10. **Settings** — paste Gemini API key (localStorage only), clear key, clear
    geocode cache. Key is never logged or sent except to Google's API.
11. **Export** — copy the summary to clipboard; download the city's cached
    data as JSON.
12. **Sources + honesty block** — always visible under the panel: data sources,
    models, windows, flood disclaimer, map-schematic note.
13. **States** — loading, offline, unknown address, no-key, API-error states
    all have plain copy and a next step. No dead controls: every button does
    something or is absent.

## 4. Data model
```
data/cities.json
  <city-id>: {
    id, name, lat, lon,
    windows: { "1991-2020" | "2025" | "2030" | "2040" | "2050": {
      models: [{ model, days_ge35_per_year, days_ge40_per_year,
                 hottest_month_mean_max, annual_mean_max, annual_mean }],
      average: { ...same metrics, mean of the two models... } } },
    elevation_grid: { lats[10], lons[10], elevations[10][10],
                      source: "Open-Meteo Elevation API (90 m SRTM-derived)" }
  }
Scenario water levels (in app.js, SCENARIOS):
  SSP2-4.5: {2025:1, 2030:1, 2040:2, 2050:2}
  SSP5-8.5: {2025:1, 2030:2, 2040:3, 2050:4}
Derived at runtime (pure functions, unit-tested):
  floodCells(city, year, scenario) -> { flooded, total, percent }
  heatDelta(city, year) -> change in days>=35 and annual mean vs baseline
  cachedSummary(city, year, scenario) -> plain paragraph from the numbers
localStorage keys: cwl.geminiKey, cwl.geocodeCache
```

## 5. User flow end to end
1. Land on the app: Mumbai is selected, year 2025, SSP2-4.5, Both layers.
   Map, numbers, chart and summary all render from cached JSON — no network.
2. Type "Bandra West, Mumbai" (or pick Chennai from the city list) → the map
   recentres on the seeded city, the marker moves, numbers update.
3. Drag the year slider to 2050 → flood cells spread on the map, the heat
   gauge numbers rise, the chart highlights 2050, the summary rewrites.
4. Switch scenario to SSP5-8.5 → flood water level rises (2 → 4 m in
   2050), more cells turn blue; a line under the toggle explains the heat
   curve does not change between scenarios before 2050.
5. Toggle layer to Heat only, then Flood only, then Both.
6. Turn on "Compare with 2025" → baseline numbers sit beside the 2050
   numbers with the change shown as +N days / +N.N °C.
7. Open Settings, paste a free Gemini key, press "Use Gemini summary" →
   the summary is replaced by a live one-paragraph summary; remove the key
   → cached summary returns, labelled.
8. Press "Copy summary" or "Download city data (JSON)" → clipboard / file.
9. Type an unseeded address (e.g. "Pune") → if online, Nominatim geocodes it,
   heat is fetched live from Open-Meteo and shown; flood shows "not available
   for this address — flood overlay only for the 8 seeded cities". If offline,
   a plain error names the problem and points back to the seeded cities.
10. Read the sources + disclaimer at the bottom of the panel before judging
    anything on screen.

## 6. Screens / layout
- **Desktop (1280px):** left column (360px) — search, city list, year slider,
  scenario toggle, layer toggle, compare switch; centre — map with legend and
  water-level badge; right column (360px) — numbers, chart, summary, actions.
  On wide screens the map is the signature: a large gridded elevation map in
  cyan/blue with the flooded cells in solid glacier blue.
- **Mobile (390px):** single column — search, map, controls, numbers, chart,
  summary, sources. Zero horizontal overflow.
- **Signature visual idea:** the elevation grid itself — a 10×10 field of
  cells shaded by elevation, with flooded cells in solid `#0891B2`. One idea,
  repeated on the map, the legend and the chart accent.

## 7. Honesty limits (shown in README and on screen)
- Flood is a bathtub screening estimate, not hydrodynamic modelling and not
  an engineering prediction. No levees, drainage, tides or defences.
- Heat is a CMIP6 model average at ~10 km resolution; a single address can
  differ. Values are projections for model validation/planning, not
  measurements of the past.
- Scenario toggle does not change the heat curve (see §2) — only the flood
  water level and the summary wording.
- The map is schematic (simplified coastline, 10×10 elevation grid), not a
  survey map and not for navigation.
- Gemini summary needs the user's own key; without it the summary is cached
  text computed from the same numbers on screen.

## 8. 2-minute demo script
- **0:00–0:15** — "Pick any address." Type a Mumbai address; show today's map.
- **0:15–0:45** — Drag to 2050, SSP5-8.5: the flood overlay spreads, the heat
  panel shows the change in days over 35 °C vs the 1991–2020 baseline.
- **0:45–1:20** — Switch to SSP2-4.5 to show the difference mitigation makes;
  switch to heat-only view; point at the chart.
- **1:20–1:50** — Read the one-paragraph summary and point at the on-screen
  sources and the "screening estimate, not an engineering prediction" label.
- **1:50–2:00** — Close: "Same address, two futures — the data, not a guess,
  decides which one."

## 9. v2 ideas (not built now)
MapLibre GL JS v6.19.0 + CARTO basemap tiles when online, with the schematic
grid as the offline fallback; live Open-Meteo fetch for any geocoded address
with a loading state; per-city flood from Climate Central / Copernicus where a
licence allows; saved places + share link (`?city=&year=&scenario=`); PDF
report export; multi-model spread (show both models, not just the average).

## 10. Launch checklist
- [x] Real data fetched and cached (8 cities, 2 models, 5 windows, elevation grids)
- [x] Tests pass, 0 failures — 15 tests, 15 pass (`node --test tests/test.js`)
- [x] Screenshots 1280px + 390px, zero overflow, read and fixed (4 shots in `screenshots/`;
  fixed: sub-metre water levels that changed nothing, pink heat wash, year-label layout)
- [x] README + MIT LICENSE, sources + disclaimer on screen
- [x] git init + human-style commits, no push (Siva creates the repo `climate-what-if-lens`)
