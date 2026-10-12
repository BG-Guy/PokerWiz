// Leak scan: looks for strategy mistakes a poker player would call weird, across the whole engine rather than
// a few hands. It isn't a comparison with a solver (scripts/gto-reference does that); it checks rules any
// sound strategy keeps:
//   preflop   premiums (AA, KK, QQ, AK) raise and re-raise instead of flatting, strong hands always open (the
//             button opens every suited ace, nobody opens trash under the gun, the big blind defends suited
//             aces and connectors against the button),
//             the big blind defends enough against button and UTG opens, the button flats some hands against a
//             cutoff open, small pairs aren't 3-bet more than they're called;
//   postflop  practice-like spots are solved and every hand the player could hold is read: strong hands
//             bet when checked to in position, good draws use their equity and position, strong hands
//             don't fold to a bet, nothing-hands don't call river bets.
//   node scripts/gto/leakScan.mjs [--charts dir] [--depths 100,40,20] [--spots 40] [--format hu|3way] [--seed 1]
//                                 [--json report.json] [--preflop-only]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setChartLoader } from '../../src/gto/preflop/charts.js';
import { createHand, applyAction, currentPlayer } from '../../src/utils/handEngine.js';
import { TABLE_POSITIONS } from '../../src/constants/poker.js';
import { createGtoHand } from '../../src/gto/hand.js';
import { CLASS_NAMES, CLASS_COMBOS, HAND_CARDS, APP_COMBO_OF_HAND, cardCode } from '../../src/gto/cards.js';
import { computeStrengths } from '../../src/coach/boardStrength.js';
import { codeToIndex } from '../../src/utils/cards.js';
import { generateSpot } from '../../src/practice/generateSpot.js';
import { createRandom } from '../../src/coach/random.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const chartDir = arg('charts') ? resolve(arg('charts')) : new URL('../../src/gto/preflop/charts/', import.meta.url).pathname;
setChartLoader(async (name) => new Uint8Array(readFileSync(join(chartDir, `${name}.pfc`))));

const POSITIONS = TABLE_POSITIONS[8]; // seat order (from the button)
const ACTION_ORDER = ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']; // who acts first preflop
const pct = (x) => `${(100 * x).toFixed(0)}%`;
const flags = [];
const flag = (text) => flags.push(text);

// ----- Preflop: whole ranges at the spots that matter (8-handed, $1/$2, 100 bb unless given) -----

// Two cards for a class name (AKs -> Ah Kh, AKo -> Ah Kd, 77 -> 7h 7d).
const cardsOf = (name) => (name.length === 2 ? [`${name[0]}h`, `${name[1]}d`] : name[2] === 's' ? [`${name[0]}h`, `${name[1]}h`] : [`${name[0]}h`, `${name[1]}d`]);

// The strategy of the player to act after `line` ([position, type, amountBB?]): per class, { fold, call, raise }.
async function preflopSpot(line, stackBB = 100) {
  const players = POSITIONS.map((position, seat) => ({ seat, position, role: 'villain', name: position, stack: stackBB * 2 }));
  let state = createHand({ players, positions: POSITIONS, sb: 1, bb: 2 });
  const gto = await createGtoHand({ state, stackBB });
  for (const [position, type, amountBB] of line) {
    if (currentPlayer(state)?.position !== position) throw new Error(`Expected ${currentPlayer(state)?.position} to act, the line has ${position}`);
    const action = { type, amount: amountBB !== undefined ? amountBB * 2 : undefined };
    gto.apply(state, action);
    state = applyAction(state, action);
  }
  const actor = currentPlayer(state).position;
  const byClass = CLASS_NAMES.map((name) => {
    const advice = gto.advise(state, cardsOf(name));
    const out = { fold: 0, call: 0, raise: 0 };
    for (const o of advice.options ?? []) {
      const kind = o.type === 'fold' ? 'fold' : o.type === 'call' || o.type === 'check' ? 'call' : 'raise';
      out[kind] += o.frequency;
    }
    return out;
  });
  // Share of all combos (weighted by how often the player gets here: everything, for a first decision).
  const reach = gto.rangeOf(state, POSITIONS.indexOf(actor)) ?? CLASS_NAMES.map(() => 1);
  const total = { fold: 0, call: 0, raise: 0 };
  let mass = 0;
  byClass.forEach((f, c) => {
    const w = CLASS_COMBOS[c] * reach[c];
    mass += w;
    for (const k of Object.keys(total)) total[k] += w * f[k];
  });
  for (const k of Object.keys(total)) total[k] /= mass;
  return { actor, byClass, total };
}

const at = (spot, name) => spot.byClass[CLASS_NAMES.indexOf(name)];
const folds = (pos) => [pos, 'fold'];
const before = (position) => ACTION_ORDER.slice(0, ACTION_ORDER.indexOf(position)).map(folds);

