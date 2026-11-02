// Stakes helpers for starting a session: labels for custom stakes ("$2/$5/$10"), a short line of table details
// ("9-max · $1 ante · Table 12"), and the list of custom stakes you've played (kept in your settings).
// A stake: { label, sb, bb, ante?, straddle?, game?, tableSize?, tableName? }, amounts in dollars.

// How many custom stakes are remembered.
export const MAX_SAVED_STAKES = 6;

// "$2", "$0.25", "$1,000": an amount as it reads in a stakes label.
export function stakeAmount(value) {
  const digits = Number.isInteger(value) ? 0 : 2;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// "$2/$5", or "$2/$5/$10" with a straddle. The small blind is left out when there isn't one ("$5 BB").
export function stakesLabel({ sb, bb, straddle }) {
  const blinds = sb > 0 ? `${stakeAmount(sb)}/${stakeAmount(bb)}` : `${stakeAmount(bb)} BB`;
  return straddle > 0 ? `${blinds}/${stakeAmount(straddle)}` : blinds;
}

// The extras worth showing under a stake: seats, ante, straddle (when the label doesn't already say it), name.
export function stakeDetails(stake, { withStraddle = false } = {}) {
  const parts = [];
  if (stake.tableSize) parts.push(stake.tableSize === 2 ? 'Heads-up' : `${stake.tableSize}-max`);
  if (stake.ante > 0) parts.push(`${stakeAmount(stake.ante)} ante`);
  if (withStraddle && stake.straddle > 0) parts.push(`${stakeAmount(stake.straddle)} straddle`);
  if (stake.tableName) parts.push(stake.tableName);
  return parts.join(' · ');
}

// Two stakes are the same when everything about them matches.
const keyOf = (s) => JSON.stringify([s.label, s.sb ?? null, s.bb, s.ante ?? null, s.straddle ?? null, s.game ?? null, s.tableSize ?? null, s.tableName ?? null]);
export const sameStake = (a, b) => Boolean(a && b) && keyOf(a) === keyOf(b);

// The saved list with `stake` moved (or added) to the front, the oldest dropped past the limit.
export function rememberStake(saved, stake) {
  return [stake, ...saved.filter((s) => !sameStake(s, stake))].slice(0, MAX_SAVED_STAKES);
}
