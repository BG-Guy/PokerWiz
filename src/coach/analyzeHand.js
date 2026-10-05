// The coach's entry point: replays a recorded hand through the GTO engine (src/gto), grades every decision you
// made against what GTO does with your hand in that spot, and summarizes the hand (accuracy %, grades,
// biggest leak).
//
//   preflop   the solved 8-max charts at the hand's stack depth: how often GTO takes each option with your hand
//             class, and how much each option gives up against the best one
//   postflop  each street is solved from the ranges the players arrived with (heads-up and multiway), with the
//             hand's real bet sizes in the tree, so every option gets an exact value for your hand
// Everyone is assumed to play GTO; player reads come later (see gto/hand.js).
import { CLASS_NAMES, CLASS_COMBOS, classOf } from './combos.js';
import { codeToIndex } from '../utils/cards.js';
import { currentPlayer, getOptions } from '../utils/handEngine.js';
import { evaluate, categoryOf, HAND_NAMES } from '../utils/handEvaluator.js';
import { formatMoney } from '../utils/format.js';
import { defaultProfile, describeProfile } from './profiles.js';
import { PREFLOP_BY_CLASS } from './preflopTable.js';
import { computeStrengths, percentileOf, strengthWord } from './boardStrength.js';
import { equityVsHands, equityVsRanges } from './equity.js';
import { overallAccuracy, accuracyLabel, GRADES, gradeOf, gradeAgainstGto } from './grading.js';
import { explainDecision } from './explain.js';
import { replayHand } from './replay.js';
import { createRandom, seedFromString } from './random.js';
import { createGtoHand } from '../gto/hand.js';
import { toAppRange } from '../gto/cards.js';

const round2 = (n) => Math.round(n * 100) / 100;

// How the hero's hand stands right now ("Top pair, strong: beats 82% of possible hands").
function describeHeroHand(heroCards, board, strengths) {
  const cls = classOf(heroCards[0], heroCards[1]);
  if (board.length < 3) {
    const entry = PREFLOP_BY_CLASS[cls];
    return { name: CLASS_NAMES[cls], text: `${CLASS_NAMES[cls]}: a top ${Math.round(((entry.start + entry.end) / 2) * 100)}% starting hand` };
  }
  const score = evaluate(heroCards, board, board.length);
  const percentile = percentileOf(strengths, score);
  return {
    name: HAND_NAMES[categoryOf(score)],
    percentile,
    text: `${HAND_NAMES[categoryOf(score)]}, ${strengthWord(percentile)} (beats ${Math.round(percentile * 100)}% of possible hands)`,
  };
}

// Readable label for an option, in the hand's money ("Raise to $7", "Bet $6 (50% pot)").
function optionLabel(option, state) {
  const opts = getOptions(state);
  const dollars = (n) => formatMoney(round2(n), { sign: false, bb: state.bb });
  if (option.type === 'fold') return 'Fold';
  if (option.type === 'check') return 'Check';
  if (option.type === 'call') return state.street === 'Preflop' && state.currentBet === state.bb && opts.toCall < state.bb ? `Complete ${dollars(opts.toCall)}` : `Call ${dollars(opts.toCall)}`;
  if (option.type === 'allin') return `All in ${dollars(opts.maxTo)}`;
  if (option.type === 'bet') return `Bet ${dollars(option.to)} (${Math.round((option.to / state.pot) * 100)}% pot)`;
  return `Raise to ${dollars(option.to)}`;
}
const KIND = { fold: 'fold', check: 'check', call: 'call', bet: 'raise', raise: 'raise', allin: 'raise' };

// Each still-active villain's range at this moment (169-class grid) for the report's range grids.
function readsAt(gto, state, villains) {
  return villains
    .filter((v) => !state.players.find((p) => p.seat === v.seat)?.folded)
    .map((v) => {
      const grid = gto.rangeOf(state, v.seat) ?? new Array(169).fill(1);
      const width = grid.reduce((sum, w, cls) => sum + w * CLASS_COMBOS[cls], 0) / 1326;
      const top = grid
        .map((w, cls) => ({ cls, w }))
        .filter((x) => x.w > 0.05)
        .sort((a, b) => b.w - a.w || CLASS_COMBOS[a.cls] - CLASS_COMBOS[b.cls])
        .slice(0, 8)
        .map((x) => CLASS_NAMES[x.cls]);
      return { seat: v.seat, name: v.name, position: v.position, label: 'GTO', width: round2(width), grid: grid.map(round2), top };
    });
}

// Who folds before acting (or isn't in the logged hand): lets a 9-handed hand fit the 8-handed charts.
function firstFolders(record, entries) {
  const firstAction = new Map();
  for (const e of entries) {
    if (e.street !== 'Preflop') break;
    const position = currentPlayer(e.state).position;
    if (!firstAction.has(position)) firstAction.set(position, e.action.type);
  }
  const seated = new Set(record.players.map((p) => p.position));
  return new Set(record.positions.filter((position) => !seated.has(position) || firstAction.get(position) === 'fold'));
}

