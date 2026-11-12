// One postflop street of a pot with too many players to solve (more than three). Nobody gets advice on it,
// but every real action still narrows the actor's range, by how a player of their kind takes it with each hand
// (players/policy.js: their read's model, or a typical player's when they have none). So when the pot gets
// down to three players or fewer, the solve starts from ranges that fit what happened: the player who bet into
// three opponents has more than the hands they called preflop with. (Such a street used to narrow nothing, and
// the next street started again from the preflop ranges.)
import { buildHandList } from './hands.js';

// A share of every hand's weight stays whatever the action: the policy is a model of a typical player, not of
// this one, so it shouldn't rule any hand out.
const KEEP = 0.1;
const close = (a, b, pot) => Math.abs(a - b) <= Math.max(0.05, 0.015 * pot);

// spec: { board (card ids), ranges: [Float32Array(1326)] in postflop order, pot (bb), stacks (bb behind),
//         policies: [policy(node, list)] per player, aggressor: who bet or raised last on the street before,
//         aggressorRaised: that was a raise, not just a bet }
// Same shape as a solved street (street.js), without advice.
export function createUnsolvedStreet({ board, ranges, pot, stacks, policies, aggressor = -1, aggressorRaised = false }) {
  const P = ranges.length;
  const current = ranges.map((r) => Float32Array.from(r));
  const streetBet = new Array(P).fill(0);
  const stack = [...stacks];
  const acted = new Set();
  let potNow = pot;
  let currentBet = 0;
  let bets = 0;
  let bettor = -1; // who bet or raised last on this street

  // The choices a player has here, as a solve would offer them: a couple of standard sizes, plus the real one.
  function menu(p, real) {
    const toCall = Math.max(0, currentBet - streetBet[p]);
    const cap = streetBet[p] + stack[p];
    const actions = toCall > 0 ? [{ type: 'fold', to: streetBet[p] }, { type: 'call', to: Math.min(currentBet, cap) }] : [{ type: 'check', to: streetBet[p] }];
    const sizes = toCall > 0 ? [currentBet + 2 * toCall] : [0.33 * potNow, 0.75 * potNow];
    if (cap > currentBet) {
      for (const size of sizes) if (size < cap) actions.push({ type: toCall > 0 ? 'raise' : 'bet', to: size });
      actions.push({ type: 'allin', to: cap });
    }
    let index = actions.findIndex((a) => a.type === real.type && (real.type === 'fold' || real.type === 'check' || real.type === 'call'));
    if (index < 0 && (real.type === 'bet' || real.type === 'raise' || real.type === 'allin')) {
      const to = Math.min(real.to ?? cap, cap);
      index = actions.findIndex((a) => (a.type === 'bet' || a.type === 'raise' || a.type === 'allin') && close(a.to, to, potNow));
      if (index < 0) index = actions.push({ type: to >= cap ? 'allin' : toCall > 0 ? 'raise' : 'bet', to }) - 1;
    }
    return { actions, index, toCall };
  }

  return {
    unsolved: true,
    setPlan() {},
    // A real action: { player (index in postflop order), type, to (bb street total) }.
    apply(real) {
      const p = real.player;
      const { actions, index, toCall } = menu(p, real);
      if (index >= 0) {
        const node = {
          actions,
          pot: potNow,
          toCall,
          board,
          bets,
          raises: Math.max(0, bets - 1) + (bets >= 1 && aggressorRaised && bettor === aggressor ? 1 : 0),
          lead: bets === 0 && aggressor >= 0 && aggressor !== p && !acted.has(aggressor),
          barrel: bets === 0 && aggressor === p,
        };
        const list = buildHandList(current[p], board, 2e-3);
        if (list.count > 0) {
          const strategy = policies[p](node, list);
          for (let k = 0; k < list.count; k++) current[p][list.hands[k]] *= KEEP + (1 - KEEP) * strategy[index * list.count + k];
        }
        const chosen = actions[index];
        if (chosen.type !== 'fold' && chosen.type !== 'check') {
          const add = chosen.to - streetBet[p];
          streetBet[p] = chosen.to;
          stack[p] -= add;
          potNow += add;
          if (chosen.to > currentBet) {
            currentBet = chosen.to;
            bets += 1;
            bettor = p;
          }
        }
      }
      acted.add(p);
    },
    // Everyone's ranges right now (1326 weights each, postflop order).
    ranges() {
      return current;
    },
  };
}
