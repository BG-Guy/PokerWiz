// Practice mode (/practice): pick a game and a spot, describe your opponents (tendency, skill level, stack),
// then play random spots against them. Villains act on their real cards using the coach's player models.
// From the spot on you play the hand to the end (the next cards are random, or picked by you), then the
// coach grades every decision you made, the same way it grades your own hands.
// /practice?hand=<id>&street=Turn replays a saved hand from that street instead (see ReplaySetup).
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getHand } from '../../api/hands.js';
import { replayStreets, spotFromSavedHand } from '../../practice/replaySpot.js';
import { GAMES, generateSpot, heroAct, dealStreet, seenCards, spotRecord } from '../../practice/generateSpot.js';
import { overallAccuracy, accuracyLabel } from '../../coach/grading.js';
import { applyLevel, applyPreset, defaultProfile, describeProfile } from '../../coach/profiles.js';
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
    villains: [
      { profile: applyLevel(applyPreset(defaultProfile(), 'fish'), 'rec'), stackBB },
      { profile: applyLevel(applyPreset(defaultProfile(), 'tag'), 'regular'), stackBB },
    ],
    hero: { profile: defaultProfile(), stackBB },
    boardMode: 'random', // next cards: 'random' or 'pick'
  };
}

function loadSetup() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.villains?.length === 2 && saved.hero && GAMES.some((g) => g.id === saved.game)) return { boardMode: 'random', ...saved };
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
  const [phase, setPhase] = useState(replayId ? 'loading' : 'setup'); // setup | loading | replay | play | grading | result
  const [replayHand, setReplayHand] = useState(null);
  const [replayOptions, setReplayOptions] = useState(null);
  const [spot, setSpot] = useState(null);
  const [review, setReview] = useState(null); // { accuracy, label, decisions }
  const [error, setError] = useState(null);
  const [tally, setTally] = useState({ hands: 0, total: 0, netBB: 0 });
  const [handNumber, setHandNumber] = useState(0);
  const workerRef = useRef(null);
  const requestRef = useRef(0);
  const firstDecisionRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    } catch {
      // storage blocked: the setup just isn't remembered
    }
  }, [setup]);

  // The coach runs in a worker; only the latest request's answer counts.
  useEffect(() => {
    const worker = new Worker(new URL('../../coach/coach.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      if (event.data.id !== requestRef.current) return;
      if (event.data.error) {
        setError(event.data.error);
        setPhase('result');
        return;
      }
      const { report } = event.data;
      // Only your decisions from the spot on count (earlier streets were played for you).
      const decisions = report.decisions.slice(firstDecisionRef.current);
      const accuracy = overallAccuracy(decisions, report.stakes.bb);
      setReview({ accuracy, label: accuracyLabel(accuracy), decisions });
      setTally((t) => ({ hands: t.hands + 1, total: t.total + (accuracy ?? 0), netBB: t.netBB + report.result / report.stakes.bb }));
      setPhase('result');
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

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
    if (phase !== 'play' || spot?.status !== 'board' || boardMode === 'pick') return undefined;
    const timer = setTimeout(() => setSpot((s) => (s?.status === 'board' ? dealStreet(s) : s)), 700);
    return () => clearTimeout(timer);
  }, [phase, spot, boardMode]);

  // Hand over: grade it.
  useEffect(() => {
    if (phase !== 'play' || spot?.status !== 'done') return;
    setPhase('grading');
    requestRef.current += 1;
    workerRef.current.postMessage({ id: requestRef.current, record: spotRecord(spot), unit: getMoneyUnit() });
  }, [phase, spot]);

  const deal = () => {
    if (replayHand) {
      startReplay();
      return;
    }
    const next = generateSpot(setup);
    setError(next ? null : 'Could not find a spot with these settings. Try again or change the stacks.');
    setSpot(next);
    setReview(null);
    firstDecisionRef.current = next?.firstDecision ?? 0;
    setHandNumber((n) => n + 1);
    setPhase(next ? 'play' : 'setup');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Start (or restart) a replay: villains dealt from their range get new cards each time.
  function startReplay() {
    const next = spotFromSavedHand(replayHand, replayOptions);
    if (next.error) {
      setError(next.error);
      setPhase('replay');
      return;
    }
    setError(null);
    setSpot(next);
    setReview(null);
    firstDecisionRef.current = next.firstDecision;
    setHandNumber((n) => n + 1);
    setPhase('play');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        <PageHeader title="Practice" subtitle="Describe your opponents, then play hands against them and get graded on every decision." />
        {error && (
          <p className="practice-error" role="alert">
            <Icon name="alert" size={16} /> {error}
          </p>
        )}
        <PracticeSetup setup={setup} onChange={setSetup} onStart={deal} />
      </div>
    );
  }

  const { state, cards, heroSeat } = spot;
  const reveal = phase === 'grading' || phase === 'result';
  const isTable = spot.setup.format === 'preflop';
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
      cards: role === 'hero' || (reveal && player) ? cards[seat] : [],
      revealFolded: reveal,
      // Preflop, the whole table shares one read: it's shown once below instead of on every seat.
      badge: role === 'villain' && !isTable ? describeProfile(recorded.profile).label : null,
      stack: player ? player.stack - player.invested : null,
      allIn: player?.allIn,
      folded: player?.folded,
      bet: player?.streetBet ?? 0,
      lastAction: player?.lastAction,
      isActive: phase === 'play' && spot.status === 'hero' && state.queue[0] === seat,
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
            {isTable && <>Table: {describeProfile(spot.setup.villains[0].profile).label} · </>}
            You started with <span className="num">{heroStackBB} bb</span>
            {state.ante > 0 && <> · Big-blind ante {formatMoney(state.ante, { sign: false, bb: state.bb })}</>}
          </p>

          {phase === 'play' && spot.status === 'hero' && (
            <PromptCarousel stepKey={`hand-${handNumber}-${state.streets.length}-${state.streets.at(-1).actions.length}`} direction="forward">
              <ActionPrompt hand={state} playerName="You" onAction={(action) => setSpot(heroAct(spot, action))} />
            </PromptCarousel>
          )}

          {phase === 'play' && spot.status === 'board' && boardMode === 'pick' && (
            <PromptCarousel stepKey={`board-${handNumber}-${spot.street}`} direction="forward">
              <BoardPrompt street={spot.street} count={spot.count} used={seenCards(spot)} onDeal={(codes) => setSpot(dealStreet(spot, codes))} />
              <button type="button" className="btn btn-ghost practice-random-card" onClick={() => setSpot(dealStreet(spot))}>
                <Icon name="cards" size={16} /> Deal {spot.count === 1 ? 'a random card' : 'random cards'}
              </button>
            </PromptCarousel>
          )}

          {phase === 'play' && spot.status === 'board' && boardMode !== 'pick' && (
            <p className="practice-dealing" aria-live="polite">
              Dealing the {spot.street.toLowerCase()}...
            </p>
          )}

          {phase === 'grading' && (
            <div className="coach-thinking" aria-live="polite">
              <span className="coach-thinking-spinner" />
              <p className="coach-thinking-title">Grading your decisions</p>
              <p className="coach-thinking-text">Reading their ranges and valuing every option.</p>
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
                      {review.decisions.length} {review.decisions.length === 1 ? 'decision' : 'decisions'} graded. Results vary with the cards; the grade is about the decisions.
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
