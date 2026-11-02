// Breakdown for a detail view: tabs for stakes / venue / game, and one row per value with a bar, its number and
// a small hint (sessions, hours) so a thin sample is easy to spot.
import { useState } from 'react';
import FilterChips from '../FilterChips/FilterChips.jsx';
import './DetailBreakdown.css';

// groups: [{ key, label, items: [{ label, value, display, hint }] }]
export default function DetailBreakdown({ groups }) {
  const [key, setKey] = useState(groups[0].key);
  const group = groups.find((g) => g.key === key) ?? groups[0];
  const maxAbs = Math.max(1e-9, ...group.items.map((item) => Math.abs(item.value)));

  return (
    <div className="detail-breakdown">
      {groups.length > 1 && (
        <FilterChips options={groups.map((g) => ({ value: g.key, label: g.label }))} value={group.key} onChange={setKey} label="Break down by" />
      )}
      <ul className="detail-breakdown-list" key={group.key}>
        {group.items.map((item, i) => (
          <li key={item.label} className="detail-breakdown-row" style={{ '--i': i }}>
            <span className="detail-breakdown-top">
              <span className="detail-breakdown-label">{item.label}</span>
              <span className={`detail-breakdown-value num ${item.value < 0 ? 'is-negative' : ''}`}>{item.display}</span>
            </span>
            <span className="detail-breakdown-track">
              <span className={`detail-breakdown-bar ${item.value < 0 ? 'is-negative' : ''}`} style={{ width: `${(Math.abs(item.value) / maxAbs) * 100}%` }} />
            </span>
            {item.hint && <span className="detail-breakdown-hint">{item.hint}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
