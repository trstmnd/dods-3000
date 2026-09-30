import { open } from '../_page.mjs';

// Tout le jeu sans souris : au clavier seul, puis a la manette seule (une manette
// simulee, dont on presse les boutons comme un joueur). Chaque etape dit sur quel ecran on
// doit arriver. C'est la porte « Steam Deck » : un joueur qui n'a qu'une manette doit
// pouvoir choisir un spot, sauter, tenir, lacher, revenir et rejouer.
//
//   ./tools/run.sh gauntlet/manette.mjs

const { browser, page, errs } = await open({ width: 1280, height: 800 });
await page.evaluate(() => {
  // une manette standard : 17 boutons, 4 axes, pilotee par window.__pad
  const btns = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
  const gp = { id: 'test pad', index: 0, connected: true, mapping: 'standard', buttons: btns, axes: [0, 0, 0, 0], timestamp: 0 };
  window.__pad = { press: i => { btns[i].pressed = true; btns[i].value = 1; }, release: i => { btns[i].pressed = false; btns[i].value = 0; }, axis: (i, v) => { gp.axes[i] = v; } };
  navigator.getGamepads = () => [gp, null, null, null];
});
const screen = () => page.evaluate(() => [...document.querySelectorAll('.screen.on')].map(s => s.id.replace('s-', '')).join('+'));
const focus = () => page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? (a.id || a.className || a.tagName) + ':' + (a.textContent || '').trim().slice(0, 18) : 'aucun'; });
const wait = ms => page.waitForTimeout(ms);
const tap = async (i, ms = 90) => { await page.evaluate(i => window.__pad.press(i), i); await wait(ms); await page.evaluate(i => window.__pad.release(i), i); await wait(160); };
const steps = [];
const check = async (nom, attendu) => { const s = await screen(); steps.push({ etape: nom, ecran: s, focus: await focus(), ok: attendu.test(s) }); };

// 1. clavier seul
await page.evaluate(() => window.__dods.show('title'));
await page.keyboard.press('Space'); await wait(250); await check('clavier : Espace sur le titre', /^spots$/);
const kf = await focus();
steps.push({ etape: 'clavier : un spot est deja choisi en arrivant', focus: kf, ok: /^spot/.test(kf) });
await page.keyboard.press('Space'); await wait(300); await check('clavier : Espace ouvre le spot choisi', /^brief$/);
await page.keyboard.press('Escape'); await wait(300); await check('clavier : Echap revient aux spots', /^spots$/);
await page.keyboard.press('ArrowRight'); await wait(120);
await page.keyboard.press('Enter'); await wait(300); await check('clavier : fleche puis Entree ouvre la fiche', /^brief$/);
await page.keyboard.press('Escape'); await wait(300); await check('clavier : Echap revient aux spots', /^spots$/);
await page.keyboard.press('Escape'); await wait(300); await check('clavier : Echap revient au titre', /^title$/);

// 2. manette seule
await tap(0); await check('manette : A sur le titre', /^spots$/);
await tap(15); await tap(15); await check('manette : croix droite parcourt les spots', /^spots$/);
const chosen = await focus();
await tap(0, 90); await wait(300); await check('manette : A ouvre la fiche (' + chosen + ')', /^brief$/);
await tap(1); await wait(300); await check('manette : B revient aux spots', /^spots$/);
await tap(0); await wait(300); await check('manette : A rouvre la fiche', /^brief$/);
await tap(0); await wait(400); await check('manette : A lance le run', /^run$/);
// le saut : A appuye au bord, tenu en vol, relache avant l'eau
const jump = await page.evaluate(async () => {
  const d = window.__dods, j = d.jump, P = window.__pad;
  d.slowmo = false;
  const until = (c, ms) => new Promise(r => { const t0 = performance.now(); const f = () => (c() || performance.now() - t0 > ms) ? r(c()) : requestAnimationFrame(f); f(); });
  await until(() => j.pos.z > -1.2, 6000);
  P.press(0);
  const flew = await until(() => j.state === 'fly', 1500);
  const heldInAir = await until(() => j.held && j.t > 0.3, 3000);
  // la planche au stick
  P.axis(1, -1); await new Promise(r => setTimeout(r, 200)); const steer = j.steer; P.axis(1, 0);
  await until(() => j.ttc < 0.2, 6000);
  P.release(0);
  await until(() => !!j.grade, 1500);
  return { decolle: flew, tenu: heldInAir, planche: steer, note: j.grade && j.grade.key, ttc: +j.tuckTtc.toFixed(3) };
});
steps.push({ etape: 'manette : appuyer, tenir, stick, lacher', ...jump, ok: jump.decolle && jump.tenu && jump.planche > 0.5 && !!jump.note });
await page.waitForFunction(() => document.querySelector('#s-jump').classList.contains('on'), null, { timeout: 8000 }).catch(() => {});
await wait(600);
await check('manette : carte de resultat', /jump/);
await tap(0); await wait(500); await check('manette : A passe au saut suivant', /^run$/);
await tap(9); await wait(300); await check('manette : Start met en pause', /^run$/);
const paused = await page.evaluate(() => document.querySelector('#pause').classList.contains('on'));
steps.push({ etape: 'manette : la pause est affichee', ok: paused });
await tap(1); await wait(400); await check('manette : B quitte le run vers les spots', /^spots$/);
await tap(1); await wait(300); await check('manette : B revient au titre', /^title$/);

const ok = steps.every(s => s.ok) && !errs.length;
console.log(JSON.stringify({ tousOk: ok, etapes: steps, erreurs: errs }, null, 1));
await browser.close();
