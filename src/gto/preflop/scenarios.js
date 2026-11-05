// The preflop spots of a solved chart that are worth browsing (the Ranges page): which decision nodes there are,
// what each is called ("BB vs BTN open"), how it reads (the line, its sizes, its actions), where it sits when you
// pick one (open, facing an open, your open vs a 3-bet ...) and how often it comes up. Ids ignore bet sizes and the
// stack depth, so a spot can be followed from one chart to another. What a spot's strategy looks like hand by
// hand is in scenarioGrid.js.
//
// Only spots the solution really solved are listed: the node itself and every decision on the way to it are
// stored in the chart (not stood in for by a nearby spot), and the spot comes up often enough to matter.
import { POSITIONS, SB } from './tree.js';
import { CLASS_COMBOS, CLASS_COUNT } from '../cards.js';

const N = CLASS_COUNT;
const isRaise = (e) => e.type === 'r' || e.type === 'a';

// Spots that come up in fewer deals than this (share of all deals) are left out, the rare multiway kind sooner.
const MIN_WEIGHT = 0.00005;
const MIN_WEIGHT_RARE = 0.0002;

// Long names for the seats, as a player says them.
export const SEAT_NAMES = {
  UTG: 'Under the gun',
  'UTG+1': 'UTG+1',
  LJ: 'Lojack',
  HJ: 'Hijack',
  CO: 'Cutoff',
  BTN: 'Button',
  SB: 'Small blind',
  BB: 'Big blind',
};

// The groups a spot can belong to, in picker order.
export const KINDS = [
  { id: 'open', title: 'Open (first in)', blurb: 'Everyone folded to you: raise or fold.' },
  { id: 'vs-open', title: 'Facing an open', blurb: 'Someone raised before you: fold, call or 3-bet.' },
  { id: 'vs-3bet', title: 'Your open vs a 3-bet', blurb: 'You raised first and got re-raised.' },
  { id: 'vs-4bet', title: 'Your 3-bet vs a 4-bet', blurb: 'You re-raised and got raised again.' },
  { id: 'vs-allin', title: 'Your 4-bet vs an all-in', blurb: 'You 4-bet and they shoved.' },
  { id: 'limp', title: 'Limped pots', blurb: 'The small blind completes (the only limp in the solved game).' },
  { id: 'other', title: 'Squeezes and rare spots', blurb: 'Called then re-raised, or raised into a raise cold.' },
];

// How each raise of a hand is called, by how many raises came before it (a limped pot has no "open": the first
// raise is just a raise, then a re-raise).
const FORMS = [
  { name: 'open', verb: 'opens', gerund: 'raising' },
  { name: '3-bet', verb: '3-bets', gerund: '3-betting' },
  { name: '4-bet', verb: '4-bets', gerund: '4-betting' },
  { name: '5-bet', verb: '5-bets', gerund: '5-betting' },
];
const LIMP_FORMS = [{ name: 'raise', verb: 'raises', gerund: 'raising' }, { name: 're-raise', verb: 're-raises', gerund: 're-raising' }, FORMS[2], FORMS[3]];
const formOf = (before, limped) => (limped ? LIMP_FORMS : FORMS)[Math.min(before, 3)];
const capital = (text) => text[0].toUpperCase() + text.slice(1);
// What Practice can drill (its areas): opening, facing an open, facing a 3-bet, facing a 4-bet, named like the groups
// above. Spots it can't ask for (your 4-bet meeting an all-in, squeezes, limped pots) have no focus, so no Practice link.
const AREAS = ['open', 'vs-open', 'vs-3bet', 'vs-4bet'];

// Position names that are safe in a URL (no "+").
const CODES = POSITIONS.map((name) => name.replace('+', ''));

// "BTN" -> 5 (the tree's seat number), accepting the URL-safe spelling too ("UTG1").
export function seatOf(name) {
  const at = POSITIONS.indexOf(name);
  return at >= 0 ? at : CODES.indexOf(name);
}

