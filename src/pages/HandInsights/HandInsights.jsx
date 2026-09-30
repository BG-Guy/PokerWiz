// Hand insights (/hands/insights): the insights panel on its own page, for phones and tablets
// (desktop shows it next to Highlights).
import { getHands } from '../../api/hands.js';
import { useApi } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import HandsTabs from '../../components/HandsTabs/HandsTabs.jsx';
import HandInsightsPanel from '../../components/HandInsightsPanel/HandInsightsPanel.jsx';

export default function HandInsights() {
  const { data: hands, error, reload } = useApi(getHands);

  return (
    <div className="hand-insights-page">
      <PageHeader title="Hand insights" subtitle="Patterns across the hands you've recorded." />
      <HandsTabs />
      {hands ? <HandInsightsPanel hands={hands} /> : <LoadState error={error} onRetry={reload} />}
    </div>
  );
}
