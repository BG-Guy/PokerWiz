// Player profiles: five trait meters (0-100) plus presets for common player types, and the conversion
// from traits to the numbers the coach's models use (range width, aggression, bluffing, folding, noise).
// Stat anchors (VPIP / PFR / aggression) come from typical tracker numbers for each player type;
// see docs/coach-algorithm.md for sources and reasoning.

// The meters shown in the traits step. "form" is centered: 50 = normal, below = cold run, above = heater.
export const TRAITS = [
  { key: 'looseness', label: 'Looseness', low: 'Tight', high: 'Loose', heroLabel: 'Table image: looseness' },
  { key: 'aggression', label: 'Aggression', low: 'Passive', high: 'Aggressive', heroLabel: 'Table image: aggression' },
  { key: 'skill', label: 'Skill', low: 'Amateur', high: 'Pro', heroLabel: 'Your level' },
  { key: 'tilt', label: 'Tilt', low: 'Calm', high: 'Tilted', heroLabel: 'Your tilt' },
  { key: 'form', label: 'Form', low: 'Cold run', high: 'Heater', heroLabel: 'Your form' },
];

// Common player types. Stats in the descriptions are the tracker numbers the presets aim for (VPIP/PFR).
export const PRESETS = [
  { id: 'unknown', label: 'Unknown', traits: { looseness: 50, aggression: 50, skill: 50 }, description: 'No read yet. Plays like an average regular (about 24/19).' },
  { id: 'nit', label: 'Nit', traits: { looseness: 15, aggression: 35, skill: 50 }, description: 'Very few hands (about 14/11). Folds to pressure, bets mean strength.' },
  { id: 'tag', label: 'TAG', traits: { looseness: 40, aggression: 65, skill: 70 }, description: 'Tight and aggressive (about 22/19). Solid, balanced regular.' },
  { id: 'lag', label: 'LAG', traits: { looseness: 68, aggression: 82, skill: 70 }, description: 'Loose and aggressive (about 32/26). Lots of pressure and bluffs.' },
  { id: 'station', label: 'Calling station', traits: { looseness: 85, aggression: 15, skill: 20 }, description: 'Plays many hands, rarely raises (about 40/8). Hates folding.' },
  { id: 'maniac', label: 'Maniac', traits: { looseness: 95, aggression: 95, skill: 25 }, description: 'Plays almost everything and bets it all (about 50/40).' },
  { id: 'fish', label: 'Recreational', traits: { looseness: 75, aggression: 30, skill: 15 }, description: 'Loose and passive, calls too much, bluffs at random.' },
  { id: 'pro', label: 'Pro', traits: { looseness: 55, aggression: 62, skill: 95 }, description: 'Close to solver play. Few mistakes to exploit.' },
];

export function defaultProfile() {
  return { preset: 'unknown', looseness: 50, aggression: 50, skill: 50, tilt: 0, form: 50 };
}

// Switch preset: sets style and skill, keeps the player's current mood (tilt, form).
export function applyPreset(profile, presetId) {
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  return { ...profile, ...preset.traits, preset: preset.id };
}

// Moving a meter by hand turns the profile into a custom one (unless it still matches the preset).
export function setTrait(profile, key, value) {
  const next = { ...profile, [key]: value };
  const preset = PRESETS.find((p) => p.id === profile.preset);
  const stillPreset = preset && ['looseness', 'aggression', 'skill'].every((k) => preset.traits[k] === next[k]);
  return { ...next, preset: stillPreset ? profile.preset : 'custom' };
}

