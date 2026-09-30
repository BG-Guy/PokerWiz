// Seed session log (cash games), loaded into the database on first run.
// Dates are ISO strings (YYYY-MM-DD); money values are in dollars.

export const sessions = [
  { id: 's1', date: '2026-07-04', game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue: 'Casino', durationMin: 240, buyIn: 200, cashOut: 385, hands: 118, notes: 'Loose-passive table. Thin value bets got paid all night.' },
  { id: 's2', date: '2026-07-09', game: 'NLH', stakes: '$0.5/$1', bigBlind: 1, venue: 'Online', durationMin: 90, buyIn: 100, cashOut: 72, hands: 410, notes: 'Tilted after a cooler and played two extra orbits.' },
  { id: 's3', date: '2026-07-13', game: 'PLO', stakes: '$1/$2', bigBlind: 2, venue: 'Home game', durationMin: 300, buyIn: 300, cashOut: 510, hands: 140, notes: 'Position was everything. Most profit came from the button.' },
  { id: 's4', date: '2026-07-19', game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue: 'Casino', durationMin: 360, buyIn: 400, cashOut: 330, hands: 170, notes: 'Reloaded once. Called down too light twice.' },
  { id: 's5', date: '2026-07-26', game: 'NLH', stakes: '$0.5/$1', bigBlind: 1, venue: 'Online', durationMin: 120, buyIn: 100, cashOut: 188, hands: 560, notes: 'Four tables. Stuck to the opening ranges.' },
  { id: 's6', date: '2026-08-02', game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue: 'Casino', durationMin: 270, buyIn: 300, cashOut: 540, hands: 125, notes: 'Won a big pot with a set against an overpair.' },
  { id: 's7', date: '2026-08-08', game: 'PLO', stakes: '$1/$2', bigBlind: 2, venue: 'Home game', durationMin: 240, buyIn: 300, cashOut: 190, hands: 110, notes: 'Chased too many non-nut draws.' },
  { id: 's8', date: '2026-08-15', game: 'NLH', stakes: '$0.5/$1', bigBlind: 1, venue: 'Online', durationMin: 150, buyIn: 100, cashOut: 146, hands: 690, notes: 'Steady session, no big spots.' },
  { id: 's9', date: '2026-08-21', game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue: 'Casino', durationMin: 420, buyIn: 400, cashOut: 260, hands: 195, notes: 'Played too long. Decisions got worse after hour five.' },
  { id: 's10', date: '2026-08-29', game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue: 'Casino', durationMin: 210, buyIn: 200, cashOut: 420, hands: 100, notes: 'Three-bet more from the button and it worked.' },
  { id: 's11', date: '2026-09-03', game: 'NLH', stakes: '$0.5/$1', bigBlind: 1, venue: 'Online', durationMin: 100, buyIn: 100, cashOut: 131, hands: 470, notes: 'Short session before dinner.' },
  { id: 's12', date: '2026-09-07', game: 'PLO', stakes: '$1/$2', bigBlind: 2, venue: 'Home game', durationMin: 270, buyIn: 300, cashOut: 455, hands: 130, notes: 'Nut flush on the river paid off nicely.' },
  { id: 's13', date: '2026-09-12', game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue: 'Casino', durationMin: 300, buyIn: 300, cashOut: 285, hands: 140, notes: 'Missed-draw bluff did not get through.' },
  { id: 's14', date: '2026-09-16', game: 'NLH', stakes: '$0.5/$1', bigBlind: 1, venue: 'Online', durationMin: 80, buyIn: 100, cashOut: 54, hands: 380, notes: 'Opened too loose from early position.' },
  { id: 's15', date: '2026-09-19', game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue: 'Casino', durationMin: 240, buyIn: 300, cashOut: 612, hands: 115, notes: 'Lost a cooler with queens but still had a great night.' },
  { id: 's16', date: '2026-09-22', game: 'NLH', stakes: '$0.5/$1', bigBlind: 1, venue: 'Online', durationMin: 130, buyIn: 100, cashOut: 177, hands: 600, notes: 'Turned a straight against a check-raise.' },
  { id: 's17', date: '2026-09-25', game: 'PLO', stakes: '$1/$2', bigBlind: 2, venue: 'Home game', durationMin: 200, buyIn: 300, cashOut: 245, hands: 95, notes: 'Card dead. Kept losses small.' },
  { id: 's18', date: '2026-09-27', game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue: 'Casino', durationMin: 285, buyIn: 300, cashOut: 498, hands: 135, notes: 'Value-bet top pair across three streets. One bad river call.' },
];
