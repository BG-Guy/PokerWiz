// The detailed views behind the leak report's cards (the "tap for the full story" sheets), as plain data for the
// StatDetail component: a lead number, then sections (facts, a breakdown with bars, a list, text, and buttons
// that go somewhere). Pure, so it can be tested without a screen.
import { areaById, spotTitle, focusToParams } from './spots.js';
import { summarize, leanSentence, adviceFor, leanLabel, worstRows, focusFor, KINDS } from './leaks.js';
import { plural } from '../utils/format.js';

// Costs are always in big blinds (whatever the app's $/BB switch says): that is how GTO's EV loss is measured.
export const bbText = (n) => `${n.toFixed(Math.abs(n) >= 100 ? 0 : 1)} bb`;
export const lossText = (n) => (n > 0 ? `−${bbText(n)}` : '0 bb');
const pct = (x) => `${Math.round(x * 100)}%`;

// "You called; GTO folds 74%": what you did against what GTO does most with that hand.
const PAST = { fold: 'folded', check: 'checked', call: 'called', raise: 'raised' };
const PRESENT = { fold: 'folds', check: 'checks', call: 'calls', raise: 'raises' };
export function youVsGtoLine(row) {
  const top = KINDS.reduce((best, kind, k) => (row.gto[k] > row.gto[KINDS.indexOf(best)] ? kind : best), 'fold');
  const share = row.gto[KINDS.indexOf(top)];
  if (top === row.you) return `You ${PAST[row.you]}, as GTO mostly does (${pct(share)})`;
  return `You ${PAST[row.you]}; GTO ${PRESENT[top]} ${pct(share)}`;
}

// The button that drills an area (or one group of it) in Practice.
export const drillLink = (areaId, split = null, key = null) => `/practice?${focusToParams(focusFor(areaId, split, key))}`;

// One area: its cost, what you do against what GTO does, advice, the worst spots, and where to go from here.
// open: add a button to the area's own page (off on that page).
export function areaDetail(entry, { open = true } = {}) {
  const { area } = entry;
  const advice = adviceFor(entry, area);
  const worst = worstRows(entry.rows, 3);
  const sections = [
    { type: 'text', title: 'What the numbers say', paragraphs: [leanSentence(entry, area), ...(advice ? [advice] : [])] },
    {
      type: 'facts',
      items: [
        { label: 'Spots', value: String(entry.count), hint: entry.confidence === 'early' ? 'an early read' : entry.confidence === 'growing' ? 'getting clearer' : 'a solid sample' },
        { label: 'Average grade', value: entry.grade?.letter ?? '–', hint: entry.avgScore === null ? 'no spots yet' : `${Math.round(entry.avgScore)} out of 100` },
        { label: 'Costly spots', value: String(entry.mistakes), hint: 'graded D or F' },
        { label: 'Per spot', value: lossText(entry.avgLoss), tone: entry.avgLoss > 0 ? 'negative' : undefined },
      ],
    },
  ];
  if (worst.length && worst[0].loss > 0) {
    sections.push({
      type: 'list',
      title: 'Costliest spots',
      items: worst.filter((row) => row.loss > 0).map((row) => ({ label: `${row.cls} · ${spotTitle(row)}`, hint: youVsGtoLine(row), value: lossText(row.loss), tone: 'negative' })),
    });
  }
  sections.push({
    type: 'actions',
    items: [
      ...(open ? [{ label: 'Open this leak', to: `/leaks/${area.id}`, icon: 'chevronRight' }] : []),
      { label: 'Drill it in Practice', to: drillLink(area.id), icon: 'target', primary: true },
    ],
  });
  return {
    title: area.name,
    lead: { value: lossText(entry.cost), caption: `${plural(entry.count, 'spot')} · ${leanLabel(entry, area) ?? 'no clear lean yet'}`, tone: entry.cost > 0 ? 'negative' : undefined },
    sections,
  };
}

// The overall view: totals, where the cost went by street and by kind of spot, and how to read it.
export function overallDetail(overview) {
  const { total, areas, handsAnalyzed, handsTotal } = overview;
  const letter = total.grade;
  const byStreet = ['Preflop', 'Flop', 'Turn', 'River']
    .map((street) => {
      const own = areas.filter((a) => a.area.street === street);
      const rows = own.flatMap((a) => a.rows);
      return { street, ...summarize(rows) };
    })
    .filter((s) => s.count > 0);
  return {
    title: 'Your play vs GTO',
    lead: { value: letter?.letter ?? '–', caption: `${plural(total.count, 'decision')} in ${plural(handsAnalyzed, 'hand')} · ${letter?.label ?? ''}`, tone: letter?.tone === 'bad' || letter?.tone === 'warning' ? 'negative' : letter?.tone === 'good' ? 'positive' : undefined },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Given up to GTO', value: lossText(total.cost), tone: total.cost > 0 ? 'negative' : undefined, hint: total.count ? `about ${bbText(total.cost / total.count)} a decision` : undefined },
          { label: 'Average score', value: total.avgScore === null ? '–' : String(Math.round(total.avgScore)), hint: 'out of 100' },
          { label: 'Costly spots', value: String(total.mistakes), hint: 'graded D or F' },
          { label: 'Hands analyzed', value: `${handsAnalyzed} of ${handsTotal}`, hint: handsAnalyzed < handsTotal ? 'the rest need more detail or aren’t supported' : undefined },
        ],
      },
      {
        type: 'breakdown',
        title: 'Where it went',
        groups: [
          { key: 'street', label: 'By street', items: byStreet.map((s) => ({ label: s.street, value: -s.cost, display: lossText(s.cost), hint: `${plural(s.count, 'spot')} · average ${s.grade?.letter ?? '–'}` })) },
          { key: 'spot', label: 'By spot', items: areas.map((a) => ({ label: a.area.short, value: -a.cost, display: lossText(a.cost), hint: `${plural(a.count, 'spot')} · average ${a.grade?.letter ?? '–'}` })) },
        ],
      },
      methodSection(),
    ],
  };
}

// How the report works, in plain words (also the body of the "How this works" card).
export function methodSection() {
  return {
    type: 'text',
    title: 'How to read this',
    paragraphs: [
      'Every hand you save is replayed through the coach, and each decision you made is graded against what GTO does with your exact hand in that exact spot.',
      'The cost is the value you gave up by not playing GTO’s way, in big blinds. It adds up across spots of the same kind, so a small leak that comes up all the time can matter more than one rare big mistake.',
      '“You vs GTO” compares how often you fold, call or raise in a kind of spot with how often GTO would, with the hands you actually held. That is where “too passive” or “calls too often” comes from.',
      'Small samples lie. Fewer than 5 spots is an early read, 12 or more is solid. Save more hands to sharpen it, and drill what keeps costing you.',
    ],
  };
}

export function methodDetail() {
  return { title: 'How the leak report works', lead: { value: 'EV', caption: 'what you give up against GTO, spot by spot' }, sections: [methodSection()] };
}

// An area's summary by its id (an area with no spots yet comes back empty), or null for an id that isn't an area.
export function entryFor(areas, id) {
  return areas.find((a) => a.area.id === id) ?? (areaById(id) ? { area: areaById(id), rows: [], ...summarize([]) } : null);
}
