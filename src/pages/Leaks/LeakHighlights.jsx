// The three headline cards at the top of Leaks, each a TLDR that opens its full story: how your play grades overall,
// the leak that costs the most, and the spot you play best. A card appears only when there's something to say.
import TldrCard from '../../components/TldrCard/TldrCard.jsx';
import StatDetail from '../../components/StatDetail/StatDetail.jsx';
import { leanSentence } from '../../coach/leaks.js';
import { areaDetail, overallDetail, lossText, bbText } from '../../coach/leakDetails.js';
import { plural } from '../../utils/format.js';
import './LeakHighlights.css';

const GRADE_TONES = { good: 'positive', bad: 'negative', warning: 'negative' };

// overview: from leakOverview(hands).
export default function LeakHighlights({ overview }) {
  const { total, worst, best, handsAnalyzed } = overview;
  const perDecision = total.count ? total.cost / total.count : 0;

  return (
    <div className="leak-highlights">
      <TldrCard
        icon="target"
        label="Your play vs GTO"
        value={total.grade ? `${total.grade.letter} · ${total.grade.label}` : '–'}
        tone={GRADE_TONES[total.grade?.tone]}
        sentence={`${plural(total.count, 'decision')} in ${plural(handsAnalyzed, 'hand')}. You gave up ${lossText(total.cost)} to GTO, about ${bbText(perDecision)} a decision.`}
        title="Your play vs GTO"
        cta="Where it went"
      >
        <StatDetail detail={overallDetail(overview)} />
      </TldrCard>

      {worst && (
        <TldrCard
          icon="drop"
          label="Biggest leak"
          value={worst.area.name}
          tone="negative"
          sentence={`${lossText(worst.cost)} over ${plural(worst.count, 'spot')}. ${leanSentence(worst, worst.area, { counted: true })}`}
          title={worst.area.name}
          cta="Why, and what to do"
        >
          <StatDetail detail={areaDetail(worst)} />
        </TldrCard>
      )}

      {best && (
        <TldrCard
          icon="trophy"
          label="You play this well"
          value={best.area.name}
          tone="positive"
          sentence={`Average grade ${best.grade.letter} over ${plural(best.count, 'spot')}, and only ${lossText(best.cost)} given up. Keep doing what you're doing here.`}
          title={best.area.name}
          cta="See the spots"
        >
          <StatDetail detail={areaDetail(best)} />
        </TldrCard>
      )}
    </div>
  );
}
