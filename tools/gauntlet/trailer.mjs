import { open } from '../_page.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Bande-annonce Steam : du vrai jeu, image par image. La simulation avance d'un pas fixe
// de 1/30 s par image (__dods.tick), donc la video est fluide quelle que soit la vitesse
// de la machine, et deux rendus de la meme version sont identiques. ffmpeg assemble en
// H.264 1080p 30 i/s, le format que Steam recommande.
//
//   ./tools/run.sh gauntlet/trailer.mjs <sortie.mp4> [en|fr]
//
// Sans son : le jeu synthetise son audio en direct (WebAudio), il ne passe pas par la
// capture d'ecran. La piste son se pose au montage si on en veut une.

const OUT = process.argv[2] || 'trailer.mp4';
const LANG = process.argv[3] || 'en';
const FPS = 30, W = 1920, H = 1080;
const TMP = fs.mkdtempSync('/tmp/dods-trailer-');
const { browser, page, errs } = await open({ width: W, height: H, render: true, lang: LANG });
let n = 0;
const frame = async () => {
  await page.evaluate(() => window.__dods.draw());
  await page.screenshot({ path: `${TMP}/f${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 });
};
const hold = async (sec, fn) => {
  for (let i = 0; i < Math.round(sec * FPS); i++) {
    await page.evaluate(fn || (() => window.__dods.tick(1, 1 / 30)));
    await frame();
  }
};
await page.evaluate(() => { const d = window.__dods; d.quality.on = false; d.paused = true; d.show('title'); d.tick(60, 1 / 30); });

// 1. titre, la camera tourne autour de l'ile
await hold(2.4);
// 2. la liste des spots
await page.evaluate(() => document.querySelector('#s-title [data-go=spots]').click());
await hold(1.6);
// 3. un saut entier, au coucher de soleil
const jumpAt = async (spotIx, tuck, sec) => {
  await page.evaluate(([spotIx, tuck]) => {
    const d = window.__dods; d.state.spot = d.spots[spotIx]; d.startRun();
    d.paused = true; d.slowmo = true; d.autoJump = 0.7; d.autoTuck = tuck; d.autoSteer = true;
  }, [spotIx, tuck]);
  await hold(sec);
  await page.evaluate(() => { const d = window.__dods; d.autoJump = null; d.autoTuck = null; d.autoSteer = false; });
};
await jumpAt(4, 0.15, 7.5);
// 4. le plus haut : Lysefjord, 34 m
await jumpAt(5, 0.16, 8.5);
// 5. un plat, pour que le joueur sache ce qui l'attend
await jumpAt(1, 0.03, 5.5);
// 6. retour au titre, logo
await page.evaluate(() => { const d = window.__dods; d.show('title'); });
await hold(2.6);
await browser.close();

execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${TMP}/f%05d.jpg`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-vf', `scale=${W}:${H},fade=t=in:st=0:d=0.5,fade=t=out:st=${(n / FPS - 0.6).toFixed(2)}:d=0.6`, OUT]);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(JSON.stringify({ video: OUT, images: n, secondes: +(n / FPS).toFixed(1), erreurs: errs }));
