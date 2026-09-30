// Seed goals. Goals are measured from your real data: "metric" says what is counted between startDate and
// the deadline (see models/goals.js). Only trackable metrics are allowed:
//   hands_played   hands from finished sessions (30 per hour when not entered)
//   net_profit     cash-out minus buy-in
//   hours_played   time at the tables
//   sessions_played
//   hands_reviewed saved hands you rated or gave a verdict
export const goals = [
  {
    id: 'g1',
    title: 'Play 20,000 hands this half',
    category: 'Volume',
    metric: 'hands_played',
    unit: 'hands',
    target: 20000,
    startDate: '2026-07-01',
    deadline: '2026-12-31',
  },
  {
    id: 'g2',
    title: 'Win $2,000 by year end',
    category: 'Results',
    metric: 'net_profit',
    unit: '$',
    target: 2000,
    startDate: '2026-07-01',
    deadline: '2026-12-31',
  },
  {
    id: 'g3',
    title: 'Put in 150 hours at the tables',
    category: 'Volume',
    metric: 'hours_played',
    unit: 'hours',
    target: 150,
    startDate: '2026-07-01',
    deadline: '2026-12-31',
  },
  {
    id: 'g4',
    title: 'Review 50 hands',
    category: 'Study',
    metric: 'hands_reviewed',
    unit: 'hands',
    target: 50,
    startDate: '2026-09-01',
    deadline: '2026-10-15',
  },
];
