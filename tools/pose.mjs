import { chromium } from 'playwright';

// Chromium fourni par l'environnement, ou celui du systeme via la variable CHROME.
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }, args: ['--ignore-certificate-errors'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 460, height: 460 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8099/?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods, null, { timeout: 25000 });
// pose + inclinaison passees en argument : "shrimp:1.4,shrimp:1.8"
for (const spec of process.argv[2].split(',')) {
  const [pose, pitch] = spec.split(':');
  await page.evaluate(async ([pose, pitch]) => {
    const d = window.__dods;
    d.show('run'); d.paused = true;
    const m = await import('/src/diver.js');
    if (!window.__demo) {
      const dv = m.createDiver();
      window.__demo = dv;
      d.world.scene.add(dv.root);
    }
    const THREE = await import('three');
    const dv = window.__demo;
    m.applyPose(dv.joints, m.POSES[pose], 1);
    dv.root.rotation.set(+pitch, -0.45, 0);
    dv.root.position.set(0, 0, 12);
    dv.root.updateMatrixWorld(true);
    // on pose le point le plus bas pile sur l'eau, comme le fait alignContact
    let low = Infinity;
    const v = new THREE.Vector3();
    for (const t of dv.tips) low = Math.min(low, t.getWorldPosition(v).y);
    dv.root.position.y = -low;
    d.camera.position.set(-6.5, 1.1, 12);
    d.camera.lookAt(0, 0.9, 12);
    d.camera.fov = 42; d.camera.updateProjectionMatrix();
    d.renderer.render(d.world.scene, d.camera);
  }, [pose, pitch]);
  await page.waitForTimeout(90);
  await page.screenshot({ path: `pose-${pose}-${pitch}.png` });
}
console.log('erreurs', JSON.stringify(errs));
await browser.close();
