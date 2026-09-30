// One finding: a leak (what's costing money) or a strength, with the evidence and a concrete next step.
import Icon from '../../components/Icon/Icon.jsx';
import './LeakCard.css';

const SEVERITY_TEXT = { high: 'High impact', medium: 'Medium impact', low: 'Low impact', strength: 'Strength' };

export default function LeakCard({ leak }) {
  return (
    <li className={`leak-card is-${leak.severity}`}>
      <div className="leak-card-top">
        <span className="leak-card-icon">
          <Icon name={leak.severity === 'strength' ? 'trendUp' : 'alert'} size={16} />
        </span>
        <span className="leak-card-severity">{SEVERITY_TEXT[leak.severity]}</span>
      </div>
      <h3 className="leak-card-title">{leak.title}</h3>
      <p className="leak-card-detail">{leak.detail}</p>

      {/* Suggested fix */}
      <p className="leak-card-action">
        <Icon name="bulb" size={16} />
        <span>{leak.action}</span>
      </p>
    </li>
  );
}
