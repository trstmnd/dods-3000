import { open } from '../_page.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Les visuels de la page Steam, rendus par le moteur du jeu lui-meme (aucun asset peint) :
// le plongeur en dods au-dessus du vide, camera placee a la main, logo du jeu par-dessus.
// Chaque fichier sort a la dimension exacte exigee par Steamworks.
//
//   ./tools/run.sh gauntlet/store.mjs <dossier>
//
// Regles Steam respectees : pas de texte sur les capsules hormis le nom du jeu, pas de
// logo ni de texte sur le Library Hero, logo de bibliotheque sur fond transparent.

const DIR = process.argv[2] || 'store';
fs.mkdirSync(DIR, { recursive: true });
const made = [];

// [fichier, largeur, hauteur, echelle, spot, cadrage du logo, camera]
// cadrage : null = aucun logo ; sinon position et taille du logo en fraction de l'image.
const ART = [
  ['header_capsule.png', 920, 430, 1, 4, { x: 0.29, y: 0.50, h: 0.42 }, 'cote'],
  ['small_capsule.png', 462, 174, 1, 4, { x: 0.33, y: 0.50, h: 0.62 }, 'cote'],
  ['main_capsule.png', 1232, 706, 1, 4, { x: 0.28, y: 0.50, h: 0.38 }, 'cote'],
  ['vertical_capsule.png', 748, 896, 1, 4, { x: 0.50, y: 0.17, h: 0.24 }, 'dessous'],
  ['library_capsule.png', 600, 900, 1, 4, { x: 0.50, y: 0.16, h: 0.22 }, 'dessous'],
  ['library_hero.png', 1920, 620, 2, 4, null, 'large'],
  ['page_background.png', 1438, 810, 1, 3, null, 'large'],
  ['icon_1024.png', 1024, 1024, 1, 4, null, 'portrait']
];

for (const [file, w, h, scale, spotIx, logo, cam] of ART) {
  const { browser, page, errs } = await open({ width: w, height: h, render: true, scale });
  await page.evaluate(([spotIx, cam, logo]) => {
    const d = window.__dods;
    // rien du jeu par-dessus la scene : ni HUD, ni ecran, ni bouton
    const st = document.createElement('style');
    st.textContent = '.screen,#sound,#lang,#loading,#vignette,#speed,#flash,#fade{display:none!important}';
    document.head.appendChild(st);
    d.state.spot = d.spots[spotIx]; d.startRun();
    d.paused = true; d.slowmo = false; d.autoJump = 0.7; d.autoTuck = null; d.autoSteer = true;
    const j = d.jump;
    let f = 0; while (f++ < 4000 && j.state !== 'fly') d.tick(1);
    d.tick(cam === 'dessous' ? 34 : 26);
    const p = j.pos, c = d.camera;
    // la camera regarde a gauche du plongeur : il tombe dans le tiers droit, le logo
    // occupe la gauche au-dessus de la falaise
    if (cam === 'cote') { c.position.set(p.x - 8, p.y + 0.2, p.z - 0.4); c.lookAt(p.x, p.y + 0.1, p.z - 2.6); c.fov = 44; }
    if (cam === 'dessous') { c.position.set(p.x - 3.6, p.y - 4.4, p.z + 4.2); c.lookAt(p.x, p.y + 1.6, p.z); c.fov = 60; }
    if (cam === 'large') { c.position.set(p.x - 15, p.y - 0.5, p.z + 1.5); c.lookAt(p.x, p.y - 1.2, p.z + 0.5); c.fov = 34; }
    if (cam === 'portrait') { c.position.set(p.x - 4.6, p.y - 0.6, p.z + 1.05); c.lookAt(p.x, p.y + 0.25, p.z + 1.0); c.fov = 38; }
    c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix();
    d.draw();
    if (logo) {
      const box = document.createElement('div');
      const px = logo.h * innerHeight;
      box.style.cssText = `position:fixed;left:${logo.x * 100}%;top:${logo.y * 100}%;transform:translate(-50%,-50%);text-align:center;z-index:99;pointer-events:none`;
      box.innerHTML = `<h1 class="logo" style="font-size:${px * 0.78}px;margin:0;padding:0 .14em">DODS<span>3000</span></h1>`;
      document.body.appendChild(box);
    }
  }, [spotIx, cam, logo]);
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__dods.draw());
  await page.screenshot({ path: `${DIR}/${file}` });
  made.push(file);
  if (errs.length) console.log(file, errs);
  await browser.close();
}