// record: see HandRecorder.buildRecord(). Returns the full report (plain data, safe to post from a worker).
// rangesOnly: skip grading and return each villain's range after the log ({ ranges: [{ seat, weights }] }, the
// coach's combo order), e.g. to deal them cards that fit how they played (Practice replays).
// detail: 'full' (reviews) or 'fast'; onProgress(text) reports what's being solved.
export async function analyzeHand(record, { rangesOnly = false, detail = 'full', onProgress = () => {} } = {}) {
  const seed = seedFromString(JSON.stringify([record.players.map((p) => [p.position, p.cards, p.stack]), record.streets, record.board]));
  const random = createRandom(seed);
  const heroRecord = record.players.find((p) => p.role === 'hero');
  if (!heroRecord || heroRecord.cards?.length !== 2) throw new Error('The coach needs your two hole cards.');
  const heroCards = heroRecord.cards.map(codeToIndex);
  const heroProfile = heroRecord.profile ?? defaultProfile();
  const bb = record.stakes.bb;

  // Every action with the state it was taken in.
  const entries = [];
  replayHand(record, ({ state, action, type, street }) => entries.push({ state, street, action: { type, amount: action.amount } }));

  const villains = record.players
    .filter((p) => p.role === 'villain')
    .map((p) => ({ seat: p.seat, position: p.position, name: p.name ?? p.position, cards: (p.cards ?? []).map(codeToIndex) }));
  if (!entries.length) return rangesOnly ? { ranges: [] } : summarize([], { record, heroRecord, heroProfile, villains, chart: null, bb });

  // The depth that matters: your stack against the deepest opponent's.
  const stackOf = (p) => p.stack ?? 100 * bb;
  const deepestVillain = Math.max(0, ...record.players.filter((p) => p.role === 'villain').map(stackOf));
  const stackBB = Math.min(stackOf(heroRecord), deepestVillain || stackOf(heroRecord)) / bb;

  onProgress('Loading the preflop charts');
  const gto = await createGtoHand({
    state: entries[0].state,
    stackBB,
    known: { [heroRecord.seat]: heroRecord.cards },
    detail,
    seed,
    folders: firstFolders(record, entries),
  });

  const decisions = [];
  let currentStreet = 'Preflop';
  let boardKey = null;
  let strengths = null;
  for (const entry of entries) {
    const { state, action, street } = entry;
    // A new street: solve it once, with all of its real actions in the tree.
    if (street !== currentStreet) {
      currentStreet = street;
      gto.startStreet(state);
      gto.planStreet(entries.filter((e) => e.street === street));
      onProgress(`Solving the ${street.toLowerCase()}`);
    }
    if (currentPlayer(state).role === 'hero' && !rangesOnly) {
      const board = state.board.map(codeToIndex);
      if (board.join() !== boardKey) {
        boardKey = board.join();
        strengths = board.length >= 3 ? computeStrengths(board, heroCards) : null;
      }
      decisions.push(gradeHeroDecision({ gto, state, action, street, heroCards, heroRecord, villains, board, strengths, random, index: decisions.length }));
    }
    gto.apply(state, action);
  }

  if (rangesOnly) {
    const last = entries[entries.length - 1].state;
    return {
      ranges: villains.map((v) => {
        const range = gto.handRangeOf(last, v.seat);
        return { seat: v.seat, weights: range ? toAppRange(range) : new Float64Array(1326).fill(1) };
      }),
    };
  }
  return summarize(decisions, { record, heroRecord, heroProfile, villains, chart: gto.chart, bb });
}

