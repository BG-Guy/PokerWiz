// The leak report's numbers. The coach grades a hand decision by decision (analyzeHand.js); this keeps a compact
// record of those decisions on the hand (packDecisions, saved as hand.coachDecisions) and adds them up by kind of
// spot (src/coach/spots.js): how often it came up, what it cost against GTO, and which way you lean (too many
// folds, too few bets...) compared with what GTO does with the hands you actually held.
import { AREAS, handFamily, strengthBucket, POT_TYPES, HAND_FAMILIES, STRENGTHS } from './spots.js';
import { letterGrade } from '../utils/letterGrade.js';

// Bump when the packed shape or the way spots are labelled changes: hands analyzed under an older version are
// analyzed again.
export const LEAK_VERSION = 1;

export const KINDS = ['fold', 'check', 'call', 'raise']; // the order of a decision's GTO frequencies
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

// ----- Packing: what is kept on the hand -----

// The graded decisions of a report, as small rows. detail: 'preflop' | 'fast' | 'full', how deeply the hand was
// analyzed (a preflop-only pass has no postflop rows yet).
export function packDecisions(report, detail) {
  const bb = report.stakes.bb;
  const decisions = [];
  for (const d of report.decisions) {
    if (!d.graded || !d.spot) continue;
    const gto = { fold: 0, check: 0, call: 0, raise: 0 };
    for (const option of d.options) gto[option.kind] += option.frequency;
    decisions.push({
      i: d.index,
      ...d.spot,
      cls: d.heroClass, // the starting hand ("AKs"); a collected row's `hand` is the saved hand it came from
      str: d.heroHand.percentile === undefined ? null : round(d.heroHand.percentile, 2),
      you: d.actual.kind,
      best: d.best.kind,
      gto: KINDS.map((kind) => round(gto[kind], 2)),
      loss: round(d.evLoss / bb, 2),
      pot: round(d.potRef / bb, 1),
      score: d.score,
    });
  }
  return { v: LEAK_VERSION, at: new Date().toISOString(), detail, accuracy: report.accuracy ?? null, decisions };
}

// A marker for a hand the coach can't read (so it isn't tried again and again).
export const skippedMarker = (reason) => ({ v: LEAK_VERSION, at: new Date().toISOString(), detail: 'skipped', reason, decisions: [] });

// Did the hero act after the flop? Then a preflop pass isn't the whole story.
export const actsPostflop = (hand) => hand.streets.slice(1).some((street) => street.actions.some((a) => a.actor === 'Hero'));

// What the background scan should do with a hand: null (nothing), 'preflop' (a quick first look) or 'fast' (the
// whole hand).
export function scanStage(hand) {
  const stored = hand.coachDecisions;
  if (!stored || stored.v !== LEAK_VERSION) return actsPostflop(hand) ? 'preflop' : 'fast';
  if (stored.detail === 'preflop' && actsPostflop(hand)) return 'fast';
  return null;
}
export const isAnalyzed = (hand) => hand.coachDecisions?.v === LEAK_VERSION && hand.coachDecisions.detail !== 'skipped';

// ----- Collecting -----

// Every stored decision, with its hand: [{ ...decision, handId, hand }].
export function collectRows(hands) {
  const rows = [];
  for (const hand of hands) {
    const stored = hand.coachDecisions;
    if (!stored || stored.v !== LEAK_VERSION) continue;
    for (const decision of stored.decisions) rows.push({ ...decision, handId: hand.id, hand });
  }
  return rows;
}

// ----- Adding up -----

export const MISTAKE_BELOW = 55; // a D or an F
export const isMistake = (row) => row.score < MISTAKE_BELOW;

// Early reads are hints, not verdicts: how much to trust a number from this many spots.
export function confidence(count) {
  return count >= 12 ? 'solid' : count >= 5 ? 'growing' : 'early';
}

// The totals for a set of rows: how many, what they cost (bb), the average score, how you played them and how
// GTO plays them with the same hands (shares of each kind: fold, check, call, raise).
export function summarize(rows) {
  const count = rows.length;
  const you = { fold: 0, check: 0, call: 0, raise: 0 };
  const gto = { fold: 0, check: 0, call: 0, raise: 0 };
  let cost = 0;
  let score = 0;
  let mistakes = 0;
  for (const row of rows) {
    cost += row.loss;
    score += row.score;
    if (isMistake(row)) mistakes++;
    you[row.you] += 1;
    KINDS.forEach((kind, k) => {
      gto[kind] += row.gto[k];
    });
  }
  for (const kind of KINDS) {
    you[kind] = count ? you[kind] / count : 0;
    gto[kind] = count ? gto[kind] / count : 0;
  }
  const avgScore = count ? score / count : null;
  return { count, cost: round(cost, 2), avgLoss: count ? cost / count : 0, avgScore, grade: letterGrade(avgScore), mistakes, you, gto, confidence: confidence(count) };
}

// ----- Which way you lean -----

