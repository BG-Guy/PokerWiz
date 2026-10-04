// Practice mode (/practice): pick a game, a spot and the stacks, then play random spots against opponents who
// all play GTO with their real cards (src/gto). From the spot on you play the hand to the end (the next cards
// are random, or picked by you), then the coach grades every decision you made against GTO.
// /practice?hand=<id>&street=Turn replays a saved hand from that street instead (see ReplaySetup).
// Two web workers do the heavy lifting: practice.worker.js plays the opponents (they solve their spots), and
// the coach worker grades the hand when it's over.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getHand } from '../../api/hands.js';
import { replayStreets } from '../../practice/replaySpot.js';
import { GAMES, seenCards, spotRecord } from '../../practice/generateSpot.js';
import { overallAccuracy, accuracyLabel } from '../../coach/grading.js';
import { defaultProfile } from '../../coach/profiles.js';
import { formatMoney, getMoneyUnit } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import PokerTable from '../../components/HandRecorder/PokerTable.jsx';
import PromptCarousel from '../../components/HandRecorder/PromptCarousel.jsx';
import ActionPrompt from '../../components/HandRecorder/prompts/ActionPrompt.jsx';
import BoardPrompt from '../../components/HandRecorder/prompts/BoardPrompt.jsx';
import AccuracyGauge from '../Coach/AccuracyGauge.jsx';
import DecisionCard from '../Coach/DecisionCard.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import PracticeSetup from './PracticeSetup.jsx';
import ReplaySetup from './ReplaySetup.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import '../../components/HandRecorder/HandRecorder.css';
import '../Coach/Coach.css';
import './Practice.css';

const STORAGE_KEY = 'pokerwiz-practice-setup';

function defaultSetup() {
  const stackBB = GAMES[0].defaultStackBB;
  return {
    game: 'cash',
    format: 'hu',
    villains: [{ stackBB }],
    hero: { profile: defaultProfile(), stackBB },
    boardMode: 'random', // next cards: 'random' or 'pick'
  };
}

function loadSetup() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.villains?.length && saved.hero && GAMES.some((g) => g.id === saved.game)) return { boardMode: 'random', ...defaultSetup(), ...saved };
  } catch {
    // no saved setup (or storage blocked): use the default
  }
  return defaultSetup();
}

// "raises to" -> "raise to" for your own actions ("You raise to $5").
const firstPerson = (verb) => verb.replace(/^(\S+?)s\b/, '$1').replace('all in', 'go all in');

// One line per action so far, street by street ("Flop Ks 8d 4c: BB checks, You bet $6").
function actionLines(state) {
  return state.streets.map((street, index) => {
    const cards = index === 0 ? [] : state.board.slice(0, { Flop: 3, Turn: 4, River: 5 }[street.name]).slice(street.name === 'Flop' ? 0 : -1);
    const text = street.actions
      .map((a) => {
        const who = a.actor === 'Hero' ? 'You' : a.actor;
        const verb = a.actor === 'Hero' ? firstPerson(a.verb) : a.verb;
        return `${who} ${verb}${a.amount ? ` ${formatMoney(a.amount, { sign: false, bb: state.bb })}` : ''}`;
      })
      .join(', ');
    return { name: street.name, cards, text: text || (index === state.streets.length - 1 ? 'Your turn to act first' : '') };
  });
}

// How the hand ended, in words.
function outcomeText(spot) {
  const bb = spot.state.bb;
  const amount = formatMoney(Math.abs(spot.result), { sign: false, bb });
  if (spot.heroFolded) return spot.result < 0 ? `You folded and lost ${amount}.` : 'You folded.';
  if (spot.result > 0) return `You won ${amount}${spot.showdown ? ' at showdown' : ''}.`;
  if (spot.result < 0) return `You lost ${amount}${spot.showdown ? ' at showdown' : ''}.`;
  return 'You broke even.';
}

