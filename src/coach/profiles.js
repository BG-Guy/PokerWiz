// Player profiles: a tendency (how they play: Nit, LAG, Calling station, Drunk...) and a skill level
// (Beginner ... Pro), chosen separately, plus five trait meters (0-100) and the conversion from traits to
// the numbers the coach's models use (range width, aggression, bluffing, folding, noise).
// Stat anchors (VPIP / PFR / aggression) come from typical tracker numbers for each player type;
// see docs/coach-algorithm.md for sources and reasoning.

// The meters shown in the traits step. "form" is centered: 50 = normal, below = cold run, above = heater.
export const TRAITS = [
  { key: 'looseness', label: 'Looseness', low: 'Tight', high: 'Loose', heroLabel: 'Table image: looseness' },
  { key: 'aggression', label: 'Aggression', low: 'Passive', high: 'Aggressive', heroLabel: 'Table image: aggression' },
  { key: 'skill', label: 'Skill', low: 'Beginner', high: 'Pro', heroLabel: 'Your level' },
  { key: 'tilt', label: 'Tilt', low: 'Calm', high: 'Tilted', heroLabel: 'Your tilt' },
  { key: 'form', label: 'Form', low: 'Cold run', high: 'Heater', heroLabel: 'Your form' },
];

// Tendencies: how a player plays, whatever their skill. They set looseness and aggression; some add
// behavior the meters can't express (mods, applied in modelParams). Stats are the VPIP/PFR they aim for.
export const TENDENCIES = [
  { id: 'unknown', label: 'Unknown', traits: { looseness: 50, aggression: 50 }, description: 'No read yet. Plays like an average player (about 24/19).' },
  { id: 'nit', label: 'Nit', traits: { looseness: 15, aggression: 35 }, description: 'Very few hands (about 14/11). Folds to pressure, bets mean strength.' },
  { id: 'tag', label: 'TAG', traits: { looseness: 40, aggression: 65 }, description: 'Tight and aggressive (about 22/19).' },
  { id: 'lag', label: 'LAG', traits: { looseness: 68, aggression: 82 }, description: 'Loose and aggressive (about 32/26). Lots of pressure and bluffs.' },
  { id: 'fish', label: 'Loose passive', traits: { looseness: 75, aggression: 30 }, description: 'Plays lots of hands and calls with them (about 35/10). Rarely takes the lead.' },
  { id: 'station', label: 'Calling station', traits: { looseness: 85, aggression: 15 }, description: 'Plays many hands, rarely raises (about 40/8). Hates folding.' },
  { id: 'maniac', label: 'Maniac', traits: { looseness: 95, aggression: 95 }, description: 'Plays almost everything and bets it all (about 50/40).' },
  {
    id: 'drunk',
    label: 'Drunk',
    traits: { looseness: 88, aggression: 70 },
    mods: { noise: 0.1, foldMult: 0.7, bluffMult: 1.3, bluffsAnySize: true },
    description: 'Plays almost any hand, calls too far and fires random bets of any size. Hard to bluff, easy to value bet.',
  },
];

// Skill levels: how well they play. Sets the Skill meter, which drives sharpness, how close folding is to
// correct, and the recreational habits (small bluffs only, passive draws, calling too much).
export const LEVELS = [
  { id: 'beginner', label: 'Beginner', short: 'Beginner', skill: 5, description: 'Knows the rules. Plays their own cards, calls a lot, bluffs rarely and only small.' },
  { id: 'rec', label: 'Recreational', short: 'Rec', skill: 22, description: 'Plays for fun. Calls more than a pro, rarely bluffs big, and plays draws passively.' },
  { id: 'regular', label: 'Regular', short: 'Reg', skill: 50, description: 'Plays often and knows the basics. Some leaks.' },
  { id: 'strong', label: 'Strong regular', short: 'Strong reg', skill: 75, description: 'A winning regular. Balanced, uses draws as semi-bluffs.' },
  { id: 'pro', label: 'Pro', short: 'Pro', skill: 95, description: 'Close to solver play. Few mistakes to exploit.' },
];

// The level closest to a skill value (profiles from before levels existed only have the number).
export function levelOf(profile) {
  const skill = profile?.skill ?? 50;
  return LEVELS.find((l) => l.id === profile?.level) ?? LEVELS.reduce((a, b) => (Math.abs(b.skill - skill) < Math.abs(a.skill - skill) ? b : a));
}

