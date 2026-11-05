// The sheet for one graded decision: the cards, what kind of spot it was, what you did against what GTO does with
// that hand (as bars), what it cost, and where to go next: review the whole hand with the Coach, replay it from
// that street in Practice, drill spots like it, or open the saved hand.
import Modal from '../Modal/Modal.jsx';
import PlayingCard from '../PlayingCard/PlayingCard.jsx';
import DrillRow from '../DrillRow/DrillRow.jsx';
import GradeBadge from '../GradeBadge/GradeBadge.jsx';
import { areaById, spotTitle, spotChips, describeFocus, focusToParams, handFamily, strengthBucket } from '../../coach/spots.js';
import { playsIn, isBetting, gtoShares, youShares, focusOfRow } from '../../coach/leaks.js';
import { youVsGtoLine, lossText, bbText } from '../../coach/leakDetails.js';
import YouVsGto from '../YouVsGto/YouVsGto.jsx';
import './SpotSheet.css';

const BOARD_SIZE = { Preflop: 0, Flop: 3, Turn: 4, River: 5 };

// row: the decision (null when nothing is open); open/onClose: as for any sheet.
export default function SpotSheet({ row, open, onClose }) {
  if (!row) return null;
  const { hand } = row;
  const area = areaById(row.area);
  const board = (hand.board ?? []).slice(0, BOARD_SIZE[row.street]);
  const focus = focusOfRow(row);
  const chips = row.street === 'Preflop' ? [row.position, row.limpers ? `${row.limpers} limping` : null, row.callers ? `${row.callers} calling` : null].filter(Boolean) : [row.street, ...spotChips(row)];
  const handType = row.street === 'Preflop' || row.str === null ? handFamily(row.cls) : `${strengthBucket(row.str)} hand`;

  return (
    <Modal open={open} onClose={onClose} title={spotTitle(row)} expandable>
      <div className="spot-sheet">
        <div className="spot-sheet-cards">
          <span className="spot-sheet-hand">
            {(hand.holeCards ?? []).map((code) => (
              <PlayingCard key={code} code={code} size="md" />
            ))}
          </span>
          {board.length > 0 && (
            <span className="spot-sheet-board">
              {board.map((code) => (
                <PlayingCard key={code} code={code} size="sm" />
              ))}
            </span>
          )}
        </div>

        <ul className="spot-sheet-chips">
          {chips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>

        <p className="spot-sheet-verdict">{youVsGtoLine(row)}.</p>
        <YouVsGto you={youShares(row)} gto={gtoShares(row)} kinds={playsIn(area)} betting={isBetting(area)} />

        <dl className="spot-sheet-facts">
          <div>
            <dt>Given up</dt>
            <dd className={`num ${row.loss > 0 ? 'is-negative' : ''}`}>{lossText(row.loss)}</dd>
          </div>
          <div>
            <dt>Grade</dt>
            <dd>
              <GradeBadge score={row.score} size="md" withLabel />
            </dd>
          </div>
          <div>
            <dt>Pot</dt>
            <dd className="num">{bbText(row.pot)}</dd>
          </div>
          <div>
            <dt>Your hand</dt>
            <dd>
              {row.cls} <span className="spot-sheet-sub">{handType}</span>
            </dd>
          </div>
        </dl>

        {/* Where to go from here: each leads somewhere that makes sense for this decision */}
        <ul className="spot-sheet-links">
          <li>
            <DrillRow to={`/coach?hand=${row.handId}`} icon="coach" title="Review the whole hand" subtitle="Every decision graded, with GTO's ranges" onClick={onClose} />
          </li>
          {row.street !== 'Preflop' && (
            <li>
              <DrillRow to={`/practice?hand=${row.handId}&street=${row.street}`} icon="undo" title={`Replay it from the ${row.street.toLowerCase()}`} subtitle="Play it again against GTO opponents" onClick={onClose} />
            </li>
          )}
          <li>
            <DrillRow to={`/practice?${focusToParams(focus)}`} icon="target" title="Drill spots like this" subtitle={describeFocus(focus)} onClick={onClose} />
          </li>
          <li>
            <DrillRow to={`/hands/${row.handId}`} icon="cards" title="Open the saved hand" subtitle={hand.title} onClick={onClose} />
          </li>
        </ul>
      </div>
    </Modal>
  );
}
