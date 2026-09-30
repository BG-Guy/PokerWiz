// Hand highlights: "awards" picked from the recorded hands (best and worst played by your own rating,
// most tilted, biggest pots won and lost, multiway wars, big laydowns, preflop fireworks, all-in thrillers).
import { formatUnits } from './format.js';

const dollars = (n) => formatUnits(n, { sign: false }); // hands arrive converted (handsForDisplay)
const TILT_WORDS = ['', 'Zen', 'Calm', 'Uneasy', 'Frustrated', 'Full tilt'];

// Hero actions with the street they happened on.
function heroActions(hand) {
  return hand.streets.flatMap((street) => street.actions.filter((a) => a.actor === 'Hero').map((a) => ({ ...a, street: street.name })));
}

// Players who saw the flop (or, for hands that ended preflop, everyone who acted).
function playersInPot(hand) {
  const flop = hand.streets[1];
  if (flop) {
    const actors = new Set(flop.actions.map((a) => a.actor));
    if (actors.size) return actors.size;
  }
  if (hand.players) return hand.players.filter((p) => !p.folded).length;
  return 2;
}

// Pot size when the hero folded (the street's starting pot plus bets made before the fold).
function potAtFold(hand) {
  for (const street of hand.streets) {
    let pot = street.pot;
    for (const action of street.actions) {
      if (action.actor === 'Hero' && action.verb === 'folds') return pot;
      pot += action.amount ?? 0;
    }
  }
  return null;
}

// Pot going to the flop (or the final pot for hands that ended preflop).
const preflopPot = (hand) => hand.streets[1]?.pot ?? hand.potSize;

const isAllIn = (hand) => hand.streets.some((s) => s.actions.some((a) => a.allIn || a.verb === 'shoves' || a.verb === 'all in'));

// The award categories, in display order. pick() filters and sorts; stat() is the line shown per hand.
export const HIGHLIGHT_CATEGORIES = [
  {
    id: 'best',
    title: 'Hall of Fame',
    subtitle: 'Your best-played hands, by your own rating',
    icon: 'trophy',
    pick: (hands) => hands.filter((h) => h.rating != null).sort((a, b) => b.rating - a.rating),
    stat: (h) => `${h.rating.toFixed(1)} stars`,
    empty: 'Rate hands to fill this.',
  },
  {
    id: 'worst',
    title: 'Wall of Shame',
    subtitle: 'Your lowest-rated hands',
    icon: 'alert',
    pick: (hands) => hands.filter((h) => h.rating != null && h.rating < 3).sort((a, b) => a.rating - b.rating),
    stat: (h) => `${h.rating.toFixed(1)} stars`,
    empty: 'No hands rated under 3 stars. Nice.',
  },
  {
    id: 'tilt',
    title: 'Tilt Tower',
    subtitle: 'The hands you were most tilted in',
    icon: 'flame',
    pick: (hands) => hands.filter((h) => h.tilt >= 3).sort((a, b) => b.tilt - a.tilt || b.potSize - a.potSize),
    stat: (h) => TILT_WORDS[h.tilt],
    empty: 'No tilted hands recorded.',
  },
  {
    id: 'bigWin',
    title: 'Monster Pots',
    subtitle: 'The biggest pots you won',
    icon: 'trendUp',
    pick: (hands) => hands.filter((h) => h.result > 0).sort((a, b) => b.potSize - a.potSize),
    stat: (h) => `Won ${dollars(h.result)} · pot ${dollars(h.potSize)}`,
    empty: 'Win a pot to see it here.',
  },
  {
    id: 'bigLoss',
    title: 'The Painful Ones',
    subtitle: 'The biggest pots you lost',
    icon: 'trendDown',
    pick: (hands) => hands.filter((h) => h.result < 0).sort((a, b) => b.potSize - a.potSize),
    stat: (h) => `Lost ${dollars(-h.result)} · pot ${dollars(h.potSize)}`,
    empty: 'No losing hands recorded.',
  },
  {
    id: 'multiway',
    title: 'Multiway Madness',
    subtitle: 'The biggest pots with three or more players',
    icon: 'users',
    pick: (hands) => hands.filter((h) => playersInPot(h) >= 3).sort((a, b) => b.potSize - a.potSize),
    stat: (h) => `${playersInPot(h)} players · pot ${dollars(h.potSize)}`,
    empty: 'No multiway pots yet.',
  },
  {
    id: 'fold',
    title: 'Great Laydowns',
    subtitle: 'The biggest pots you let go',
    icon: 'cards',
    pick: (hands) => hands.filter((h) => potAtFold(h) !== null).sort((a, b) => potAtFold(b) - potAtFold(a)),
    stat: (h) => `Folded into a ${dollars(potAtFold(h))} pot`,
    empty: 'You haven\'t folded a recorded hand yet.',
  },
  {
    id: 'preflop',
    title: 'Preflop Fireworks',
    subtitle: 'The biggest pots built before the flop',
    icon: 'zap',
    pick: (hands) => [...hands].sort((a, b) => preflopPot(b) - preflopPot(a)),
    stat: (h) => `${dollars(preflopPot(h))} preflop`,
    empty: 'No hands yet.',
  },
  {
    id: 'allin',
    title: 'All-in Thrillers',
    subtitle: 'The biggest pots where someone was all in',
    icon: 'allIn',
    pick: (hands) => hands.filter(isAllIn).sort((a, b) => b.potSize - a.potSize),
    stat: (h) => `${h.result >= 0 ? 'Won' : 'Lost'} ${dollars(Math.abs(h.result))} · pot ${dollars(h.potSize)}`,
    empty: 'No all-ins recorded yet.',
  },
  {
    id: 'coach',
    title: 'Coach\'s Pick',
    subtitle: 'Your highest coach accuracy',
    icon: 'coach',
    pick: (hands) => hands.filter((h) => h.coachAccuracy != null).sort((a, b) => b.coachAccuracy - a.coachAccuracy),
    stat: (h) => `${h.coachAccuracy}% accuracy`,
    empty: 'Save a hand from Coach mode to see it here.',
  },
];

// Every category with its top `limit` hands.
export function buildHighlights(hands, limit = 3) {
  return HIGHLIGHT_CATEGORIES.map((category) => ({
    ...category,
    entries: category.pick(hands).slice(0, limit).map((hand) => ({ hand, stat: category.stat(hand) })),
  }));
}

// A short list for the home page: the top hand from the first few categories that have one.
export function highlightPreview(hands, count = 3) {
  const order = ['best', 'bigWin', 'tilt', 'bigLoss', 'allin', 'multiway', 'fold', 'worst', 'preflop'];
  const built = buildHighlights(hands, 1);
  return order
    .map((id) => built.find((c) => c.id === id))
    .filter((c) => c.entries.length > 0)
    .slice(0, count)
    .map((c) => ({ id: c.id, title: c.title, icon: c.icon, ...c.entries[0] }));
}
