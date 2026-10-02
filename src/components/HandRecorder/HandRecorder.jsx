// Hand recorder: rebuild a hand on a poker table, one question at a time. Used by Add Hand ("record")
// and Coach mode ("coach"), which adds a player-traits step and ends with an analysis instead of saving.
// Flow: game -> hero seat -> villains -> stacks -> [traits] -> hero cards -> villain cards -> action
// (street by street, dealing the board between streets) -> showdown -> details (save) or analyze.
// Every answer is pushed onto a history stack, so Undo steps back exactly one question, and tapping a step
// in the hand log jumps back to that question to change it.
import { useState } from 'react';
import { STAKES, TABLE_POSITIONS, TABLE_SIZES } from '../../constants/poker.js';
import { RANKS } from '../../utils/cards.js';
import { formatMoney, todayIso } from '../../utils/format.js';
import { defaultProfile, describeProfile } from '../../coach/profiles.js';
import PokerTable from './PokerTable.jsx';
import PromptCarousel from './PromptCarousel.jsx';
import LogEntry from './LogEntry.jsx';
import Icon from '../Icon/Icon.jsx';
import GamePrompt from './prompts/GamePrompt.jsx';
import SeatPickPrompt from './prompts/SeatPickPrompt.jsx';
import StacksPrompt from './prompts/StacksPrompt.jsx';
import TraitsPrompt from './prompts/TraitsPrompt.jsx';
import CardsPrompt from './prompts/CardsPrompt.jsx';
import ActionPrompt from './prompts/ActionPrompt.jsx';
import BoardPrompt from './prompts/BoardPrompt.jsx';
import ResultPrompt from './prompts/ResultPrompt.jsx';
import DetailsPrompt from './prompts/DetailsPrompt.jsx';
import AnalyzePrompt from './prompts/AnalyzePrompt.jsx';
import {
  BOARD_CARDS,
  applyAction,
  autoTags,
  createHand,
  currentPlayer,
  dealBoard,
  heroResult,
  nextStreet,
  showdownWinners,
} from '../../utils/handEngine.js';
import './HandRecorder.css';

const INITIAL_WIZARD = {
  step: 'game',
  stakesLabel: '$1/$2',
  tableSize: TABLE_SIZES[0], // 8-max by default; 6-max is one tap away
  heroSeat: null,
  villainSeats: [],
  stacks: {}, // seat -> starting stack in dollars (string while being typed)
  profiles: {}, // seat -> player profile (coach mode)
  cards: {}, // seat -> [codes]
  hand: null, // betting engine state, from the action step on
  winners: [],
  log: [], // answered steps, shown in the carousel and the hand log
};

// "AKs", "QQ", "K9o"
function shorthand(cards) {
  const [high, low] = [...cards].sort((a, b) => RANKS.indexOf(b[0]) - RANKS.indexOf(a[0]));
  if (high[0] === low[0]) return high[0] + low[0];
  return high[0] + low[0] + (high[1] === low[1] ? 's' : 'o');
}

// Log verbs are third person ("raises to"); for the hero say "You raise to".
const secondPerson = (verb) => verb.replace(/s(\sto)?$/, '$1');

