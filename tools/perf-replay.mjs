import { open } from './_page.mjs';

// Le surcout de la v4.3, que perf.mjs ne mesure pas : l'ecriture de la trace a chaque
// image (rec.sample), la pose du fantome du record a cote (ghostEcho.pose), et la
// relecture complete (echo.pose + camera recalculuee). Rendu coupe, comme perf.mjs :
//   ./tools/run.sh perf-replay.mjs
// Chaque corps retourne les images reellement simulees : un saut n'en vaut jamais 1000,
// la relecture non plus. Un premier passage echauffe la JIT, le deuxieme est mesure.

const { browser, page, errs } = await open({ width: 1280, height: 800, lang: 'fr' });
const bench = async (nom, corps) => {
  const r = await page.evaluate(src => {
    const d = window.__dods;
    const f = new Function('d', src);
    f(d); // echauffement : JIT et monde deja construits
    const t0 = performance.now();
    const frames = f(d);
    return { ms: +(performance.now() - t0).toFixed(3), frames };
  }, corps.toString().match(/\{([\s\S]*)\}/)[1]);
  return { phase: nom, images: r.frames, ms: r.ms, msParImage: +(r.ms / r.frames).toFixed(4) };
};

// Un premier run pilote pose le record du spot : les suivants tournent avec fantome.
const jouer = () => {
  const d = window.__dods;
  const carte = () => document.querySelector('#s-jump').classList.contains('on');
  d.state.spot = d.spots[5]; d.startRun();
  d.autoJump = 0.7; d.autoSteer = true; d.autoTuck = 0.15;
  let f = 0;
  while (!carte() && f < 4000) { d.tick(1); f++; }
  return f;
};
await page.evaluate(`(${jouer})()`);

const mesures = [];
// un saut entier, trace et fantome actifs (le cas reel du jeu). Chaque passage
// repart d'un startRun : l'echauffement epuise un saut, la mesure en joue un autre.
mesures.push(await bench('saut-avec-trace-et-fantome', () => {
  const carte = () => document.querySelector('#s-jump').classList.contains('on');
  d.startRun();
  let f = 0;
  while (!carte() && f < 4000) { d.tick(1); f++; }
  return f;
}));
// la relecture du saut qui vient de finir : echo + camera + gerbe
mesures.push(await bench('relecture', () => {
  d.startReplay();
  let f = 0;
  while (d.replay && f < 4000) { d.tick(1); f++; }
  return f;
}));

await browser.close();
console.log(JSON.stringify({ mesures, erreurs: errs }, null, 1));
