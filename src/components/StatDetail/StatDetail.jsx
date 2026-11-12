// The detailed view of one stat or insight: what a TLDR box opens. Built as plain data by statDetail
// (utils/insightDetails.js), the session, hand and goal builders next to it, or the leak report's
// (coach/leakDetails.js): the lead number and a caption, a note when one is due, then its sections: facts, month
// bars, breakdowns, a small curve (with a Full screen button when the detail carries its sessions), lists (a row
// with `to` leads somewhere), hands (each opens the hand), plain-word notes and buttons that go somewhere (an
// `actions` section of { label, to, icon, primary } links). Sections rise in one after another as the view opens.
import { Link } from 'react-router-dom';
import { amountFormatters } from '../../utils/format.js';
import Icon from '../Icon/Icon.jsx';
import PlayingCard from '../PlayingCard/PlayingCard.jsx';
import DetailBars from './DetailBars.jsx';
import DetailBreakdown from './DetailBreakdown.jsx';
import DetailCurve from './DetailCurve.jsx';
import './StatDetail.css';

// onNavigate: called when a link inside is followed (the page closes the sheet when the link stays on it).
export default function StatDetail({ detail, onNavigate }) {
  // The formatters for the unit the detail's numbers are in (a detail built from sessions carries its own).
  const money = detail.money ?? amountFormatters();
  return (
    <div className="stat-detail">
      {/* The TLDR, grown up */}
      <div className="stat-detail-lead">
        <span className={`stat-detail-lead-value num ${detail.lead.tone ? `is-${detail.lead.tone}` : ''}`}>{detail.lead.value}</span>
        {detail.lead.caption && <span className="stat-detail-lead-caption">{detail.lead.caption}</span>}
        {detail.note && <span className="stat-detail-note">{detail.note}</span>}
      </div>

      {detail.sections.map((section, i) => (
        <section key={`${section.type}${i}`} className={`stat-detail-section is-${section.type}`} style={{ '--i': i }}>
          {section.title && section.type !== 'curve' && <h3 className="stat-detail-title">{section.title}</h3>}

          {section.type === 'facts' && (
            <dl className="stat-detail-facts">
              {section.items.map((item) => (
                <div key={item.label} className="stat-detail-fact">
                  <dt>{item.label}</dt>
                  <dd className={`num ${item.tone ? `is-${item.tone}` : ''}`}>{item.value}</dd>
                  {item.hint && <dd className="stat-detail-hint">{item.hint}</dd>}
                </div>
              ))}
            </dl>
          )}

          {section.type === 'bars' && <DetailBars items={section.items} signed={section.signed} />}

          {section.type === 'breakdown' && <DetailBreakdown groups={section.groups} />}

          {section.type === 'curve' && <DetailCurve section={section} money={money} />}

          {section.type === 'list' && (
            <ul className="stat-detail-list">
              {section.items.map((item, k) => {
                const row = (
                  <>
                    <span className="stat-detail-list-main">
                      <span className="stat-detail-list-label">{item.label}</span>
                      {item.hint && <span className="stat-detail-hint">{item.hint}</span>}
                    </span>
                    <span className={`stat-detail-list-value num ${item.tone ? `is-${item.tone}` : ''}`}>{item.value}</span>
                  </>
                );
                return (
                  <li key={`${item.label}${k}`}>
                    {item.to ? (
                      <Link to={item.to} className="stat-detail-row" onClick={onNavigate}>
                        {row}
                        <Icon name="chevronRight" size={16} className="stat-detail-chevron" />
                      </Link>
                    ) : (
                      <span className="stat-detail-row">{row}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {section.type === 'hands' && (
            <ul className="stat-detail-list">
              {section.items.map((item) => (
                <li key={item.id}>
                  <Link to={`/hands/${item.id}`} className="stat-detail-row" onClick={onNavigate}>
                    <span className="stat-detail-cards">
                      {item.cards.slice(0, 2).map((code) => (
                        <PlayingCard key={code} code={code} size="sm" />
                      ))}
                    </span>
                    <span className="stat-detail-list-main">
                      <span className="stat-detail-list-label">{item.title}</span>
                      {item.hint && <span className="stat-detail-hint">{item.hint}</span>}
                    </span>
                    <span className={`stat-detail-list-value num ${item.tone ? `is-${item.tone}` : ''}`}>{item.value}</span>
                    <Icon name="chevronRight" size={16} className="stat-detail-chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {section.type === 'text' && section.paragraphs.map((text) => <p key={text} className="stat-detail-text">{text}</p>)}

          {section.type === 'actions' && (
            <div className="stat-detail-actions">
              {section.items.map((item) => (
                <Link key={item.label} to={item.to} state={item.state} className={`btn ${item.primary ? '' : 'btn-secondary'}`} onClick={onNavigate}>
                  {item.icon && <Icon name={item.icon} size={16} />}
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
