// The detailed views behind the hand numbers: each box on Hand Insights (hands, net, rating, tilt), each row of
// its bars (a seat, a verdict, showdown or not), and the short version of one hand (the sheet a hand opens in the
// hand list, before its full page). Pure: plain data for StatDetail.
// Totals over several hands come in through handScope() (utils/format.js): in big blinds only when every hand
// was played at one big blind, otherwise dollars. One hand is always at one big blind.
import { bigBlindOf, formatDate, formatLongDate, formatMoney, mixedStakesNote, plural } from './format.js';
import { VERDICT_LABELS, isAllIn, reachedShowdown } from './handInsights.js';
import { letterGrade } from './letterGrade.js';

const TILT_WORDS = ['', 'Zen', 'Calm', 'Uneasy', 'Frustrated', 'Full tilt'];
const tone = (value) => (value > 0 ? 'positive' : value < 0 ? 'negative' : undefined);
const sum = (list) => list.reduce((a, b) => a + b, 0);
const resultOf = (hand) => hand.result ?? 0;
const newestFirst = (hands) => [...hands].sort((a, b) => `${b.date}${b.createdAt ?? ''}`.localeCompare(`${a.date}${a.createdAt ?? ''}`));

// A hand as a row of a `hands` section: its cards, title, where and when, and one value on the right.
function handItem(hand, value, valueTone) {
  return { id: hand.id, cards: hand.holeCards, title: hand.title, hint: `${formatDate(hand.date)} · ${hand.heroPosition} · ${hand.stakes}`, value, tone: valueTone };
}
const byResult = (hands, money) => hands.map((h) => handItem(h, money.full(resultOf(h)), tone(resultOf(h))));

function countDetail(hands, money) {
  const won = hands.filter((h) => resultOf(h) > 0).length;
  const lost = hands.filter((h) => resultOf(h) < 0).length;
  const dates = hands.map((h) => h.date).sort();
  const stakes = new Map();
  for (const h of hands) stakes.set(h.stakes, [...(stakes.get(h.stakes) ?? []), h]);
  return {
    lead: { value: plural(hands.length, 'hand'), caption: dates.length ? `saved since ${formatLongDate(dates[0])}` : 'none saved yet' },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Won', value: String(won), tone: won ? 'positive' : undefined },
          { label: 'Lost', value: String(lost), tone: lost ? 'negative' : undefined },
          { label: 'Went to showdown', value: String(hands.filter(reachedShowdown).length) },
          { label: 'All in', value: String(hands.filter(isAllIn).length) },
          { label: 'Reviewed by the coach', value: String(hands.filter((h) => h.coachAccuracy != null).length) },
          { label: 'Rated by you', value: `${hands.filter((h) => h.rating != null).length} of ${hands.length}` },
        ],
      },
      stakes.size > 1 && {
        type: 'list',
        title: 'By stakes',
        items: [...stakes].sort((a, b) => b[1].length - a[1].length).map(([label, list]) => ({ label, hint: plural(list.length, 'hand'), value: money.full(sum(list.map(resultOf))), tone: tone(sum(list.map(resultOf))) })),
      },
      { type: 'hands', title: 'Latest', items: byResult(newestFirst(hands).slice(0, 4), money) },
      {
        type: 'actions',
        items: [
          { label: 'All hands', to: '/hands', icon: 'cards', primary: true },
          { label: 'Add a hand', to: '/hands/new', icon: 'plus' },
        ],
      },
    ],
  };
}

function netDetail(hands, money) {
  const net = sum(hands.map(resultOf));
  const sorted = [...hands].sort((a, b) => resultOf(b) - resultOf(a));
  const wins = sorted.filter((h) => resultOf(h) > 0);
  const losses = sorted.filter((h) => resultOf(h) < 0).reverse();
  return {
    lead: { value: money.full(net), tone: tone(net), caption: `over ${plural(hands.length, 'saved hand')}` },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Won in winning hands', value: money.full(sum(wins.map(resultOf))), tone: 'positive', hint: plural(wins.length, 'hand') },
          { label: 'Lost in losing hands', value: money.full(sum(losses.map(resultOf))), tone: 'negative', hint: plural(losses.length, 'hand') },
          { label: 'A hand on average', value: money.full(net / Math.max(1, hands.length)), tone: tone(net) },
          { label: 'Biggest pot', value: money.full(Math.max(0, ...hands.map((h) => h.potSize ?? 0)), { sign: false }) },
        ],
      },
      wins.length > 0 && { type: 'hands', title: 'Biggest wins', items: byResult(wins.slice(0, 3), money) },
      losses.length > 0 && { type: 'hands', title: 'Biggest losses', items: byResult(losses.slice(0, 3), money) },
      {
        type: 'text',
        title: 'Reading it',
        paragraphs: ['These are the hands you chose to save, usually the big and the painful ones, so this is not your win rate. Your sessions are what count the money.'],
      },
    ],
  };
}