// Where nothing is to call (first to act, or checked to), the choice is between checking and betting.
export const isBetting = (area) => /^(flop|turn|river)-bet$/.test(area.id);
// The plays that are on the table in an area.
export const playsIn = (area) => (area.id === 'limped' ? KINDS : isBetting(area) ? ['check', 'raise'] : ['fold', 'call', 'raise']);

// One decision as shares of each play: what GTO does with the hand, and what you did (all on one play).
export const gtoShares = (row) => Object.fromEntries(KINDS.map((kind, k) => [kind, row.gto[k]]));
export const youShares = (row) => Object.fromEntries(KINDS.map((kind) => [kind, kind === row.you ? 1 : 0]));

// The kind of play where you and GTO differ the most, or null when the sample is too small or the difference
// too slight to mean anything. lean: "over" (you do it more than GTO) or "under".
const MIN_SPOTS = 5;
const MIN_GAP = 0.1;
export function tendencyOf(summary, area) {
  if (summary.count < MIN_SPOTS) return null;
  let best = null;
  for (const kind of playsIn(area)) {
    const gap = summary.you[kind] - summary.gto[kind];
    // A tie (check against bet, where one gap mirrors the other) goes to the first play listed.
    if (!best || Math.abs(gap) > Math.abs(best.gap) + 1e-6) best = { kind, you: summary.you[kind], gto: summary.gto[kind], gap };
  }
  if (!best || Math.abs(best.gap) < MIN_GAP) return null;
  return { ...best, lean: best.gap > 0 ? 'over' : 'under' };
}

// A play in words for an area: you "fold" and GTO "folds"; where nothing is to call a raise is a "bet".
function playWords(kind, area) {
  if (kind === 'raise') return area.id === 'open' ? { you: 'open', gto: 'opens' } : isBetting(area) ? { you: 'bet', gto: 'bets' } : { you: 'raise', gto: 'raises' };
  if (kind === 'call' && (area.id === 'open' || area.id === 'limped')) return { you: 'limp or call', gto: 'limps or calls' };
  return { you: kind, gto: `${kind}s` };
}
const pct = (x) => `${Math.round(x * 100)}%`;

// One sentence on what the numbers say: "You fold 62% of these; GTO folds 41% of the time with the hands you held."
// counted: the caller already says how many spots there are, so a small sample needn't repeat it.
export function leanSentence(summary, area, { counted = false } = {}) {
  const lean = tendencyOf(summary, area);
  if (!lean) {
    if (summary.count < MIN_SPOTS) return counted ? 'An early read, not a verdict.' : `Only ${summary.count} ${summary.count === 1 ? 'spot' : 'spots'} so far: an early read, not a verdict.`;
    return 'No clear lean: you play these spots about the way GTO would, and the mistakes are spread across the options.';
  }
  const words = playWords(lean.kind, area);
  return `You ${words.you} ${pct(lean.you)} of these; GTO ${words.gto} ${pct(lean.gto)} of the time with the hands you held.`;
}

// The lean in a few words, for a list row: "Folds too often", "Too passive". null when there's no clear lean.
export function leanLabel(summary, area) {
  const lean = tendencyOf(summary, area);
  if (!lean) return null;
  const betting = isBetting(area);
  const labels = {
    fold: { over: area.id === 'open' ? 'Opens too few hands' : 'Folds too often', under: "Doesn't fold enough" },
    call: { over: 'Calls too often', under: "Doesn't call enough" },
    check: { over: 'Checks too often', under: 'Bets too often' },
    raise: { over: area.id === 'open' ? 'Opens too wide' : betting ? 'Bets too often' : 'Raises too often', under: betting || area.id === 'open' ? 'Too passive' : "Doesn't raise enough" },
  };
  return labels[lean.kind][lean.lean];
}

// What to do about it, in a sentence (null when there's no clear lean).
export function adviceFor(summary, area) {
  const lean = tendencyOf(summary, area);
  if (!lean) return null;
  const betting = isBetting(area);
  const opening = area.id === 'open';
  const advice = {
    fold: {
      over: opening ? 'You pass on hands GTO opens. Open more of them, especially from the later seats.' : 'You give up too easily. Keep more of your medium-strength hands in the pot: they have the equity to continue.',
      under: 'You pay off too often. Let go of the weakest hands you continue with.',
    },
    call: {
      over: opening || area.id === 'limped' ? 'You limp or call where GTO raises or folds. Pick a side: raise the good hands, fold the rest.' : 'You call too much. With these hands GTO folds the weakest and raises the strongest instead.',
      under: 'You fold or raise where GTO calls. Some of these hands are worth a call, no more.',
    },
    check: {
      over: 'You check too often. GTO bets more of these hands.',
      under: 'You bet more than GTO does. Some of these hands should check.',
    },
    raise: {
      over: betting ? 'You bet more than GTO does with these hands. Check more of the weaker ones.' : "You're more aggressive than GTO here. Fewer raises, more calls and folds.",
      under: betting ? "You're too passive. GTO bets more of these hands: take the lead." : "You're too passive. GTO raises more often here, mainly with strong hands and good bluffs.",
    },
  };
  return advice[lean.kind][lean.lean];
}

