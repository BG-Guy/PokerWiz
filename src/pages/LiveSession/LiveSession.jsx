// Log session page (/session): shows the start form when nothing is running, otherwise the live session.
import { useNavigate } from 'react-router-dom';
import { getLiveSession } from '../../api/sessions.js';
import { useApi } from '../../hooks/useApi.js';
import LoadState from '../../components/LoadState/LoadState.jsx';
import StartSessionForm from './StartSessionForm.jsx';
import LiveSessionView from './LiveSessionView.jsx';
import './LiveSession.css';

export default function LiveSession() {
  const navigate = useNavigate();
  const { data: session, error, loading, reload, setData } = useApi(getLiveSession);

  if (loading || error) return <LoadState error={error} onRetry={reload} />;

  return (
    <div className="live-session-page">
      {session ? (
        <LiveSessionView
          session={session}
          onChange={setData}
          onDiscarded={() => setData(null)}
          onFinished={(finished) => navigate(`/history?open=${finished.id}`)}
        />
      ) : (
        <StartSessionForm onStarted={setData} />
      )}
    </div>
  );
}
