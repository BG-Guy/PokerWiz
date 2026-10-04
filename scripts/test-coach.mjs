// Coach sanity checks: scripted hands with an obvious right answer, run through the full GTO analysis.
// Run with: node scripts/test-coach.mjs          (add "--verbose" to print every note)
//      or:  node scripts/test-coach.mjs --api http://localhost:3001   to also review every saved hand
// Each case prints the hero's decisions with grade, the GTO play and how often GTO takes each option, so the
// engine can be checked by eye. The hands are 6-handed, so they also exercise the mapping onto the 8-max charts.
import { readFileSync } from 'node:fs';
import { createHand, applyAction, dealBoard, heroResult } from '../src/utils/handEngine.js';
import { analyzeHand } from '../src/coach/analyzeHand.js';
import { prepareSavedHand } from '../src/coach/savedHand.js';
import { setChartLoader } from '../src/gto/preflop/charts.js';

setChartLoader(async (name) => new Uint8Array(readFileSync(new URL(`../src/gto/preflop/charts/${name}.pfc`, import.meta.url))));
const VERBOSE = process.argv.includes('--verbose');
const POSITIONS = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];

// Build a coach record by playing a script through the engine.
// players: [{ position, role, cards, stack }]; script: [{ act: {type, amount} } | { deal: [codes] }]
function buildRecord({ players, script, sb = 1, bb = 2, winners }) {
  const seated = players.map((p) => ({
    seat: POSITIONS.indexOf(p.position),
    position: p.position,
    role: p.role,
    name: p.role === 'hero' ? 'You' : p.position,
    stack: p.stack ?? 200,
    cards: p.cards ?? [],
  }));
  let state = createHand({ players: seated, positions: POSITIONS, sb, bb });
  for (const step of script) {
    state = step.deal ? dealBoard(state, step.deal) : applyAction(state, step.act);
  }
  const heroSeat = seated.find((p) => p.role === 'hero').seat;
  const winSeats = winners ? winners.map((pos) => POSITIONS.indexOf(pos)) : [heroSeat];
  return {
    stakes: { label: `$${sb}/$${bb}`, sb, bb },
    tableSize: 6,
    positions: POSITIONS,
    heroSeat,
    players: seated,
    streets: state.streets,
    board: state.board,
    winners: winSeats,
    result: heroResult(state, winSeats),
    pot: state.pot,
  };
}

const act = (type, amount) => ({ act: { type, amount } });
const deal = (...cards) => ({ deal: cards });

