// Le pont vers la version bureau (desktop/, Electron). Dans un navigateur,
// window.dodsDesktop n'existe pas : tout ce qui suit est alors sans effet, et le jeu web
// reste strictement le meme.
const D = typeof window !== 'undefined' ? window.dodsDesktop || null : null;

export const DESKTOP = !!D;

export function quit() { if (D) D.quit(); }

// Les succes Steam. L'identifiant est celui a declarer tel quel dans Steamworks
// (Stats et succes) : store/achievements.md en donne le nom et la description en deux
// langues. Steam ignore un succes deja obtenu, on peut donc le redonner sans compter.
export const ACH = {
  FIRST_JUMP: 'FIRST_JUMP',
  FIRST_PERFECT: 'FIRST_PERFECT',
  PLANK_PERFECT: 'PLANK_PERFECT',
  BELLY_FLOP: 'BELLY_FLOP',
  STREAK_3: 'STREAK_3',
  HIGH_PERFECT: 'HIGH_PERFECT',
  ALL_SPOTS: 'ALL_SPOTS',
  RUN_8000: 'RUN_8000',
  TOTAL_30000: 'TOTAL_30000'
};

const given = new Set();
export function achieve(id) {
  if (!D || given.has(id)) return;
  given.add(id);
  try { Promise.resolve(D.achieve(id)).catch(() => {}); } catch { }
}
