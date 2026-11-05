// A "too long; didn't read" box: the headline and one plain sentence up front, and a tap opens the full story in
// a sheet (a bottom sheet on phones, the card itself growing into a panel on larger screens). The children are
// the broader description; StatDetail (a detail built by utils/insightDetails.js style data) fits right in. Children
// can also be a function that gets `close`, for content with a way out of the sheet (a link to somewhere else).
import { useRef, useState } from 'react';
import InsightCard from '../InsightCard/InsightCard.jsx';
import DetailSheet from '../DetailSheet/DetailSheet.jsx';

// icon, label, value (the headline), tone ("positive" | "negative"), sentence: what the card shows.
// title: the sheet's title (the label by default). cta: the cue at the bottom of the card ("See more").
export default function TldrCard({ icon, label, value, tone, sentence, title, cta, children }) {
  const cardRef = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <InsightCard ref={cardRef} icon={icon} label={label} value={value} tone={tone} sentence={sentence} cta={cta} onOpen={() => setOpen(true)} />
      <DetailSheet open={open} onClose={() => setOpen(false)} title={title ?? label} originRef={cardRef}>
        {typeof children === 'function' ? children(() => setOpen(false)) : children}
      </DetailSheet>
    </>
  );
}
