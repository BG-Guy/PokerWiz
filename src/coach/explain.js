// Plain-language coaching notes for each graded decision: the math first (price, equity, fold equity),
// then what the player reads (traits) change, then the verdict.
import { formatMoney } from '../utils/format.js';

const pct = (x) => `${Math.round(x * 100)}%`;
const dollars = (n) => formatMoney(Math.round(n * 100) / 100, { sign: false });

const ACTION_WORDS = { raise: 'raise', call: 'call', fold: 'fold', check: 'check' };

// Main villain in a spot: the one who bet last, or the first still in.
function mainRead(decision) {
  return decision.reads[0] ?? null;
}

// Notes about how the reads changed the math.
function traitNotes(decision, ctx) {
  const notes = [];
  for (const read of decision.reads) {
    const villain = ctx.villainsBySeat.get(read.seat);
    if (!villain) continue;
    const { foldMult, bluffMult } = villain.params;
    const acted = decision.actual;
    const bluffy = acted?.kind === 'raise' && (acted.equityWhenCalled ?? 1) < 0.4;
    if (foldMult < 0.8 && bluffy) {
      notes.push(`${read.position} (${read.label}) folds much less than the math says a player should, so bluffs lose value against them. Bet for value instead.`);
    } else if (foldMult > 1.15 && (acted?.kind === 'check' || acted?.kind === 'call') && decision.best?.kind === 'raise') {
      notes.push(`${read.position} (${read.label}) folds too often: pressure is worth more against them than against an average player.`);
    }
    if (bluffMult > 1.8 && decision.toCall > 0 && acted?.kind === 'fold') {
      notes.push(`${read.position} (${read.label}) bluffs a lot, so their betting range is weaker than it looks. Call down lighter.`);
    }
    // Recreational habits: big bets are value, and they call (not bet) their draws.
    const facedBig = decision.toCall > 0 && read.seat === decision.aggressorSeat && (decision.facedBetRatio ?? 0) >= 0.75;
    if (facedBig && villain.params.bigBluffShy >= 0.5) {
      notes.push(`${read.position} (${read.label}) rarely bluffs this big: players at that level bluff small if at all, so their range here was weighted heavily toward value.`);
    }
    if (villain.params.drawAggro <= 0.4 && decision.toCall > 0 && read.seat === decision.aggressorSeat && decision.street !== 'River') {
      notes.push(`${read.position} plays draws passively (they check and call them), so this bet was read as a made hand more than a semi-bluff.`);
    }
    if (villain.params.drawAggro <= 0.4 && decision.toCall === 0 && acted?.kind === 'raise' && (acted.equityWhenCalled ?? 0) >= 0.5 && decision.street !== 'River') {
      notes.push(`${read.position} calls with their draws rather than folding or raising: expect to get called by draws, and charge them for it.`);
    }
    if (villain.profile.tilt >= 60) notes.push(`${read.position} is tilted: their ranges were widened and they were modeled to bluff more and fold less.`);
  }
  return notes;
}

// Hero tilt: flag plays that lean the way tilt pushes (looser / more aggressive than the best line).
function heroTiltNote(decision, ctx) {
  if ((ctx.heroProfile.tilt ?? 0) < 50 || decision.score >= 80) return null;
  const order = { fold: 0, check: 1, call: 2, raise: 3 };
  const did = decision.actual?.kind ?? decision.did;
  const best = decision.best?.kind ?? decision.advice?.best;
  if (order[did] > order[best]) return 'Your tilt meter was high, and this play leans exactly the way tilt pushes: looser and more aggressive than the math.';
  return null;
}

