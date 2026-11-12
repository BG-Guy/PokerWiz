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
      // The river of a turn solve also has the jam while it's up to 4 pots (reviews only, see menuFor): a turn
      // play is often the first half of a two-street line that ends in a river overbet (a turn check-raise
      // then a jam), and without the jam the turn half was valued as if the river could only bet 75%.
      river: { first: [0.75], later: [0.75], raise: [3], maxBets: 3, allInPots: 4 },
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
  const later = table.later[street] ?? table.root[street];
  // Fast solves keep the smaller tree: no wider all in on later streets.
  return detail === 'fast' && later.allInPots ? { ...later, allInPots: undefined } : later;
}

// All in is offered when it isn't a giant overbet: at most this many pots (after calling), unless the menu
// says otherwise (allInPots, allInAlways).
export const ALL_IN_MAX_POTS = 1.6;
// A real bet or raise within this ratio of a menu size (as money put in over the bet faced) replaces that size
// in the tree instead of standing next to it.
export const REAL_SIZE_MERGE = 1.12;
// A bet or raise that would put in at least this share of the stack becomes all in.
export const FORCE_ALL_IN_SHARE = 0.67;
