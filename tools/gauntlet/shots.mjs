import { open } from '../_page.mjs';
import fs from 'node:fs';

// Toutes les images qu'un relecteur doit voir pour juger le jeu : chaque ecran et chaque
// instant du saut, a trois tailles. 1920x1080 est la taille des captures Steam, 1280x800
// celle du Steam Deck, 390x844 un telephone. Les images sont rendues par le vrai GPU sur
// un Mac (voir _page.mjs), en logiciel ailleurs.
//
//   ./tools/run.sh gauntlet/shots.mjs <dossier> [steam,deck,mobile] [lang]

const DIR = process.argv[2] || 'shots';
const SIZES = { steam: [1920, 1080], deck: [1280, 800], mobile: [390, 844] };
const WANT = (process.argv[3] || 'steam,deck,mobile').split(',');
const LANG = process.argv[4] || '';
fs.mkdirSync(DIR, { recursive: true });
const all = [];

for (const name of WANT) {
  const [width, height] = SIZES[name];
  const { browser, page, errs } = await open({ width, height, render: true, touch: name === 'mobile', lang: LANG });
  await page.evaluate(() => { window.__dods.quality.on = false; });
  const snap = async (tag) => {
    await page.evaluate(() => window.__dods.draw());
    await page.waitForTimeout(160);
    await page.evaluate(() => window.__dods.draw());
    const f = `${DIR}/${name}-${tag}.png`;
    await page.screenshot({ path: f });
    all.push(f);
  };
  // ecrans de menu : la camera tourne, on la laisse se poser
  const settle = (n = 90) => page.evaluate(n => { const d = window.__dods; d.paused = true; d.tick(n); d.paused = false; }, n);

  await page.evaluate(() => window.__dods.show('title'));
  await settle(); await snap('01-titre');
  await page.click('#s-title [data-go=spots]');
  await settle(30); await snap('02-spots');
  await page.evaluate(() => { const d = window.__dods; d.openBrief(d.spots[3]); });
  await settle(120); await snap('03-brief');

  const phase = async (spotIx, tag, fn) => {
    await page.evaluate(([spotIx, fn]) => {
      const d = window.__dods;
      d.state.spot = d.spots[spotIx]; d.startRun();
      d.paused = true; d.slowmo = false; d.autoJump = 0.7; d.autoTuck = 0.15; d.autoSteer = true;
      const j = d.jump;
      const until = (c, max = 4000) => { let f = 0; while (f++ < max && !c()) d.tick(1); };
      if (fn === 'course') { d.tick(40); return; }
      until(() => j.state === 'fly');
      if (fn === 'decollage') { d.tick(6); return; }
      if (fn === 'vol') { d.tick(30); return; }
      if (fn === 'avant-eau') { d.autoTuck = null; until(() => j.ttc < 0.32); return; }
      until(() => j.state === 'impact');
      if (fn === 'gerbe') { d.tick(10); return; }
      until(() => document.querySelector('#s-jump').classList.contains('on'));
    }, [spotIx, fn]);
    await snap(tag);
    await page.evaluate(() => { const d = window.__dods; d.autoJump = null; d.autoTuck = null; d.autoSteer = false; });
  };
  await phase(0, '04-course', 'course');
  await phase(5, '05-decollage', 'decollage');
  await phase(3, '06-vol', 'vol');
  await phase(4, '07-avant-eau', 'avant-eau');
  await phase(5, '08-gerbe', 'gerbe');
  await phase(2, '09-resultat', 'resultat');
  // fin de run : trois sauts enchaines
  await page.evaluate(() => {
    const d = window.__dods; d.state.spot = d.spots[1]; d.startRun();
    d.paused = true; d.slowmo = false; d.autoJump = 0.7; d.autoTuck = 0.15; d.autoSteer = true;
    for (let k = 0; k < 3; k++) {
      let f = 0; while (f++ < 4000 && !document.querySelector('#s-jump').classList.contains('on')) d.tick(1);
      d.advance && d.advance();
      if (!d.advance) { const card = document.querySelector('#jr-next'); card && card.click(); }
      d.tick(2);
    }
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => { const b = document.querySelector('#jr-next'); if (document.querySelector('#s-jump').classList.contains('on') && b) b.click(); });
  await page.waitForTimeout(700);
  await snap('10-fin');
  if (errs.length) fs.writeFileSync(`${DIR}/${name}-erreurs.txt`, errs.join('\n'));
  await browser.close();
}
console.log(JSON.stringify({ images: all.length, dossier: DIR }));