export function explainPreflop(decision, ctx) {
  const t = decision.thresholds;
  const s = decision.situation;
  const notes = [];

  if (t.kind === 'unopened') {
    notes.push(
      s.limpers > 0
        ? `${s.limpers} player${s.limpers > 1 ? 's' : ''} limped. From the ${ctx.heroPosition}, raise the top ${pct(t.raise)} of hands to isolate.`
        : `Nobody had raised. From the ${ctx.heroPosition}, a solid opening range is about the top ${pct(t.raise)} of hands.`
    );
  } else if (t.kind === 'vsOpen') {
    notes.push(
      `Facing a ${s.openerPosition ?? ''} open, the ${ctx.heroPosition} continues with about the top ${pct(t.play)} of hands and 3-bets the top ${pct(t.raise)}.`
    );
  } else if (t.kind === 'vs3bet') {
    notes.push(`Facing a 3-bet, continue with about the top ${pct(t.play)} of hands and 4-bet the top ${pct(t.raise)}.`);
  } else {
    notes.push(`Facing a 4-bet or more, only about the top ${pct(t.play)} of hands continues (${pct(t.raise)} goes all in).`);
  }

  notes.push(`${decision.heroClass} sits around the top ${pct(decision.handTop)} of starting hands.`);

  const opener = ctx.villainsBySeat.get(s.openerSeat);
  if (opener && t.kind !== 'unopened') {
    if (opener.params.widthMult > 1.25) notes.push(`The opener (${opener.label}) plays wide, so these ranges were widened to match.`);
    else if (opener.params.widthMult < 0.8) notes.push(`The opener (${opener.label}) plays tight, so these ranges were tightened.`);
  }

  const bestWord = decision.advice.best;
  if (decision.did === bestWord) {
    notes.push(`So ${ACTION_WORDS[bestWord]} is the standard play, and that's what you did.`);
  } else {
    notes.push(`That makes ${ACTION_WORDS[bestWord]} the standard play; you chose to ${decision.limped ? 'limp' : ACTION_WORDS[decision.did]}.`);
  }
  if (decision.limped) notes.push('Limping gives up the initiative. Raising or folding is usually better.');
  if (decision.deepShove) notes.push('Shoving a deep stack risks a lot to win the blinds; a normal raise gets the same folds for less.');
  if (decision.equity) notes.push(`Against the ranges still in the hand you have about ${pct(decision.equity)} equity.`);

  const tilt = heroTiltNote(decision, ctx);
  if (tilt) notes.push(tilt);
  return notes;
}

export function explainPostflop(decision, ctx) {
  const notes = [];
  const read = mainRead(decision);
  const rangeText = read ? `${read.position}'s range (about ${pct(read.width)} of hands after their actions)` : 'their range';

  if (decision.toCall > 0) {
    const required = decision.toCall / (decision.pot + decision.toCall);
    notes.push(`Pot odds: call ${dollars(decision.toCall)} into a pot of ${dollars(decision.pot)}, so you need ${pct(required)} equity to break even.`);
  }
  let equityLine = `Against ${rangeText} you have about ${pct(decision.equity)} equity`;
  if (!decision.inPosition && decision.street !== 'River') {
    equityLine += `, but out of position you only realize about ${pct(decision.realization)} of it`;
  }
  notes.push(`${equityLine}.`);

  const best = decision.best;
  if (best.kind === 'raise') {
    notes.push(
      `Best: ${best.label}. They fold about ${pct(best.foldEquity)} of the time, and you have ${pct(best.equityWhenCalled)} when called.`
    );
  } else if (best.kind === 'call') {
    notes.push(`Best: ${best.label}. Your equity is worth more than the price.`);
  } else if (best.kind === 'fold') {
    notes.push('Best: Fold. You don\'t have the equity to continue at this price.');
  } else if (best.lookahead) {
    notes.push(
      `Best: Check. They bet about ${pct(best.lookahead.theyBet)} of the time after you check, and you have ${pct(best.lookahead.equityVsBet)} against that betting range: letting them bet is worth more than betting yourself.`
    );
  } else {
    notes.push('Best: Check. Betting doesn\'t win enough folds or get enough value from worse hands here.');
  }

  if (decision.actual === best || decision.actual?.isBest) {
    notes.push('Your play was the highest-value option.');
  } else {
    notes.push(
      `Your play (${decision.actual.label}) is worth ${dollars(decision.actual.ev)} against ${dollars(best.ev)} for the best line: about ${dollars(decision.evLoss)} given up (${pct(decision.evLoss / decision.potRef)} of the pot).`
    );
  }

  // Close spot: something else was nearly as good.
  const runnerUp = decision.options.filter((o) => !o.isBest).reduce((a, b) => (!a || b.ev > a.ev ? b : a), null);
  if (runnerUp && best.ev - runnerUp.ev < 0.02 * decision.potRef) notes.push(`Close spot: ${runnerUp.label} was almost as good.`);

  if (decision.equityVsActual !== null && decision.equityVsActual !== undefined) {
    notes.push(`Against their actual cards you had ${pct(decision.equityVsActual)} here.`);
  }

  notes.push(...traitNotes(decision, ctx));
  const tilt = heroTiltNote(decision, ctx);
  if (tilt) notes.push(tilt);
  return notes;
}
