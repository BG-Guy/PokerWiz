// Equity Calculator: pick hands for 2-6 players and an optional board; see each hand's chance to win.
// Results recalculate automatically in a web worker whenever the cards change.
import { useEffect, useRef, useState } from 'react';
import { describeHand } from '../../utils/handEvaluator.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import CardSlot from '../../components/CardSlot/CardSlot.jsx';
import CardPicker from '../../components/CardPicker/CardPicker.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import PlayerHandRow from './PlayerHandRow.jsx';
import './Equity.css';

const MAX_PLAYERS = 6;
const ITERATIONS = 40000;
const STREET_BY_BOARD = { 0: 'Preflop', 3: 'Flop', 4: 'Turn', 5: 'River' };

let nextPlayerId = 1;
const newPlayer = () => ({ id: nextPlayerId++, cards: [] });

// Why the inputs can't be calculated yet (or null when they can).
function blockingReason(players, board) {
  if (players.some((p) => p.cards.length === 1)) return 'Each player needs two cards, or none for a random hand.';
  if (!players.some((p) => p.cards.length === 2)) return 'Pick cards for at least one player to see equity.';
  if (board.length === 1 || board.length === 2) return 'The board needs at least three cards (the flop).';
  return null;
}

export default function Equity() {
  const [players, setPlayers] = useState(() => [newPlayer(), newPlayer()]);
  const [board, setBoard] = useState([]);
  const [pickerTarget, setPickerTarget] = useState(null); // 'board' | player index | null
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const workerRef = useRef(null);
  const requestRef = useRef(0);

  // One worker for the page's lifetime; ignore replies to outdated requests.
  useEffect(() => {
    const worker = new Worker(new URL('./equity.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      if (event.data.id !== requestRef.current) return;
      setResult(event.data);
      setRunning(false);
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const reason = blockingReason(players, board);

  // Recalculate shortly after the cards change (debounced so rapid picks don't queue work).
  useEffect(() => {
    if (reason) {
      setResult(null);
      setRunning(false);
      return undefined;
    }
    const id = ++requestRef.current;
    setRunning(true);
    const timer = setTimeout(() => {
      workerRef.current?.postMessage({ id, players: players.map((p) => p.cards), board, iterations: ITERATIONS });
    }, 150);
    return () => clearTimeout(timer);
  }, [players, board, reason]);

  const usedCards = [...players.flatMap((p) => p.cards), ...board];
  const results = result?.results.length === players.length ? result.results : null;
  const leaderEquity = results ? Math.max(...results.map((r) => r.equity)) : null;

  // Save cards chosen in the picker to the board or to a player.
  const handlePicked = (codes) => {
    if (pickerTarget === 'board') setBoard(codes);
    else setPlayers((list) => list.map((p, i) => (i === pickerTarget ? { ...p, cards: codes } : p)));
    setPickerTarget(null);
  };

  const resetAll = () => {
    setPlayers([newPlayer(), newPlayer()]);
    setBoard([]);
  };

  return (
    <div className="equity">
      <PageHeader title="Equity Calculator" subtitle="How often does each hand win? Leave a hand empty to play a random one.">
        <button type="button" className="btn btn-ghost" onClick={resetAll}>
          <Icon name="undo" size={16} /> Reset
        </button>
      </PageHeader>

      <div className="equity-layout">
        {/* Board on felt */}
        <section className="equity-board">
          <div className="equity-board-head">
            <span className="equity-board-street">{STREET_BY_BOARD[board.length] ?? 'Board'}</span>
            {board.length > 0 && (
              <button type="button" className="equity-board-clear" onClick={() => setBoard([])}>
                Clear board
              </button>
            )}
          </div>
          <div className="equity-board-cards">
            {[0, 1, 2, 3, 4].map((slot) => (
              <CardSlot key={slot} code={board[slot]} size="lg" label={`Board card ${slot + 1}`} onClick={() => setPickerTarget('board')} />
            ))}
          </div>
        </section>

        {/* Players */}
        <section className="equity-players">
          <ul className="equity-player-list">
            {players.map((player, index) => (
              <PlayerHandRow
                key={player.id}
                index={index}
                player={player}
                result={results?.[index]}
                isLeader={results != null && results[index].equity === leaderEquity}
                isStale={running}
                handName={player.cards.length === 2 ? describeHand([...player.cards, ...board]) : null}
                canRemove={players.length > 2}
                onPickCards={() => setPickerTarget(index)}
                onRemove={() => setPlayers((list) => list.filter((p) => p.id !== player.id))}
              />
            ))}
          </ul>

          {players.length < MAX_PLAYERS && (
            <button type="button" className="equity-add-player" onClick={() => setPlayers((list) => [...list, newPlayer()])}>
              <Icon name="plus" size={18} /> Add player
            </button>
          )}

          {/* Status line: what's missing, or how the numbers were computed */}
          <p className="equity-status" aria-live="polite">
            {reason ??
              (running
                ? 'Calculating'
                : result?.exact
                  ? `Exact result over all ${result.trials.toLocaleString('en-US')} possible boards`
                  : result && `Simulated ${result.trials.toLocaleString('en-US')} random boards`)}
          </p>
        </section>
      </div>

      <CardPicker
        open={pickerTarget !== null}
        title={pickerTarget === 'board' ? 'Board cards' : `Player ${Number(pickerTarget) + 1} cards`}
        count={pickerTarget === 'board' ? 5 : 2}
        initial={pickerTarget === 'board' ? board : (players[pickerTarget]?.cards ?? [])}
        used={usedCards}
        allowPartial
        onDone={handlePicked}
        onClose={() => setPickerTarget(null)}
      />
    </div>
  );
}
