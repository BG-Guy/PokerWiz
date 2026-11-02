// The detailed view of one stat or insight (built by statDetail in utils/insightDetails.js): the lead number and
// a caption, then its sections: facts, month bars, breakdowns, a small curve, lists and plain-word notes.
// Sections rise in one after another as the view opens.
import { amountFormatters, formatDate } from '../../utils/format.js';
import LineChart from '../LineChart/LineChart.jsx';
import DetailBars from './DetailBars.jsx';
import DetailBreakdown from './DetailBreakdown.jsx';
import './StatDetail.css';

export default function StatDetail({ detail }) {
  const money = amountFormatters();
  return (
    <div className="stat-detail">
      {/* The TLDR, grown up */}
      <div className="stat-detail-lead">
        <span className={`stat-detail-lead-value num ${detail.lead.tone ? `is-${detail.lead.tone}` : ''}`}>{detail.lead.value}</span>
        {detail.lead.caption && <span className="stat-detail-lead-caption">{detail.lead.caption}</span>}
      </div>

      {detail.sections.map((section, i) => (
        <section key={`${section.type}${i}`} className={`stat-detail-section is-${section.type}`} style={{ '--i': i }}>
          {section.title && <h3 className="stat-detail-title">{section.title}</h3>}

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

          {section.type === 'curve' && (
            <LineChart data={section.data} height={140} tone={section.tone} formatValue={(v) => money.compact(v)} formatLabel={(label) => (label ? formatDate(label) : '')} />
          )}

          {section.type === 'list' && (
            <ul className="stat-detail-list">
              {section.items.map((item) => (
                <li key={item.label}>
                  <span className="stat-detail-list-main">
                    <span className="stat-detail-list-label">{item.label}</span>
                    {item.hint && <span className="stat-detail-hint">{item.hint}</span>}
                  </span>
                  <span className={`stat-detail-list-value num ${item.tone ? `is-${item.tone}` : ''}`}>{item.value}</span>
                </li>
              ))}
            </ul>
          )}

          {section.type === 'text' && section.paragraphs.map((text) => <p key={text} className="stat-detail-text">{text}</p>)}
        </section>
      ))}
    </div>
  );
}
