// Hand insights: patterns in the hands you've recorded (results by position, verdicts, showdowns,
// all-ins, and how your own rating and tilt line up with results). Everything here comes from saved hands.
import { formatMoney } from './format.js';

const sum = (list) => list.reduce((a, b) => a + b, 0);
const average = (list) => (list.length ? sum(list) / list.length : null);
const dollars = (n) => formatMoney(Math.round(n));
const isAllIn = (hand) => hand.streets.some((s) => s.actions.some((a) => a.allIn || a.verb === 'shoves' || a.verb === 'all in'));

export function handInsights(hands) {
  const net = sum(hands.map((h) => h.result ?? 0));
  const rated = hands.filter((h) => h.rating != null);
  const tilted = hands.filter((h) => h.tilt != null);

  // Net result by the hero's seat.
  const positions = new Map();
  for (const hand of hands) positions.set(hand.heroPosition, (positions.get(hand.heroPosition) ?? 0) + (hand.result ?? 0));
  const byPosition = [...positions.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  // Verdict counts.
  const verdictLabels = { good: 'Good play', mistake: 'Mistake', cooler: 'Cooler', review: 'To review' };
  const byVerdict = Object.entries(verdictLabels)
    .map(([id, label]) => ({ label, value: hands.filter((h) => h.verdict === id).length }))
    .filter((v) => v.value > 0);

  // Showdown vs. no showdown.
  const showdown = hands.filter((h) => (h.tags ?? []).includes('Showdown') || h.streets.at(-1)?.name === 'River');
  const noShowdown = hands.filter((h) => !showdown.includes(h));
  const byShowdown = [
    { label: 'Showdown', value: sum(showdown.map((h) => h.result ?? 0)) },
    { label: 'No showdown', value: sum(noShowdown.map((h) => h.result ?? 0)) },
  ];

  const allIns = hands.filter(isAllIn);
  const allInRecord = { won: allIns.filter((h) => h.result > 0).length, lost: allIns.filter((h) => h.result < 0).length };

  // Plain-language findings.
  const notes = [];
  const calm = tilted.filter((h) => h.tilt <= 2);
  const hot = tilted.filter((h) => h.tilt >= 3);
  if (calm.length >= 2 && hot.length >= 2) {
    const calmAvg = average(calm.map((h) => h.result ?? 0));
    const hotAvg = average(hot.map((h) => h.result ?? 0));
    notes.push(
      hotAvg < calmAvg
        ? `Tilt shows up in your results: tilted hands average ${dollars(hotAvg)}, calm ones ${dollars(calmAvg)}.`
        : `Your tilted hands average ${dollars(hotAvg)} against ${dollars(calmAvg)} when calm. Tilt isn't costing you in these hands.`
    );
  }
  const mistakes = hands.filter((h) => h.verdict === 'mistake');
  if (mistakes.length >= 2) {
    const counts = new Map();
    for (const h of mistakes) counts.set(h.heroPosition, (counts.get(h.heroPosition) ?? 0) + 1);
    const [position, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (count >= 2) notes.push(`${count} of your ${mistakes.length} marked mistakes came from the ${position}. Review how you play that seat.`);
  }
  if (byPosition.length >= 2) {
    const worst = byPosition[byPosition.length - 1];
    if (worst.value < 0) notes.push(`Your recorded hands lose the most from the ${worst.label} (${dollars(worst.value)}).`);
  }
  if (showdown.length && noShowdown.length) {
    notes.push(`You're ${dollars(byShowdown[0].value)} in hands that reach the river and ${dollars(byShowdown[1].value)} in hands that end earlier.`);
  }
  if (allIns.length) notes.push(`All-in record: ${allInRecord.won} won, ${allInRecord.lost} lost.`);
  const avgRating = average(rated.map((h) => h.rating));
  if (avgRating !== null && rated.length >= 3) {
    notes.push(
      avgRating < 3
        ? `You rate your own play ${avgRating.toFixed(1)} stars on average. Pick one leak and drill it.`
        : `You rate your own play ${avgRating.toFixed(1)} stars on average.`
    );
  }

  return {
    count: hands.length,
    net,
    avgRating,
    avgTilt: average(tilted.map((h) => h.tilt)),
    byPosition,
    byVerdict,
    byShowdown,
    allInRecord,
    notes,
  };
}