function ratingDetail(hands, money) {
  const rated = hands.filter((h) => h.rating != null);
  if (!rated.length) {
    return {
      lead: { value: 'Not rated', caption: 'none of your hands has a rating yet' },
      sections: [
        { type: 'text', paragraphs: ['Rate how you played each hand, from 1 to 5 stars, in the hand list. The average shows whether you think your play is getting better.'] },
        { type: 'actions', items: [{ label: 'Rate your hands', to: '/hands', icon: 'star', primary: true }] },
      ],
    };
  }
  const average = sum(rated.map((h) => h.rating)) / rated.length;
  const buckets = [
    { label: 'Played well', hint: '4 stars or more', test: (r) => r >= 4 },
    { label: 'In between', hint: '3 to 4 stars', test: (r) => r >= 3 && r < 4 },
    { label: 'Played badly', hint: 'under 3 stars', test: (r) => r < 3 },
  ]
    .map((b) => ({ ...b, list: rated.filter((h) => b.test(h.rating)) }))
    .filter((b) => b.list.length > 0);
  const stars = (h) => `${h.rating.toFixed(1)} stars`;
  const best = [...rated].sort((a, b) => b.rating - a.rating);
  return {
    lead: { value: `${average.toFixed(1)} stars`, caption: `your own rating of ${rated.length} of ${plural(hands.length, 'hand')}` },
    sections: [
      {
        type: 'list',
        title: 'How you rated them',
        items: buckets.map((b) => ({ label: b.label, hint: `${b.hint} · ${money.full(sum(b.list.map(resultOf)))}`, value: plural(b.list.length, 'hand') })),
      },
      { type: 'hands', title: 'Best played', items: best.slice(0, 3).map((h) => handItem(h, stars(h), 'positive')) },
      best.length > 3 && { type: 'hands', title: 'Lowest rated', items: best.slice(-3).reverse().map((h) => handItem(h, stars(h), h.rating < 3 ? 'negative' : undefined)) },
      rated.length < hands.length && { type: 'text', paragraphs: [`${plural(hands.length - rated.length, 'hand')} ${hands.length - rated.length === 1 ? "isn't" : "aren't"} rated yet. Rate them in the hand list to sharpen this.`] },
    ],
  };
}

function tiltDetail(hands, money) {
  const noted = hands.filter((h) => h.tilt != null);
  if (!noted.length) {
    return {
      lead: { value: 'Not noted', caption: 'no hand has a tilt level yet' },
      sections: [
        { type: 'text', paragraphs: ['Note how tilted you were in a hand, from Zen to Full tilt, on its page. Over time this shows what tilt costs you.'] },
        { type: 'actions', items: [{ label: 'Open your hands', to: '/hands', icon: 'cards', primary: true }] },
      ],
    };
  }
  const average = sum(noted.map((h) => h.tilt)) / noted.length;
  const calm = noted.filter((h) => h.tilt <= 2);
  const hot = noted.filter((h) => h.tilt >= 3);
  const mean = (list) => (list.length ? sum(list.map(resultOf)) / list.length : 0);
  const levels = [1, 2, 3, 4, 5].map((level) => ({ level, list: noted.filter((h) => h.tilt === level) })).filter((l) => l.list.length > 0);
  return {
    lead: { value: `${average.toFixed(1)} of 5`, caption: `${TILT_WORDS[Math.min(5, Math.max(1, Math.round(average)))]} on average, over ${plural(noted.length, 'hand')}` },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Calm hands', value: calm.length ? money.full(mean(calm)) : 'None', tone: tone(mean(calm)), hint: calm.length ? `${plural(calm.length, 'hand')}, on average` : undefined },
          { label: 'Tilted hands', value: hot.length ? money.full(mean(hot)) : 'None', tone: tone(mean(hot)), hint: hot.length ? `${plural(hot.length, 'hand')}, on average` : undefined },
        ],
      },
      {
        type: 'list',
        title: 'By tilt level',
        items: levels.map(({ level, list }) => ({ label: TILT_WORDS[level], hint: `${plural(list.length, 'hand')} · ${money.full(mean(list))} on average`, value: money.full(sum(list.map(resultOf))), tone: tone(sum(list.map(resultOf))) })),
      },
      hot.length > 0 && { type: 'hands', title: 'Most tilted', items: [...hot].sort((a, b) => b.tilt - a.tilt).slice(0, 3).map((h) => handItem(h, TILT_WORDS[h.tilt], 'negative')) },
      {
        type: 'text',
        title: 'Reading it',
        paragraphs: [
          calm.length >= 2 && hot.length >= 2
            ? mean(hot) < mean(calm)
              ? `Tilted hands cost you ${money.full(mean(calm) - mean(hot), { sign: false })} more a hand than calm ones. A stop-loss, or a walk after a bad beat, is worth real money to you.`
              : "Tilt isn't showing in these results. Keep noting it: a few hands can't tell yet."
            : 'Too few hands with a tilt level to compare calm against tilted. Keep noting it.',
        ],
      },
    ],
  };
}

