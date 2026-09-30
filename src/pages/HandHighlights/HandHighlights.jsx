// Hand Highlights (/hands/highlights): every award with its top three hands.
// Desktop shows the hand insights panel alongside; phones reach it through the Insights tab.
import { getHands } from '../../api/hands.js';
import { useApi } from '../../hooks/useApi.js';
import { buildHighlights } from '../../utils/handHighlights.js';
import { handsForDisplay } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import HandsTabs from '../../components/HandsTabs/HandsTabs.jsx';
import HandInsightsPanel from '../../components/HandInsightsPanel/HandInsightsPanel.jsx';
import HighlightCategory from './HighlightCategory.jsx';
import './HandHighlights.css';

export default function HandHighlights() {
  const { data: hands, error, reload } = useApi(getHands);

  return (
    <div className="hand-highlights">
      <PageHeader title="Highlights" subtitle="Your best, worst and wildest hands." />
      <HandsTabs />

      {!hands ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <div className="hand-highlights-layout">
          <div className="hand-highlights-grid">
            {buildHighlights(handsForDisplay(hands)).map((category) => (
              <HighlightCategory key={category.id} category={category} />
            ))}
          </div>
          <aside className="hand-highlights-insights">
            <HandInsightsPanel hands={hands} />
          </aside>
        </div>
      )}
    </div>
  );
}
