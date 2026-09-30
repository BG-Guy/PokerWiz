// Practice mode (/practice): pick a game and a spot, describe your opponents (tendency, skill level, stack),
// then play random spots against them. Villains act on their real cards using the coach's player models;
// you make the decision and the coach grades it the same way it grades your own hands.
import { useEffect, useRef, useState } from 'react';
import { GAMES, generateSpot, recordWithHeroAction } from '../../practice/generateSpot.js';
import { applyLevel, applyPreset, defaultProfile, describeProfile } from '../../coach/profiles.js';
import { formatMoney } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import PokerTable from '../../components/HandRecorder/PokerTable.jsx';
import PromptCarousel from '../../components/HandRecorder/PromptCarousel.jsx';
import ActionPrompt from '../../components/HandRecorder/prompts/ActionPrompt.jsx';
import DecisionCard from '../Coach/DecisionCard.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import PracticeSetup from './PracticeSetup.jsx';
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
  };
}

function loadSetup() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.villains?.length === 2 && saved.hero && GAMES.some((g) => g.id === saved.game)) return saved;
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
        return `${who} ${verb}${a.amount ? ` ${formatMoney(a.amount, { sign: false })}` : ''}`;
      })
      .join(', ');
    return { name: street.name, cards, text: text || (index === state.streets.length - 1 ? 'Your turn to act first' : '') };
  });
}

export default function Practice() {
  const [setup, setSetup] = useState(loadSetup);
  const [phase, setPhase] = useState('setup'); // setup | spot | grading | result
  const [spot, setSpot] = useState(null);
  const [decision, setDecision] = useState(null);
  const [error, setError] = useState(null);
  const [tally, setTally] = useState({ spots: 0, total: 0, best: 0 });
  const [spotNumber, setSpotNumber] = useState(0);
  const workerRef = useRef(null);
  const requestRef = useRef(0);

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
        setPhase('spot');
        return;
      }
      const graded = event.data.report.decisions.at(-1);
      setDecision(graded);
      setTally((t) => ({ spots: t.spots + 1, total: t.total + graded.score, best: t.best + (graded.score >= 97 ? 1 : 0) }));
      setPhase('result');
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const deal = () => {
    const next = generateSpot(setup);
    setError(next ? null : 'Could not find a spot with these settings. Try again or change the stacks.');
    setSpot(next);
    setDecision(null);
    setSpotNumber((n) => n + 1);
    setPhase(next ? 'spot' : 'setup');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const act = (action) => {
    setSpot((s) => ({ ...s, heroAction: action }));
    setPhase('grading');
    requestRef.current += 1;
    workerRef.current.postMessage({ id: requestRef.current, record: recordWithHeroAction(spot, action) });
  };

  if (phase === 'setup') {
    return (
      <div className="practice">
        <PageHeader title="Practice" subtitle="Describe your opponents, then play spots against them and get graded on every decision." />
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
  const reveal = phase === 'result';
  const isTable = spot.record.practice.format === 'preflop';
  const inRecord = new Map(spot.record.players.map((p) => [p.seat, p]));
  const seats = spot.record.positions.map((position, seat) => {
    const player = state.players.find((p) => p.seat === seat);
    const recorded = inRecord.get(seat);
    const role = recorded?.role ?? null;
    return {
      seat,
      position,
      role,
      name: role === 'hero' ? 'You' : null,
      cards: role === 'hero' || (reveal && player && !player.folded) ? cards[seat] : [],
      // Preflop, the whole table shares one read: it's shown once below instead of on every seat.
      badge: role === 'villain' && !isTable ? describeProfile(recorded.profile).label : null,
      stack: player ? player.stack - player.invested : null,
      allIn: player?.allIn,
      folded: player?.folded,
      bet: player?.streetBet ?? 0,
      lastAction: player?.lastAction,
      isActive: !reveal && state.queue[0] === seat,
    };
  });
  const bb = state.bb;
  const heroStackBB = Math.round(((state.players.find((p) => p.seat === heroSeat).stack) / bb) * 10) / 10;

  return (
    <div className="practice">
      <PageHeader title="Practice" subtitle={`Spot ${spotNumber} · ${GAMES.find((g) => g.id === setup.game).label}`}>
        <button type="button" className="btn btn-ghost" onClick={() => setPhase('setup')}>
          <Icon name="chevronLeft" size={16} /> Setup
        </button>
      </PageHeader>

      {tally.spots > 0 && (
        <div className="practice-tally" aria-live="polite">
          <span>
            <strong className="num">{tally.spots}</strong> spots
          </span>
          <span>
            Average <strong className="num">{Math.round(tally.total / tally.spots)}</strong>
          </span>
          <span>
            Best move <strong className="num">{tally.best}</strong>
          </span>
        </div>
      )}

      <div className="hand-recorder">
        <div className="hand-recorder-table">
          <PokerTable seats={seats} board={state.board} pot={state.pot} rotation={heroSeat} />
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
            {isTable && <>Table: {describeProfile(setup.villains[0].profile).label} · </>}
            You started with <span className="num">{heroStackBB} bb</span>
            {state.ante > 0 && <> · Big-blind ante {formatMoney(state.ante, { sign: false })}</>}
          </p>

          {phase === 'spot' && (
            <PromptCarousel stepKey={`spot-${spotNumber}`} direction="forward">
              {error && (
                <p className="practice-error" role="alert">
                  <Icon name="alert" size={16} /> {error}
                </p>
              )}
              <ActionPrompt hand={state} playerName="You" onAction={act} />
            </PromptCarousel>
          )}

          {phase === 'grading' && (
            <div className="coach-thinking" aria-live="polite">
              <span className="coach-thinking-spinner" />
              <p className="coach-thinking-title">Grading your decision</p>
              <p className="coach-thinking-text">Reading their ranges and valuing every option.</p>
            </div>
          )}

          {phase === 'result' && decision && (
            <>
              <DecisionCard decision={decision} number={spotNumber} />
              <div className="practice-next">
                <button type="button" className="btn practice-next-btn" onClick={deal}>
                  Next spot <Icon name="chevronRight" size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
