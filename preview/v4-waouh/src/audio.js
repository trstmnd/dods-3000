// Son entierement synthetise : aucun fichier a charger, aucune requete reseau.
// Trois couches depuis la v4.5, en plus du vent et de la tension existants :
// - le vent monte avec la chute : le souffle grave s'ouvre vers l'aigu et un
//   sifflement s'y ajoute dans les grandes vitesses ;
// - la foule du bord du fjord : un murmure qui grossit pendant l'elan, un souffle
//   coupe pendant le vol, puis l'ovation ou le ohhh decu selon la carte. Le
//   championnat du monde rassemble 6000 spectateurs : le jeu n'en montre aucun,
//   l'oreille les devine ;
// - l'impact descend dans le corps : sub grave dose par la puissance, claquement
//   sec a plat, clapot qui retombe, echo court de falaise, et l'oreille qui passe
//   sous l'eau avec la camera : tout s'etouffe une demi-seconde puis rouvre.
export function createAudio() {
  let ctx = null, master = null, wind = null, windGain = null, windF = null, windHissGain = null;
  let tens = null, tensGain = null, tensFilter = null, tens2 = null;
  let crowdGain = null, crowdLfoG = null, echoIn = null, muffleF = null;
  let muted = false;
  const VOLUME = 0.55;

  // Ce que le harnais lit : l'intention posee, pas le graphe. Un contexte suspendu
  // (page sans geste, headless) n'avance pas son temps audio, mais les valeurs
  // cible restent vraies : le test sonore lit donc ici, en performance.now().
  let muffleAt = -9;
  const S = { wind: 0, windHz: 300, hiss: 0, crowd: 0, splash: null, cheer: null };

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
    muffleF = ctx.createBiquadFilter(); muffleF.type = 'lowpass'; muffleF.frequency.value = 22050;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(muffleF).connect(ctx.destination);

    // L'echo court de falaise : le claquement de l'impact y rebondit une fois,
    // assourdi, comme au fond d'un fjord. Seul l'impact s'y branche.
    echoIn = ctx.createGain(); echoIn.gain.value = 0.55;
    const dly = ctx.createDelay(1); dly.delayTime.value = 0.31;
    const fb = ctx.createGain(); fb.gain.value = 0.24;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 1500;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    echoIn.connect(master);
    echoIn.connect(dly); dly.connect(dlp); dlp.connect(fb); fb.connect(dly);
    dly.connect(wet).connect(master);

    // Le vent : un meme souffle de bruit, deux ecoutes. Grave et rond en debut de
    // chute (bandpass bas), de plus en plus ouvert avec la vitesse, puis un
    // sifflement de grande vitesse (passe-haut) qui ne parle qu'au-dela.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3); src.loop = true;
    windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 300; windF.Q.value = 0.7;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    src.connect(windF).connect(windGain).connect(master);
    const hissF = ctx.createBiquadFilter(); hissF.type = 'highpass'; hissF.frequency.value = 1700; hissF.Q.value = 0.5;
    windHissGain = ctx.createGain(); windHissGain.gain.value = 0;
    src.connect(hissF).connect(windHissGain).connect(master);
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

    // Le murmure de foule : un lit de bruit grave, module lentement pour qu'il
    // respire. Deux LFO desynchronises (volume et timbre) : le murmure ne repasse
    // jamais par le meme etat, sans jamais deux fois le meme silence.
    const csrc = ctx.createBufferSource();
    csrc.buffer = noiseBuffer(4); csrc.loop = true;
    const cf = ctx.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 340; cf.Q.value = 0.4;
    crowdGain = ctx.createGain(); crowdGain.gain.value = 0;
    csrc.connect(cf).connect(crowdGain).connect(master);
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.11;
    crowdLfoG = ctx.createGain(); crowdLfoG.gain.value = 0;
    lfo.connect(crowdLfoG).connect(crowdGain.gain);
    const lfo2 = ctx.createOscillator(); lfo2.type = 'sine'; lfo2.frequency.value = 0.29;
    const lfo2G = ctx.createGain(); lfo2G.gain.value = 55;
    lfo2.connect(lfo2G).connect(cf.frequency);
    lfo.start(); lfo2.start();
    csrc.start();
    return true;
  }

  function blip(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0, out = null) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    if (out) g.connect(out);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function burst(dur, f0, f1, vol, type = 'lowpass', delay = 0, out = null) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noise1;
    const f = ctx.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(master);
    if (out) g.connect(out);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  // Un applaudissement : un clac de bruit tres court dans le medium-aigu. Une
  // ovation en est une soixantaine, desynchronisee, dense au debut puis rare.
  function clap(at, vol) {
    const s = ctx.createBufferSource(); s.buffer = noise1;
    s.loopStart = Math.random() * 0.5;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = 1300 + Math.random() * 2400; f.Q.value = 1.1;
    const g = ctx.createGain();
    const dur = 0.012 + Math.random() * 0.02;
    g.gain.setValueAtTime(vol * (0.6 + Math.random() * 0.4), at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f).connect(g).connect(master);
    s.start(at, Math.random() * 0.5, dur + 0.02); s.stop(at + dur + 0.03);
  }

  function claps(n, spread, vol) {
    if (!ensure()) return;
    const base = ctx.currentTime + 0.32;
    for (let i = 0; i < n; i++)
      clap(base + spread * Math.pow(Math.random(), 1.5), vol * (0.75 + Math.random() * 0.5));
  }

  // L'aaah de la foule : des voix desaccordees qui montent, tiennent et
  // retombent. Quatre ou cinq oscillateurs suffisent : a ce volume, l'oreille
  // remplit le reste du public.
  function voices(mark, up) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + 0.28;
    const dur = 1 + mark * 0.16;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 950;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0.0001, t0);
    vg.gain.exponentialRampToValueAtTime(0.06 + mark * 0.012, t0 + 0.22);
    vg.gain.setValueAtTime(0.06 + mark * 0.012, t0 + dur * 0.55);
    vg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    lp.connect(vg).connect(master);
    const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 5.2;
    const vibG = ctx.createGain(); vibG.gain.value = 5;
    vib.connect(vibG); vib.start(t0); vib.stop(t0 + dur + 0.05);
    const n = 5, f0 = up ? 230 : 300;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      const f = f0 + i * (14 + Math.random() * 26);
      o.frequency.setValueAtTime(f * 0.8, t0);
      o.frequency.linearRampToValueAtTime(f, t0 + 0.25);
      if (!up) o.frequency.linearRampToValueAtTime(f * 0.62, t0 + dur);
      vibG.connect(o.frequency);
      const og = ctx.createGain(); og.gain.value = 0.2;
      o.connect(og).connect(lp);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
  }

  // Le sub de l'impact : la partie du son qu'on sent dans la poitrine. Sa duree
  // et son niveau suivent la puissance mesuree du saut, pas un reglage fixe.
  function sub(power, dead) {
    blip(38 + power * 6, 0.32 + power * 0.3, 'sine', 0.22 + power * 0.18, -12, 0, echoIn);
    if (dead) blip(46, 0.5, 'sine', 0.3, -16, 0, echoIn);
  }

  // Le clapot : l'eau qui retombe en gouttes apres la gerbe. Quelques blips
  // haute frequence, clairsemes, sur plus d'une seconde.
  function drip(power) {
    const n = Math.round(5 + power * 7);
    for (let i = 0; i < n; i++)
      blip(750 + Math.random() * 950, 0.03, 'sine', 0.05 + Math.random() * 0.05, 180 + Math.random() * 220, 0.18 + Math.random() * 1.25);
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
    // le murmure du bord : il grossit avec l'elan, se coupe quand le corps
    // prend le vide. `fast` rabat le lit en 50 ms (le souffle retenu du vol).
    setCrowd(v, fast) {
      S.crowd = v;
      if (!crowdGain || !ctx) return;
      const t = ctx.currentTime;
      crowdGain.gain.setTargetAtTime(v * 0.24, t, fast ? 0.05 : 0.3);
      crowdLfoG.gain.setTargetAtTime(v * 0.07, t, fast ? 0.05 : 0.3);
    },
    // La clameur, une demi-seconde apres la gerbe : le public reactit au saut,
    // pas aux cartons. Sa moyenne ne decide que de l'intensite.
    cheer(mark, dead) {
      S.cheer = { mark, dead: !!dead, at: performance.now() };
      if (!ensure()) return;
      if (dead) {
        // le plat qui claque : un ohhh qui descend, quelques applaudissements
        // polis. Personne ne rit : c'est le moment qu'on partage.
        voices(3, false);
        claps(9, 1.1, 0.05);
        return;
      }
      if (mark >= 8) { voices(mark, true); claps(66, 2.7, 0.14); }
      else if (mark >= 6.5) { voices(mark, true); claps(40, 1.9, 0.12); }
      else if (mark >= 5) claps(22, 1.5, 0.1);
      else claps(9, 1.1, 0.06);
    },
    // l'oreille passe sous l'eau avec la camera : tout s'etouffe, puis le monde
    // rouvre pendant que la gerbe retombe
    muffle() {
      if (!muffleF || !ctx) { muffleAt = performance.now() / 1000; return; }
      const t = ctx.currentTime;
      muffleF.frequency.cancelScheduledValues(t);
      muffleF.frequency.setTargetAtTime(480, t, 0.03);
      muffleF.frequency.setTargetAtTime(22050, t + 0.55, 0.22);
      muffleAt = performance.now() / 1000;
    },
    splash(dead, power = 1) {
      S.splash = { dead: !!dead, power: Math.round(power * 100) / 100, at: performance.now() };
      if (!ensure()) return;
      if (dead) {
        // le plat qui claque : la claque seche d'abord (bruit mi-aigu tres court),
        // puis le sourd qui descend dans le corps. C'est le son qu'on partage.
        burst(0.14, 2400, 400, 0.5 * (0.7 + power * 0.4), 'lowpass', 0, echoIn);
        blip(90, 0.3, 'sawtooth', 0.3, -40);
        blip(52, 0.45, 'square', 0.38, -22);
      } else {
        burst(0.7, 5200, 300, 0.4 * (0.6 + power * 0.5), 'lowpass', 0, echoIn);
        blip(70, 0.35, 'sine', 0.35, -25);
        drip(power);
      }
      sub(power, dead);
      this.muffle();
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
    // Le vent suit la vitesse de chute : le souffle s'ouvre vers l'aigu (300 a
    // 1200 Hz) et le sifflement ne parle qu'au-dela des deux tiers de la chute.
    setWind(v) {
      S.wind = v; S.windHz = 300 + v * 900;
      S.hiss = v > 0.62 ? (v - 0.62) * 1.45 : 0;
      if (!windGain || !ctx) return;
      const t = ctx.currentTime;
      windGain.gain.setTargetAtTime(Math.min(0.5, v * 0.42), t, 0.08);
      windF.frequency.setTargetAtTime(S.windHz, t, 0.1);
      windHissGain.gain.setTargetAtTime(S.hiss * 0.3, t, 0.1);
    },
    // Coupure globale au master : le vent, la tension et la foule passent par la aussi.
    setMuted(v) { muted = !!v; if (master) master.gain.value = muted ? 0 : VOLUME; return muted; },
    get muted() { return muted; },
    // L'etat pose, pour le harnais : la preuve sonore se lit hors du graphe.
    probe() {
      return {
        wind: Math.round(S.wind * 100) / 100, windHz: Math.round(S.windHz), hiss: Math.round(S.hiss * 100) / 100,
        crowd: Math.round(S.crowd * 100) / 100,
        muffle: (performance.now() / 1000 - muffleAt) < 0.5 ? 480 : 22050,
        splash: S.splash, cheer: S.cheer, ready: !!ctx
      };
    }
  };
}