// A link to the Ranges page for a kind of spot as Practice and the leak report name it ({ area, position, opener? }),
// at a depth if given; null for the spots no single chart answers (what a 3-bet looks like depends on who made it).
export function rangesPath(focus, depth) {
  const hero = seatOf(focus.position);
  const opener = seatOf(focus.opener);
  let spot = null;
  if (focus.area === 'open' && hero >= 0) spot = CODES[hero];
  if (focus.area === 'vs-open' && hero >= 0 && opener >= 0) spot = `${CODES[hero]}/${CODES[opener]}r`;
  if (!spot) return null;
  const params = new URLSearchParams({ spot });
  if (depth) params.set('depth', String(depth));
  return `/ranges?${params}`;
}

// "2.5 bb", "9.4 bb", "100 bb"; and without the unit.
const bb = (x) => `${Number(x.toFixed(1))} bb`;
const plain = (x) => String(Number(x.toFixed(1)));

// "UTG:f|UTG+1:r2.5|LJ:c" -> [{ seat, type: 'f' | 'c' | 'k' | 'r' | 'a', to? }]
function parseKey(key) {
  if (!key) return [];
  return key.split('|').map((part) => {
    const at = part.lastIndexOf(':');
    const type = part[at + 1];
    return { seat: POSITIONS.indexOf(part.slice(0, at)), type, to: type === 'r' ? Number(part.slice(at + 2)) : undefined };
  });
}

// What happened before a decision, without the folds that go without saying (players who fold before ever putting
// chips in): the same story means the same spot.
function storyOf(key) {
  const seen = new Set();
  return parseKey(key).filter((e) => {
    if (e.type === 'f' && !seen.has(e.seat)) return false;
    seen.add(e.seat);
    return true;
  });
}

// Which group a spot belongs to, from its story and the player to act.
function kindOf(story, hero) {
  if (story[0]?.type === 'c' && story[0].seat === SB) return 'limp';
  const raises = story.filter(isRaise);
  const lastOwn = raises.map((r, i) => (r.seat === hero ? i : -1)).filter((i) => i >= 0).at(-1) ?? -1;
  if (raises.length === 0) return 'open';
  if (raises.length === 1 && !story.some((e) => e.seat === hero)) return 'vs-open';
  if (raises.length === 2 && lastOwn === 0) return 'vs-3bet';
  if (raises.length === 3 && lastOwn === 1) return 'vs-4bet';
  if (raises.length === 4 && lastOwn === 2) return 'vs-allin';
  return 'other';
}

// An id that doesn't change with bet sizes or stack depth: "BB/BTNr" (BB facing a BTN raise), "BB/BTNr-SBc"
// (and the SB called), "BTN" (BTN first in).
function idOf(hero, story) {
  const steps = story.map((e) => CODES[e.seat] + e.type);
  return steps.length ? `${CODES[hero]}/${steps.join('-')}` : CODES[hero];
}

// The player's options in words ("3-bet to 9.4", "Call 2.5", "Fold"). raises: how many raises came before.
function actionsOf(node, raises, limped, stack) {
  const form = formOf(raises, limped);
  return node.actions.map((a, index) => {
    const base = { index, type: a.type, to: a.to };
    if (a.type === 'fold') return { ...base, family: 'fold', label: 'Fold', short: 'Fold', verb: 'fold', gerund: 'folding' };
    if (a.type === 'check') return { ...base, family: 'check', label: 'Check', short: 'Check', verb: 'check', gerund: 'checking' };
    if (a.type === 'call') {
      const limp = node.level === 0; // the small blind completing
      return {
        ...base,
        family: 'call',
        label: limp ? 'Limp' : `Call ${plain(a.to)}`,
        short: limp ? 'Limp' : 'Call',
        size: bb(a.to),
        verb: limp ? 'limp' : 'call',
        gerund: limp ? 'limping' : 'calling',
      };
    }
    if (a.type === 'allin') return { ...base, to: stack, family: 'allin', label: 'All in', short: 'All in', size: bb(stack), verb: 'go all in', gerund: 'going all in' };
    const name = raises === 0 ? 'raise' : form.name;
    return { ...base, family: 'raise', label: `${capital(name)} to ${plain(a.to)}`, short: capital(name), size: bb(a.to), verb: name, gerund: form.gerund };
  });
}

