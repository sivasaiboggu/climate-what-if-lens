// Headless-Chrome screenshots (CDP, file://) for Climate What-If Lens.
// Run: node scripts/shots.mjs — writes screenshots/*.png
// This VM's Hatch Chrome needs a WebGL domain policy (contract file + SHA-256)
// just to start; the policy is a plain-text contract, see chromeArgs().
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const CHROME = '/opt/meta-chromium/chrome';
const DEBUG_PORT = 9227;

function chromeArgs(debugPort, firstUrl) {
  const policy = 'hatch-webgl-allowed-domains-v1\nexample.com\n';
  const file = path.join(os.tmpdir(), 'climate-what-if-lens-webgl-policy.txt');
  fs.writeFileSync(file, policy);
  const sha = createHash('sha256').update(policy).digest('hex');
  return [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'climate-lens-chrome-'))}`,
    `--hatch-webgl-allowed-domains-file=${file}`,
    `--hatch-webgl-allowed-domains-sha256=${sha}`,
    `--remote-debugging-port=${debugPort}`,
    '--window-size=1280,900',
    firstUrl,
  ];
}

const pageUrl = (page) => `file://${ROOT}/${page}`;

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
      } else if (msg.method) this.events.push(msg);
    };
  }
  async call(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const done = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return done;
  }
  async waitForEvent(method, timeoutMs = 30000) {
    const start = Date.now();
    for (;;) {
      const i = this.events.findIndex((e) => e.method === method);
      if (i >= 0) return this.events.splice(i, 1)[0];
      if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${method}`);
      await delay(100);
    }
  }
  async evaluate(expression) {
    const res = await this.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result?.value;
  }
  close() { try { this.ws.close(); } catch { /* already closed */ } }
}

// setup: JS run in the page after load to reach a state (year/scenario/city)
const SHOTS = [
  { name: 'desktop-1280.png', width: 1280, height: 1100, setup: null },
  { name: 'desktop-2050-ssp585.png', width: 1280, height: 1100, setup: `document.getElementById('yearSlider').value='3';document.getElementById('yearSlider').dispatchEvent(new Event('input'));document.getElementById('ssp585').click();` },
  { name: 'mobile-390.png', width: 390, height: 1500, setup: null },
  { name: 'mobile-2050-chennai.png', width: 390, height: 1500, setup: `document.querySelectorAll('.city-btn')[1].click();document.getElementById('yearSlider').value='3';document.getElementById('yearSlider').dispatchEvent(new Event('input'));` },
];

async function main() {
  fs.mkdirSync(path.join(ROOT, 'screenshots'), { recursive: true });
  const chrome = spawn(CHROME, chromeArgs(DEBUG_PORT, pageUrl('index.html')));
  try {
    let wsUrl = null;
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
        const targets = await res.json();
        const page = targets.find((t) => t.type === 'page');
        if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
      } catch { /* not up yet */ }
      await delay(200);
    }
    if (!wsUrl) throw new Error('Chrome DevTools did not come up');
    const cdp = new Cdp(wsUrl);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    // Navigate once. Later shots change viewport + app state in-page:
    // re-navigation over CDP intermittently drops the DevTools connection
    // in this Chrome build, which silently ends the Node process.
    // The load event can also stall on the (blocked) Google Fonts request,
    // so do not depend on it: poll for the app instead.
    try { await cdp.waitForEvent('Page.loadEventFired', 8000); } catch { /* poll below */ }
    for (let i = 0; i < 60; i++) {
      const ready = await cdp.evaluate(`(function(){try{var a=document.getElementById('yearSlider');var b=document.getElementById('mapTitle');return !!(a&&b&&b.textContent.length>0);}catch(e){return false;}})()`);
      if (ready) break;
      await delay(200);
    }
    await delay(500);
    for (const shot of SHOTS) {
      console.log('starting', shot.name);
      await cdp.call('Emulation.setDeviceMetricsOverride', {
        width: shot.width, height: shot.height, deviceScaleFactor: 1, mobile: shot.width < 600,
      });
      await delay(400);
      // reset to the default state, then apply this shot's setup
      await cdp.evaluate(`(function(){document.querySelectorAll('.city-btn')[0].click();document.getElementById('yearSlider').value='0';document.getElementById('yearSlider').dispatchEvent(new Event('input'));document.getElementById('ssp245').click();document.getElementById('layerBoth').click();})()`);
      await delay(300);
      if (shot.setup) { await cdp.evaluate(shot.setup); await delay(400); }
      const overflow = await cdp.evaluate(
        `JSON.stringify({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth, title: document.getElementById('mapTitle').textContent, year: document.getElementById('yearRead').textContent })`,
      );
      const o = JSON.parse(overflow);
      if (o.overflowX) throw new Error(`${shot.name}: horizontal overflow ${o.sw} > ${o.cw}`);
      const { data } = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(ROOT, 'screenshots', shot.name), Buffer.from(data, 'base64'));
      console.log('wrote', shot.name, JSON.stringify(o));
    }
    cdp.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