export default function Practice() {
  const [searchParams] = useSearchParams();
  const replayId = searchParams.get('hand');
  const [setup, setSetup] = useState(loadSetup);
  // setup | loading | replay | dealing | play | grading | result
  const [phase, setPhase] = useState(replayId ? 'loading' : 'setup');
  const [replayHand, setReplayHand] = useState(null);
  const [replayOptions, setReplayOptions] = useState(null);
  const [spot, setSpot] = useState(null);
  const [thinking, setThinking] = useState(false); // the opponents are deciding (practice worker busy)
  const [review, setReview] = useState(null); // { accuracy, label, decisions }
  const [progress, setProgress] = useState(null); // what the coach is solving while grading
  const [error, setError] = useState(null);
  const [tally, setTally] = useState({ hands: 0, total: 0, netBB: 0 });
  const [handNumber, setHandNumber] = useState(0);
  const coachRef = useRef(null);
  const coachRequest = useRef(0);
  const practiceRef = useRef(null);
  const practiceRequest = useRef({ id: 0, type: null });
  const firstDecisionRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    } catch {
      // storage blocked: the setup just isn't remembered
    }
  }, [setup]);

  // ----- The opponents' worker: only the latest request's answer counts -----
  const onPracticeMessage = useCallback((event) => {
    const { id, spot: next, error: failure } = event.data;
    if (id !== practiceRequest.current.id) return;
    const { type } = practiceRequest.current;
    setThinking(false);
    if (failure || !next) {
      setError(failure ?? 'Could not find a spot with these settings. Try again or change the stacks.');
      setPhase(type === 'replay' ? 'replay' : type === 'new' ? 'setup' : 'play');
      return;
    }
    setError(null);
    setSpot(next);
    if (type === 'new' || type === 'replay') {
      firstDecisionRef.current = next.firstDecision ?? 0;
      setHandNumber((n) => n + 1);
      setPhase('play');
    }
  }, []);

  const startPracticeWorker = useCallback(() => {
    practiceRef.current?.terminate();
    const worker = new Worker(new URL('../../practice/practice.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = onPracticeMessage;
    practiceRef.current = worker;
  }, [onPracticeMessage]);

  // Send a request to the opponents. A new hand while they're still thinking restarts the worker (instant).
  const send = (message, { restart = false } = {}) => {
    if (!practiceRef.current || (restart && thinking)) startPracticeWorker();
    practiceRequest.current = { id: practiceRequest.current.id + 1, type: message.type };
    setThinking(true);
    practiceRef.current.postMessage({ id: practiceRequest.current.id, ...message });
  };

  // ----- The coach's worker (grading); only the latest request's answer counts -----
  useEffect(() => {
    const worker = new Worker(new URL('../../coach/coach.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      if (event.data.id !== coachRequest.current) return;
      if (event.data.progress) {
        setProgress(event.data.progress);
        return;
      }
      if (event.data.error) {
        setError(event.data.error);
        setPhase('result');
        return;
      }
      const { report } = event.data;
      // Only your decisions from the spot on count (earlier streets were played for you).
      const decisions = report.decisions.slice(firstDecisionRef.current);
      const accuracy = overallAccuracy(decisions.filter((d) => d.graded), report.stakes.bb);
      setReview({ accuracy, label: accuracyLabel(accuracy), decisions });
      setTally((t) => ({ hands: t.hands + 1, total: t.total + (accuracy ?? 0), netBB: t.netBB + report.result / report.stakes.bb }));
      setPhase('result');
    };
    coachRef.current = worker;
    startPracticeWorker();
    return () => {
      worker.terminate();
      practiceRef.current?.terminate();
      practiceRef.current = null;
    };
  }, [startPracticeWorker]);

  // Replay of a saved hand: load it and pick sensible defaults (the street from the link, the real runout).
  useEffect(() => {
    if (!replayId) return undefined;
    let active = true;
    setPhase('loading');
    getHand(replayId)
      .then((hand) => {
        if (!active) return;
        const streets = replayStreets(hand);
        const street = streets.includes(searchParams.get('street')) ? searchParams.get('street') : streets[0];
        if (!street) throw new Error('This hand ended preflop, so there is no street to replay from.');
        const later = (hand.board ?? []).length > { Flop: 3, Turn: 4, River: 5 }[street];
        setReplayHand(hand);
        setReplayOptions({ street, villainCards: 'real', boardMode: later ? 'real' : 'random', profiles: {} });
        setPhase('replay');
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
        setPhase('replay');
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayId]);

  // Picked cards wait for you; otherwise the next street comes by itself after a short beat, so the action
  // can be read (replays use the cards that really came when that's the choice).
  const boardMode = spot?.setup.boardMode ?? setup.boardMode;
  useEffect(() => {
    if (phase !== 'play' || thinking || spot?.status !== 'board' || boardMode === 'pick') return undefined;
    const timer = setTimeout(() => send({ type: 'deal', codes: null }), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, spot, boardMode, thinking]);

  // Hand over: grade it.
  useEffect(() => {
    if (phase !== 'play' || spot?.status !== 'done') return;
    setPhase('grading');
    setProgress(null);
    coachRequest.current += 1;
    coachRef.current.postMessage({ id: coachRequest.current, record: spotRecord(spot), unit: getMoneyUnit(), detail: 'fast' });
  }, [phase, spot]);

  // Next hand, at any point: a hand still being played or graded is dropped (not graded, not counted).
  const deal = () => {
    coachRequest.current += 1; // a grade still on its way belongs to the old hand: ignore it
    setReview(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (replayHand) {
      startReplay();
      return;
    }
    setPhase('dealing');
    send({ type: 'new', setup }, { restart: true });
  };

  // Start (or restart) a replay: villains dealt from their range get new cards each time.
  function startReplay() {
    coachRequest.current += 1; // drop any grade still coming for the previous run
    setError(null);
    setReview(null);
    setPhase('dealing');
    send({ type: 'replay', hand: replayHand, options: replayOptions }, { restart: true });
  }

  if (phase === 'loading') return <LoadState />;

  if (phase === 'replay') {
    return (
      <div className="practice">
        <PageHeader title="Replay" subtitle="Take a hand from any street and play it differently." />
        {error && (
          <p className="practice-error" role="alert">
            <Icon name="alert" size={16} /> {error}
          </p>
        )}
        {replayHand && replayOptions && <ReplaySetup hand={replayHand} options={replayOptions} onChange={setReplayOptions} onStart={startReplay} />}
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div className="practice">
        <PageHeader title="Practice" subtitle="Play spots against opponents who all play GTO, and get graded on every decision." />
        {error && (
          <p className="practice-error" role="alert">
            <Icon name="alert" size={16} /> {error}
          </p>
        )}
        <PracticeSetup setup={setup} onChange={setSetup} onStart={deal} />
      </div>
    );
  }

  if (phase === 'dealing' || !spot) {
    return (
      <div className="practice">
        <PageHeader title={replayHand ? 'Replay' : 'Practice'} subtitle={replayHand ? replayHand.title : 'Dealing a hand'}>
          <button type="button" className="btn btn-ghost" onClick={() => setPhase(replayHand ? 'replay' : 'setup')}>
            <Icon name="chevronLeft" size={16} /> Setup
          </button>
        </PageHeader>
        <div className="coach-thinking" aria-live="polite">
          <span className="coach-thinking-spinner" />
          <p className="coach-thinking-title">Dealing</p>
          <p className="coach-thinking-text">The GTO players are playing the hand up to your spot. Postflop spots are solved on the way, so this can take a few seconds.</p>
        </div>
      </div>
    );
  }

  const { state, cards, heroSeat } = spot;
  const reveal = phase === 'grading' || phase === 'result';
  const inHand = new Map(spot.players.map((p) => [p.seat, p]));
  const winners = new Set(spot.winners ?? []);
  const seats = spot.positions.map((position, seat) => {
    const player = state.players.find((p) => p.seat === seat);
    const recorded = inHand.get(seat);
    const role = recorded?.role ?? null;
    return {
      seat,
      position,
      role,
      name: role === 'hero' ? 'You' : null,
      // Once the hand is over every hand is shown, including the ones that folded (dimmed on the table).
      cards: role === 'hero' || (reveal && player) ? cards[seat] ?? [] : [],
      revealFolded: reveal,
      badge: null,
      stack: player ? player.stack - player.invested : null,
      allIn: player?.allIn,
      folded: player?.folded,
      bet: player?.streetBet ?? 0,
      lastAction: player?.lastAction,
      isActive: phase === 'play' && spot.status === 'hero' && !thinking && state.queue[0] === seat,
      isWinner: reveal && winners.has(seat),
    };
  });
  const bb = state.bb;
  const replay = spot.replay ?? null;
  const heroStackBB = Math.round((state.players.find((p) => p.seat === heroSeat).stack / bb) * 10) / 10;

  return (
    <div className={`practice ${phase === 'result' ? 'has-next-bar' : ''}`}>
      <PageHeader
        title={replay ? 'Replay' : 'Practice'}
        subtitle={replay ? `${replay.title} · from the ${replay.street.toLowerCase()}` : `Hand ${handNumber} · ${spot.game.label}`}
      >
        <button type="button" className="btn btn-ghost" onClick={() => setPhase(replay ? 'replay' : 'setup')}>
          <Icon name="chevronLeft" size={16} /> Setup
        </button>
        {/* Every hand can be left for the next one; once it's over, the pinned bar below takes over */}
        {phase !== 'result' && (
          <button type="button" className="btn btn-ghost practice-skip" onClick={deal}>
            {replay ? 'Replay again' : 'Next hand'} <Icon name="chevronRight" size={16} />
          </button>
        )}
      </PageHeader>

      {tally.hands > 0 && (
        <div className="practice-tally" aria-live="polite">
          <span>
            <strong className="num">{tally.hands}</strong> {tally.hands === 1 ? 'hand' : 'hands'}
          </span>
          <span>
            Average accuracy <strong className="num">{Math.round(tally.total / tally.hands)}%</strong>
          </span>
          <span>
            Net{' '}
            <strong className="num">
              {tally.netBB >= 0 ? '+' : ''}
              {Math.round(tally.netBB * 10) / 10} bb
            </strong>
          </span>
        </div>
      )}

      <div className="hand-recorder">
        <div className="hand-recorder-table">
          <PokerTable seats={seats} board={state.board} pot={state.pot} bb={state.bb} rotation={heroSeat} />
        </div>

        <div className="hand-recorder-panel">
          <ol className="practice-log">
            {actionLines(state).map((line) => (
              <li key={line.name}>
                <span className="practice-log-street">
                  {line.name}
                  {line.cards.length > 0 && (
                    <span className="practice-log-cards">
                      {line.cards.map((code) => (
                        <PlayingCard key={code} code={code} size="xs" />
                      ))}
                    </span>
                  )}
                </span>
                <span className="practice-log-text">{line.text || 'Nobody has acted yet'}</span>
              </li>
            ))}
          </ol>
          <p className="practice-stacks">
            Opponents play GTO · You started with <span className="num">{heroStackBB} bb</span>
            {state.ante > 0 && <> · Big-blind ante {formatMoney(state.ante, { sign: false, bb: state.bb })}</>}
          </p>

          {phase === 'play' && thinking && (
            <p className="practice-dealing" aria-live="polite">
              <span className="coach-thinking-spinner is-small" /> Opponents are thinking...
            </p>
          )}

          {phase === 'play' && !thinking && spot.status === 'hero' && (
            <PromptCarousel stepKey={`hand-${handNumber}-${state.streets.length}-${state.streets.at(-1).actions.length}`} direction="forward">
              <ActionPrompt hand={state} playerName="You" onAction={(action) => send({ type: 'act', action })} />
            </PromptCarousel>
          )}

          {phase === 'play' && !thinking && spot.status === 'board' && boardMode === 'pick' && (
            <PromptCarousel stepKey={`board-${handNumber}-${spot.street}`} direction="forward">
              <BoardPrompt street={spot.street} count={spot.count} used={seenCards(spot)} onDeal={(codes) => send({ type: 'deal', codes })} />
              <button type="button" className="btn btn-ghost practice-random-card" onClick={() => send({ type: 'deal', codes: null })}>
                <Icon name="cards" size={16} /> Deal {spot.count === 1 ? 'a random card' : 'random cards'}
              </button>
            </PromptCarousel>
          )}

          {phase === 'play' && !thinking && spot.status === 'board' && boardMode !== 'pick' && (
            <p className="practice-dealing" aria-live="polite">
              Dealing the {spot.street.toLowerCase()}...
            </p>
          )}

          {phase === 'grading' && (
            <div className="coach-thinking" aria-live="polite">
              <span className="coach-thinking-spinner" />
              <p className="coach-thinking-title">Grading your decisions</p>
              <p className="coach-thinking-text">{progress ? `${progress}...` : 'Comparing every decision with GTO.'}</p>
            </div>
          )}

          {phase === 'result' && (
            <>
              <section className="practice-summary">
                {review && <AccuracyGauge value={review.accuracy ?? 0} label={review.label} />}
                <div className="practice-summary-text">
                  <span className="practice-summary-kicker">Hand over</span>
                  <p className={`practice-summary-outcome ${spot.result > 0 ? 'is-win' : spot.result < 0 ? 'is-loss' : ''}`}>{outcomeText(spot)}</p>
                  {replay && replay.realResult != null && (
                    <p className="practice-summary-detail">
                      In the real hand: {replay.realResult > 0 ? 'you won' : replay.realResult < 0 ? 'you lost' : 'you broke even'}
                      {replay.realResult !== 0 && ` ${formatMoney(Math.abs(replay.realResult), { sign: false, bb })}`}.
                      {Object.values(replay.dealtFrom).includes('range') && ' Villains dealt from their range get new cards on every replay.'}
                    </p>
                  )}
                  {review && (
                    <p className="practice-summary-detail">
                      {review.decisions.length} {review.decisions.length === 1 ? 'decision' : 'decisions'} graded against GTO. Results vary with the cards; the grade is about the
                      decisions.
                    </p>
                  )}
                </div>
              </section>
              {error && (
                <p className="practice-error" role="alert">
                  <Icon name="alert" size={16} /> {error}
                </p>
              )}
              {review?.decisions.map((decision, index) => (
                <DecisionCard key={index} decision={decision} number={index + 1} bb={state.bb} />
              ))}
              {/* Pinned to the bottom of the screen (above the phone tab bar), so it never needs a scroll */}
              <div className="practice-next">
                {replay && (
                  <Link to={`/hands/${replay.handId}`} className="btn btn-ghost">
                    <Icon name="chevronLeft" size={16} /> Back to the hand
                  </Link>
                )}
                <button type="button" className="btn practice-next-btn" onClick={deal}>
                  {replay ? 'Replay again' : 'Next hand'} <Icon name="chevronRight" size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