// One event of the story in words: "BTN opens to 2.5 bb", "SB calls", "BB 3-bets to 11.9 bb".
// ordinal: how many raises came before it.
function phrase(e, ordinal, limped, stack) {
  const who = POSITIONS[e.seat];
  if (e.type === 'f') return `${who} folds`;
  if (e.type === 'k') return `${who} checks`;
  if (e.type === 'c') return limped && e.seat === SB && ordinal === 0 ? `${who} limps` : `${who} calls`;
  if (e.type === 'a') return `${who} goes all in (${bb(stack)})`;
  return `${who} ${formOf(ordinal, limped).verb} to ${bb(e.to)}`;
}

// The same, shorter, for lines of play too long to read in a list: "BTN opens 2.5", "SB all in".
function shortPhrase(e, ordinal, limped) {
  const who = POSITIONS[e.seat];
  if (e.type === 'a') return `${who} all in`;
  if (e.type !== 'r') return phrase(e, ordinal, limped, 0);
  return `${who} ${formOf(ordinal, limped).verb} ${plain(e.to)}`;
}

// The name of a spot ("BB vs BTN open", "BTN open vs SB 3-bet", "SB 3-bet vs BTN 4-bet") and what it is against
// ("vs BTN open"), for lists where the seat is already known.
function namesOf(kind, hero, story, raises) {
  const me = POSITIONS[hero];
  const limped = kind === 'limp';
  const last = raises.at(-1);
  const them = last ? POSITIONS[last.seat] : POSITIONS[SB];
  // What the last raise is called ("open", "3-bet", "all-in"), and what you did in the hand so far.
  const theirs = !last ? 'limp' : last.type === 'a' ? 'all-in' : formOf(raises.length - 1, limped).name;
  const mine = story.filter((e) => e.seat === hero);
  const ownRaise = raises.map((r, i) => (r.seat === hero ? i : -1)).filter((i) => i >= 0).at(-1) ?? -1;
  const role = ownRaise >= 0 ? formOf(ownRaise, limped).name : mine.length ? (limped ? 'limp' : 'call') : kind === 'other' ? 'cold' : '';
  const callers = story.filter((e) => e.type === 'c' && e.seat !== hero && !(limped && e === story[0]));
  const plus = callers.length ? ` + ${callers.map((e) => POSITIONS[e.seat]).join(', ')} call` : '';
  if (kind === 'open') return { title: `${me} open`, versus: 'First in' };
  const versus = `vs ${them} ${theirs}${plus}`;
  return { title: `${me}${role ? ` ${role}` : ''} ${versus}`, versus: kind === 'other' && role ? `${role} ${versus}` : versus };
}

// How a decision's range got here: for every seat, the share of each hand class that takes the actions leading
// to the node (1 = every combo of the class), and the chance (0..1) that a random deal reaches the node at all
// (everyone playing the chart). exactPath: every decision on the way is stored in the chart, not stood in for.
export function reachAt(chart, node) {
  const steps = [];
  for (let at = node; at.parent; at = at.parent) steps.push({ node: at.parent, index: at.parent.children.indexOf(at) });
  steps.reverse();
  const reach = Array.from({ length: POSITIONS.length }, () => new Float32Array(N).fill(1));
  let probability = 1;
  let exactPath = true;
  for (const { node: step, index } of steps) {
    const data = chart.dataAt(step);
    if (!data) {
      exactPath = false;
      continue;
    }
    if (!data.exact) exactPath = false;
    const row = reach[step.player];
    let before = 0;
    let after = 0;
    for (let c = 0; c < N; c++) {
      const w = CLASS_COMBOS[c] * row[c];
      before += w;
      after += w * data.strategy[index * N + c];
    }
    for (let c = 0; c < N; c++) row[c] *= data.strategy[index * N + c];
    probability *= before > 0 ? after / before : 0;
  }
  return { reach, probability, exactPath };
}

// Share of a range (class weights `row`) that takes action `index` of a node.
function shareOf(data, row, index) {
  let total = 0;
  let taken = 0;
  for (let c = 0; c < N; c++) {
    const w = CLASS_COMBOS[c] * row[c];
    total += w;
    taken += w * data.strategy[index * N + c];
  }
  return total > 0 ? taken / total : 0;
}

