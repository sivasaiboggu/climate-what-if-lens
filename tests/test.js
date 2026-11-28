// Tests for Climate What-If Lens — run: node --test tests/test.js
// Pure functions are extracted from app.js (between the YEARS declaration and
// the window.CWL export) and evaluated against the real cached data, so the
// tests exercise the shipped code, not a copy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cities.json'), 'utf8'));
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

function loadPure() {
  const start = appSrc.indexOf("var YEARS =");
  const end = appSrc.indexOf('window.CWL =');
  assert.ok(start !== -1 && end !== -1 && end > start, 'pure-function block found in app.js');
  const src = appSrc.slice(start, end) + '\nreturn { floodCells, waterLevel, heatDelta, cachedSummary, matchSeededCity, floodDepthBand, YEARS, SCENARIOS };';
  const fn = new Function('DATA', 'window', src);
  return fn(data, { CWL_DATA: data });
}
const P = loadPure();
const CITIES = ['mumbai', 'chennai', 'kolkata', 'kochi', 'dhaka', 'miami', 'new-orleans', 'rotterdam'];

test('data: all 8 seeded cities present with 5 windows and a 10x10 elevation grid', () => {
  assert.deepEqual(Object.keys(data).sort(), [...CITIES].sort());
  for (const id of CITIES) {
    const c = data[id];
    assert.ok(c.lat >= -90 && c.lat <= 90 && c.lon >= -180 && c.lon <= 180, id + ' coords');
    assert.deepEqual(Object.keys(c.windows).sort(), ['1991-2020', '2025', '2030', '2040', '2050']);
    for (const w of Object.keys(c.windows)) {
      assert.equal(c.windows[w].models.length, 2, id + ' ' + w + ' has 2 models');
      const a = c.windows[w].average;
      assert.ok(a.days_ge35_per_year >= 0 && a.days_ge35_per_year <= 365, id + ' ' + w + ' days>=35 in range');
      assert.ok(a.days_ge40_per_year >= 0 && a.days_ge40_per_year <= a.days_ge35_per_year, id + ' ' + w + ' days>=40 <= days>=35');
      assert.ok(a.annual_mean > -10 && a.annual_mean < 40, id + ' mean temp sane');
    }
    assert.equal(c.elevation_grid.elevations.length, 10);
    c.elevation_grid.elevations.forEach(r => assert.equal(r.length, 10));
    assert.ok(c.elevation_grid.elevations.flat().every(v => v === null || (typeof v === 'number' && v > -50 && v < 1000)));
  }
});

test('data: per-model values average to the stored average (within rounding)', () => {
  for (const id of CITIES) {
    for (const w of Object.keys(data[id].windows)) {
      const win = data[id].windows[w];
      const mean35 = win.models.reduce((s, m) => s + m.days_ge35_per_year, 0) / 2;
      assert.ok(Math.abs(mean35 - win.average.days_ge35_per_year) <= 0.1, `${id} ${w} model average matches`);
    }
  }
});

test('floodCells: bathtub math on a synthetic grid', () => {
  assert.deepEqual(P.floodCells([[0, 5], [10, -1]], 1), { flooded: 2, total: 4, percent: 50 });
  assert.deepEqual(P.floodCells([[5, 6]], 1), { flooded: 0, total: 2, percent: 0 });
  assert.deepEqual(P.floodCells([[null, 0]], 1), { flooded: 1, total: 1, percent: 100 });
  assert.deepEqual(P.floodCells([[]], 1), { flooded: 0, total: 0, percent: 0 });
});

test('flood: higher water level never floods fewer cells, for every city', () => {
  for (const id of CITIES) {
    const g = data[id].elevation_grid.elevations;
    const lo = P.floodCells(g, 0.5).flooded, hi = P.floodCells(g, 1.5).flooded;
    assert.ok(hi >= lo, id + ' monotonic in water level');
  }
});

test('flood: 2050 SSP5-8.5 floods at least as much as SSP2-4.5, for every city', () => {
  for (const id of CITIES) {
    const g = data[id].elevation_grid.elevations;
    const a = P.floodCells(g, P.waterLevel('SSP2-4.5', '2050')).flooded;
    const b = P.floodCells(g, P.waterLevel('SSP5-8.5', '2050')).flooded;
    assert.ok(b >= a, id + ' SSP5-8.5 >= SSP2-4.5 in 2050');
  }
});

test('waterLevel: scenario table matches the plan', () => {
  assert.equal(P.waterLevel('SSP2-4.5', '2050'), 2);
  assert.equal(P.waterLevel('SSP5-8.5', '2050'), 4);
  assert.equal(P.waterLevel('SSP2-4.5', '2025'), 1);
  assert.equal(P.waterLevel('SSP5-8.5', '2040'), 3);
  assert.ok(P.waterLevel('SSP5-8.5', '2030') >= P.waterLevel('SSP2-4.5', '2030'));
});

test('floodDepthBand: depth bands shade flooded cells, dry cells are null', () => {
  assert.equal(P.floodDepthBand(0, 1), 'shallow');
  assert.equal(P.floodDepthBand(0, 2), 'mid');
  assert.equal(P.floodDepthBand(0, 4), 'deep');
  assert.equal(P.floodDepthBand(3, 4), 'shallow');
  assert.equal(P.floodDepthBand(4, 4), null);
  assert.equal(P.floodDepthBand(5, 4), null);
  assert.equal(P.floodDepthBand(null, 4), null);
});

