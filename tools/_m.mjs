import { open } from './_page.mjs';
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const { browser, page } = await open({ width: 960, height: 540 });
  let s = seed * 9973; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const held = { Space: false, ArrowUp: false, ArrowDown: false };
  let last = '', same = 0, report = null;
  for (let step = 0; step < 400; step++) {
    for (const k of Object.keys(held)) if (rnd() < 1 / 30) { held[k] = !held[k]; held[k] ? await page.keyboard.down(k) : await page.keyboard.up(k); }
    if (rnd() < 1 / 40) { const x = rnd() * 960, y = rnd() * 540; await page.mouse.click(x, y); }
    await page.waitForTimeout(60);
    const st = await page.evaluate(() => { const d = window.__dods; return { scr: [...document.querySelectorAll('.screen.on')].map(e => e.id).join('+'), owner: d.owner, held: d.held.join(','), ap: d.autoPaused, focus: document.activeElement.id || document.activeElement.className || document.activeElement.tagName, j: d.jump && d.jump.state }; });
    const key = st.scr + '|' + st.j;
    if (key === last) same++; else { same = 0; last = key; }
    if (same > 60 && !['s-run|walk'].includes(key)) { report = { seed, step, ...st, keys: { ...held } }; break; }
  }
  console.log(JSON.stringify(report || { seed, ok: true, last }));
  await browser.close();
}