async function scanPreflop() {
  console.log(`Preflop (${chartDir})`);
  const results = [];
  // A rule at a spot; when it fails, `problem` says what's wrong in words.
  const check = (spot, label, value, ok, problem) => {
    results.push({ spot, check: label, value, ok });
    if (!ok) flag(`preflop ${spot}: ${problem}`);
  };

  for (const stackBB of arg('depths', '100,40,20').split(',').map(Number)) {
    // Opens: the strongest hands always open, from every position.
    for (const pos of ['UTG', 'HJ', 'CO', 'BTN', 'SB']) {
      const spot = await preflopSpot(before(pos), stackBB);
      for (const name of ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs']) {
        const f = at(spot, name);
        if (f.fold > 0.02) check(`${pos} open ${stackBB}bb`, `${name} opens`, 1 - f.fold, false, `${name} folds ${pct(f.fold)}`);
      }
      if (stackBB === 100) console.log(`  ${pos} opens ${pct(spot.total.raise + (pos === 'SB' ? spot.total.call : 0))}`);
      if (stackBB !== 100) continue;
      // Hands every chart treats the same way: the button opens all suited aces and the strong suited and
      // broadway hands; nobody opens trash from under the gun.
      if (pos === 'BTN') {
        for (const name of ['A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s', 'KTs', 'QTs', 'JTs', 'T9s', 'KQo', 'KJo', 'QJo', '55', '22']) {
          const f = at(spot, name);
          if (f.fold > 0.1) check(`${pos} open`, `${name} opens`, 1 - f.fold, false, `${name} folds ${pct(f.fold)}`);
        }
      }
      if (pos === 'UTG') {
        for (const name of ['72o', '83o', '94o', 'T4o', 'J5o', 'Q3o', 'K4o', '32o', '64o', '75o']) {
          const f = at(spot, name);
          if (f.fold < 0.95) check(`${pos} open`, `${name} folds`, f.fold, false, `${name} opens ${pct(1 - f.fold)}`);
        }
      }
    }
    // Facing one raise: AA and KK re-raise (always), QQ and AK nearly always.
    const facing = [
      ['BB vs BTN', [...before('BTN'), ['BTN', 'raise', 2.5], ['SB', 'fold']]],
      ['BTN vs CO', [...before('CO'), ['CO', 'raise', 2.5]]],
      ['SB vs BTN', [...before('BTN'), ['BTN', 'raise', 2.5]]],
      ['BB vs UTG', [['UTG', 'raise', 2.5], ...['UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB'].map(folds)]],
    ];
    for (const [label, line] of facing) {
      const spot = await preflopSpot(line, stackBB);
      for (const [name, need] of [['AA', 0.95], ['KK', 0.95], ['QQ', 0.7], ['AKs', 0.7], ['AKo', 0.5]]) {
        const f = at(spot, name);
        check(`${label} ${stackBB}bb`, `${name} re-raises`, f.raise, f.raise >= need, `${name} re-raises only ${pct(f.raise)} (flats ${pct(f.call)}, folds ${pct(f.fold)})`);
      }
      if (stackBB === 100) {
        const t = spot.total;
        console.log(`  ${label}: fold ${pct(t.fold)}, call ${pct(t.call)}, raise ${pct(t.raise)}`);
        if (label === 'BB vs BTN') check(label, 'big blind defends', 1 - t.fold, t.fold <= 0.45, `defends only ${pct(1 - t.fold)} (folds ${pct(t.fold)})`);
        if (label === 'BB vs BTN') {
          for (const name of ['A9s', 'A5s', 'A2s', 'KTs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s', 'KJo', 'QJo', '22']) {
            const f = at(spot, name);
            if (f.fold > 0.1) check(label, `${name} defends`, 1 - f.fold, false, `${name} folds ${pct(f.fold)}`);
          }
        }
        if (label === 'BB vs UTG') check(label, 'big blind defends', 1 - t.fold, t.fold <= 0.78, `defends only ${pct(1 - t.fold)} (folds ${pct(t.fold)})`);
        if (label === 'BTN vs CO') check(label, 'button flats some hands', t.call, t.call >= 0.03, `flats only ${pct(t.call)} of hands`);
        // Small pairs: set-mining hands are called more than 3-bet; a range that 3-bets 44 and flats KJ is upside down.
        const small = ['22', '33', '44', '55', '66'].map((n) => at(spot, n));
        const smallRaise = small.reduce((s, f) => s + f.raise, 0) / small.length;
        const smallCall = small.reduce((s, f) => s + f.call, 0) / small.length;
        if (label.startsWith('BB')) check(label, 'small pairs mostly flat', smallCall, smallRaise <= smallCall, `3-bets small pairs (22-66) ${pct(smallRaise)} of the time and flats them ${pct(smallCall)}: they should mostly flat`);
      }
    }
    // Facing a 3-bet: AA and KK 4-bet or get it in, never fold.
    const threeBet = await preflopSpot([...before('CO'), ['CO', 'raise', 2.5], ['BTN', 'raise', 8], ['SB', 'fold'], ['BB', 'fold']], stackBB);
    for (const name of ['AA', 'KK']) {
      const f = at(threeBet, name);
      check(`CO vs BTN 3-bet ${stackBB}bb`, `${name} never folds`, f.fold, f.fold <= 0.01, `${name} folds ${pct(f.fold)}`);
      check(`CO vs BTN 3-bet ${stackBB}bb`, `${name} mostly 4-bets`, f.raise, f.raise >= 0.6, `${name} 4-bets only ${pct(f.raise)}`);
    }
  }
  return results;
}

