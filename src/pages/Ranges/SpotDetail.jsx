// The sheet behind the "price" card: what is in the pot, what it costs to continue and the equity that needs, the
// action so far and the options open to you with how often the range takes each. Built as a StatDetail.
import { useMemo } from 'react';
import StatDetail from '../../components/StatDetail/StatDetail.jsx';
import { percent } from './actionStyle.js';

const bb = (x) => `${Number(x.toFixed(1))} bb`;

// What this spot's sheet says, as the lead number, facts, lists and notes StatDetail draws.
function spotDetail(grid) {
  const s = grid.scenario;
  const facing = s.toCall > 0;
  // Facing a bet with no call among the options: the pot would have too many players for the solved game.
  const noCall = facing && !s.actions.some((a) => a.family === 'call');
  const sections = [
    {
      type: 'facts',
      items: [
        { label: 'Pot', value: bb(s.pot), hint: 'Before you act' },
        { label: facing ? 'To call' : 'Your raise', value: facing ? bb(s.toCall) : bb(s.actions.find((a) => a.family === 'raise')?.to ?? 0) },
        { label: 'Pot odds', value: facing ? percent(s.potOdds, 1) : '-', hint: facing ? 'Equity to break even' : undefined },
        { label: 'Stacks', value: `${s.stack} bb`, hint: 'Everyone, to start' },
      ],
    },
    { type: 'list', title: 'The action so far', items: s.line.length ? s.line.map((label) => ({ label, value: '' })) : [{ label: `Everyone folds to ${s.position}`, value: '' }] },
    { type: 'list', title: 'Your options', items: grid.order.map((a) => ({ label: grid.actions[a].label, hint: 'Share of your range', value: percent(grid.actions[a].share, 1) })) },
    {
      type: 'text',
      title: 'Good to know',
      paragraphs: [
        noCall
          ? "Calling isn't an option in this spot: the solved game doesn't allow a pot with this many players, so the choice is to raise or fold."
          : facing
            ? `Calling costs ${bb(s.toCall)} to win ${bb(s.pot)}. A hand needs about ${percent(s.potOdds)} equity against the range you face to break even, before counting how it plays after the flop.`
            : `Raising risks more than it wins right away: the pot holds ${bb(s.pot)}. It works because everyone behind often folds, and because the hands that get called play well after the flop.`,
        'The solved game uses a fixed set of sizes (2.5 bb opens, 3x re-raises in position, 3.75x from the blinds, 2.3x 4-bets). A real bet of another size is read as the nearest one.',
      ],
    },
  ];
  return {
    lead: { value: facing ? percent(s.potOdds, 1) : bb(s.pot), caption: facing ? `Equity you need to call ${bb(s.toCall)} into a ${bb(s.pot)} pot` : 'In the middle before you act' },
    sections,
  };
}

export default function SpotDetail({ grid }) {
  const detail = useMemo(() => spotDetail(grid), [grid]);
  return <StatDetail detail={detail} />;
}
