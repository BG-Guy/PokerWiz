// Card helpers. Cards are written as two-character codes ("As" = ace of spades, "Td" = ten of diamonds).
// The hand evaluator uses integers instead: index = rankIndex * 4 + suitIndex (0..51).

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';

// Ranks from high to low, for pickers.
export const RANKS_DESC = [...RANKS].reverse();

// All 52 codes.
export const FULL_DECK = [...RANKS].flatMap((rank) => [...SUITS].map((suit) => rank + suit));

export function codeToIndex(code) {
  return RANKS.indexOf(code[0]) * 4 + SUITS.indexOf(code[1]);
}

export function isRedSuit(suit) {
  return suit === 'h' || suit === 'd';
}
