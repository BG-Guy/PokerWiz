// The spots the engine is compared on: flop boards, the reference game tree, and the decision points.

// Flops: dry high, two-tone middle, ace high, low connected two-tone, two-tone queen, paired, monotone.
export const BOARDS = {
  K72: ['Ks', '7d', '2c'],
  T96: ['Td', '9d', '6h'],
  A83: ['Ah', '8c', '3d'],
  765: ['7c', '6c', '5d'],
  Q94: ['Qs', '9h', '4s'],
  884: ['8h', '8d', '4c'],
  AK5m: ['Ah', 'Kh', '5h'],
};

// The reference game for flop decisions: two flop sizes with raises; the turn and the river one size each
// plus all in (trimmed so a flop solves in minutes; every runout is dealt, and the river is played).
export const FLOP_TREE = {
  flop: { oop: { bet: [33, 75], raise: [50], allin: true }, ip: { bet: [33, 75], raise: [50], allin: true } },
  turn: { oop: { bet: [66], donk: [66], allin: true }, ip: { bet: [66], allin: true } },
  river: { oop: { bet: [75], donk: [75], allin: true }, ip: { bet: [75], allin: true } },
};

// Decision points on the flop: the line to them (bets as a share of the pot).
export const FLOP_NODES = [
  { id: 'bb_first', label: 'BB first to act', line: [] },
  { id: 'btn_vs_check', label: 'BTN after a check', line: [{ type: 'check' }] },
  { id: 'bb_vs_33', label: 'BB facing 33%', line: [{ type: 'check' }, { type: 'bet', size: 0.33 }] },
  { id: 'bb_vs_75', label: 'BB facing 75%', line: [{ type: 'check' }, { type: 'bet', size: 0.75 }] },
];

// A line with bets as a share of the pot -> bets in big blinds (this street's totals; the street starts with
// nothing in front of anyone).
export function lineInBB(line, startPot) {
  let pot = startPot;
  return line.map((step) => {
    if (step.type !== 'bet') return step;
    const to = Math.round(step.size * pot * 1000) / 1000;
    pot += to;
    return { type: 'bet', to };
  });
}

// ----- Turn and river spots -----
// Each starts after a line on the street before (from the reference's solve of that street, so the ranges that
// reach it are exact) and a new card. Bets are shares of the pot.
export const TURN_SPOTS = {
  K72: { line: [{ type: 'check' }, { type: 'bet', size: 0.33 }, { type: 'call' }], card: '4h' },
  T96: { line: [{ type: 'check' }, { type: 'bet', size: 0.33 }, { type: 'call' }], card: '2c' },
  A83: { line: [{ type: 'check' }, { type: 'bet', size: 0.33 }, { type: 'call' }], card: 'Jc' },
  765: { line: [{ type: 'check' }, { type: 'bet', size: 0.33 }, { type: 'call' }], card: 'Kh' },
  Q94: { line: [{ type: 'check' }, { type: 'bet', size: 0.33 }, { type: 'call' }], card: '8d' },
  884: { line: [{ type: 'check' }, { type: 'bet', size: 0.33 }, { type: 'call' }], card: 'Js' },
  AK5m: { line: [{ type: 'check' }, { type: 'bet', size: 0.33 }, { type: 'call' }], card: 'Td' },
};
export const RIVER_SPOTS = {
  K72: { line: [{ type: 'check' }, { type: 'check' }], card: '9s' },
  T96: { line: [{ type: 'check' }, { type: 'check' }], card: 'Ks' },
  A83: { line: [{ type: 'check' }, { type: 'check' }], card: '5h' },
};

// The reference games from the turn and from the river: the sizes commercial solvers use.
export const TURN_TREE = {
  turn: { oop: { bet: [33, 66, 100], donk: [33, 66], raise: [50], allin: true }, ip: { bet: [33, 66, 100], raise: [50], allin: true } },
  river: { oop: { bet: [33, 75, 150], donk: [50], raise: [50], allin: true }, ip: { bet: [33, 75, 150], raise: [50], allin: true } },
};
export const RIVER_TREE = {
  river: { oop: { bet: [33, 75, 150], donk: [33, 75], raise: [50], allin: true }, ip: { bet: [33, 75, 150], raise: [50], allin: true } },
};

export const TURN_NODES = [
  { id: 'bb_first', label: 'BB first to act', line: [] },
  { id: 'btn_vs_check', label: 'BTN after a check', line: [{ type: 'check' }] },
  { id: 'bb_vs_66', label: 'BB facing 66%', line: [{ type: 'check' }, { type: 'bet', size: 0.66 }] },
  { id: 'bb_vs_100', label: 'BB facing 100%', line: [{ type: 'check' }, { type: 'bet', size: 1 }] },
];
export const RIVER_NODES = [
  { id: 'bb_first', label: 'BB first to act', line: [] },
  { id: 'btn_vs_check', label: 'BTN after a check', line: [{ type: 'check' }] },
  { id: 'bb_vs_75', label: 'BB facing 75%', line: [{ type: 'check' }, { type: 'bet', size: 0.75 }] },
  { id: 'bb_vs_150', label: 'BB facing 150%', line: [{ type: 'check' }, { type: 'bet', size: 1.5 }] },
];

// Pot and stack after a line on one street (bets in big blinds, from lineInBB): the bets left in the middle.
export function afterLine(lineBB, pot, stack) {
  let bet = 0;
  for (const step of lineBB) if (step.type === 'bet' || step.type === 'raise') bet = step.to;
  const called = lineBB.at(-1)?.type === 'call';
  return { pot: called ? pot + 2 * bet : pot, stack: called ? stack - bet : stack };
}
