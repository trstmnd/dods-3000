// Son entierement synthetise : aucun fichier a charger, aucune requete reseau.
export function createAudio() {
  let ctx = null, master = null, wind = null, windGain = null;
  let muted = false;
  const VOLUME = 0.55;

  function noiseBuffer(sec = 2) {
    const n = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(ctx.destination);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 480; f.Q.value = 0.7;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    src.connect(f).connect(windGain).connect(master);
    src.start();
    wind = src;
    return true;
  }

  function blip(freq, dur, type = 'sine', vol = 0.3, slide = 0) {
    if (!ensure()) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(master); o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  function burst(dur, f0, f1, vol) {
    if (!ensure()) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(1);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(f0, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(f1, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    s.connect(f).connect(g).connect(master); s.start(); s.stop(ctx.currentTime + dur + 0.05);
  }

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    ui() { blip(520, 0.07, 'square', 0.12, 260); },
    jump() { blip(230, 0.16, 'triangle', 0.22, 420); },
    tuck() { blip(880, 0.06, 'square', 0.16, -300); },
    scream() { blip(340, 0.5, 'sawtooth', 0.09, -180); },
    splash(dead) {
      burst(dead ? 0.22 : 0.65, dead ? 1800 : 5200, dead ? 180 : 300, dead ? 0.55 : 0.4);
      if (dead) blip(90, 0.3, 'sawtooth', 0.3, -40);
    },
    grade(mult) { if (mult >= 2) { blip(660, 0.1, 'triangle', 0.2); setTimeout(() => blip(990, 0.16, 'triangle', 0.2), 90); } },
    setWind(v) { if (windGain) windGain.gain.value = Math.min(0.5, v * 0.5); },
    // Coupure globale au master : le vent en boucle passe par la aussi.
    setMuted(v) { muted = !!v; if (master) master.gain.value = muted ? 0 : VOLUME; return muted; },
    get muted() { return muted; }
  };
}
