// Son entierement synthetise : aucun fichier a charger, aucune requete reseau.
export function createAudio() {
  let ctx = null, master = null, wind = null, windGain = null;
  let tens = null, tensGain = null, tensFilter = null, tens2 = null;
  let muted = false;
  const VOLUME = 0.55;

  function noiseBuffer(sec = 2) {
    const n = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  let noise1 = null;
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
    noise1 = noiseBuffer(1);
    // La tension : deux oscillateurs legerement desaccordes dont la hauteur suit le temps
    // qui reste avant l'eau. L'oreille anticipe mieux que l'oeil : c'est un repere de
    // timing, pas une musique.
    tens = ctx.createOscillator(); tens.type = 'triangle'; tens.frequency.value = 150;
    tens2 = ctx.createOscillator(); tens2.type = 'sine'; tens2.frequency.value = 151.5;
    tensFilter = ctx.createBiquadFilter(); tensFilter.type = 'lowpass'; tensFilter.frequency.value = 900; tensFilter.Q.value = 3;
    tensGain = ctx.createGain(); tensGain.gain.value = 0;
    tens.connect(tensFilter); tens2.connect(tensFilter);
    tensFilter.connect(tensGain).connect(master);
    tens.start(); tens2.start();
    return true;
  }

  function blip(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function burst(dur, f0, f1, vol, type = 'lowpass') {
    if (!ensure()) return;
    const s = ctx.createBufferSource(); s.buffer = noise1;
    const f = ctx.createBiquadFilter(); f.type = type;
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
    // le lacher : un claquement sec et un souffle court, le corps qui se ferme
    tuck() { blip(880, 0.05, 'square', 0.14, -380); burst(0.12, 2600, 400, 0.22); blip(150, 0.12, 'sine', 0.3, -80); },
    scream() { blip(340, 0.5, 'sawtooth', 0.09, -180); },
    // une figure terminee : un souffle court qui monte, l'air que le corps vient de couper
    fig() { burst(0.2, 480, 2300, 0.2); blip(300, 0.14, 'triangle', 0.12, 200); },
    splash(dead) {
      if (dead) {
        // le plat qui claque : la claque seche d'abord (bruit mi-aigu tres court),
        // puis le sourd qui descend dans le corps. C'est le son qu'on partage.
        burst(0.14, 2400, 400, 0.6);
        blip(90, 0.3, 'sawtooth', 0.3, -40);
        blip(52, 0.45, 'square', 0.38, -22);
      } else {
        burst(0.7, 5200, 300, 0.4);
        blip(70, 0.35, 'sine', 0.35, -25);
      }
    },
    grade(mult) {
      if (mult >= 3) { [660, 880, 1320, 1760].forEach((f, i) => blip(f, 0.22, 'triangle', 0.16, 0, i * 0.07)); burst(0.6, 9000, 5000, 0.08, 'highpass'); }
      else if (mult >= 2) { blip(660, 0.1, 'triangle', 0.2); blip(990, 0.16, 'triangle', 0.2, 0, 0.09); }
    },
    // un coup sourd, puis un second plus faible : un coeur
    beat(v) { blip(62, 0.12, 'sine', 0.22 + v * 0.25, -12); blip(58, 0.1, 'sine', 0.12 + v * 0.14, -10, 0.13); },
    // palier franchi pendant la chute : un tic qui monte avec la note
    tick(level) { blip(440 * Math.pow(2, level / 4), 0.05, 'triangle', 0.1); },
    setTension(v) {
      if (!tensGain) return;
      const t = ctx.currentTime;
      const f = 140 * Math.pow(2, v * 2.4);
      tens.frequency.setTargetAtTime(f, t, 0.03);
      tens2.frequency.setTargetAtTime(f * 1.01, t, 0.03);
      tensFilter.frequency.setTargetAtTime(500 + v * 2600, t, 0.05);
      tensGain.gain.setTargetAtTime(v > 0 ? 0.015 + v * v * 0.1 : 0, t, v > 0 ? 0.04 : 0.02);
    },
    setWind(v) { if (windGain) windGain.gain.value = Math.min(0.5, v * 0.5); },
    // Coupure globale au master : le vent et la tension en boucle passent par la aussi.
    setMuted(v) { muted = !!v; if (master) master.gain.value = muted ? 0 : VOLUME; return muted; },
    get muted() { return muted; }
  };
}
