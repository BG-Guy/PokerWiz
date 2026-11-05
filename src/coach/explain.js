// Plain-language coaching notes for each graded decision, from the GTO solution: what GTO does with your hand
// in that spot, how your play compares, and the numbers behind it (price, equity). Against a player with a read
// the solution is the best play against them, and the notes say that instead of "GTO".
import { formatMoney } from '../utils/format.js';

const pct = (x) => `${Math.round(x * 100)}%`;
// Amounts in the hand's big blinds or dollars (ctx.bb is the big blind).
const money = (n, ctx) => formatMoney(Math.round(n * 100) / 100, { sign: false, bb: ctx.bb });
const lower = (label) => label.charAt(0).toLowerCase() + label.slice(1);
// Is someone still in the hand a player with a read (so the solution is the best play against them)?
const againstRead = (d) => Boolean(d.reads?.some((r) => r.label !== 'GTO'));

// "raise to $5 72%, fold 28%": the options GTO uses with this hand, most played first.
function mixText(options) {
  return options
    .filter((o) => o.frequency >= 0.02)
    .sort((a, b) => b.frequency - a.frequency)
    .map((o) => `${lower(o.label)} ${pct(o.frequency)}`)
    .join(', ');
}

// Where the answer comes from.
function sourceNote(d) {
  if (d.source === 'chart') {
    const depth = `${d.chart.stack} bb${d.chart.ante ? ' with a big-blind ante' : ''}`;
    return `Preflop GTO solution${againstRead(d) ? ', bent toward their read,' : ''} for 8-handed play at ${depth}${d.chartNote ? ` (${d.chartNote})` : ''}.`;
  }
  const who = d.players === 2 ? 'heads-up' : `${d.players}-way`;
  return `This ${d.street.toLowerCase()} was solved ${who} from the ranges everyone arrived with, including the real bet sizes.`;
}

export function explainDecision(d, ctx) {
  if (!d.graded) return [d.reason];
  const notes = [sourceNote(d)];
  const { actual, best } = d;

  if (d.facingBet) {
    notes.push(`Pot odds: call ${money(d.toCall, ctx)} to win ${money(d.pot + d.toCall, ctx)}, so you need ${pct(d.toCall / (d.pot + d.toCall))} equity to break even.`);
  }
  // Against a read the solution is the best play against that player, not GTO.
  const read = againstRead(d);
  const mix = read ? 'best-play' : 'GTO';
  notes.push(`${read ? 'Against their read, with' : 'GTO with'} ${d.heroClass} here: ${mixText(d.options)}.`);

  // Your play against the strategy.
  if (d.offMenu) notes.push(d.offMenu);
  else if (actual.isBest) notes.push(`${actual.label} is ${read ? 'the top choice against them' : "GTO's top choice"}${actual.frequency < 0.98 ? ` (played ${pct(actual.frequency)} of the time)` : ''}.`);
  else if (actual.frequency >= 0.2) notes.push(`${actual.label} is part of the ${mix} mix (${pct(actual.frequency)}): as good as ${lower(best.label)}.`);
  else if (actual.frequency >= 0.05) notes.push(`${actual.label} is a small part of the ${mix} mix (${pct(actual.frequency)}); ${lower(best.label)} is the main play.`);
  else if (actual.kind === 'raise' && d.kindFrequency >= 0.5) {
    const verb = d.toCall > 0 ? 'Raising' : 'Betting';
    notes.push(`${verb} is right: ${read ? 'the best play against them is to do it' : 'GTO does it'} ${pct(d.kindFrequency)} of the time with this hand, mostly as ${lower(best.label)}. Your size is one it rarely uses.`);
  } else notes.push(read ? `Against them, ${lower(actual.label)} isn't a play with this hand here; ${lower(best.label)} is.` : `GTO doesn't play ${lower(actual.label)} with this hand here; ${lower(best.label)} is the play.`);
  if (d.evLoss > 0.004 * d.potRef && !actual.isBest) {
    notes.push(`That gives up about ${money(d.evLoss, ctx)} (${pct(d.evLoss / Math.max(d.potRef, 1e-9))} of the pot) against ${lower(best.label)}.`);
  }

  // A close call between the two best options.
  const ranked = d.options.filter((o) => o.ev !== null).sort((a, b) => b.ev - a.ev);
  if (ranked.length > 1 && !d.offMenu && ranked[0].ev - ranked[1].ev < 0.02 * d.potRef && ranked[1].frequency < 0.2) {
    notes.push(`Close spot: ${lower(ranked[1].label)} is worth almost the same.`);
  }

  if (d.sizeNote) notes.push(d.sizeNote);
  if (d.equity != null) notes.push(`Against their ranges at this point you have about ${pct(d.equity)} equity.`);
  if (d.equityVsActual != null) notes.push(`Against their actual cards you had ${pct(d.equityVsActual)}.`);
  return notes;
}
