// One highlight award: title, subtitle, and its top hands (cards, title, the stat that earned it).
import { Link } from 'react-router-dom';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './HighlightCategory.css';

export default function HighlightCategory({ category }) {
  return (
    <section className={`highlight-category is-${category.id}`}>
      <header className="highlight-category-header">
        <span className="highlight-category-icon">
          <Icon name={category.icon} size={20} />
        </span>
        <div>
          <h2 className="highlight-category-title">{category.title}</h2>
          <p className="highlight-category-subtitle">{category.subtitle}</p>
        </div>
      </header>

      {category.entries.length === 0 ? (
        <p className="highlight-category-empty">{category.empty}</p>
      ) : (
        <ol className="highlight-category-list">
          {category.entries.map(({ hand, stat }, index) => (
            <li key={hand.id}>
              <Link to={`/hands/${hand.id}`} className="highlight-entry">
                <span className="highlight-entry-rank num">{index + 1}</span>
                <span className="highlight-entry-cards">
                  {hand.holeCards.map((code) => (
                    <PlayingCard key={code} code={code} size="xs" />
                  ))}
                </span>
                <span className="highlight-entry-text">
                  <span className="highlight-entry-title">{hand.title}</span>
                  <span className="highlight-entry-stat">{stat}</span>
                </span>
                <Icon name="chevronRight" size={16} />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
