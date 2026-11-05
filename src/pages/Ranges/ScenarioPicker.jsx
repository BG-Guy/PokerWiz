// The sheet that slides up to change the spot, as a drill-down: your seat, then what's happening (open, facing an
// open, your open vs a 3-bet ...), then against whom. Every row leads one step further, the back arrow one step
// up, and the last step closes the sheet on the spot you picked. The first step also lists the popular spots.
import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal/Modal.jsx';
import DrillRow from '../../components/DrillRow/DrillRow.jsx';
import { POSITIONS } from '../../gto/preflop/tree.js';
import { SEAT_NAMES, situationsFor, popularScenarios, seatHeadline } from '../../gto/preflop/scenarios.js';
import SeatBadge from './SeatBadge.jsx';
import SpotRow from './SpotRow.jsx';
import { percent } from './actionStyle.js';
import './ScenarioPicker.css';

const KIND_ICONS = { open: 'play', 'vs-open': 'target', 'vs-3bet': 'repeat', 'vs-4bet': 'flame', 'vs-allin': 'allIn', limp: 'coins', other: 'users' };
// The short names of the groups, for the line under a seat.
const KIND_SHORT = { open: 'Open', 'vs-open': 'vs opens', 'vs-3bet': 'vs 3-bets', 'vs-4bet': 'vs 4-bets', 'vs-allin': 'vs all-ins', limp: 'Limped', other: 'Rare' };

export default function ScenarioPicker({ open, onClose, scenarios, current, onSelect }) {
  const [step, setStep] = useState({ name: 'seat' });
  // Each time it opens it starts at the top.
  useEffect(() => {
    if (open) setStep({ name: 'seat' });
  }, [open]);

  const bySeat = useMemo(() => POSITIONS.map((_, seat) => situationsFor(scenarios, seat)), [scenarios]);
  const popular = useMemo(() => popularScenarios(scenarios, 5), [scenarios]);
  const choose = (scenario) => {
    onSelect(scenario);
    onClose();
  };

  let title = 'Choose a spot';
  let onBack;
  let body;

  if (step.name === 'seat') {
    body = (
      <>
        <section className="rg-picker-section">
          <h3 className="rg-picker-heading">Popular spots</h3>
          <div className="rg-picker-list stagger-in">
            {popular.map((s) => (
              <DrillRow
                key={s.id}
                lead={<SeatBadge position={s.position} />}
                title={s.title}
                subtitle={s.subtitle}
                value={percent(s.headline.share)}
                hint={s.headline.label}
                selected={s.id === current.id}
                onClick={() => choose(s)}
              />
            ))}
          </div>
        </section>
        <section className="rg-picker-section">
          <h3 className="rg-picker-heading">Your seat</h3>
          <div className="rg-picker-list stagger-in">
            {POSITIONS.map((position, seat) => {
              const headline = seatHeadline(scenarios, seat);
              return (
                <DrillRow
                  key={position}
                  lead={<SeatBadge position={position} />}
                  title={SEAT_NAMES[position]}
                  subtitle={bySeat[seat].map((k) => KIND_SHORT[k.id]).join(' · ')}
                  value={headline ? percent(headline.share) : undefined}
                  hint={headline?.label}
                  selected={current.seat === seat}
                  onClick={() => setStep({ name: 'situation', seat })}
                />
              );
            })}
          </div>
        </section>
      </>
    );
  } else if (step.name === 'situation') {
    const position = POSITIONS[step.seat];
    title = `${SEAT_NAMES[position]} (${position})`;
    onBack = () => setStep({ name: 'seat' });
    body = (
      <section className="rg-picker-section">
        <h3 className="rg-picker-heading">What is happening?</h3>
        <div className="rg-picker-list stagger-in">
          {bySeat[step.seat].map((kind) => {
            const first = kind.groups[0].base;
            // One line of play (opening): go straight to it. Several: ask against whom.
            const single = kind.groups.length === 1;
            return (
              <DrillRow
                key={kind.id}
                icon={KIND_ICONS[kind.id]}
                title={kind.title}
                subtitle={kind.blurb}
                value={single ? percent(first.headline.share) : kind.count}
                hint={single ? first.headline.label : kind.count === 1 ? 'spot' : 'spots'}
                selected={current.seat === step.seat && current.kind === kind.id}
                onClick={() => (single ? choose(first) : setStep({ name: 'versus', seat: step.seat, kind: kind.id }))}
              />
            );
          })}
        </div>
      </section>
    );
  } else {
    const position = POSITIONS[step.seat];
    const kind = bySeat[step.seat].find((k) => k.id === step.kind);
    const maxWeight = Math.max(...kind.groups.map((g) => g.base.weight));
    title = `${position} · ${kind.title}`;
    onBack = () => setStep({ name: 'situation', seat: step.seat });
    body = (
      <section className="rg-picker-section">
        <h3 className="rg-picker-heading">Against whom?</h3>
        <p className="rg-picker-note">The bar under each line shows how often it comes up. The most common are first.</p>
        <div className="rg-picker-list stagger-in">
          {kind.groups.map((group) => (
            <SpotRow key={group.id} group={group} maxWeight={maxWeight} selected={current.groupId === group.id} onSelect={choose} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} onBack={onBack} className="rg-picker">
      <div key={step.name + (step.seat ?? '') + (step.kind ?? '')}>{body}</div>
    </Modal>
  );
}
