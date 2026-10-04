// Poker constants shared across pages: review verdicts, games, stakes, venues and table positions.

// Review verdicts a hand can carry, with their display labels.
export const VERDICTS = {
  good: 'Good play',
  mistake: 'Mistake',
  cooler: 'Cooler',
  review: 'To review',
};

export const GAMES = [
  { value: 'NLH', label: "No-Limit Hold'em" },
  { value: 'PLO', label: 'Pot-Limit Omaha' },
];

export const VENUES = ['Casino', 'Online', 'Home game'];

// Common cash-game stakes. sb/bb are in dollars.
export const STAKES = [
  { label: '$0.5/$1', sb: 0.5, bb: 1 },
  { label: '$1/$2', sb: 1, bb: 2 },
  { label: '$1/$3', sb: 1, bb: 3 },
  { label: '$2/$5', sb: 2, bb: 5 },
  { label: '$5/$10', sb: 5, bb: 10 },
];

// Seat positions clockwise, starting from the button. 8-handed is the table the GTO engine is solved for
// (src/gto); 6- and 9-handed hands are mapped onto it.
export const TABLE_POSITIONS = {
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
};