// What the headline number of a spot counts: how often you open, defend, continue or call.
const HEADLINES = { open: 'opens', 'vs-open': 'defends', 'vs-3bet': 'continues', 'vs-4bet': 'continues', 'vs-allin': 'calls', limp: 'continues', other: 'continues' };

// Every browsable spot of a chart (see the header), ordered by group, then seat, then how often it comes up.
// A spot: {
//   id, groupId (the same line of play whoever called: "BB/BTNr" and "BB/BTNr-SBc" share one), nodeId, node,
//   kind, seat, position (who acts), villain / villainPosition / villainVerb (the last raiser, or the limper: "opens",
//   "3-bets", "goes all in", "limps"; villainSpot: the id of the spot where they made that move), opener (the first
//   raiser's position), callers: [positions], raises: how many raises came before, limped,
//   title ("BB vs BTN open"), versus ("vs BTN open"), line: [text], sizes ("BTN opens to 2.5 bb"), subtitle (the
//   sizes, shortened when the line of play is long, or "Folded to BTN"),
//   actions: [{ index, type, to, family, label, short, size?, verb, gerund }],
//   pot, toCall, potOdds (bb), stack (bb), weight (share of all deals that get here),
//   headline: { label, share } (how much of the range plays on: opens, defends ...),
//   area, focus: what Practice can drill ({ area, position, opener? }: opener is the first raiser, which is you when you
//   opened), or null
// }
export function listScenarios(chart) {
  const stack = chart.tree.stack;
  const ante = chart.tree.ante ?? 0;
  const list = [];
  for (const node of chart.tree.decisions) {
    const data = chart.dataAt(node);
    if (!data?.exact) continue;
    const { reach, probability, exactPath } = reachAt(chart, node);
    if (!exactPath) continue;
    const hero = node.player;
    const story = storyOf(node.key);
    const kind = kindOf(story, hero);
    if (probability < (kind === 'other' ? MIN_WEIGHT_RARE : MIN_WEIGHT)) continue;

    const raises = story.filter(isRaise);
    const limped = kind === 'limp';
    const position = POSITIONS[hero];
    const actions = actionsOf(node, raises.length, limped, stack);
    let ordinal = 0;
    const line = [];
    const brief = [];
    for (const e of story) {
      line.push(phrase(e, ordinal, limped, stack));
      brief.push(shortPhrase(e, ordinal, limped));
      if (isRaise(e)) ordinal += 1;
    }
    const pot = node.invested.reduce((sum, x) => sum + x, 0) + ante;
    const toCall = Math.max(0, node.currentBet - node.invested[hero]);
    const fold = actions.findIndex((a) => a.family === 'fold');
    const villain = raises.length ? raises.at(-1).seat : limped ? SB : null;
    // Where that opponent made their move (BB vs BTN open: the button's open), so their range can be followed back.
    let acted = node.parent;
    while (acted && acted.player !== villain) acted = acted.parent;
    const area = AREAS.includes(kind) ? kind : null;
    const names = namesOf(kind, hero, story, raises);
    const aggressive = actions.filter((a) => a.family === 'raise' || a.family === 'allin').reduce((sum, a) => sum + shareOf(data, reach[hero], a.index), 0);
    const skeleton = story.filter((e) => isRaise(e) || (limped && e === story[0])).map((e) => CODES[e.seat] + e.type);

    list.push({
      id: idOf(hero, story),
      groupId: `${kind}:${CODES[hero]}:${skeleton.join('-')}`,
      nodeId: node.id,
      node,
      kind,
      seat: hero,
      position,
      villain,
      villainPosition: villain === null ? null : POSITIONS[villain],
      villainSpot: villain !== null && acted ? idOf(villain, storyOf(acted.key)) : null,
      villainVerb: !raises.length ? 'limps' : raises.at(-1).type === 'a' ? 'goes all in' : formOf(raises.length - 1, limped).verb,
      opener: raises.length ? POSITIONS[raises[0].seat] : null,
      callers: story.filter((e) => e.type === 'c' && e.seat !== hero && !(limped && e === story[0])).map((e) => POSITIONS[e.seat]),
      raises: raises.length,
      limped,
      title: names.title,
      versus: names.versus,
      line,
      sizes: line.join(' · '),
      subtitle: !line.length ? `Folded to ${position}` : line.join(' · ').length > 58 ? brief.join(' · ') : line.join(' · '),
      actions,
      pot,
      toCall,
      potOdds: toCall > 0 ? toCall / (pot + toCall) : 0,
      stack,
      weight: probability,
      headline: fold < 0 ? { label: 'raises', share: aggressive } : { label: kind === 'open' && hero === SB ? 'plays' : HEADLINES[kind], share: 1 - shareOf(data, reach[hero], fold) },
      area,
      focus: area ? { area, position, ...(raises.length ? { opener: POSITIONS[raises[0].seat] } : {}) } : null,
    });
  }
  const order = (s) => KINDS.findIndex((k) => k.id === s.kind);
  return list.sort((a, b) => order(a) - order(b) || a.seat - b.seat || b.weight - a.weight);
}