test('flood: Mumbai visibly changes between 2025 and 2050 SSP5-8.5', () => {
  const g = data.mumbai.elevation_grid.elevations;
  const a = P.floodCells(g, P.waterLevel('SSP2-4.5', '2025')).flooded;
  const b = P.floodCells(g, P.waterLevel('SSP5-8.5', '2050')).flooded;
  assert.ok(b > a, `Mumbai flooded cells grow: ${a} -> ${b}`);
});

test('heatDelta: 2050 vs baseline is computed from stored windows', () => {
  const d = P.heatDelta(data.chennai, '2050');
  const expect = +(data.chennai.windows['2050'].average.days_ge35_per_year - data.chennai.windows['1991-2020'].average.days_ge35_per_year).toFixed(1);
  assert.equal(d.d35, expect);
  assert.ok(d.dMean > 0, 'Chennai warms by 2050 in the model average');
  const r = P.heatDelta(data.rotterdam, '2050');
  assert.equal(r.d35, 0, 'Rotterdam has 0 days >=35 in both baseline and 2050');
  assert.ok(r.dMean > 0, 'Rotterdam annual mean still rises');
});

test('cachedSummary: names the city, year, scenario and the screening caveat', () => {
  const s = P.cachedSummary(data.mumbai, '2050', 'SSP5-8.5');
  assert.ok(s.includes('Mumbai'), 'names city');
  assert.ok(s.includes('2050') && s.includes('SSP5-8.5'), 'names year + scenario');
  assert.ok(s.includes('4.0 m'), 'names water level');
  assert.ok(s.toLowerCase().includes('screening estimate'), 'carries the flood caveat');
  assert.ok(s.includes('not an engineering prediction'), 'caveat wording exact');
});

test('matchSeededCity: finds seeded cities by name fragment, rejects others', () => {
  assert.equal(P.matchSeededCity('Mumbai').id, 'mumbai');
  assert.equal(P.matchSeededCity('bandra west, mumbai').id, 'mumbai');
  assert.equal(P.matchSeededCity('New Orleans').id, 'new-orleans');
  assert.equal(P.matchSeededCity('Pune'), null);
  assert.equal(P.matchSeededCity(''), null);
});

test('app.js: search status never keeps the error style after a later success', () => {
  // Regression: a failed lookup set className 'status error' and later success
  // messages only replaced the text, so they stayed red until reload.
  assert.ok(appSrc.includes('function setSearchStatus(msg, isError)'), 'single status helper exists');
  assert.ok(!/\$\('searchStatus'\)\.textContent/.test(appSrc), 'no direct status text writes bypass the helper');
  assert.ok(appSrc.includes("setSearchStatus('Seeded city: '") && appSrc.includes(", false)"), 'success paths reset the status class');
  assert.ok(appSrc.includes("setSearchStatus('Lookup failed"), 'failure paths still mark the error class');
});

test('app.js: copy failure is reported, not swallowed', () => {
  assert.ok(appSrc.includes("Copy failed — select the summary text manually."), 'clipboard rejection shows a message');
});

test('years: slider covers 2025, 2030, 2040, 2050', () => {
  assert.deepEqual(P.YEARS, ['2025', '2030', '2040', '2050']);
});

test('html: disclaimer, sources, settings and all controls exist; no dead placeholder copy', () => {
  assert.ok(html.includes('screening estimate, not an engineering prediction'), 'disclaimer on screen');
  assert.ok(html.includes('id="yearSlider"') && html.includes('id="searchBtn"'), 'controls present');
  assert.ok(html.includes('id="settingsDlg"') && html.includes('id="copyBtn"') && html.includes('id="downloadBtn"'), 'settings/copy/download present');
  assert.ok(html.includes('Open-Meteo Climate API') && html.includes('Nominatim'), 'sources named');
  assert.ok(!/lorem ipsum/i.test(html), 'no lorem ipsum');
  assert.ok(!/seamless|supercharge|elevate|unlock/i.test(html), 'no cliché copy');
});

test('css: glacier cyan identity, no gradients or glows', () => {
  assert.ok(css.includes('#0891B2'), 'glacier cyan present');
  assert.ok(css.includes('Instrument Sans'), 'Instrument Sans present');
  assert.ok(!/linear-gradient|radial-gradient|box-shadow:\s*0 0 \d+px/i.test(css), 'no gradients or glows');
});

test('app.js: no fake live calls — Gemini only with a user key, flood labelled screening', () => {
  assert.ok(appSrc.includes('generativelanguage.googleapis.com'), 'Gemini endpoint present');
  assert.ok(appSrc.includes("localStorage.getItem('cwl.geminiKey')"), 'key read from localStorage only');
  assert.ok(appSrc.includes('Cached summary'), 'cached fallback exists');
  assert.ok(appSrc.includes('screening estimate'), 'screening label in code');
  assert.ok(!appSrc.includes('Math.random()'), 'no random fake data');
});