const CASES = [
  {
    name: 'AKo 3-bets the button vs a CO open, value bets top pair three streets',
    expect: 'high accuracy',
    players: [
      { position: 'CO', role: 'villain' },
      { position: 'BTN', role: 'hero', cards: ['As', 'Kd'] },
    ],
    script: [
      act('raise', 5), act('raise', 16), act('call'),
      deal('Kh', '7c', '2d'), act('check'), act('bet', 8), act('call'),
      deal('4s'), act('check'), act('bet', 24), act('call'),
      deal('9h'), act('check'), act('bet', 60), act('call'),
    ],
  },
  {
    name: 'Folds pocket aces to a single open',
    expect: 'blunder',
    players: [
      { position: 'CO', role: 'villain' },
      { position: 'BTN', role: 'hero', cards: ['Ah', 'Ac'] },
    ],
    script: [act('raise', 5), act('fold')],
  },
  {
    name: 'Flats pocket kings against a cutoff open',
    expect: 'below Good: GTO 3-bets kings',
    players: [
      { position: 'CO', role: 'villain' },
      { position: 'BTN', role: 'hero', cards: ['Kh', 'Kc'] },
    ],
    script: [act('raise', 5), act('call')],
  },
  {
    name: 'Opens 72o under the gun',
    expect: 'mistake',
    players: [
      { position: 'UTG', role: 'hero', cards: ['7h', '2c'] },
      { position: 'BB', role: 'villain' },
    ],
    script: [act('raise', 5), act('fold')],
  },
  {
    name: 'Bluffs the river with a missed draw (jack-ten on A-8-3-2-6)',
    expect: 'GTO bluffs some missed draws and checks some',
    players: [
      { position: 'BB', role: 'villain' },
      { position: 'BTN', role: 'hero', cards: ['Jc', 'Tc'] },
    ],
    script: [
      act('raise', 5), act('call'),
      deal('Ah', '8s', '3d'), act('check'), act('check'),
      deal('2h'), act('check'), act('check'),
      deal('6s'), act('check'), act('bet', 10),
    ],
  },
  {
    name: 'Folds the nut flush draw + overcards to a small flop bet',
    expect: 'fold is a mistake',
    players: [
      { position: 'CO', role: 'villain' },
      { position: 'BB', role: 'hero', cards: ['Ah', 'Kh'] },
    ],
    script: [
      act('raise', 5), act('call'),
      deal('9h', '6h', '2c'), act('check'), act('bet', 4), act('fold'),
    ],
    winners: ['CO'],
  },
  {
    name: 'Short-stacked button shoves 15 bb, big blind calls with 22',
    expect: 'close: GTO calls small pairs against a wide shove',
    players: [
      { position: 'BTN', role: 'villain', stack: 30 },
      { position: 'BB', role: 'hero', cards: ['2h', '2c'] },
    ],
    script: [act('allin'), act('call'), deal('Kd', '9s', '5c'), deal('Jh'), deal('4d')],
  },
  {
    name: 'Calls a pot-size river bet with top pair, weak kicker',
    expect: 'a bluff-catch GTO makes at some frequency',
    players: [
      { position: 'BB', role: 'villain' },
      { position: 'BTN', role: 'hero', cards: ['Kd', '9c'] },
    ],
    script: [
      act('raise', 5), act('call'),
      deal('Ks', '8d', '4c'), act('check'), act('bet', 4), act('call'),
      deal('2s'), act('check'), act('check'),
      deal('7h'), act('bet', 18), act('call'),
    ],
    winners: ['BB'],
  },
  {
    name: 'Faces a flop check-raise on a draw-heavy board with top pair',
    expect: 'continue (call)',
    players: [
      { position: 'BB', role: 'villain' },
      { position: 'BTN', role: 'hero', cards: ['Ac', 'Jd'] },
    ],
    script: [
      act('raise', 5), act('call'),
      deal('Jh', 'Th', '4c'), act('check'), act('bet', 4), act('raise', 14), act('call'),
    ],
    winners: ['BB'],
  },
];

const pct = (x) => `${Math.round(x * 100)}%`;
for (const test of CASES) {
  const record = buildRecord(test);
  const started = Date.now();
  const report = await analyzeHand(record);
  console.log(`\n=== ${test.name}  (expect: ${test.expect})`);
  console.log(`Accuracy ${report.accuracy}% (${report.label}) · EV lost ${report.evLostBB} bb · ${report.chart?.name} · ${Date.now() - started} ms`);
  for (const d of report.decisions) {
    if (!d.graded) {
      console.log(`  ${d.street.padEnd(7)} not graded: ${d.reason}`);
      continue;
    }
    const equity = d.equity != null ? ` eq ${pct(d.equity)}` : '';
    console.log(`  ${d.street.padEnd(7)} ${d.grade.label.padEnd(11)} ${String(d.score).padStart(3)}  did: ${d.actual.label}  GTO: ${d.best.label}${equity}`);
    console.log(`          ${d.options.map((o) => `${o.label} ${pct(o.frequency)}${o.ev !== null ? ` (${o.ev})` : ''}`).join(' | ')}`);
    if (VERBOSE) for (const note of d.notes) console.log(`          - ${note}`);
    for (const read of d.reads) console.log(`          ${read.position} range: ${pct(read.width)} of hands, top ${read.top.slice(0, 5).join(' ')}`);
  }
}

// Optional: review every hand saved in a running PokerWiz API (what the Coach button does in the app).
const apiIndex = process.argv.indexOf('--api');
if (apiIndex !== -1) {
  const base = process.argv[apiIndex + 1] ?? 'http://localhost:3001';
  const hands = await (await fetch(`${base}/api/hands`)).json();
  console.log(`\n=== Saved hands from ${base}`);
  for (const hand of hands) {
    const prepared = prepareSavedHand(hand);
    if (prepared.error) {
      console.log(`  SKIP ${hand.title}: ${prepared.error}`);
      continue;
    }
    const report = await analyzeHand(prepared.record);
    const verdicts = report.decisions.map((d) => `${d.street[0]}:${d.graded ? d.grade.id : 'ungraded'}`).join(' ');
    console.log(`  ${String(report.accuracy).padStart(3)}%  ${hand.title}  (${verdicts})`);
  }
}
