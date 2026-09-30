// Coach sanity checks: scripted hands with an obvious right answer, run through the full analysis.
// Run with: node scripts/test-coach.mjs          (add "--verbose" to print every note)
//      or:  node scripts/test-coach.mjs --api http://localhost:3001   to also review every saved hand
// Each case prints the hero's decisions with grade, best line and EV so the model can be tuned by eye.
import { createHand, applyAction, dealBoard, heroResult } from '../src/utils/handEngine.js';
import { analyzeHand } from '../src/coach/analyzeHand.js';
import { applyPreset, defaultProfile } from '../src/coach/profiles.js';
import { prepareSavedHand } from '../src/coach/savedHand.js';

const VERBOSE = process.argv.includes('--verbose');
const POSITIONS = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];

// Build a coach record by playing a script through the engine.
// players: [{ position, role, cards, stack, preset? }]; script: [{ act: {type, amount} } | { deal: [codes] }]
function buildRecord({ players, script, sb = 1, bb = 2, winners }) {
  const seated = players.map((p) => ({
    seat: POSITIONS.indexOf(p.position),
    position: p.position,
    role: p.role,
    name: p.role === 'hero' ? 'You' : p.position,
    stack: p.stack ?? 200,
    cards: p.cards ?? [],
    profile: p.preset ? applyPreset(defaultProfile(), p.preset) : p.profile ?? defaultProfile(),
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
      { position: 'CO', role: 'villain', preset: 'unknown' },
      { position: 'BTN', role: 'hero', cards: ['As', 'Kd'] },
    ],
    script: [
      act('raise', 5), act('raise', 16), act('call'),
      deal('Kh', '7c', '2d'), act('check'), act('bet', 16), act('call'),
      deal('4s'), act('check'), act('bet', 40), act('call'),
      deal('9h'), act('check'), act('bet', 80), act('call'),
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
    name: 'Opens 72o under the gun',
    expect: 'blunder/mistake',
    players: [
      { position: 'UTG', role: 'hero', cards: ['7h', '2c'] },
      { position: 'BB', role: 'villain' },
    ],
    script: [act('raise', 5), act('fold')],
  },
  {
    name: 'River bluff with air vs a calling station',
    expect: 'bluff is a mistake',
    players: [
      { position: 'BB', role: 'villain', preset: 'station' },
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
    name: 'Same river bluff vs a nit',
    expect: 'bluff is fine',
    players: [
      { position: 'BB', role: 'villain', preset: 'nit' },
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
    name: 'Calls a nit\'s river check-raise all in with one pair',
    expect: 'call is a mistake',
    players: [
      { position: 'BB', role: 'villain', preset: 'nit' },
      { position: 'BTN', role: 'hero', cards: ['Qh', 'Jh'] },
    ],
    script: [
      act('raise', 5), act('call'),
      deal('Qs', '8d', '4c'), act('check'), act('bet', 6), act('call'),
      deal('2s'), act('check'), act('bet', 12), act('call'),
      deal('9c'), act('check'), act('bet', 30), act('allin'), act('call'),
    ],
    winners: ['BB'],
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
    name: 'Short-stacked villain shoves, hero calls with 22 vs a maniac',
    expect: 'call is fine vs a maniac',
    players: [
      { position: 'BTN', role: 'villain', preset: 'maniac', stack: 30 },
      { position: 'BB', role: 'hero', cards: ['2h', '2c'] },
    ],
    script: [act('allin'), act('call'), deal('Kd', '9s', '5c'), deal('Jh'), deal('4d')],
  },
];

for (const test of CASES) {
  const record = buildRecord(test);
  const started = Date.now();
  const report = analyzeHand(record);
  console.log(`\n=== ${test.name}  (expect: ${test.expect})`);
  console.log(`Accuracy ${report.accuracy}% (${report.label}) · EV lost ${report.evLostBB} bb · ${Date.now() - started} ms`);
  for (const d of report.decisions) {
    const did = d.kind === 'chart' ? d.actualLabel : d.actual.label;
    const best = d.kind === 'chart' ? d.advice.best : `${d.best.label} (EV ${d.best.ev})`;
    const equity = d.equity != null ? ` eq ${Math.round(d.equity * 100)}%` : '';
    console.log(`  ${d.street.padEnd(7)} ${d.grade.label.padEnd(11)} ${String(d.score).padStart(3)}  did: ${did}  best: ${best}${equity}`);
    if (d.kind === 'ev') console.log(`          options: ${d.options.map((o) => `${o.label}=${o.ev}${o.foldEquity !== undefined ? ` (f${Math.round(o.foldEquity * 100)}%)` : ''}`).join(' | ')}`);
    if (VERBOSE) for (const note of d.notes) console.log(`          - ${note}`);
    for (const read of d.reads) console.log(`          read ${read.position} ${read.label}: ${Math.round(read.width * 100)}% of hands, top ${read.top.slice(0, 5).join(' ')}`);
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
    const report = analyzeHand(prepared.record);
    const verdicts = report.decisions.map((d) => `${d.street[0]}:${d.grade.id}`).join(' ');
    console.log(`  ${String(report.accuracy).padStart(3)}%  ${hand.title}  (${verdicts})`);
  }
}