// mode: 'record' | 'coach'
// onSave(payload) -> Promise   (record mode: persist the hand; reject with an Error to show a message)
// onAnalyze({ record, payload }) (coach mode: hand the finished hand to the coach)
// initialTableSize / initialDetails: start values when re-recording a saved hand.
export default function HandRecorder({ mode = 'record', initialStakesLabel, initialTableSize, initialDetails, onSave, onAnalyze }) {
  const isCoach = mode === 'coach';
  const [wizard, setWizard] = useState(() => ({
    ...INITIAL_WIZARD,
    stakesLabel: STAKES.some((s) => s.label === initialStakesLabel) ? initialStakesLabel : INITIAL_WIZARD.stakesLabel,
    tableSize: TABLE_SIZES.includes(initialTableSize) ? initialTableSize : INITIAL_WIZARD.tableSize,
  }));
  const [history, setHistory] = useState([]);
  const [direction, setDirection] = useState('forward');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const { step, hand, heroSeat, villainSeats, stacks, profiles, cards, winners } = wizard;
  const positions = TABLE_POSITIONS[wizard.tableSize];
  const stakes = STAKES.find((s) => s.label === wizard.stakesLabel);
  const nameOf = (seat) => (seat === heroSeat ? 'You' : `Villain ${villainSeats.indexOf(seat) + 1}`);
  const usedCards = [...Object.values(cards).flat(), ...(hand?.board ?? [])];
  const finalStep = isCoach ? 'analyze' : 'details';

  // Move to the next question: remember the current state for Undo and log the answer.
  const advance = (changes, entry) => {
    setHistory((h) => [...h, wizard]);
    setWizard((w) => ({ ...w, ...changes, log: entry ? [...w.log, entry] : w.log }));
    setDirection('forward');
  };
  // Change something within the current question (no Undo step).
  const edit = (changes) => setWizard((w) => ({ ...w, ...changes }));
  const undo = () => {
    if (history.length === 0) return;
    setWizard(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setDirection('back');
  };
  // Go back to the question that produced log entry `index` (everything after it is redone).
  const jumpTo = (index) => {
    const at = history.findIndex((past) => past.log.length === index);
    if (at < 0) return;
    setWizard(history[at]);
    setHistory((h) => h.slice(0, at));
    setDirection('back');
  };

  // Players in the hand, with display info, hero first.
  const inHand =
    heroSeat === null
      ? []
      : [heroSeat, ...villainSeats].map((seat) => ({
          seat,
          position: positions[seat],
          role: seat === heroSeat ? 'hero' : 'villain',
          name: nameOf(seat),
          cards: cards[seat] ?? [],
          profile: profiles[seat],
        }));

  // Everything the coach (or a later replay) needs to rebuild this hand exactly.
  const buildRecord = () => ({
    stakes: { label: stakes.label, sb: stakes.sb, bb: stakes.bb },
    tableSize: wizard.tableSize,
    positions,
    heroSeat,
    players: hand.players.map((p) => ({
      seat: p.seat,
      position: p.position,
      role: p.role,
      name: p.name,
      stack: p.stack,
      cards: cards[p.seat] ?? [],
      profile: profiles[p.seat] ?? null,
    })),
    streets: hand.streets,
    board: hand.board,
    winners,
    result: heroResult(hand, winners),
    pot: hand.pot,
  });

  // The hand as it is stored by the API (Hand Review format).
  const buildPayload = (details) => ({
    date: todayIso(),
    game: 'NLH',
    stakes: stakes.label,
    tableSize: wizard.tableSize,
    title: details.title,
    verdict: details.verdict ?? 'review',
    note: details.note ?? '',
    rating: details.rating ?? null,
    tilt: details.tilt ?? null,
    heroPosition: positions[heroSeat],
    holeCards: cards[heroSeat],
    board: hand.board,
    potSize: hand.pot,
    result: heroResult(hand, winners),
    tags: autoTags(hand),
    streets: hand.streets,
    players: hand.players.map((p) => ({
      seat: p.seat,
      position: p.position,
      role: p.role,
      stack: p.stack,
      folded: p.folded,
      allIn: p.allIn,
      cards: cards[p.seat] ?? [],
      profile: profiles[p.seat] ?? null,
    })),
  });

  const defaultTitle = () =>
    `${shorthand(cards[heroSeat])} on the ${positions[heroSeat]} vs ${villainSeats.map((s) => positions[s]).join(', ')}`;

  // ----- Answers from each step -----

  const handleSeatClick = (seat) => {
    if (step === 'hero') {
      advance(
        { heroSeat: seat, villainSeats: villainSeats.filter((s) => s !== seat), step: 'villains' },
        { text: `You sit in the ${positions[seat]}`, role: 'hero' }
      );
    } else if (step === 'villains' && seat !== heroSeat) {
      edit({ villainSeats: villainSeats.includes(seat) ? villainSeats.filter((s) => s !== seat) : [...villainSeats, seat] });
    }
  };

  const finishStacks = () => {
    const depths = [...new Set(inHand.map((p) => Math.round(Number(stacks[p.seat]) / stakes.bb)))];
    const entry = { text: depths.length === 1 ? `Everyone ${depths[0]} bb deep` : 'Stacks set' };
    if (isCoach) {
      // Every player starts with a neutral profile unless one was already set.
      const withDefaults = Object.fromEntries(inHand.map((p) => [p.seat, profiles[p.seat] ?? defaultProfile()]));
      advance({ step: 'traits', profiles: withDefaults }, entry);
    } else {
      advance({ step: 'heroCards' }, entry);
    }
  };

  const startAction = () => {
    const players = inHand.map(({ seat, position, role, name }) => ({ seat, position, role, name, stack: Number(stacks[seat]) }));
    const known = villainSeats.filter((s) => cards[s]?.length === 2).length;
    advance(
      { hand: createHand({ players, positions, sb: stakes.sb, bb: stakes.bb }), step: 'action' },
      { text: known ? `${known} villain ${known === 1 ? 'hand' : 'hands'} known` : 'Villain cards unknown', role: 'villain' }
    );
  };

  const handleAction = (action) => {
    const actor = currentPlayer(hand);
    if (!actor) return;
    const next = applyAction(hand, action);
    const logged = next.streets[next.streets.length - 1].actions.at(-1);
    const isHero = actor.role === 'hero';
    const who = isHero ? 'You' : actor.position;
    const amount = logged.amount ? ` ${formatMoney(logged.amount, { sign: false, bb: stakes.bb })}` : '';
    let text = `${who} ${isHero ? secondPerson(logged.verb) : logged.verb}${amount}`;
    if (logged.allIn) {
      const verb = logged.verb === 'calls' ? (isHero ? 'call' : 'calls') : isHero ? 'go' : 'goes';
      text = `${who} ${verb} all in for${amount}`;
    }
    const entry = { text, role: actor.role, allIn: logged.allIn };

    if (next.phase === 'result' && next.uncontestedWinner !== undefined) {
      advance({ hand: next, winners: [next.uncontestedWinner], step: finalStep }, entry);
    } else if (next.phase === 'result') {
      advance({ hand: next, winners: showdownWinners(next, cards) ?? [], step: 'result' }, entry);
    } else {
      advance({ hand: next, step: next.phase === 'board' ? 'board' : 'action' }, entry);
    }
  };

  // Deal a street. If nobody can bet any more (all-in), go straight to the next card or the showdown.
  const handleDeal = (codes) => {
    const next = dealBoard(hand, codes);
    const entry = { text: nextStreet(hand), cards: codes };
    if (next.phase === 'result') advance({ hand: next, winners: showdownWinners(next, cards) ?? [], step: 'result' }, entry);
    else advance({ hand: next, step: next.phase }, entry);
  };

  const revealCards = (seat, codes) => {
    const nextCards = { ...cards, [seat]: codes };
    edit({ cards: nextCards, winners: showdownWinners(hand, nextCards) ?? winners });
  };

  const finishShowdown = () => {
    const text = winners.length > 1 ? 'Split pot' : `${nameOf(winners[0])} won ${formatMoney(hand.pot, { sign: false, bb: stakes.bb })}`;
    advance({ step: finalStep }, { text, role: winners.includes(heroSeat) ? 'hero' : 'villain' });
  };

  const handleSave = async (details) => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(buildPayload(details));
    } catch (err) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  // ----- The question for the current step -----

  let prompt = null;
  if (step === 'game') {
    prompt = (
      <GamePrompt
        stakesLabel={wizard.stakesLabel}
        tableSize={wizard.tableSize}
        onContinue={(label, size) =>
          advance(
            { stakesLabel: label, tableSize: size, heroSeat: null, villainSeats: [], cards: {}, profiles: {}, step: 'hero' },
            { text: `${label} · ${size}-max` }
          )
        }
      />
    );
  } else if (step === 'hero' || step === 'villains') {
    prompt = (
      <SeatPickPrompt
        mode={step}
        positions={positions}
        heroSeat={heroSeat}
        villainSeats={villainSeats}
        onPick={handleSeatClick}
        onContinue={() => {
          // Everyone starts at 100 big blinds unless a stack was already entered.
          const defaults = Object.fromEntries([heroSeat, ...villainSeats].map((seat) => [seat, stacks[seat] ?? String(stakes.bb * 100)]));
          advance({ step: 'stacks', stacks: defaults }, { text: `Villains: ${villainSeats.map((s) => positions[s]).join(', ')}`, role: 'villain' });
        }}
      />
    );
  } else if (step === 'stacks') {
    prompt = (
      <StacksPrompt
        players={inHand}
        stacks={stacks}
        bb={stakes.bb}
        onChange={(seat, value) => edit({ stacks: { ...stacks, [seat]: value } })}
        onSetAll={(amount) => edit({ stacks: Object.fromEntries(inHand.map((p) => [p.seat, String(amount)])) })}
        onContinue={finishStacks}
      />
    );
  } else if (step === 'traits') {
    prompt = (
      <TraitsPrompt
        players={inHand}
        profiles={profiles}
        onChange={(seat, profile) => edit({ profiles: { ...profiles, [seat]: profile } })}
        onContinue={() => {
          const reads = inHand.filter((p) => p.role === 'villain').map((p) => `${p.position} ${describeProfile(profiles[p.seat]).label}`);
          advance({ step: 'heroCards' }, { text: `Reads: ${reads.join(', ')}`, role: 'villain' });
        }}
      />
    );
  } else if (step === 'heroCards') {
    prompt = (
      <CardsPrompt
        mode="hero"
        players={inHand}
        used={usedCards}
        onHeroCards={(codes) => advance({ cards: { ...cards, [heroSeat]: codes }, step: 'villainCards' }, { text: 'Your hand', cards: codes, role: 'hero' })}
      />
    );
  } else if (step === 'villainCards') {
    prompt = (
      <CardsPrompt
        mode="villains"
        players={inHand}
        used={usedCards}
        onSetCards={(seat, codes) => edit({ cards: { ...cards, [seat]: codes } })}
        onContinue={startAction}
      />
    );
  } else if (step === 'action' && currentPlayer(hand)) {
    // (Guarded: the action step only renders while someone is actually on the clock.)
    prompt = (
      <ActionPrompt
        hand={hand}
        playerName={nameOf(currentPlayer(hand).seat)}
        onAction={handleAction}
        onSkipToEnd={() => advance({ step: finalStep, winners: [] }, { text: 'Skipped the rest of the hand' })}
      />
    );
  } else if (step === 'board') {
    const street = nextStreet(hand);
    prompt = <BoardPrompt street={street} count={BOARD_CARDS[street]} used={usedCards} onDeal={handleDeal} />;
  } else if (step === 'result') {
    const live = inHand.filter((p) => !hand.players.find((hp) => hp.seat === p.seat).folded);
    prompt = (
      <ResultPrompt
        players={live}
        board={hand.board}
        winners={winners}
        suggested={showdownWinners(hand, cards)}
        used={usedCards}
        onToggleWinner={(seat) => edit({ winners: winners.includes(seat) ? winners.filter((s) => s !== seat) : [...winners, seat] })}
        onReveal={revealCards}
        onContinue={finishShowdown}
      />
    );
  } else if (step === 'details') {
    prompt = (
      <DetailsPrompt
        defaultTitle={defaultTitle()}
        initial={initialDetails}
        result={heroResult(hand, winners)}
        pot={hand.pot}
        bb={stakes.bb}
        saving={saving}
        error={saveError}
        onSave={handleSave}
      />
    );
  } else if (step === 'analyze') {
    prompt = (
      <AnalyzePrompt
        result={heroResult(hand, winners)}
        pot={hand.pot}
        bb={stakes.bb}
        decisions={hand.streets.reduce((n, s) => n + s.actions.filter((a) => a.actor === 'Hero').length, 0)}
        onAnalyze={() => onAnalyze({ record: buildRecord(), payload: buildPayload({ title: defaultTitle() }) })}
      />
    );
  }

  // ----- Table view -----

  const seats = positions.map((position, seat) => {
    const role = seat === heroSeat ? 'hero' : villainSeats.includes(seat) ? 'villain' : null;
    const player = hand?.players.find((p) => p.seat === seat);
    return {
      seat,
      position,
      role,
      name: role ? nameOf(seat) : null,
      cards: cards[seat] ?? [],
      // Coach mode shows each player's read (e.g. "LAG", "Tilted") on their seat.
      badge:
        isCoach && role && profiles[seat] && (role === 'villain' || describeProfile(profiles[seat]).label !== 'Unknown')
          ? describeProfile(profiles[seat]).label
          : null,
      // Before the action starts show the starting stack; during it, what's left behind.
      stack: player ? player.stack - player.invested : role && Number(stacks[seat]) > 0 ? Number(stacks[seat]) : null,
      allIn: player?.allIn,
      folded: player?.folded,
      bet: player?.streetBet ?? 0,
      lastAction: player?.lastAction,
      isActive: step === 'action' && hand?.queue[0] === seat,
      isWinner: (step === 'details' || step === 'analyze') && winners.includes(seat),
    };
  });

  return (
    <div className="hand-recorder">
      <div className="hand-recorder-table">
        <PokerTable
          seats={seats}
          bb={stakes.bb}
          board={hand?.board ?? []}
          pot={hand?.pot ?? 0}
          rotation={heroSeat ?? 0}
          selectable={step === 'hero' || step === 'villains' ? step : null}
          onSeatClick={handleSeatClick}
        />
      </div>

      <div className="hand-recorder-panel">
        <PromptCarousel
          stepKey={`${step}-${history.length}`}
          direction={direction}
          previous={wizard.log[wizard.log.length - 1]}
          canUndo={history.length > 0 && !saving}
          onUndo={undo}
        >
          {prompt}
        </PromptCarousel>

        {/* Everything recorded so far */}
        {wizard.log.length > 0 && (
          <details className="hand-recorder-log">
            <summary>Hand so far ({wizard.log.length} steps)</summary>
            <p className="hand-recorder-log-hint">Tap a step to go back and change it.</p>
            <ol>
              {wizard.log.map((entry, index) => (
                <li key={index}>
                  <button type="button" className="hand-recorder-log-step" disabled={saving} onClick={() => jumpTo(index)}>
                    <LogEntry entry={entry} />
                    <Icon name="pencil" size={14} className="hand-recorder-log-edit" />
                  </button>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </div>
  );
}