const BUILDERS = {
  count: ['Hands', countDetail],
  net: ['Net in saved hands', netDetail],
  rating: ['Your rating', ratingDetail],
  tilt: ['Tilt', tiltDetail],
};

// The detail behind one of the Hand Insights boxes. scope: handScope(hands).
export function handStatDetail(kind, scope) {
  if (!scope.hands.length || !BUILDERS[kind]) return null;
  const [title, build] = BUILDERS[kind];
  const detail = build(scope.hands, scope.money);
  return { title, money: scope.money, note: kind === 'net' || kind === 'tilt' ? mixedStakesNote(scope) : null, ...detail, sections: detail.sections.filter(Boolean) };
}

// The detail behind one bar: the hands of a seat, a verdict, or of showdown / no showdown. group: { label,
// hands } as handInsights() makes them (the hands in the scope's unit). kind: 'seat' | 'verdict' | 'showdown'.
export function handGroupDetail(group, scope, kind) {
  const { money } = scope;
  const hands = group.hands;
  const net = sum(hands.map(resultOf));
  const sorted = [...hands].sort((a, b) => resultOf(a) - resultOf(b));
  const words = { seat: `from the ${group.label}`, verdict: `marked "${group.label}"`, showdown: group.key === 'showdown' ? 'that went to showdown' : 'that ended before showdown' }[kind];
  return {
    title: kind === 'seat' ? `From the ${group.label}` : group.label,
    money,
    note: mixedStakesNote(scope),
    lead: { value: money.full(net), tone: tone(net), caption: `${plural(hands.length, 'hand')} ${words}` },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Won', value: String(hands.filter((h) => resultOf(h) > 0).length) },
          { label: 'Lost', value: String(hands.filter((h) => resultOf(h) < 0).length) },
          { label: 'A hand on average', value: money.full(net / Math.max(1, hands.length)), tone: tone(net) },
          { label: 'Worst', value: money.full(resultOf(sorted[0])), tone: tone(resultOf(sorted[0])) },
        ],
      },
      { type: 'hands', title: hands.length > 8 ? 'The 8 that cost the most' : 'The hands', items: byResult(sorted.slice(0, 8), money) },
    ].filter(Boolean),
  };
}

// "You raise to 3.3 bb" / "BB 3-bets to 11.7 bb": one action in words (your own in the second person).
function actionWords(action, money) {
  const mine = action.actor === 'Hero';
  const verb = mine ? action.verb.replace(/^(\S+?)s\b/, '$1') : action.verb;
  return `${mine ? 'you' : action.actor} ${verb}${action.amount ? ` ${money(action.amount)}` : ''}`;
}

// The short version of one hand: the result, the pot, how you judged it, the action in a line a street, your
// note, and the ways on (the full hand, the coach). canCoach: the coach can review it.
export function handSummary(hand, { canCoach = false } = {}) {
  const bb = bigBlindOf(hand.stakes);
  const money = (amount, options) => formatMoney(amount, { sign: false, bb, ...options });
  const result = resultOf(hand);
  const grade = hand.coachAccuracy != null ? letterGrade(hand.coachAccuracy) : null;
  return {
    title: hand.title,
    lead: { value: money(result, { sign: true }), tone: tone(result), caption: `${formatLongDate(hand.date)} · ${hand.heroPosition} · ${hand.game ?? ''} ${hand.stakes}`.replace(/\s+/g, ' ') },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Final pot', value: money(hand.potSize ?? 0) },
          { label: 'Verdict', value: VERDICT_LABELS[hand.verdict] ?? 'None', tone: hand.verdict === 'good' ? 'positive' : hand.verdict === 'mistake' ? 'negative' : undefined },
          { label: 'Your rating', value: hand.rating != null ? `${hand.rating.toFixed(1)} stars` : 'Not rated' },
          grade && { label: 'Coach', value: `${grade.letter} · ${grade.label}`, tone: grade.tone === 'good' ? 'positive' : grade.tone === 'bad' ? 'negative' : undefined },
          hand.tilt != null && { label: 'Tilt', value: TILT_WORDS[hand.tilt] },
        ].filter(Boolean),
      },
      {
        type: 'list',
        title: 'How it went',
        items: hand.streets.map((street) => ({
          label: street.pot != null ? `${street.name} · pot ${money(street.pot)}` : street.name,
          hint: street.actions.length ? street.actions.map((action) => actionWords(action, money)).join(', ').replace(/^./, (c) => c.toUpperCase()) : 'No action',
          value: '',
        })),
      },
      hand.note && { type: 'text', title: 'Your notes', paragraphs: [hand.note] },
      {
        type: 'actions',
        items: [
          { label: 'Open the full hand', to: `/hands/${hand.id}`, icon: 'cards', primary: true },
          canCoach && { label: 'Coach', to: `/coach?hand=${hand.id}`, icon: 'coach' },
        ].filter(Boolean),
      },
    ].filter(Boolean),
  };
}