// A spot by id (or null).
export const findScenario = (list, id) => list.find((s) => s.id === id) ?? null;

// The spot with the fewest callers is the base of its line of play ("heads-up"); the rest are its variants.
const byBase = (a, b) => a.callers.length - b.callers.length || b.weight - a.weight;

// What a seat can be facing, for picking: [{ ...kind, groups: [{ id, base, variants }], count }] in picker order.
// A group is one line of play (BB facing a CO open) with its caller variants after the base, common lines first.
export function situationsFor(list, seat) {
  const out = [];
  for (const kind of KINDS) {
    const mine = list.filter((s) => s.seat === seat && s.kind === kind.id);
    if (!mine.length) continue;
    const byGroup = new Map();
    for (const s of mine) byGroup.set(s.groupId, [...(byGroup.get(s.groupId) ?? []), s]);
    const groups = [...byGroup.entries()].map(([id, members]) => {
      const sorted = [...members].sort(byBase);
      return { id, base: sorted[0], variants: sorted.slice(1) };
    });
    groups.sort((a, b) => b.base.weight - a.base.weight);
    out.push({ ...kind, groups, count: groups.length });
  }
  return out;
}

// The spots of the same line of play as `scenario` (BB vs CO open with each set of callers), base first.
export const variantsOf = (list, scenario) => list.filter((s) => s.groupId === scenario.groupId).sort(byBase);

// A few spots everybody studies first (the ones that exist in this chart).
const POPULAR = ['BB/BTNr', 'BTN', 'BB/COr', 'CO', 'SB/BTNr', 'BTN/COr', 'SB', 'BTN/BTNr-BBr'];
export function popularScenarios(list, count = 6) {
  return POPULAR.map((id) => findScenario(list, id)).filter(Boolean).slice(0, count);
}

// How much a seat says about itself, for the seat list: how wide it opens, or how much the blind defends.
export function seatHeadline(list, seat) {
  const open = list.find((s) => s.seat === seat && s.kind === 'open');
  if (open) return { share: open.headline.share, label: open.headline.label };
  const defend = list.find((s) => s.seat === seat && s.kind === 'vs-open' && s.opener === 'BTN' && !s.callers.length) ?? list.find((s) => s.seat === seat && s.kind === 'vs-open');
  return defend ? { share: defend.headline.share, label: `defends vs ${defend.opener}` } : null;
}

// The spot in `list` closest to `hint` (a spot of another chart, say at another depth): the same one when it
// exists, else the same seat, group and opponent as far as they go.
export function nearestScenario(list, hint) {
  if (!list.length) return null;
  if (!hint) return null;
  const same = findScenario(list, hint.id);
  if (same) return same;
  const score = (s) =>
    (s.seat === hint.seat ? 8 : 0) +
    (s.kind === hint.kind ? 4 : 0) +
    (s.opener === hint.opener ? 2 : 0) +
    (s.villain === hint.villain ? 1 : 0) -
    Math.abs(s.callers.length - hint.callers.length) * 0.5 -
    Math.min(1, 1 - s.weight * 50) * 0.1;
  return list.reduce((best, s) => (score(s) > score(best) ? s : best), list[0]);
}