// ----- Postflop: every hand of the player to act, in solved practice spots -----

// Where a decision is: on which street, and whether the player is first to act, checked to, facing a bet, or
// facing a raise (a bet and a raise: even strong hands can fold there, so it isn't held to the same rules).
function situationOf(state, seat) {
  const actor = state.players.find((p) => p.seat === seat);
  const actions = state.streets.at(-1).actions;
  const acted = actions.length;
  const facing = state.currentBet > (actor.streetBet ?? 0);
  const aggressive = actions.filter((a) => a.verb === 'bets' || a.verb.includes('raise') || a.verb === 'all in').length;
  if (facing && aggressive >= 2) return `${state.street.toLowerCase()} facing a raise`;
  // Checked to: in position when nobody acts after you (heads-up always; 3-way only the last player).
  const left = state.players.filter((p) => !p.folded && !p.allIn).length - 1 - acted;
  const checkedTo = left > 0 ? 'checked to, not last' : 'checked to';
  return `${state.street.toLowerCase()} ${facing ? 'facing a bet' : acted === 0 ? 'first to act' : checkedTo}`;
}

// A hand's bucket on the board: its percentile among all possible hands (hs) and its drawing equity.
function bucketOf(hs, draw, street) {
  if (hs >= 0.95) return 'nutted';
  if (hs >= 0.85) return 'strong';
  const drawing = street === 'flop' ? draw >= 0.28 : street === 'turn' ? draw >= 0.15 : false;
  if (hs >= 0.65) return 'good';
  if (drawing) return 'draw';
  if (hs >= 0.35) return 'weak';
  return 'air';
}