export function defaultProfile() {
  return { preset: 'unknown', level: 'regular', looseness: 50, aggression: 50, skill: 50, tilt: 0, form: 50 };
}

// Switch tendency: sets looseness and aggression, keeps the skill level and mood (tilt, form).
export function applyPreset(profile, tendencyId) {
  const tendency = TENDENCIES.find((p) => p.id === tendencyId) ?? TENDENCIES[0];
  return { ...profile, ...tendency.traits, preset: tendency.id };
}

// Switch skill level: sets the Skill meter, keeps everything else.
export function applyLevel(profile, levelId) {
  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[2];
  return { ...profile, skill: level.skill, level: level.id };
}

// Moving a meter by hand turns the tendency into a custom one (unless it still matches). Moving Skill picks
// the nearest level.
export function setTrait(profile, key, value) {
  const next = { ...profile, [key]: value };
  if (key === 'skill') return { ...next, level: levelOf({ skill: value }).id };
  const tendency = TENDENCIES.find((p) => p.id === profile.preset);
  const stillPreset = tendency && ['looseness', 'aggression'].every((k) => tendency.traits[k] === next[k]);
  return { ...next, preset: stillPreset ? profile.preset : 'custom' };
}

// Short label for seats and summaries ("LAG · Rec", "Drunk · Reg", plus mood tags like "Tilted").
export function describeProfile(profile) {
  if (!profile) return { label: 'Unknown', tags: [] };
  const tendency = TENDENCIES.find((p) => p.id === profile.preset);
  const level = levelOf(profile);
  let style = tendency?.id === 'unknown' ? null : tendency?.label;
  if (!tendency) {
    const tight = profile.looseness < 35 ? 'Tight' : profile.looseness > 65 ? 'Loose' : 'Balanced';
    const aggro = profile.aggression < 35 ? 'passive' : profile.aggression > 65 ? 'aggressive' : '';
    style = [tight, aggro].filter(Boolean).join(' ');
  }
  let label = style ? `${style} · ${level.short}` : level.id === 'regular' ? 'Unknown' : level.label;
  const tags = [];
  if (profile.tilt >= 60) tags.push('Tilted');
  else if (profile.tilt >= 30) tags.push('Steaming');
  if (profile.form >= 70) tags.push('On a heater');
  if (profile.form <= 30) tags.push('Cold run');
  if (tags.length) label = `${label} · ${tags[0]}`;
  return { label, tags, tendency: tendency ?? null, level };
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
//   bigBluffShy 0..1: how much bluffing drops off as bets get bigger. Recreational players bluff small if at
//               all, so a big bet from them is almost always value. Strong players (0) bluff at any size.
//   drawAggro   0..1: how often draws are played as semi-bluffs (bets, raises). Recreational players check
//               and call their draws, even big combo draws; strong players bet and raise them.
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
  // recreational players call noticeably more on top of that ("I have to see it").
  let foldMult = clamp(1.3 - 0.8 * L, 0.45, 1.35);
  foldMult = lerp(foldMult, 1, 0.6 * S) * (0.75 + 0.25 * S);
  let noise = 0.05 + 0.13 * (1 - S);
  let bigBluffShy = clamp((0.45 - S) / 0.35, 0, 1); // beginners 1, recreational ~0.65, regulars and up 0
  const drawSkill = clamp((S - 0.05) / 0.65, 0, 1);
  let drawAggro = lerp(0.15, 1, drawSkill ** 1.5);

  // Tilt: plays more hands, bets and bluffs more, won't fold, and decisions get sloppy.
  widthMult *= 1 + 0.6 * T;
  aggression *= 1 + 0.5 * T;
  bluffMult *= 1 + T;
  foldMult *= 1 - 0.3 * T;
  noise += 0.06 * T;
  bigBluffShy *= 1 - T; // tilted players fire big bluffs too

  // Tendency extras the meters can't express (e.g. a drunk player calls anything and bluffs any size).
  const mods = TENDENCIES.find((t) => t.id === p.preset)?.mods;
  if (mods) {
    noise += mods.noise ?? 0;
    foldMult *= mods.foldMult ?? 1;
    bluffMult *= mods.bluffMult ?? 1;
    if (mods.bluffsAnySize) bigBluffShy = 0;
  }

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
    bigBluffShy: clamp(bigBluffShy, 0, 1),
    drawAggro: clamp(drawAggro, 0.1, 1),
    skill: S,
  };
}
