// The slide-up sheet for a tapped hand (phones): the spot's name in the title, the hand's detail in the body.
// Swiping it down closes it; the hands next to it on the grid are one tap away.
import Modal from '../../components/Modal/Modal.jsx';
import HandDetail from './HandDetail.jsx';

export default function HandSheet({ open, onClose, grid, cls, onPick }) {
  return (
    <Modal open={open} onClose={onClose} title={grid.scenario.title} className="rg-hand-sheet">
      {cls !== null && <HandDetail grid={grid} cls={cls} variant="sheet" onPick={onPick} />}
    </Modal>
  );
}