// Logo de bibliotheque : le logo seul, fond transparent, 1280x720.
{
  const { browser, page } = await open({ width: 1280, height: 720, render: false });
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = 'html,body{background:transparent!important}canvas,.screen,#sound,#lang,#loading,#vignette,#speed,#flash,#fade{display:none!important}';
    document.head.appendChild(st);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center';
    // padding : le degrade clippe au texte (background-clip) rognait la fin du S, a cause de
    // l'espacement negatif des lettres (relecture release manager du 30/09)
    box.innerHTML = '<h1 class="logo" style="font-size:280px;margin:0;padding:0 .14em">DODS<span>3000</span></h1>';
    document.body.appendChild(box);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${DIR}/library_logo.png`, omitBackground: true });
  made.push('library_logo.png');
  await browser.close();
}
// Icones des 9 succes (Steamworks : 256x256 JPG, obtenu et non obtenu). La scene d'un spot,
// la marque du succes par-dessus ; la version non obtenue est derivee en gris par ffmpeg.
const ACH = [
  ['FIRST_JUMP', 0, '1'], ['FIRST_PERFECT', 2, 'P'], ['PLANK_PERFECT', 3, '='], ['BELLY_FLOP', 1, '!'],
  ['STREAK_3', 4, 'x3'], ['HIGH_PERFECT', 5, '34'], ['ALL_SPOTS', 2, '6'], ['RUN_8000', 4, '8K'], ['TOTAL_30000', 5, '30K']
];
fs.mkdirSync(`${DIR}/achievements`, { recursive: true });
for (const [id, spotIx, mark] of ACH) {
  const { browser, page } = await open({ width: 256, height: 256, render: true });
  await page.evaluate(([spotIx, mark]) => {
    const d = window.__dods;
    const st = document.createElement('style');
    st.textContent = '.screen,#sound,#lang,#loading,#vignette,#speed,#flash,#fade{display:none!important}';
    document.head.appendChild(st);
    d.state.spot = d.spots[spotIx]; d.startRun(); d.paused = true; d.slowmo = false; d.autoJump = 0.7; d.autoSteer = true;
    const j = d.jump; let f = 0; while (f++ < 4000 && j.state !== 'fly') d.tick(1); d.tick(30);
    const p = j.pos, c = d.camera;
    c.position.set(p.x - 5.2, p.y - 0.4, p.z + 1.0); c.lookAt(p.x, p.y + 0.2, p.z + 1.0); c.fov = 40; c.aspect = 1; c.updateProjectionMatrix();
    d.draw();
    const b = document.createElement('div');
    b.style.cssText = 'position:fixed;right:10px;bottom:8px;z-index:99;font:900 76px ui-sans-serif,system-ui,Arial;color:#ffd447;letter-spacing:-.04em;text-shadow:0 3px 0 #06182b,0 0 18px rgba(0,0,0,.7)';
    b.textContent = mark;
    document.body.appendChild(b);
  }, [spotIx, mark]);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__dods.draw());
  await page.screenshot({ path: `${DIR}/achievements/${id}.jpg`, type: 'jpeg', quality: 92 });
  await browser.close();
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', `${DIR}/achievements/${id}.jpg`, '-vf', 'hue=s=0,eq=brightness=-0.12', `${DIR}/achievements/${id}_locked.jpg`]);
  made.push(`achievements/${id}.jpg`);
}
console.log(JSON.stringify({ dossier: DIR, fichiers: made }));