// Short label for seats and summaries ("LAG", "Loose passive", plus mood tags like "Tilted").
export function describeProfile(profile) {
  if (!profile) return { label: 'Unknown', tags: [] };
  const preset = PRESETS.find((p) => p.id === profile.preset);
  let label = preset?.label;
  if (!label) {
    const style = profile.looseness < 35 ? 'Tight' : profile.looseness > 65 ? 'Loose' : 'Balanced';
    const aggro = profile.aggression < 35 ? 'passive' : profile.aggression > 65 ? 'aggressive' : '';
    label = [style, aggro].filter(Boolean).join(' ');
  }
  const tags = [];
  if (profile.tilt >= 60) tags.push('Tilted');
  else if (profile.tilt >= 30) tags.push('Steaming');
  if (profile.form >= 70) tags.push('On a heater');
  if (profile.form <= 30) tags.push('Cold run');
  if (tags.length) label = `${label} · ${tags[0]}`;
  return { label, tags };
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const lerp = (a, b, t) => a + (b - a) * t;

// Traits -> model parameters.
//   vpip        share of hands this player voluntarily plays (0.10 nit ... 0.55 maniac)
//   widthMult   multiplier on position-based baseline ranges (1 = average regular)
//   pfrRatio    share of played hands that are raised rather than called/limped
//   aggression  postflop aggression factor (bets+raises : calls), about 0.5 ... 5
//   bluffMult   multiplier on bluffing frequency
//   foldMult    >1 folds more than MDF says (nit), <1 folds less (calling station)
//   noise       how "soft" decisions are: pros follow thresholds sharply, amateurs are all over the place
// imageOf: the hero's profile, when this player is a villain facing the hero. A loose/aggressive/tilted
// image makes villains call lighter (fold less) and a nitty image makes them fold more.
export function modelParams(profile, imageOf = null) {
  const p = profile ?? defaultProfile();
  const L = p.looseness / 100;
  const A = p.aggression / 100;
  const S = p.skill / 100;
  const T = (p.tilt ?? 0) / 100;
  const F = ((p.form ?? 50) - 50) / 50; // -1 cold run ... +1 heater

  const vpip = L < 0.5 ? 0.1 + 0.28 * L : 0.24 + 0.62 * (L - 0.5);
  let widthMult = vpip / 0.24;
  const pfrRatio = 0.2 + 0.7 * A;
  let aggression = 0.5 + 4.5 * A ** 1.3;
  let bluffMult = 0.3 + 1.7 * A;
  // Loose players call more; skill pulls folding back toward the mathematically correct amount;
  // amateurs call a bit more on top of that ("can't fold").
  let foldMult = clamp(1.3 - 0.8 * L, 0.45, 1.35);
  foldMult = lerp(foldMult, 1, 0.6 * S) * (0.85 + 0.15 * S);
  let noise = 0.05 + 0.13 * (1 - S);

  // Tilt: plays more hands, bets and bluffs more, won't fold, and decisions get sloppy.
  widthMult *= 1 + 0.6 * T;
  aggression *= 1 + 0.5 * T;
  bluffMult *= 1 + T;
  foldMult *= 1 - 0.3 * T;
  noise += 0.06 * T;

  // Form: a heater brings confidence (wider, more aggressive); a cold run brings scared, tight play.
  if (F > 0) {
    widthMult *= 1 + 0.12 * F;
    aggression *= 1 + 0.2 * F;
    bluffMult *= 1 + 0.25 * F;
    foldMult *= 1 - 0.1 * F;
  } else if (F < 0) {
    widthMult *= 1 + 0.15 * F;
    aggression *= 1 + 0.25 * F;
    bluffMult *= 1 + 0.3 * F;
    foldMult *= 1 - 0.15 * F;
  }

  // How this player sees the hero (only for villains).
  if (imageOf) {
    const imageAggro = (imageOf.aggression / 100 - 0.5) * 2; // -1 ... 1
    const imageLoose = (imageOf.looseness / 100 - 0.5) * 2;
    const heroTilt = (imageOf.tilt ?? 0) / 100;
    foldMult *= clamp(1 - 0.25 * (0.6 * imageAggro + 0.4 * imageLoose) - 0.15 * heroTilt, 0.7, 1.25);
  }

  return {
    vpip: clamp(vpip * (widthMult / (vpip / 0.24)), 0.05, 0.95),
    widthMult: clamp(widthMult, 0.3, 3.8),
    pfrRatio: clamp(pfrRatio, 0.15, 0.95),
    aggression: clamp(aggression, 0.3, 7),
    bluffMult: clamp(bluffMult, 0.1, 4),
    foldMult: clamp(foldMult, 0.3, 1.6),
    noise: clamp(noise, 0.03, 0.3),
    skill: S,
  };
}
