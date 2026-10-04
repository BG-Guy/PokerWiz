// Hand recorder: rebuild a hand on a poker table, one question at a time. Used by Add Hand ("record"), by
// editing a saved hand (record mode started from the replayed hand, see restoreHand.js), and by Coach mode
// ("coach"), which adds a player-traits step and ends with an analysis instead of saving.
// Flow: game -> hero seat -> villains -> stacks -> [traits] -> hero cards -> villain cards -> action
// (street by street, dealing the board between streets) -> showdown -> details (save) or analyze.
// Every answer is pushed onto a history stack, so Undo steps back exactly one question, and tapping a step in
// "Hand so far" goes back to just before it.
import { useState } from 'react';
import { STAKES, TABLE_POSITIONS } from '../../constants/poker.js';
import { RANKS } from '../../utils/cards.js';
import { todayIso } from '../../utils/format.js';
import { defaultProfile, describeProfile } from '../../coach/profiles.js';
import { PLAYER_READS } from '../../gto/config.js';
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
import { BOARD_CARDS, autoTags, createHand, currentPlayer, heroResult, nextStreet, showdownWinners } from '../../utils/handEngine.js';
import {
  actionStep,
  dealStep,
  gameEntry,
  heroCardsEntry,
  heroSeatEntry,
  seatName,
  showdownEntry,
  stacksEntry,
  startEntry,
  villainsEntry,
  INITIAL_WIZARD,
} from './recorderSteps.js';
import './HandRecorder.css';


// "AKs", "QQ", "K9o"
function shorthand(cards) {
  const [high, low] = [...cards].sort((a, b) => RANKS.indexOf(b[0]) - RANKS.indexOf(a[0]));
  if (high[0] === low[0]) return high[0] + low[0];
  return high[0] + low[0] + (high[1] === low[1] ? 's' : 'o');
}

// mode: 'record' | 'coach'
// onSave(payload) -> Promise   (record mode: persist the hand; reject with an Error to show a message)
// onAnalyze({ record, payload }) (coach mode: hand the finished hand to the coach)
// Editing a saved hand: initial = { wizard, history } (restoreHand.js), initialDetails = the hand's title,
// verdict, note, rating and tilt for the last step, and saveLabel for its button.
export default function HandRecorder({ mode = 'record', initialStakesLabel, initial = null, initialDetails = null, saveLabel, onSave, onAnalyze }) {
  const isCoach = mode === 'coach';
  const [wizard, setWizard] = useState(
    () =>
      initial?.wizard ?? {
        ...INITIAL_WIZARD,
        stakesLabel: STAKES.some((s) => s.label === initialStakesLabel) ? initialStakesLabel : INITIAL_WIZARD.stakesLabel,
      }
  );
  const [history, setHistory] = useState(initial?.history ?? []);
  const [direction, setDirection] = useState('forward');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const { step, hand, heroSeat, villainSeats, stacks, profiles, cards, winners } = wizard;
  const positions = TABLE_POSITIONS[wizard.tableSize];
  // Stakes from the list, or a saved hand's own stakes when they aren't in it.
  const stakes = STAKES.find((s) => s.label === wizard.stakesLabel) ?? wizard.customStakes;
  const nameOf = (seat) => seatName(seat, heroSeat, villainSeats);
  const usedCards = [...Object.values(cards).flat(), ...(hand?.board ?? [])];
  const finalStep = isCoach ? 'analyze' : 'details';

  // Move to the next question: remember the current state for Undo and log the answer. Each log line keeps
  // where it sits in the history (at), so tapping it can go back to just before it.
  const advance = (changes, entry) => {
    const at = history.length;
    setHistory((h) => [...h, wizard]);
    setWizard((w) => ({ ...w, ...changes, log: entry ? [...w.log, { ...entry, at }] : w.log }));
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
  // Go back to just before a logged step, to answer it again (everything after it is redone from there).
  const rewindTo = (at) => {
    if (at === undefined || at >= history.length) return;
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
      advance({ heroSeat: seat, villainSeats: villainSeats.filter((s) => s !== seat), step: 'villains' }, heroSeatEntry(positions[seat]));
    } else if (step === 'villains' && seat !== heroSeat) {
      edit({ villainSeats: villainSeats.includes(seat) ? villainSeats.filter((s) => s !== seat) : [...villainSeats, seat] });
    }
  };

  const finishStacks = () => {
    const entry = stacksEntry(inHand.map((p) => stacks[p.seat]), stakes.bb);
    if (isCoach && PLAYER_READS) {
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
    advance({ hand: createHand({ players, positions, sb: stakes.sb, bb: stakes.bb }), step: 'action' }, startEntry(known));
  };

  const handleAction = (action) => {
    if (!currentPlayer(hand)) return;
    const { next, entry, step: nextStep, winners: ended } = actionStep(hand, action, { bb: stakes.bb, cards, finalStep });
    advance({ hand: next, step: nextStep, ...(ended ? { winners: ended } : {}) }, entry);
  };

  // Deal a street. If nobody can bet any more (all-in), go straight to the next card or the showdown.
  const handleDeal = (codes) => {
    const { next, entry, step: nextStep, winners: ended } = dealStep(hand, codes, cards);
    advance({ hand: next, step: nextStep, ...(ended ? { winners: ended } : {}) }, entry);
  };

  const revealCards = (seat, codes) => {
    const nextCards = { ...cards, [seat]: codes };
    edit({ cards: nextCards, winners: showdownWinners(hand, nextCards) ?? winners });
  };

  const finishShowdown = () => {
    advance({ step: finalStep }, showdownEntry(winners, hand, heroSeat, nameOf, stakes.bb));
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
          advance({ stakesLabel: label, tableSize: size, heroSeat: null, villainSeats: [], cards: {}, profiles: {}, step: 'hero' }, gameEntry(label, size))
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
          advance({ step: 'stacks', stacks: defaults }, villainsEntry(villainSeats.map((s) => positions[s])));
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
        onHeroCards={(codes) => advance({ cards: { ...cards, [heroSeat]: codes }, step: 'villainCards' }, heroCardsEntry(codes))}
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
        saveLabel={saveLabel}
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
        PLAYER_READS && isCoach && role && profiles[seat] && (role === 'villain' || describeProfile(profiles[seat]).label !== 'Unknown')
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

        {/* Everything recorded so far; tap a step to go back and answer it again */}
        {wizard.log.length > 0 && (
          <details className="hand-recorder-log" open={Boolean(initial)}>
            <summary>
              Hand so far ({wizard.log.length} steps) <span className="hand-recorder-log-hint">Tap a step to change it</span>
            </summary>
            <ol>
              {wizard.log.map((entry, index) => (
                <li key={index}>
                  {entry.at !== undefined && entry.at < history.length && !saving ? (
                    <button type="button" className="hand-recorder-log-step" onClick={() => rewindTo(entry.at)} title="Go back to this step">
                      <LogEntry entry={entry} />
                      <Icon name="undo" size={14} className="hand-recorder-log-rewind" />
                    </button>
                  ) : (
                    <LogEntry entry={entry} />
                  )}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </div>
  );
}
