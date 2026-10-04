// Bet and raise sizes the postflop solver considers, the way commercial solvers simplify the game: a few pot
// fractions per street, raises as a multiple of the bet faced, and all-in when stacks are short enough for
// a jam to be a normal size. The street being solved gets more choices; later streets (only there so the
// current street's decisions know what each hand is worth going forward) get one size each.
//
// Sizes: bets are fractions of the pot; raises are "x times": raise to = bet faced + (x - 1) x the increase
// over your own bet (3x a bet of 10 = raise to 30; re-raising a 30 raise over your 10 bet = 70).
// maxBets: bets plus raises allowed on the street (4 = bet, raise, 3-bet, then only all in or call).

const MENUS = {
  2: {
    root: {
      flop: { first: [0.33], later: [0.33, 0.75], raise: [3], maxBets: 4 },
      turn: { first: [0.5], later: [0.5, 1], raise: [3], maxBets: 4 },
      river: { first: [0.33, 0.75], later: [0.33, 0.75, 1.25], raise: [2.5], maxBets: 4, allInAlways: true },
    },
    later: {
      turn: { first: [0.66], later: [0.66], raise: [3], maxBets: 3 },
      river: { first: [0.75], later: [0.75], raise: [3], maxBets: 3 },
    },
  },
  3: {
    root: {
      flop: { first: [0.33], later: [0.33], raise: [3], maxBets: 3 },
      turn: { first: [0.5], later: [0.5], raise: [3], maxBets: 3 },
      river: { first: [0.5], later: [0.5, 1], raise: [3], maxBets: 3, allInAlways: true },
    },
    later: {
      turn: { first: [0.66], later: [0.66], raise: [3], maxBets: 2 },
      river: { first: [0.75], later: [0.75], raise: [3], maxBets: 2 },
    },
  },
};

// Fast mode (practice opponents, phones): one size on the street being solved too.
const FAST_ROOT = {
  flop: { first: [0.33], later: [0.33], raise: [3], maxBets: 3 },
  turn: { first: [0.66], later: [0.66], raise: [3], maxBets: 3 },
  river: { first: [0.75], later: [0.5, 1], raise: [2.5], maxBets: 3, allInAlways: true },
};

export const STREETS = ['flop', 'turn', 'river'];

// Sizes for a street. players: how many are in the hand (4+ use the 3-way menu); isRoot: the street being solved.
export function menuFor({ players, street, isRoot, detail = 'full' }) {
  const table = MENUS[Math.min(3, players)];
  if (isRoot) return detail === 'fast' && players === 2 ? FAST_ROOT[street] : table.root[street];
  return table.later[street] ?? table.root[street];
}

// All in is offered when it isn't a giant overbet: at most this many pots (after calling).
export const ALL_IN_MAX_POTS = 1.6;
// A bet or raise that would put in at least this share of the stack becomes all in.
export const FORCE_ALL_IN_SHARE = 0.67;
