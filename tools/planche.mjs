import { open } from './_page.mjs';

// La planche (v3) : sans pilote, avec un pilote parfait (autoSteer), et independance a
// la frequence d'image. Sans pilote la planche doit se degrader avec le vent du spot.
const { browser: b, page, errs } = await open();
const run = (spot, steer, dt = 1 / 60, tuck = 0.15) => page.evaluate(([spot, steer, dt, tuck]) => {
  const d = window.__dods; d.slowmo = false; d.autoSteer = steer; d.state.spot = d.spots[spot]; d.startRun(); d.paused = true;
  d.autoJump = 0.7; d.autoTuck = tuck;
  let maxTilt = 0, f = 0;
  while (f++ < 20000 && !document.querySelector('#s-jump').classList.contains('on')) { d.tick(1, dt); if (d.jump.state === 'fly' && !d.jump.tucked) maxTilt = Math.max(maxTilt, Math.abs(d.jump.tilt)); }
  const r = d.state.last; d.autoJump = null; d.autoTuck = null; d.autoSteer = false;
  return { spot: d.spots[spot].id, pilote: steer, grade: r.grade.key, score: r.score, planche: r.planche.label, mult: r.planche.mult, ecartDeg: Math.round(r.planche.mean * 57.3), maxDeg: Math.round(maxTilt * 57.3) };
}, [spot, steer, dt, tuck]);
const out = [];
for (const s of [0, 1, 3, 5]) { out.push(await run(s, false)); out.push(await run(s, true)); }
out.push({ freq: 30, ...(await run(3, true, 1 / 30)) });
out.push({ freq: 144, ...(await run(3, true, 1 / 144)) });
out.push({ freq: '30 sans pilote', ...(await run(3, false, 1 / 30)) });
out.push({ freq: '144 sans pilote', ...(await run(3, false, 1 / 144)) });
console.log(JSON.stringify({ out, errs }, null, 0).replace(/},{/g, '},\n{'));
await b.close();
