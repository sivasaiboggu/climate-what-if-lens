/* Climate What-If Lens — offline-first, no keys required.
   Heat: cached Open-Meteo CMIP6 averages. Flood: bathtub screening estimate.
   Map: schematic 10x10 elevation grid (real elevation data), no tiles. */
(function () {
  'use strict';

  var YEARS = ['2025', '2030', '2040', '2050'];
  var SCENARIOS = {
    // Screening water levels (m above present mean sea level). These are
    // planning levels for a severe event: IPCC AR6 global-mean sea-level rise
    // to 2050 (~0.2-0.3 m) PLUS a local high-tide / storm-surge allowance.
    // They are NOT mean sea-level projections. Integer steps are deliberate:
    // the elevation data is integer metres, so sub-metre steps would not
    // change the overlay at all (verified: Mumbai has no 1 m cells).
    'SSP2-4.5': { '2025': 1, '2030': 1, '2040': 2, '2050': 2 },
    'SSP5-8.5': { '2025': 1, '2030': 2, '2040': 3, '2050': 4 }
  };
  var DATA = window.CWL_DATA || {};

  /* ---- pure functions (also used by tests) ---- */
  function floodCells(grid, waterLevel) {
    var flooded = 0, total = 0;
    grid.forEach(function (row) {
      row.forEach(function (e) {
        if (e === null || e === undefined) return;
        total++;
        if (e < waterLevel) flooded++;
      });
    });
    return { flooded: flooded, total: total, percent: total ? Math.round(flooded / total * 100) : 0 };
  }
  function waterLevel(scenario, year) { return SCENARIOS[scenario][year]; }
  // Depth band of a flooded cell: null when not flooded. Used for shading.
  function floodDepthBand(elevation, wl) {
    if (elevation === null || elevation === undefined || elevation >= wl) return null;
    var depth = wl - elevation;
    if (depth <= 1) return 'shallow';
    if (depth <= 2) return 'mid';
    return 'deep';
  }
  function heatDelta(city, year) {
    var base = city.windows['1991-2020'].average, cur = city.windows[year].average;
    return {
      d35: +(cur.days_ge35_per_year - base.days_ge35_per_year).toFixed(1),
      d40: +(cur.days_ge40_per_year - base.days_ge40_per_year).toFixed(1),
      dMean: +(cur.annual_mean - base.annual_mean).toFixed(1)
    };
  }
  function cachedSummary(city, year, scenario) {
    var avg = city.windows[year].average, base = city.windows['1991-2020'].average;
    var d = heatDelta(city, year), wl = waterLevel(scenario, year);
    var fl = floodCells(city.elevation_grid.elevations, wl);
    var heatPart = avg.days_ge35_per_year >= 1
      ? 'about ' + avg.days_ge35_per_year + ' days a year over 35 °C'
      : 'almost no days over 35 °C';
    var change = d.d35 > 0 ? 'up from ' + base.days_ge35_per_year + ' a year in 1991–2020'
      : d.d35 < 0 ? 'down from ' + base.days_ge35_per_year + ' a year in 1991–2020'
      : 'about the same as in 1991–2020';
    return 'In ' + year + ' under ' + scenario + ', ' + city.name + ' averages ' + heatPart +
      ' (' + change + '), with an annual mean temperature ' +
      (d.dMean >= 0 ? '+' : '') + d.dMean + ' °C vs the 1991–2020 baseline. ' +
      'At a screening water level of ' + wl.toFixed(1) + ' m, ' + fl.percent +
      '% of the mapped area around the city centre sits below the water line. ' +
      'That flood figure is a screening estimate, not an engineering prediction.';
  }
  function matchSeededCity(query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) return null;
    var ids = Object.keys(DATA);
    for (var i = 0; i < ids.length; i++) {
      var c = DATA[ids[i]];
      if (c.name.toLowerCase().indexOf(q) !== -1 || q.indexOf(c.name.split(',')[0].toLowerCase()) !== -1) return c;
    }
    return null;
  }
  window.CWL = { floodCells: floodCells, waterLevel: waterLevel, heatDelta: heatDelta,
    cachedSummary: cachedSummary, matchSeededCity: matchSeededCity, floodDepthBand: floodDepthBand, YEARS: YEARS, SCENARIOS: SCENARIOS };

  /* ---- state ---- */
  var state = { cityId: 'mumbai', year: '2025', scenario: 'SSP2-4.5', layer: 'both', compare: false, liveHeat: null };

  function $(id) { return document.getElementById(id); }
  function city() { return DATA[state.cityId]; }
  function avg() {
    if (state.liveHeat) return state.liveHeat;
    return city().windows[state.year].average;
  }
  function fmt(n, dp) { return Number(n).toFixed(dp === undefined ? 1 : dp); }

  /* ---- rendering ---- */
  function renderCities() {
    var list = $('cityList'); list.innerHTML = '';
    Object.keys(DATA).forEach(function (id) {
      var c = DATA[id];
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'city-btn';
      b.setAttribute('aria-pressed', id === state.cityId ? 'true' : 'false');
      b.innerHTML = '';
      var t = document.createElement('span'); t.textContent = c.name; b.appendChild(t);
      var s = document.createElement('small');
      s.textContent = '2050: ' + c.windows['2050'].average.days_ge35_per_year + ' days ≥35 °C/yr';
      b.appendChild(s);
      b.addEventListener('click', function () { state.liveHeat = null; selectCity(id); });
      list.appendChild(b);
    });
  }

  function renderMap() {
    var svg = $('map'); var c = city();
    var grid = c.elevation_grid.elevations;
    var wl = waterLevel(state.scenario, state.year);
    var maxHeat = 0;
    YEARS.forEach(function (y) { maxHeat = Math.max(maxHeat, c.windows[y].average.days_ge35_per_year); });
    var cell = 50, html = '';
    // sea strip on the west for coastal cities (all seeded cities are coastal/riverine)
    html += '<rect x="0" y="0" width="500" height="420" fill="#EAF2F2"/>';
    for (var r = 0; r < 10; r++) {
      for (var col = 0; col < 10; col++) {
        var e = grid[r][col];
        var band = (state.layer !== 'heat') ? floodDepthBand(e, wl) : null;
        var flooded = band !== null;
        var x = col * cell, y = r * cell;
        var fill;
        if (flooded) fill = band === 'shallow' ? '#7CC4D6' : band === 'mid' ? '#0891B2' : '#0E5A6E';
        else if (state.layer !== 'flood') {
          var heat = c.windows[state.year].average.days_ge35_per_year;
          var t = maxHeat > 0 ? Math.min(heat / Math.max(maxHeat, 1), 1) : 0;
          // elevation tint + heat wash: hotter years warm the low cells (sand tones)
          fill = t > 0.05 && e !== null && e < 10 ? 'rgb(' + Math.round(253 - t * 21) + ',' + Math.round(238 - t * 58) + ',' + Math.round(214 - t * 94) + ')' : (e !== null && e < 3 ? '#DDECEC' : '#F4F8F8');
        } else fill = e !== null && e < 3 ? '#DDECEC' : '#F4F8F8';
        html += '<rect x="' + x + '" y="' + y + '" width="' + (cell - 1.5) + '" height="' + (cell - 1.5) +
          '" fill="' + fill + '" rx="2"><title>Cell row ' + (r + 1) + ', col ' + (col + 1) +
          ': elevation ' + (e === null ? 'unknown' : e + ' m') + (flooded ? ', flooded at ' + wl.toFixed(1) + ' m' : '') + '</title></rect>';
      }
    }
    // marker at city centre
    html += '<g><circle cx="250" cy="210" r="9" fill="#0F2A2E"/><circle cx="250" cy="210" r="4" fill="#fff"/>' +
      '<text x="264" y="214" font-size="13" font-weight="700" fill="#0F2A2E" stroke="#fff" stroke-width="3" paint-order="stroke">' + escapeHtml(c.name.split(',')[0]) + '</text></g>';
    svg.innerHTML = html;
    $('mapTitle').textContent = c.name;
    $('mapCoords').textContent = c.lat.toFixed(3) + ', ' + c.lon.toFixed(3);
    $('waterBadge').textContent = 'Water level ' + wl.toFixed(1) + ' m · ' + state.scenario;
  }
  function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function renderNumbers() {
    var c = city(), a = avg(), base = c.windows['1991-2020'].average, d = heatDelta(c, state.year);
    $('panelTitle').textContent = 'Heat in ' + state.year;
    $('stat35').textContent = fmt(a.days_ge35_per_year);
    $('stat40').textContent = fmt(a.days_ge40_per_year);
    if (state.liveHeat) {
      $('statHot').textContent = '—';
      $('statMean').innerHTML = fmt(a.annual_mean) + ' <small>°C</small>';
    } else {
      $('statHot').innerHTML = fmt(a.hottest_month_mean_max) + ' <small>°C</small>';
      $('statMean').innerHTML = fmt(a.annual_mean) + ' <small>°C</small>';
    }
    function delta(el, val, unit) {
      var node = $(el);
      if (state.liveHeat) { node.textContent = 'live lookup — no baseline stored'; node.className = 'd flat'; return; }
      node.textContent = (val > 0 ? '+' : '') + fmt(val) + ' ' + unit + ' vs 1991–2020';
      node.className = 'd ' + (val > 0 ? 'up' : 'flat');
    }
    delta('delta35', d.d35, 'days/yr'); delta('delta40', d.d40, 'days/yr');
    delta('deltaHot', +(a.hottest_month_mean_max - base.hottest_month_mean_max).toFixed(1), '°C');
    delta('deltaMean', d.dMean, '°C');
    $('compareLine').textContent = state.compare && !state.liveHeat
      ? '2025 baseline for ' + c.name.split(',')[0] + ': ' + fmt(c.windows['2025'].average.days_ge35_per_year) +
        ' days ≥35 °C/yr, annual mean ' + fmt(c.windows['2025'].average.annual_mean) + ' °C. Selected year: ' +
        fmt(a.days_ge35_per_year) + ' days, ' + fmt(a.annual_mean) + ' °C.'
      : '';
    // flood
    if (state.liveHeat) {
      $('statFloodPct').textContent = '—'; $('statFloodCells').textContent = '—';
      $('floodHint').textContent = 'Flood overlay is only available for the 8 seeded cities — this address has no elevation grid cached.';
      $('floodNote').textContent = '';
    } else {
      var wl = waterLevel(state.scenario, state.year);
      var fl = floodCells(c.elevation_grid.elevations, wl);
      $('statFloodPct').textContent = fl.percent + '%';
      $('statFloodCells').textContent = fl.flooded + ' / ' + fl.total;
      $('floodHint').textContent = 'Bathtub screening estimate at a water level of ' + wl.toFixed(1) + ' m (' + state.scenario + ', ' + state.year + ').';
      $('floodNote').textContent = 'Screening estimate, not an engineering prediction. Ignores levees, drainage, tides and defences.';
    }
    // chart
    var chart = $('chart'); chart.innerHTML = '';
    var max = 0;
    YEARS.forEach(function (y) { max = Math.max(max, c.windows[y].average.days_ge35_per_year); });
    YEARS.forEach(function (y) {
      var v = c.windows[y].average.days_ge35_per_year;
      var wrap = document.createElement('div'); wrap.className = 'bar-wrap';
      var val = document.createElement('div'); val.className = 'bar-val'; val.textContent = fmt(v, 0);
      var bar = document.createElement('div'); bar.className = 'bar' + (y === state.year ? ' sel' : '');
      bar.style.height = Math.max(3, Math.round(v / Math.max(max, 1) * 88)) + 'px';
      bar.title = y + ': ' + fmt(v) + ' days ≥35 °C a year';
      var lab = document.createElement('div'); lab.className = 'bar-lab'; lab.textContent = y;
      wrap.appendChild(val); wrap.appendChild(bar); wrap.appendChild(lab);
      chart.appendChild(wrap);
    });
  }

  function renderSummary() {
    var c = city();
    var key = null;
    try { key = localStorage.getItem('cwl.geminiKey'); } catch (e) { key = null; }
    if (state.liveHeat) {
      $('summary').textContent = 'Live lookup for this address: about ' + fmt(avg().days_ge35_per_year) +
        ' days a year over 35 °C in ' + state.year + ' (CMIP6 model average, ~10 km resolution). ' +
        'Flood screening is not available here — it only exists for the 8 seeded cities.';
      $('summarySrc').textContent = 'Live Open-Meteo Climate API response, cached for this session only.';
      return;
    }
    if (key) { fetchGeminiSummary(c, key); return; }
    $('summary').textContent = cachedSummary(c, state.year, state.scenario);
    $('summarySrc').textContent = 'Cached summary — computed from the numbers on screen. No Gemini key entered.';
    $('geminiStatus').textContent = '';
  }

  function fetchGeminiSummary(c, key) {
    $('summary').textContent = 'Asking Gemini for a plain-language summary…';
    $('geminiStatus').textContent = '';
    var prompt = 'In one short paragraph (max 90 words), in plain words, summarise the climate outlook for ' +
      c.name + ' in ' + state.year + ' under ' + state.scenario + ' using only these numbers: ' +
      'days over 35C per year ' + c.windows[state.year].average.days_ge35_per_year +
      ' (baseline 1991-2020: ' + c.windows['1991-2020'].average.days_ge35_per_year + '), ' +
      'days over 40C ' + c.windows[state.year].average.days_ge40_per_year +
      ', annual mean ' + c.windows[state.year].average.annual_mean + 'C, ' +
      'flood screening: ' + floodCells(c.elevation_grid.elevations, waterLevel(state.scenario, state.year)).percent +
      '% of mapped area below a ' + waterLevel(state.scenario, state.year).toFixed(1) +
      ' m screening water level. State that the flood figure is a screening estimate, not an engineering prediction.';
    fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
        var text = j && j.candidates && j.candidates[0] && j.candidates[0].content &&
          j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
        if (text) {
          $('summary').textContent = text.trim();
          $('summarySrc').textContent = 'Live Gemini summary (gemini-2.0-flash), from the numbers on screen.';
        } else {
          $('summary').textContent = cachedSummary(c, state.year, state.scenario);
          $('summarySrc').textContent = 'Cached summary — Gemini returned no text, so the on-screen numbers are used instead.';
        }
      })
      .catch(function () {
        $('summary').textContent = cachedSummary(c, state.year, state.scenario);
        $('summarySrc').textContent = 'Cached summary — Gemini request failed (offline or bad key). Check Settings.';
        $('geminiStatus').textContent = 'Gemini request failed. The cached summary is shown instead.';
      });
  }

  function renderAll() {
    renderCities(); renderMap(); renderNumbers(); renderSummary();
    $('yearRead').textContent = state.year;
    $('yearSlider').value = String(YEARS.indexOf(state.year));
    $('ssp245').setAttribute('aria-pressed', state.scenario === 'SSP2-4.5' ? 'true' : 'false');
    $('ssp585').setAttribute('aria-pressed', state.scenario === 'SSP5-8.5' ? 'true' : 'false');
    $('layerFlood').setAttribute('aria-pressed', state.layer === 'flood' ? 'true' : 'false');
    $('layerHeat').setAttribute('aria-pressed', state.layer === 'heat' ? 'true' : 'false');
    $('layerBoth').setAttribute('aria-pressed', state.layer === 'both' ? 'true' : 'false');
    $('compareToggle').setAttribute('aria-pressed', state.compare ? 'true' : 'false');
  }
  function selectCity(id) { state.cityId = id; state.liveHeat = null; $('searchStatus').textContent = ''; renderAll(); }

  /* ---- search: seeded match first, then live Nominatim (1 req/s policy) ---- */
  var lastGeocode = 0;
  $('searchBtn').addEventListener('click', function () {
    var q = $('searchInput').value;
    var hit = matchSeededCity(q);
    if (hit) { state.liveHeat = null; selectCity(hit.id); $('searchStatus').textContent = 'Seeded city: ' + hit.name + '. Full flood + heat available.'; return; }
    if (!q.trim()) { $('searchStatus').textContent = 'Type an address or pick a seeded city below.'; return; }
    var now = Date.now();
    if (now - lastGeocode < 1100) { $('searchStatus').textContent = 'Please wait a second between lookups (Nominatim allows 1 request/second).'; return; }
    lastGeocode = now;
    $('searchStatus').textContent = 'Looking up "' + q + '"…';
    var cache = {};
    try { cache = JSON.parse(localStorage.getItem('cwl.geocodeCache') || '{}'); } catch (e) { cache = {}; }
    function useResult(lat, lon, name) {
      // live heat fetch from Open-Meteo Climate API (2025 + selected year windows)
      var url = 'https://climate-api.open-meteo.com/v1/climate?latitude=' + lat + '&longitude=' + lon +
        '&start_date=' + ({ '2025': '2021-01-01', '2030': '2026-01-01', '2040': '2036-01-01', '2050': '2041-01-01' })[state.year] +
        '&end_date=' + ({ '2025': '2030-12-31', '2030': '2035-12-31', '2040': '2045-12-31', '2050': '2050-12-31' })[state.year] +
        '&daily=temperature_2m_max,temperature_2m_mean&models=CMCC_CM2_VHR4&timezone=auto';
      fetch(url).then(function (r) { return r.json(); }).then(function (d) {
        var tmax = d.daily.temperature_2m_max.filter(function (v) { return v !== null; });
        var tmean = d.daily.temperature_2m_mean.filter(function (v) { return v !== null; });
        var yrs = tmax.length / 365.25;
        state.liveHeat = {
          days_ge35_per_year: +(tmax.filter(function (v) { return v >= 35; }).length / yrs).toFixed(1),
          days_ge40_per_year: +(tmax.filter(function (v) { return v >= 40; }).length / yrs).toFixed(1),
          hottest_month_mean_max: 0, annual_mean_max: 0,
          annual_mean: +(tmean.reduce(function (a, b) { return a + b; }, 0) / tmean.length).toFixed(1)
        };
        // keep the nearest seeded city as the map base, flag live heat
        $('searchStatus').textContent = 'Found ' + name + ' (' + lat.toFixed(3) + ', ' + lon.toFixed(3) + '). Heat is live; flood overlay is not available for unseeded addresses.';
        renderAll();
      }).catch(function () {
        $('searchStatus').textContent = 'Found the address, but the live heat lookup failed (offline?). Try a seeded city.';
        $('searchStatus').className = 'status error';
      });
    }
    if (cache[q.toLowerCase()]) {
      var ch = cache[q.toLowerCase()];
      useResult(ch.lat, ch.lon, ch.name); return;
    }
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), {
      headers: { 'Accept': 'application/json' }
    }).then(function (r) { return r.json(); }).then(function (arr) {
      if (!arr || !arr.length) { $('searchStatus').textContent = 'No match for "' + q + '". Try a seeded city below.'; return; }
      var g = arr[0];
      cache[q.toLowerCase()] = { lat: +g.lat, lon: +g.lon, name: g.display_name };
      try { localStorage.setItem('cwl.geocodeCache', JSON.stringify(cache)); } catch (e) { /* storage full/blocked */ }
      useResult(+g.lat, +g.lon, g.display_name);
    }).catch(function () {
      $('searchStatus').textContent = 'Lookup failed — you appear to be offline. The 8 seeded cities still work without a connection.';
      $('searchStatus').className = 'status error';
    });
  });
  $('searchInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('searchBtn').click(); } });

  /* ---- controls ---- */
  $('yearSlider').addEventListener('input', function (e) { state.year = YEARS[+e.target.value]; renderAll(); });
  $('ssp245').addEventListener('click', function () { state.scenario = 'SSP2-4.5'; renderAll(); });
  $('ssp585').addEventListener('click', function () { state.scenario = 'SSP5-8.5'; renderAll(); });
  $('layerFlood').addEventListener('click', function () { state.layer = 'flood'; renderAll(); });
  $('layerHeat').addEventListener('click', function () { state.layer = 'heat'; renderAll(); });
  $('layerBoth').addEventListener('click', function () { state.layer = 'both'; renderAll(); });
  $('compareToggle').addEventListener('click', function () { state.compare = !state.compare; renderAll(); });

  $('copyBtn').addEventListener('click', function () {
    var text = $('summary').textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { $('geminiStatus').textContent = 'Summary copied.'; });
    } else { $('geminiStatus').textContent = 'Copy not available in this browser — select the summary text manually.'; }
  });
  $('downloadBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(city(), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = state.cityId + '-climate-data.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  /* ---- settings ---- */
  var dlg = $('settingsDlg');
  $('settingsBtn').addEventListener('click', function () {
    try { $('geminiKey').value = localStorage.getItem('cwl.geminiKey') || ''; } catch (e) { $('geminiKey').value = ''; }
    $('keyStatus').textContent = '';
    if (dlg.showModal) dlg.showModal();
  });
  $('closeSettingsBtn').addEventListener('click', function () { dlg.close(); });
  $('saveKeyBtn').addEventListener('click', function () {
    var k = $('geminiKey').value.trim();
    if (!k) { $('keyStatus').textContent = 'Paste a key first, or press Remove key.'; return; }
    try { localStorage.setItem('cwl.geminiKey', k); } catch (e) { $('keyStatus').textContent = 'Could not save the key in this browser.'; return; }
    $('keyStatus').textContent = 'Key saved in this browser only.';
    dlg.close(); renderSummary();
  });
  $('clearKeyBtn').addEventListener('click', function () {
    try { localStorage.removeItem('cwl.geminiKey'); } catch (e) { /* ignore */ }
    $('geminiKey').value = ''; $('keyStatus').textContent = 'Key removed. Cached summaries will be used.';
    renderSummary();
  });

  renderAll();
})();
