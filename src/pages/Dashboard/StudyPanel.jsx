// Home page's way into studying: your biggest leak (a tap opens its page), a drill for it, and the range browser.
// The leak comes from the hands the coach has already graded (Leaks does that grading); until there are some it
// invites you to find your leaks.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { leakOverview, leanSentence } from '../../coach/leaks.js';
import { lossText, drillLink } from '../../coach/leakDetails.js';
import { describeFocus } from '../../coach/spots.js';
import Panel from '../../components/Panel/Panel.jsx';
import DrillRow from '../../components/DrillRow/DrillRow.jsx';
import './StudyPanel.css';

export default function StudyPanel({ hands }) {
  const { worst } = useMemo(() => leakOverview(hands), [hands]);

  return (
    <Panel
      title="Study"
      className="dashboard-study"
      action={
        <Link to="/leaks" className="btn btn-ghost">
          All leaks
        </Link>
      }
    >
      <ul className="dashboard-study-list">
        <li>
          {worst ? (
            <DrillRow
              to={`/leaks/${worst.area.id}`}
              icon="drop"
              title={`Biggest leak: ${worst.area.name}`}
              subtitle={leanSentence(worst, worst.area)}
              value={lossText(worst.cost)}
              tone="negative"
            />
          ) : (
            <DrillRow
              to="/leaks"
              icon="drop"
              title="Find your leaks"
              subtitle={hands.length ? 'The coach grades your saved hands and shows where you give up the most.' : 'Save hands, and the coach shows where you give up the most.'}
            />
          )}
        </li>
        {worst && (
          <li>
            <DrillRow to={drillLink(worst.area.id)} icon="target" title="Drill it in Practice" subtitle={describeFocus({ area: worst.area.id })} />
          </li>
        )}
        <li>
          <DrillRow to="/ranges" icon="grid" title="Browse ranges" subtitle="What GTO does with every hand, from every seat" />
        </li>
      </ul>
    </Panel>
  );
}
