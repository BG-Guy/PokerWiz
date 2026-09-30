// Action step: the player on the clock picks Fold / Check / Call / Bet / Raise / All in.
// Bet and Raise open a sizing panel with quick sizes, a stepper and a free amount (capped at the stack).
import { useState } from 'react';
import { formatMoney, getMoneyUnit } from '../../../utils/format.js';
import Icon from '../../Icon/Icon.jsx';
import { getOptions, sizeSuggestions } from '../../../utils/handEngine.js';
import './ActionPrompt.css';

const round2 = (n) => Math.round(n * 100) / 100;

export default function ActionPrompt({ hand, playerName, onAction, onSkipToEnd }) {
  const { player, remaining, maxTo, toCall, canCheck, callIsAllIn, canRaise, isOpening, minTo } = getOptions(hand);
  const sizes = sizeSuggestions(hand);
  const dollars = (n) => formatMoney(n, { sign: false, bb: hand.bb });
  // The typed amount is in the display unit (big blinds or dollars); value is always in dollars.
  const scale = getMoneyUnit() === 'bb' && hand.bb > 0 ? hand.bb : 1;
  const toText = (chips) => String(round2(chips / scale));
  const [sizing, setSizing] = useState(false);
  const [amount, setAmount] = useState(toText(sizes[Math.min(1, sizes.length - 1)]?.amount ?? minTo));

  // Big-blind amounts are snapped to half a small blind, so 2.33 bb at $1/$3 is a clean $7.
  const typed = scale === 1 ? Number(amount) : Math.round((Number(amount) * scale) / (hand.sb / 2)) * (hand.sb / 2);
  const value = Math.min(typed, maxTo);
  const tooSmall = !(value >= minTo);
  const heroFolded = hand.players.some((p) => p.role === 'hero' && p.folded);
  const aggressiveWord = isOpening ? 'Bet' : 'Raise';
  // A normal bet/raise needs room between the minimum and all-in; otherwise only All in is offered.
  const canSize = canRaise && minTo < maxTo;

  // Stepper moves by one small blind, between the minimum and the stack.
  const nudge = (steps) => setAmount(toText(Math.min(maxTo, Math.max(minTo, (value || 0) + steps * hand.sb))));

  // Describe what the player is facing.
  let situation = 'No bet yet.';
  if (toCall > 0) situation = `Facing ${dollars(hand.currentBet)}. ${callIsAllIn ? `Calling puts them all in.` : `${dollars(toCall)} to call.`}`;
  else if (!isOpening) situation = 'Option to check or raise.';

  return (
    <>
      <span className="prompt-kicker">
        {hand.street}
        <span className="action-prompt-pot num">Pot {dollars(hand.pot)}</span>
      </span>

      <h2 className="prompt-title">
        <span className={`prompt-player-avatar is-${player.role}`}>
          <Icon name={player.role} size={18} />
        </span>
        {playerName}
        <span className="action-prompt-position">{player.position}</span>
      </h2>
      <p className="prompt-text">
        {situation} <span className="action-prompt-stack num">{dollars(remaining)} behind.</span>
      </p>

      {!sizing ? (
        <div className="action-prompt-buttons">
          {toCall > 0 && (
            <button type="button" className="action-prompt-btn is-fold" onClick={() => onAction({ type: 'fold' })}>
              Fold
            </button>
          )}
          {canCheck && (
            <button type="button" className="action-prompt-btn is-passive" onClick={() => onAction({ type: 'check' })}>
              Check
            </button>
          )}
          {toCall > 0 && (
            <button
              type="button"
              className={`action-prompt-btn ${callIsAllIn ? 'is-allin' : 'is-passive'}`}
              onClick={() => onAction({ type: 'call' })}
            >
              {callIsAllIn ? 'Call all in' : 'Call'} <span className="num">{dollars(toCall)}</span>
            </button>
          )}
          {canSize && (
            <button type="button" className="action-prompt-btn is-aggressive" onClick={() => setSizing(true)}>
              {aggressiveWord}
            </button>
          )}
          {canRaise && (
            <button type="button" className="action-prompt-btn is-allin" onClick={() => onAction({ type: 'allin' })}>
              <span className="action-prompt-allin-label">
                <Icon name="allIn" size={16} /> All in
              </span>
              <span className="num">{dollars(maxTo)}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="action-prompt-sizing">
          {/* Quick sizes, plus all-in */}
          <div className="prompt-chips">
            {sizes.map((size) => (
              <button
                key={size.label}
                type="button"
                className={`filter-chip ${Math.abs(value - size.amount) < 0.005 ? 'is-active' : ''}`}
                onClick={() => setAmount(toText(size.amount))}
              >
                {size.label} <span className="filter-chip-count num">{dollars(size.amount)}</span>
              </button>
            ))}
            <button type="button" className={`filter-chip action-prompt-allin-chip ${value >= maxTo ? 'is-active' : ''}`} onClick={() => setAmount(toText(maxTo))}>
              All in <span className="filter-chip-count num">{dollars(maxTo)}</span>
            </button>
          </div>

          {/* Stepper + free amount */}
          <div className="action-prompt-amount">
            <button type="button" className="action-prompt-step" onClick={() => nudge(-1)} aria-label="Smaller">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
            <label className="action-prompt-input">
              {scale === 1 && <span aria-hidden="true">$</span>}
              <input
                type="number"
                inputMode="decimal"
                min={minTo / scale}
                max={maxTo / scale}
                step={hand.sb / scale}
                value={amount}
                aria-label={`${aggressiveWord} amount`}
                onChange={(event) => setAmount(event.target.value)}
              />
              {scale !== 1 && <span aria-hidden="true">bb</span>}
            </label>
            <button type="button" className="action-prompt-step" onClick={() => nudge(1)} aria-label="Bigger">
              <Icon name="plus" size={18} />
            </button>
          </div>
          {tooSmall && (
            <p className="action-prompt-hint">
              Minimum {aggressiveWord.toLowerCase()} is {dollars(minTo)}.
            </p>
          )}

          <div className="prompt-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setSizing(false)}>
              Back
            </button>
            {value >= maxTo ? (
              <button type="button" className="btn action-prompt-allin-confirm" onClick={() => onAction({ type: 'allin' })}>
                <Icon name="allIn" size={16} /> All in {dollars(maxTo)}
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={tooSmall}
                onClick={() => onAction({ type: isOpening ? 'bet' : 'raise', amount: round2(value) })}
              >
                {isOpening ? 'Bet' : 'Raise to'} {dollars(value || 0)}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Once the hero is out, the rest of the action is optional */}
      {heroFolded && (
        <button type="button" className="action-prompt-skip" onClick={onSkipToEnd}>
          You folded. Skip to the end <Icon name="chevronRight" size={14} />
        </button>
      )}
    </>
  );
}