async function scanPostflop(spots, seed, format) {
  console.log(`\nPostflop: ${spots} practice spots (${format === '3way' ? '3-way' : 'heads-up'}; any pot and 3-bet pots)`);
  const random = createRandom(seed);
  const table = new Map(); // `${situation}|${bucket}` -> { weight, bet, call, fold, check }
  const examples = [];
  const facingSpots = []; // where each facing-a-bet row comes from
  for (let k = 0; k < spots; k++) {
    // Flop, turn and river in turn; every third spot a 3-bet pot.
    const street = ['Flop', 'Turn', 'River'][k % 3];
    const setup = { game: 'cash', format, pot: Math.floor(k / 3) % 3 === 2 ? '3bet' : 'any', street, villains: [{ stackBB: 100 }], hero: { stackBB: 100 }, boardMode: 'random' };
    const spot = await generateSpot(setup, random);
    if (!spot) continue;
    const { state, gto } = spot;
    const seat = currentPlayer(state).seat;
    const situation = situationOf(state, seat);
    // The action so far on this street, with bets as a share of the pot before them (for the examples).
    const line = state.streets.at(-1).actions.map((a) => `${a.actor === 'Hero' ? 'player' : a.actor} ${a.verb}${a.amount ? ` ${(a.amount / state.bb).toFixed(1)}bb` : ''}`).join(', ') || 'first to act';
    const where = `${state.board.join(' ')}, pot ${(state.pot / state.bb).toFixed(1)}bb, ${line}`;
    const range = gto.handRangeOf(state, seat);
    const strengths = computeStrengths(state.board.map(codeToIndex));
    const boardCodes = new Set(state.board);
    const seenOptions = new Set();
    for (let h = 0; h < HAND_CARDS.length; h++) {
      const w = range?.[h] ?? 0;
      if (!(w > 1e-3)) continue;
      const codes = HAND_CARDS[h].map(cardCode);
      if (codes.some((c) => boardCodes.has(c))) continue;
      let advice;
      try {
        advice = gto.advise(state, codes);
      } catch {
        continue; // too rare in the range to be in the solve
      }
      if (advice.unavailable || !advice.options) continue;
      const combo = APP_COMBO_OF_HAND[h];
      const hs = strengths.hs[combo];
      const bucket = bucketOf(hs, strengths.draw[combo], state.street.toLowerCase());
      const key = `${situation}|${bucket}`;
      const row = table.get(key) ?? { weight: 0, bet: 0, call: 0, fold: 0, check: 0 };
      let bet = 0;
      for (const o of advice.options) seenOptions.add(o.type);
      for (const o of advice.options) {
        const kind = o.type === 'bet' || o.type === 'raise' || o.type === 'allin' ? 'bet' : o.type;
        row[kind] += w * o.frequency;
        if (kind === 'bet') bet += o.frequency;
      }
      row.weight += w;
      table.set(key, row);
      // Single hands worth a look: the near-nuts checking back in position, or folding.
      const foldFreq = advice.options.filter((o) => o.type === 'fold').reduce((s, o) => s + o.frequency, 0);
      if (hs >= 0.97 && situation.endsWith('checked to') && bet < 0.05) examples.push(`${codes.join('')} (beats ${pct(hs)}) checks back ${pct(1 - bet)}: ${where}`);
      if (hs >= 0.85 && foldFreq > 0.15 && situation.endsWith('facing a bet')) examples.push(`${codes.join('')} (beats ${pct(hs)}) folds ${pct(foldFreq)}: ${where}`);
    }
    if (situation.includes('facing')) facingSpots.push(`${situation}: ${where} (options: ${[...seenOptions].join(', ')})`);
    process.stdout.write(`\r  ${k + 1}/${spots} spots`);
  }
  console.log('');

  const rows = [...table.entries()].map(([key, r]) => {
    const [situation, bucket] = key.split('|');
    const norm = (x) => x / r.weight;
    return { situation, bucket, weight: r.weight, bet: norm(r.bet), call: norm(r.call), fold: norm(r.fold), check: norm(r.check) };
  });
  const order = ['nutted', 'strong', 'good', 'draw', 'weak', 'air'];
  rows.sort((a, b) => a.situation.localeCompare(b.situation) || order.indexOf(a.bucket) - order.indexOf(b.bucket));
  let last = '';
  for (const r of rows) {
    if (r.situation !== last) console.log(`  ${r.situation}`);
    last = r.situation;
    const facing = r.situation.endsWith('facing a bet') || r.situation.endsWith('facing a raise');
    const parts = facing ? `raise ${pct(r.bet)}, call ${pct(r.call)}, fold ${pct(r.fold)}` : `bet ${pct(r.bet)}, check ${pct(r.check)}`;
    console.log(`    ${r.bucket.padEnd(7)} ${parts}  (${r.weight.toFixed(1)} combos)`);
  }

  // The rules. Each needs enough hands behind it to mean something.
  for (const r of rows) {
    if (r.weight < 3) continue;
    const where = `${r.situation}, ${r.bucket} hands`;
    if (r.situation.endsWith('checked to') && (r.bucket === 'nutted' || r.bucket === 'strong') && r.bet < 0.35) flag(`postflop ${where}: bet only ${pct(r.bet)} in position (value missed)`);
    if (r.situation.endsWith('checked to') && r.bucket === 'draw' && r.bet < 0.25) flag(`postflop ${where}: bet only ${pct(r.bet)} (equity and position unused)`);
    if (r.situation.endsWith('facing a bet') && r.bucket === 'nutted' && r.fold > 0.01) flag(`postflop ${where}: fold ${pct(r.fold)}`);
    if (r.situation.endsWith('facing a bet') && r.bucket === 'strong' && r.fold > 0.05) flag(`postflop ${where}: fold ${pct(r.fold)}`);
    if (r.situation === 'river facing a bet' && r.bucket === 'air' && r.call > 0.15) flag(`postflop ${where}: call ${pct(r.call)} with nothing`);
  }
  console.log(`  Spots facing a bet or raise (${facingSpots.length}):`);
  for (const f of facingSpots) console.log(`    ${f}`);
  if (examples.length) {
    console.log(`  Single hands worth a look (${examples.length}):`);
    for (const e of examples.slice(0, 12)) console.log(`    ${e}`);
  }
  return rows;
}

const preflop = await scanPreflop();
const postflop = process.argv.includes('--preflop-only') ? [] : await scanPostflop(Number(arg('spots', 40)), Number(arg('seed', 1)), arg('format', 'hu'));
console.log(flags.length ? `\n${flags.length} leak${flags.length === 1 ? '' : 's'} found:\n  ${flags.join('\n  ')}` : '\nNo leaks found.');
if (arg('json')) writeFileSync(arg('json'), JSON.stringify({ preflop, postflop, flags }, null, 1));
process.exitCode = flags.length ? 1 : 0;
