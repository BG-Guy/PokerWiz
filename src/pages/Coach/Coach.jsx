// Coach mode (/coach): record a hand, then get a GTO review of each decision (accuracy, the GTO play and how
// often GTO makes it, the value of every option, villain ranges). The GTO engine runs in a web worker.
// Opened as /coach?hand=<id> (the Coach button on any hand in Hands), it reviews that saved hand instead:
// missing details are rebuilt from the log, your level can be changed on the spot (the review re-runs), and
// the score is saved onto the hand.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createHand, getHand, updateHand } from '../../api/hands.js';
import { prepareSavedHand } from '../../coach/savedHand.js';
import { getMoneyUnit } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import HandRecorder from '../../components/HandRecorder/HandRecorder.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import CoachReport from './CoachReport.jsx';
import ReviewSetup from './ReviewSetup.jsx';
import './Coach.css';

const STEPS = [
  { icon: 'cards', title: 'Replay the hand', text: 'Seats, stacks, cards and every action, on the table.' },
  { icon: 'target', title: 'Solved with GTO', text: 'Preflop charts for your stack depth; every postflop street solved from both ranges.' },
  { icon: 'bulb', title: 'Get graded', text: 'Accuracy, the GTO play and how often it makes it, decision by decision.' },
];

export default function Coach() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const savedHandId = searchParams.get('hand');
  const [phase, setPhase] = useState(savedHandId ? 'loading' : 'record'); // record | loading | analyzing | report | error
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null); // a hand recorded here, for "Save to my hands"
  const [saveState, setSaveState] = useState(null);
  const [recorderKey, setRecorderKey] = useState(0);
  // Reviewing a saved hand
  const [savedHand, setSavedHand] = useState(null);
  const [record, setRecord] = useState(null);
  const [assumptions, setAssumptions] = useState([]);
  const [busy, setBusy] = useState(false); // re-running with new reads (the old report stays visible)
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(null); // what the GTO engine is solving right now
  const workerRef = useRef(null);
  const requestRef = useRef(0);

  // One worker for the page; replies to older requests are ignored.
  useEffect(() => {
    const worker = new Worker(new URL('../../coach/coach.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      if (event.data.id !== requestRef.current) return;
      if (event.data.progress) {
        setProgress(event.data.progress);
        return;
      }
      setBusy(false);
      if (event.data.error) {
        setError(event.data.error);
        setPhase('error');
      } else {
        setReport(event.data.report);
        setPhase('report');
      }
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const analyze = (nextRecord, { keepReport = false } = {}) => {
    if (keepReport) setBusy(true);
    else setPhase('analyzing');
    setError(null);
    setProgress(null);
    requestRef.current += 1;
    workerRef.current.postMessage({ id: requestRef.current, record: nextRecord, unit: getMoneyUnit(), detail: 'full' });
  };

  // Saved-hand review: load the hand, fill in what's missing, analyze. Without ?hand, record a new one.
  useEffect(() => {
    if (!savedHandId) {
      setSavedHand(null);
      setRecord(null);
      setReport(null);
      setPhase('record');
      return undefined;
    }
    let active = true;
    setPhase('loading');
    setReport(null);
    setStatus(null);
    getHand(savedHandId)
      .then((hand) => {
        if (!active) return;
        const prepared = prepareSavedHand(hand);
        if (prepared.error) throw new Error(prepared.error);
        setSavedHand(hand);
        setRecord(prepared.record);
        setAssumptions(prepared.assumptions);
        analyze(prepared.record);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
        setPhase('error');
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedHandId]);

  // Each finished review of a saved hand stores its score and the reads it used on the hand.
  useEffect(() => {
    if (!report || !savedHand || !record) return;
    const reads = Object.fromEntries(record.players.filter((p) => p.profile).map((p) => [p.role === 'hero' ? 'hero' : p.position, p.profile]));
    updateHand(savedHand.id, { coachAccuracy: report.accuracy, coachReads: reads })
      .then(() => setStatus(`Score saved to this hand: ${report.accuracy}%.`))
      .catch(() => setStatus('Could not save the score to the hand.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  // Change reads on a saved hand and re-run.
  const rerunWith = (players) => {
    const next = { ...record, players };
    setRecord(next);
    analyze(next, { keepReport: true });
  };
  const changeRead = (position, profile) =>
    rerunWith(record.players.map((p) => (p.role === 'villain' && p.position === position ? { ...p, profile } : p)));
  const changeHero = (profile) => rerunWith(record.players.map((p) => (p.role === 'hero' ? { ...p, profile } : p)));

  const startOver = () => {
    if (savedHandId) {
      navigate('/coach');
      return;
    }
    setReport(null);
    setPayload(null);
    setSaveState(null);
    setRecorderKey((k) => k + 1);
    setPhase('record');
  };

  const saveRecordedHand = async () => {
    setSaveState('saving');
    try {
      const verdict = report.accuracy >= 85 ? 'good' : report.accuracy < 60 ? 'mistake' : 'review';
      const saved = await createHand({ ...payload, verdict, coachAccuracy: report.accuracy });
      setSaveState({ id: saved.id });
    } catch (err) {
      setSaveState({ error: err.message });
    }
  };

  return (
    <div className="coach">
      <PageHeader
        title="Coach"
        subtitle={savedHandId ? 'A GTO review of a hand from your Hands.' : 'Replay a hand and get every decision graded against GTO.'}
      >
        {savedHandId ? (
          <Link to="/coach" className="btn btn-ghost">
            <Icon name="plus" size={16} /> Coach a new hand
          </Link>
        ) : (
          <Link to="/practice" className="btn btn-ghost">
            <Icon name="zap" size={16} /> Practice spots
          </Link>
        )}
      </PageHeader>

      {phase === 'record' && !savedHandId && (
        <>
          <ol className="coach-steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="coach-step">
                <span className="coach-step-icon">
                  <Icon name={step.icon} size={18} />
                </span>
                <span className="coach-step-text">
                  <strong>
                    {index + 1}. {step.title}
                  </strong>
                  <span>{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <HandRecorder
            key={recorderKey}
            mode="coach"
            onAnalyze={({ record: recorded, payload: handPayload }) => {
              setPayload(handPayload);
              analyze(recorded);
            }}
          />
        </>
      )}

      {/* Saved hand: what's being reviewed, what was assumed, and your level */}
      {savedHand && record && phase !== 'error' && phase !== 'loading' && (
        <ReviewSetup
          hand={savedHand}
          record={record}
          assumptions={assumptions}
          busy={busy || phase === 'analyzing'}
          status={status}
          onReadChange={changeRead}
          onHeroChange={changeHero}
        />
      )}

      {(phase === 'loading' || phase === 'analyzing') && (
        <div className="coach-thinking" aria-live="polite">
          <span className="coach-thinking-spinner" />
          <p className="coach-thinking-title">{phase === 'loading' ? 'Loading the hand' : progress ? `${progress}...` : 'Solving the hand'}</p>
          <p className="coach-thinking-text">Following the hand through the GTO charts and solving each postflop street from both ranges. A few seconds per street.</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="coach-error">
          <LoadState error={new Error(error)} />
          {savedHandId ? (
            <Link to={`/hands/${savedHandId}`} className="btn">
              Back to the hand
            </Link>
          ) : (
            <button type="button" className="btn" onClick={startOver}>
              Record a hand
            </button>
          )}
        </div>
      )}

      {phase === 'report' && report && (
        <div className={`coach-report-wrap ${busy ? 'is-busy' : ''}`}>
          <CoachReport
            report={report}
            onNewHand={startOver}
            onSave={saveRecordedHand}
            saveState={saveState}
            canSave={!savedHandId && Boolean(payload)}
            backTo={savedHandId ? `/hands/${savedHandId}` : null}
          />
        </div>
      )}
    </div>
  );
}
