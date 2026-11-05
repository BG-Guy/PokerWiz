// Page title block: heading, short subtitle, and optional actions on the right. A page one level down a branch
// (a leak inside Leaks) says where "back" goes with `back`.
import { Link } from 'react-router-dom';
import Icon from '../Icon/Icon.jsx';
import './PageHeader.css';

// back: { to, label } puts a "< label" link above the title.
export default function PageHeader({ title, subtitle, back, children }) {
  return (
    <header className="page-header">
      <div>
        {back && (
          <Link to={back.to} className="page-header-back">
            <Icon name="chevronLeft" size={16} /> {back.label}
          </Link>
        )}
        <h1 className="page-header-title">{title}</h1>
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </header>
  );
}
