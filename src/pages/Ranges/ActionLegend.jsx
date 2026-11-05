// The legend under the grid, and the action filter: one tile per action with its colour, size (in bb) and the share
// of the range that takes it. Tap a tile to colour only the hands that play that action (the rest dim); tap it again to
// show everything.
import { colorOf, percent } from './actionStyle.js';
import './ActionLegend.css';

// grid: from buildGrid. highlight: the chosen action's index or null. layout: 'tiles' (a row of big tiles),
// 'column' (stacked, for the desktop side) or 'chips' (one line of small ones, full screen).
export default function ActionLegend({ grid, highlight, onHighlight, layout = 'tiles', digits = 1 }) {
  return (
    <div className={`rg-legend is-${layout}`} role="group" aria-label="Actions. Tap one to see only where it is played.">
      {grid.order.map((a) => {
        const action = grid.actions[a];
        const on = highlight === a;
        const size = action.size?.replace(' bb', '');
        return (
          <button
            key={a}
            type="button"
            className={`rg-tile ${on ? 'is-on' : ''} ${highlight !== null && !on ? 'is-off' : ''}`}
            style={{ '--tile': colorOf(action, grid.actions) }}
            aria-pressed={on}
            onClick={() => onHighlight(on ? null : a)}
          >
            <span className="rg-tile-top">
              <span className="rg-tile-swatch" aria-hidden="true" />
              <span className="rg-tile-name">
                {action.short}
                {size && <span className="rg-tile-size is-inline"> {size}</span>}
              </span>
            </span>
            <span className="rg-tile-bottom">
              <span className="rg-tile-share num">{percent(action.share, layout === 'chips' ? 0 : digits)}</span>
              {size && (
                <span className="rg-tile-size is-row" title={action.size}>
                  {size}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