// ----- The areas, and what's inside one -----

// Every area that came up, costliest first, each with its summary and rows.
export function areaSummaries(rows) {
  return AREAS.map((area) => {
    const own = rows.filter((row) => row.area === area.id);
    return { area, rows: own, ...summarize(own) };
  })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.cost - a.cost);
}

// The whole picture: overall totals, the areas by cost, and how many hands were looked at.
export function leakOverview(hands) {
  const rows = collectRows(hands);
  const areas = areaSummaries(rows);
  return {
    rows,
    total: summarize(rows),
    areas,
    handsAnalyzed: new Set(rows.map((row) => row.handId)).size,
    handsTotal: hands.length,
    worst: areas.find((entry) => entry.cost > 0 && entry.count >= 3) ?? null,
    best: areas.filter((entry) => entry.count >= MIN_SPOTS && entry.avgScore >= 85).sort((a, b) => b.avgScore - a.avgScore)[0] ?? null,
  };
}

// ----- Splitting an area -----

const POSITION_ORDER = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const ROLES = { aggressor: 'Preflop raiser', caller: 'Preflop caller', none: 'Limped pot' };

// The ways an area can be split: [{ id, label }]. Preflop: seat, kind of hand (and who opened). Postflop: seat,
// hand strength, pot type, position in the hand, role.
export function splitsFor(area) {
  if (area.street === 'Preflop') {
    const splits = [{ id: 'position', label: 'Seat' }, { id: 'family', label: 'Hand' }];
    if (area.id === 'vs-open' || area.id === 'vs-3bet') splits.push({ id: 'opener', label: 'Opener' });
    return splits;
  }
  return [{ id: 'position', label: 'Seat' }, { id: 'strength', label: 'Hand strength' }, { id: 'pot', label: 'Pot' }, { id: 'ip', label: 'Position' }, { id: 'role', label: 'Role' }];
}

// The value of a row on a split: { key, label, order } (order sorts ties).
function splitValue(row, split) {
  switch (split) {
    case 'position':
      return { key: row.position, label: row.position, order: POSITION_ORDER.indexOf(row.position) };
    case 'family':
      return { key: handFamily(row.cls), label: handFamily(row.cls), order: HAND_FAMILIES.indexOf(handFamily(row.cls)) };
    case 'opener':
      return { key: row.opener, label: `vs ${row.opener}`, order: POSITION_ORDER.indexOf(row.opener) };
    case 'strength': {
      const key = row.str === null ? 'Medium' : strengthBucket(row.str);
      return { key, label: key, order: STRENGTHS.indexOf(key) };
    }
    case 'pot':
      return { key: row.potType, label: POT_TYPES[row.potType], order: Object.keys(POT_TYPES).indexOf(row.potType) };
    case 'ip':
      return { key: row.ip ? 'ip' : 'oop', label: row.ip ? 'In position' : 'Out of position', order: row.ip ? 0 : 1 };
    case 'role':
      return { key: row.role, label: ROLES[row.role], order: Object.keys(ROLES).indexOf(row.role) };
    default:
      return { key: 'all', label: 'All', order: 0 };
  }
}

// Is this row in one of the groups of a split (to narrow a list to it)?
export const rowIsIn = (row, split, key) => splitValue(row, split).key === key;

// An area's rows grouped on a split: [{ key, label, rows, ...summary }], costliest first.
export function splitRows(rows, split) {
  const groups = new Map();
  for (const row of rows) {
    const value = splitValue(row, split);
    if (!groups.has(value.key)) groups.set(value.key, { key: value.key, label: value.label, order: value.order, rows: [] });
    groups.get(value.key).rows.push(row);
  }
  return [...groups.values()].map((group) => ({ ...group, ...summarize(group.rows) })).sort((a, b) => b.cost - a.cost || a.order - b.order);
}

// The costliest rows first, for the "worst spots" list.
export const worstRows = (rows, limit = 10) => [...rows].sort((a, b) => b.loss - a.loss || a.score - b.score).slice(0, limit);

// What to drill to practice a decision like this one: its area, narrowed by what matters (the seat and the
// opener before the flop; the kind of pot and position after it). Not so narrow that a spot rarely comes up.
export function focusOfRow(row) {
  if (row.street === 'Preflop') return { area: row.area, position: row.position, ...(row.area === 'vs-open' ? { opener: row.opener } : {}) };
  return { area: row.area, potType: row.potType, ip: row.ip };
}

// What to drill for an area (narrowed to one group of a split, when given): a focus for Practice (spots.js).
export function focusFor(areaId, split = null, key = null) {
  const focus = { area: areaId };
  if (!split || key === null) return focus;
  if (split === 'position') focus.position = key;
  else if (split === 'opener') focus.opener = key;
  else if (split === 'pot') focus.potType = key;
  else if (split === 'ip') focus.ip = key === 'ip';
  else if (split === 'role') focus.role = key;
  return focus;
}
