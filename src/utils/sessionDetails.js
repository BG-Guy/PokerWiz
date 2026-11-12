// The detailed views behind one session: each number on its page (result, buy-in, cash-out, rate, hands, its
// grade), and the short version of the whole session (what a session row opens on the dashboard). Pure: plain
// data for StatDetail. One session was played at one big blind, so its amounts follow the BB/$ switch as they
// are, and the other unit rides along as a hint.
import { formatDate, formatDuration, formatLongDate, formatMoney, formatTime, formatWeekday, getMoneyUnit, plural } from './format.js';
import { isTournament, sessionProfit } from './stats.js';
import { gradeSession } from './sessionGrade.js';
import { letterGrade } from './letterGrade.js';

// What a live table deals in an hour (the estimate on a running session).
export const LIVE_HANDS_AN_HOUR = 30;

const tone = (value) => (value > 0 ? 'positive' : value < 0 ? 'negative' : undefined);
const GRADE_TONES = { good: 'positive', bad: 'negative', warning: 'negative' };
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]}`;
const titleOf = (session) => (isTournament(session) ? `Tournament · ${session.game}` : `${session.game} ${session.stakes}`);
const whenOf = (session) => `${formatWeekday(session.date)}, ${formatLongDate(session.date)}`;

// How this session's amounts are written: in the unit on the switch (`money`), in the other one (`other`, null
// for a tournament, which has no big blind), and per hour.
function writers(session) {
  const bb = isTournament(session) ? null : session.bigBlind;
  const inBB = getMoneyUnit() === 'bb' && bb > 0;
  const money = (amount, options) => formatMoney(amount, { bb, ...options });
  const dollars = (amount, options) => formatMoney(Math.round(amount), { ...options });
  const bigBlinds = (amount, { sign = true } = {}) => {
    const value = amount / bb;
    const text = `${Math.abs(value).toFixed(Math.abs(value) >= 100 ? 0 : 1)} bb`;
    return sign && value !== 0 ? `${value > 0 ? '+' : '-'}${text}` : text;
  };
  const other = bb > 0 ? (amount, options) => (inBB ? dollars(amount, options) : bigBlinds(amount, options)) : null;
  return { bb, inBB, money, other, otherLabel: inBB ? 'In dollars' : 'In big blinds' };
}

const hoursOf = (session) => Math.max(session.durationMin / 60, 0.25);
const rebuysOf = (session) => (session.events ?? []).filter((e) => e.type === 'rebuy' && e.amount > 0);

// A saved hand as a row of a `hands` section.
function handItem(hand, money) {
  return {
    id: hand.id,
    cards: hand.holeCards,
    title: hand.title,
    hint: [hand.heroPosition, hand.coachAccuracy != null && `coach ${letterGrade(hand.coachAccuracy).letter}`, hand.rating != null && `${hand.rating.toFixed(1)} stars`].filter(Boolean).join(' · '),
    value: money(hand.result ?? 0),
    tone: tone(hand.result ?? 0),
  };
}

function resultDetail(session, { sessions }) {
  const { money, other, otherLabel, bb } = writers(session);
  const profit = sessionProfit(session);
  const hours = hoursOf(session);
  const cash = sessions.filter((s) => !isTournament(s));
  const same = cash.filter((s) => s.stakes === session.stakes && s.game === session.game && s.id !== session.id);
  const rank = cash.filter((s) => sessionProfit(s) > profit).length + 1;
  const sameAverage = same.length ? same.reduce((sum, s) => sum + sessionProfit(s), 0) / same.length : 0;
  return {
    lead: { value: money(profit), tone: tone(profit), caption: `${titleOf(session)} · ${whenOf(session)}` },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Buy-in', value: money(session.buyIn, { sign: false }) },
          { label: 'Cash-out', value: money(session.cashOut, { sign: false }) },
          session.expenses > 0 && { label: 'Expenses', value: money(session.expenses, { sign: false }), hint: 'tips, food, fees' },
          other && { label: otherLabel, value: other(profit), tone: tone(profit) },
          { label: 'An hour', value: `${money(profit / hours)}/h`, tone: tone(profit), hint: formatDuration(session.durationMin) },
          bb > 0 && session.hands > 0 && { label: 'Per 100 hands', value: `${profit >= 0 ? '+' : ''}${((profit / bb / session.hands) * 100).toFixed(1)} bb`, hint: `${session.hands.toLocaleString('en-US')} hands` },
        ].filter(Boolean),
      },
      !isTournament(session) &&
        cash.length > 1 && {
          type: 'list',
          title: 'Against your other sessions',
          items: [
            { label: 'By money won', hint: rank === 1 ? 'your best session so far' : rank === cash.length ? 'your worst session so far' : 'among your cash sessions', value: `${ordinal(rank)} of ${cash.length}` },
            same.length > 0 && {
              label: `Your other ${session.game} ${session.stakes} sessions`,
              hint: `${plural(same.length, 'session')} on average`,
              value: money(sameAverage),
              tone: tone(sameAverage),
            },
          ].filter(Boolean),
        },
      session.notes && { type: 'text', title: 'Your notes', paragraphs: [session.notes] },
    ],
  };
}

function buyInDetail(session) {
  const { money, other, otherLabel } = writers(session);
  const rebuys = rebuysOf(session);
  const rebought = rebuys.reduce((sum, e) => sum + e.amount, 0);
  return {
    lead: { value: money(session.buyIn, { sign: false }), caption: rebuys.length ? `in all, over ${plural(rebuys.length + 1, 'buy-in')}` : 'one buy-in, no rebuys' },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Sat down with', value: money(session.buyIn - rebought, { sign: false }) },
          { label: 'Rebuys', value: rebuys.length ? money(rebought, { sign: false }) : 'None', hint: rebuys.length ? plural(rebuys.length, 'rebuy') : undefined },
          other && { label: otherLabel, value: other(session.buyIn, { sign: false }) },
          session.expenses > 0 && { label: 'Expenses on top', value: money(session.expenses, { sign: false }) },
        ].filter(Boolean),
      },
      rebuys.length > 0 && {
        type: 'list',
        title: 'Every rebuy',
        items: rebuys.map((e) => ({ label: e.createdAt ? formatTime(e.createdAt) : 'Rebuy', hint: e.text || undefined, value: money(e.amount, { sign: false }) })),
      },
      {
        type: 'text',
        title: 'Reading it',
        paragraphs: [
          rebuys.length
            ? 'Rebuys count toward your buy-in, so the result already has them in it.'
            : 'Everything you put on the table in this session. A rebuy logged on the live timeline would add to it.',
        ],
      },
    ],
  };
}

function cashOutDetail(session) {
  const { money, other, otherLabel } = writers(session);
  const profit = sessionProfit(session);
  const share = session.buyIn > 0 ? session.cashOut / session.buyIn : 0;
  return {
    lead: {
      value: money(session.cashOut, { sign: false }),
      caption: session.cashOut <= 0 ? 'you left with nothing on the table' : `${share >= 1 ? `${share.toFixed(1)} times` : `${Math.round(share * 100)}% of`} what you put in`,
    },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Put in', value: money(session.buyIn, { sign: false }) },
          { label: 'Result', value: money(profit), tone: tone(profit) },
          other && { label: otherLabel, value: other(session.cashOut, { sign: false }) },
          session.expenses > 0 && { label: 'Expenses', value: money(session.expenses, { sign: false }), hint: 'taken off the result' },
        ].filter(Boolean),
      },
    ],
  };
}

function rateDetail(session, { sessions }) {
  const { money, bb } = writers(session);
  const profit = sessionProfit(session);
  const hours = hoursOf(session);
  const same = sessions.filter((s) => !isTournament(s) && s.stakes === session.stakes && s.game === session.game);
  const sameHours = same.reduce((sum, s) => sum + s.durationMin, 0) / 60;
  const sameRate = sameHours > 0 ? same.reduce((sum, s) => sum + sessionProfit(s), 0) / sameHours : 0;
  const lead = bb > 0 ? `${profit >= 0 ? '+' : ''}${(profit / bb / hours).toFixed(1)} bb/h` : `${money(profit / hours)}/h`;
  return {
    lead: { value: lead, tone: tone(profit), caption: `over ${formatDuration(session.durationMin)}` },
    sections: [
      {
        type: 'facts',
        items: [
          bb > 0 && { label: 'In dollars', value: `${formatMoney(Math.round(profit / hours))}/h`, tone: tone(profit) },
          { label: 'Played', value: formatDuration(session.durationMin) },
          session.hands > 0 && { label: 'Hands an hour', value: String(Math.round(session.hands / hours)) },
          bb > 0 && session.hands > 0 && { label: 'Per 100 hands', value: `${profit >= 0 ? '+' : ''}${((profit / bb / session.hands) * 100).toFixed(1)} bb` },
          same.length > 1 && { label: `All your ${session.stakes} sessions`, value: `${money(sameRate)}/h`, tone: tone(sameRate), hint: `${Math.round(sameHours)}h over ${plural(same.length, 'session')}` },
        ].filter(Boolean),
      },
      {
        type: 'text',
        title: 'Reading it',
        paragraphs: ["One session's rate is mostly luck: a single big pot moves it a lot. It starts to mean something over dozens of sessions, which is what the Hourly card on the home page adds up."],
      },
    ],
  };
}

function handsDetail(session, { hands }) {
  const { money } = writers(session);
  const hours = hoursOf(session);
  const reviewed = hands.filter((h) => h.coachAccuracy != null);
  return {
    lead: { value: plural(session.hands, 'hand'), caption: session.hands > 0 ? `about ${Math.round(session.hands / hours)} an hour` : 'none counted for this session' },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Saved', value: String(hands.length), hint: hands.length ? 'to review' : 'save the ones worth a second look' },
          { label: 'Reviewed by the coach', value: String(reviewed.length) },
          hands.length > 0 && { label: 'Marked mistakes', value: String(hands.filter((h) => h.verdict === 'mistake').length) },
          hands.length > 0 && { label: 'In the saved hands', value: money(hands.reduce((sum, h) => sum + (h.result ?? 0), 0)), tone: tone(hands.reduce((sum, h) => sum + (h.result ?? 0), 0)) },
        ].filter(Boolean),
      },
      hands.length > 0 && { type: 'hands', title: 'The hands you saved', items: hands.map((h) => handItem(h, money)) },
      {
        type: 'actions',
        items: [
          hands.length > 0 && { label: `Review ${plural(hands.length, 'hand')}`, to: `/hands?session=${session.id}`, icon: 'cards', primary: true },
          { label: 'Add a hand', to: `/hands/new?session=${session.id}`, icon: 'plus', primary: hands.length === 0 },
        ].filter(Boolean),
      },
    ],
  };
}

function gradeDetail(session, { hands }) {
  const grade = gradeSession(session, hands);
  return {
    lead: { value: `${grade.letter} · ${grade.label}`, tone: GRADE_TONES[grade.tone], caption: `${grade.score} out of 100` },
    sections: [
      {
        type: 'list',
        title: 'What it is made of',
        items: grade.parts.map((part) => {
          const letter = letterGrade(part.score);
          return { label: part.name, hint: `${part.detail} · counts ${Math.round(part.weight * 100)}%`, value: `${letter.letter} · ${part.score}`, tone: GRADE_TONES[letter.tone] };
        }),
      },
      {
        type: 'text',
        title: 'How it is worked out',
        paragraphs: [
          "Decisions are how well you played the hands you saved: the coach's accuracy where it reviewed them, otherwise your own star ratings.",
          'Results are the money: big blinds an hour in a cash game (break-even is a C, +15 bb an hour is close to an A), the return on the buy-in in a tournament.',
          'Time played scores best between 3 and 7 hours: a short session is a small sample, and very long ones tend to cost focus.',
          grade.note,
        ].filter(Boolean),
      },
      hands.length > 0 && { type: 'actions', items: [{ label: 'Review the saved hands', to: `/hands?session=${session.id}`, icon: 'cards', primary: true }] },
    ],
  };
}

const BUILDERS = {
  result: ['Result', resultDetail],
  buyin: ['Buy-in', buyInDetail],
  cashout: ['Cash-out', cashOutDetail],
  rate: ['Win rate', rateDetail],
  hands: ['Hands', handsDetail],
  grade: ['Session grade', gradeDetail],
};

// The detail behind one number of a session. hands: the hands saved from it. sessions: all your sessions (for
// "against your other sessions"). Amounts are as stored (dollars).
export function sessionDetail(kind, session, { hands = [], sessions = [] } = {}) {
  if (!BUILDERS[kind]) return null;
  const [title, build] = BUILDERS[kind];
  const detail = build(session, { hands, sessions });
  return { title: kind === 'rate' && isTournament(session) ? 'Per hour' : title, ...detail, sections: detail.sections.filter(Boolean) };
}

// The numbers on a running session's card (Log session): what you've put in, the hands dealt so far (an
// estimate), the hands you saved and the notes you took. session: the live session with its timeline (events).
// elapsedMs: how long it has been running.
export function liveSessionDetail(kind, session, elapsedMs) {
  const { money } = writers(session);
  const events = session.events ?? [];
  const minutes = Math.max(0, Math.round(elapsedMs / 60000));
  const at = (event) => (event.createdAt ? formatTime(event.createdAt) : '');
  if (kind === 'buyin') return sessionDetail('buyin', session);
  if (kind === 'dealt') {
    const dealt = Math.floor((elapsedMs / 3600000) * LIVE_HANDS_AN_HOUR);
    return {
      title: 'Hands dealt',
      lead: { value: `About ${dealt}`, caption: `after ${formatDuration(minutes)} at the table` },
      sections: [
        {
          type: 'facts',
          items: [
            { label: 'Counted at', value: `${LIVE_HANDS_AN_HOUR} an hour`, hint: 'a live table deals about that' },
            { label: 'Saved so far', value: String(events.filter((e) => e.type === 'hand').length) },
          ],
        },
        { type: 'text', title: 'Reading it', paragraphs: ['This is an estimate from the clock, to give you a feel for how small the sample still is. You set the real number when you finish the session.'] },
      ],
    };
  }
  if (kind === 'saved') {
    const saved = events.filter((e) => e.type === 'hand');
    return {
      title: 'Saved hands',
      lead: { value: plural(saved.length, 'hand'), caption: saved.length ? 'saved in this session' : 'none saved yet' },
      sections: [
        saved.length > 0 && {
          type: 'list',
          title: 'In the order you saved them',
          items: saved.map((e) => ({ label: e.text || 'Hand', hint: at(e), value: e.amount != null ? money(e.amount) : '', tone: tone(e.amount ?? 0), to: e.handId ? `/hands/${e.handId}` : undefined })),
        },
        !saved.length && { type: 'text', paragraphs: ['Save the hands you want to look at again: the big pots, the close calls, the ones that bother you. They wait for you in the hand list, with the coach.'] },
        { type: 'actions', items: [{ label: 'Add a hand', to: `/hands/new?session=${session.id}`, icon: 'plus', primary: true }] },
      ].filter(Boolean),
    };
  }
  if (kind === 'notes') {
    const notes = events.filter((e) => e.type === 'note');
    return {
      title: 'Notes',
      lead: { value: plural(notes.length, 'note'), caption: notes.length ? 'on this session' : 'none yet' },
      sections: [
        notes.length > 0 && { type: 'list', title: 'What you wrote', items: notes.map((e) => ({ label: e.text, hint: at(e), value: '' })) },
        !notes.length && { type: 'text', paragraphs: ['A line about the table, a read on a player, how you feel. Notes land on the timeline with their time, and the whole session keeps them.'] },
      ].filter(Boolean),
    };
  }
  return null;
}

// The short version of a whole session: how it went, its grade, your notes, the hands you saved, and the way to
// its page.
export function sessionSummary(session, hands = []) {
  const { money, other, otherLabel } = writers(session);
  const profit = sessionProfit(session);
  const grade = gradeSession(session, hands);
  return {
    title: titleOf(session),
    lead: { value: money(profit), tone: tone(profit), caption: `${formatWeekday(session.date)}, ${formatDate(session.date)} · ${session.venue} · ${formatDuration(session.durationMin)}` },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Buy-in', value: money(session.buyIn, { sign: false }) },
          { label: 'Cash-out', value: money(session.cashOut, { sign: false }) },
          { label: 'An hour', value: `${money(profit / hoursOf(session))}/h`, tone: tone(profit) },
          other && { label: otherLabel, value: other(profit), tone: tone(profit) },
          { label: 'Grade', value: `${grade.letter} · ${grade.label}`, tone: GRADE_TONES[grade.tone] },
          { label: 'Hands', value: session.hands.toLocaleString('en-US'), hint: `${hands.length} saved` },
        ].filter(Boolean),
      },
      session.notes && { type: 'text', title: 'Your notes', paragraphs: [session.notes] },
      hands.length > 0 && { type: 'hands', title: 'Saved hands', items: hands.slice(0, 4).map((h) => handItem(h, money)) },
      {
        type: 'actions',
        items: [
          { label: 'The whole session', to: `/history/${session.id}`, icon: 'clock', primary: true },
          hands.length > 0 && { label: `Review ${plural(hands.length, 'hand')}`, to: `/hands?session=${session.id}`, icon: 'cards' },
        ].filter(Boolean),
      },
    ],
  };
}
