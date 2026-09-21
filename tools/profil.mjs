import { chromium } from 'playwright';

// Chromium fourni par l'environnement, ou celui du systeme via la variable CHROME.
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }, args: ['--ignore-certificate-errors'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } })).newPage();
await page.goto('http://127.0.0.1:8099/?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods, null, { timeout: 20000 });

const out = await page.evaluate(async () => {
  const d = window.__dods, r = d.renderer;
  const spots = (await import('/src/spots.js')).SPOTS;
  const tris = g => g && g.attributes.position ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0;

  function detail() {
    const par = {};
    d.world.scene.traverse(o => {
      if (!o.geometry) return;
      const t = tris(o.geometry);
      const cle = o.name || o.geometry.type;
      par[cle] = (par[cle] || 0) + t;
    });
    return Object.entries(par).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ' ' + Math.round(v));
  }

  function chrono(n = 60) {
    const t0 = performance.now();
    d.tick(n);
    return +((performance.now() - t0) / n).toFixed(1);
  }

  const res = { parSpot: [], reglages: {}, contexte: {} };
  for (const s of spots) {
    d.state.spot = s;
    d.show('run'); d.startRun(); d.paused = true;
    const ms = chrono(40);
    res.parSpot.push({
      spot: s.id, hauteur: s.height, ms,
      calls: r.info.render.calls,
      triangles: r.info.render.triangles,
      geometries: r.info.memory.geometries
    });
    if (s.id === spots[spots.length - 1].id) res.detail = detail();
  }

  // variantes sur le dernier spot construit
  const base = chrono(40);
  r.setPixelRatio(1);
  const sansPixelRatio = chrono(40);
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  d.world.scene.traverse(o => { if (o.isLight) o.castShadow = false; if (o.material) o.material.needsUpdate = true; });
  r.shadowMap.enabled = false;
  const sansOmbres = chrono(40);
  res.reglages = { base, sansPixelRatio, sansOmbres };
  res.contexte = { pixelRatio: r.getPixelRatio(), dpr: window.devicePixelRatio, largeur: window.innerWidth, hauteur: window.innerHeight };
  return res;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