// One hero decision: what GTO does with the hand here and how the real play compares.
function gradeHeroDecision({ gto, state, action, street, heroCards, heroRecord, villains, board, strengths, random, index }) {
  const opts = getOptions(state);
  const potRef = state.pot + opts.toCall;
  const playerOf = (seat) => state.players.find((p) => p.seat === seat);
  const active = villains.filter((v) => !playerOf(v.seat).folded);
  const base = {
    index,
    street,
    pot: state.pot,
    board: state.board,
    toCall: opts.toCall,
    potRef,
    heroHand: describeHeroHand(heroCards, board, strengths),
    heroClass: CLASS_NAMES[classOf(heroCards[0], heroCards[1])],
    reads: readsAt(gto, state, villains),
    players: state.players.filter((p) => !p.folded).length,
    // Preflop, the blinds alone aren't a bet to answer: pot odds only once someone has bet or raised.
    facingBet: opts.toCall > 0 && (street !== 'Preflop' || state.currentBet > state.bb),
  };

  let advice;
  try {
    advice = gto.advise(state, heroRecord.cards);
  } catch (error) {
    advice = { unavailable: error.message };
  }
  if (advice.unavailable) return { ...base, kind: 'gto', graded: false, reason: `Not graded: ${advice.unavailable}`, options: [], score: null, grade: null };

  // Equity against the ranges still in the hand (and against their real cards, when known).
  const ranges = active.map((v) => gto.handRangeOf(state, v.seat)).filter(Boolean).map(toAppRange);
  const equity = ranges.length ? equityVsRanges({ hero: heroCards, board, ranges, iterations: 1500, random }).equity : null;
  const known = active.length > 0 && active.every((v) => v.cards.length === 2);
  const equityVsActual = known ? equityVsHands({ hero: heroCards, board, hands: active.map((v) => v.cards), iterations: 1500, random }).equity : null;

  // Your action among the options. A limp where GTO only opens or folds isn't one of them: it's valued halfway
  // between the two (better than folding a strong hand, worse than raising it).
  let actual = gto.optionIndex(state, action, advice);
  let offMenu = null;
  const options = advice.options.map((o) => ({ ...o, kind: KIND[o.type], label: optionLabel(o, state) }));
  if (street === 'Preflop' && action.type === 'call' && !['call', 'check'].includes(options[actual]?.type)) {
    const fold = options.findIndex((o) => o.type === 'fold');
    const limpLoss = (advice.lossBB[fold] + advice.lossBB[actual]) / 2;
    options.push({ type: 'call', kind: 'call', label: optionLabel({ type: 'call' }, state), frequency: 0, to: state.currentBet, ev: (advice.lossBB[fold] - limpLoss) * state.bb });
    advice = { ...advice, options, lossBB: [...advice.lossBB, limpLoss] };
    actual = options.length - 1;
    offMenu = "Limping isn't part of GTO from this seat (it opens or folds), so the limp is valued halfway between the two.";
  }
  const graded = gradeAgainstGto({ advice, actual, potRef, bb: state.bb });
  const labeled = options.map((o, k) => ({ ...o, ev: o.ev === null ? null : round2(o.ev), isActual: k === actual, isBest: k === graded.best }));

  // A raise size the charts don't have was graded as the closest one they do.
  let sizeNote = null;
  const matched = labeled[actual];
  if (street === 'Preflop' && (action.type === 'raise' || action.type === 'bet') && matched?.to && Math.abs(matched.to - action.amount) > 0.1 * action.amount) {
    sizeNote = `GTO charts use standard sizes, so your raise to ${formatMoney(action.amount, { sign: false, bb: state.bb })} was graded as ${matched.label.toLowerCase()}.`;
  }
  return {
    ...base,
    kind: 'gto',
    graded: true,
    source: advice.source,
    chart: advice.chart ?? null,
    chartNote: advice.exact === false ? 'this exact line is rare, so the closest solved spot was used' : null,
    solve: advice.iterations ? { iterations: advice.iterations, seconds: Math.round(advice.elapsed / 100) / 10 } : null,
    options: labeled,
    actual: matched,
    best: labeled[graded.best],
    evLoss: round2(graded.evLoss),
    kindFrequency: graded.kindFrequency,
    score: graded.score,
    grade: gradeOf(graded.score),
    equity,
    equityVsActual,
    offMenu,
    sizeNote,
  };
}

// The report: accuracy over the graded decisions, grade counts, EV given up, the biggest leak, players.
function summarize(decisions, { record, heroRecord, heroProfile, villains, chart, bb }) {
  const ctx = { bb };
  for (const d of decisions) d.notes = explainDecision(d, ctx);
  const graded = decisions.filter((d) => d.graded);
  const accuracy = overallAccuracy(graded, bb);
  const counts = Object.fromEntries(GRADES.map((g) => [g.id, graded.filter((d) => d.grade.id === g.id).length]));
  const evLost = round2(graded.reduce((sum, d) => sum + (d.evLoss ?? 0), 0));
  const worst = graded.reduce((a, d) => (!a || d.score < a.score ? d : a), null);
  const keyLesson =
    worst && worst.score < 80
      ? { street: worst.street, text: `${worst.street}: ${worst.best.label.toLowerCase()} was the GTO play with ${worst.heroClass}, not ${worst.actual.label.toLowerCase()}.` }
      : null;

  return {
    accuracy,
    label: accuracyLabel(accuracy),
    counts,
    evLost,
    evLostBB: round2(evLost / bb),
    keyLesson,
    chart,
    hero: {
      position: heroRecord.position,
      cards: heroRecord.cards,
      label: describeProfile(heroProfile).label,
    },
    villains: villains.map((v) => ({
      seat: v.seat,
      name: v.name,
      position: v.position,
      label: 'GTO',
      cards: record.players.find((p) => p.seat === v.seat)?.cards ?? [],
    })),
    decisions,
    result: record.result,
    pot: record.pot,
    stakes: record.stakes,
  };
}
