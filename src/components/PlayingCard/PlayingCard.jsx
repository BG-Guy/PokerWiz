// A single playing card drawn from a code like "As" (ace of spades) or "Td" (ten of diamonds).
// With no code it draws an empty slot; with faceDown it draws the branded card back.
import SuitIcon from './SuitIcon.jsx';
import './PlayingCard.css';

const SUIT_NAMES = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_NAMES = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: '10' };

// size: "xs" (table seats), "sm" (lists), "md" (default), "lg" (hand detail).
export default function PlayingCard({ code, size = 'md', faceDown = false }) {
  // Card back: patterned slate with the PokerWiz spade in the middle
  if (faceDown) {
    return (
      <span className={`playing-card playing-card-${size} playing-card-back`} role="img" aria-label="Unknown card">
        <span className="playing-card-back-logo">
          <SuitIcon suit="s" />
        </span>
      </span>
    );
  }

  if (!code) {
    return <span className={`playing-card playing-card-${size} playing-card-empty`} aria-hidden="true" />;
  }

  const rank = code[0];
  const suit = code[1];
  const displayRank = rank === 'T' ? '10' : rank;
  const isRed = suit === 'h' || suit === 'd';
  const label = `${RANK_NAMES[rank] ?? rank} of ${SUIT_NAMES[suit]}`;

  return (
    <span className={`playing-card playing-card-${size} ${isRed ? 'is-red' : ''}`} role="img" aria-label={label}>
      <span className="playing-card-rank">{displayRank}</span>
      <SuitIcon suit={suit} className="playing-card-suit" />
    </span>
  );
}
