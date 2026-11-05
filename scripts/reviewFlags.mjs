// Replays an exported flags file (Profile > Flagged decisions > Export) through the current engine: for each
// flagged decision, the spot, your note, what the engine said when you flagged it, and what it says now.
//   node scripts/reviewFlags.mjs pokerwiz-flags-2026-11-02.json [--detail full|fast]
import { readFileSync } from 'node:fs';
import { setChartLoader } from '../src/gto/preflop/charts.js';
import { analyzeHand } from '../src/coach/analyzeHand.js';

setChartLoader(async (name) => new Uint8Array(readFileSync(new URL(`../src/gto/preflop/charts/${name}.pfc`, import.meta.url))));

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/reviewFlags.mjs <flags file.json> [--detail full|fast]');
  process.exit(1);
}
const detailAt = process.argv.indexOf('--detail');
const exported = JSON.parse(readFileSync(file, 'utf8'));
if (exported.kind !== 'pokerwiz-flags') throw new Error("This isn't a PokerWiz flags file.");

// An option list on one line: "Check 0% | Bet 8.1 bb (33% pot) 28% (+79.1)".
const optionsLine = (options) => options.map((o) => `${o.label} ${Math.round(o.frequency * 100)}%${o.ev === null || o.ev === undefined ? '' : ` (${o.ev >= 0 ? '+' : ''}${o.ev.toFixed(1)})`}`).join(' | ');

console.log(`${exported.flags.length} flagged decisions, exported ${exported.exportedAt} from version ${exported.appVersion}\n`);
for (const [n, flag] of exported.flags.entries()) {
  const { record, decision: then } = flag;
  const hero = record.players.find((p) => p.role === 'hero');
  const line = record.streets.map((s) => `${s.name}: ${s.actions.map((a) => `${a.actor} ${a.verb}${a.amount ? ` ${a.amount}` : ''}`).join(', ')}`).join(' / ');
  console.log(`#${n + 1} ${flag.source} (${flag.detail}), ${record.stakes.label}, ${hero.position} ${hero.cards.join('')}, board ${record.board.join(' ') || '-'}`);
  console.log(`   ${line}`);
  if (flag.note) console.log(`   Note: "${flag.note}"`);
  console.log(`   Then (${flag.appVersion}): ${then.street}, ${then.grade ?? 'not graded'} (${then.score ?? '-'}), you ${then.you}, GTO ${then.gto}`);
  console.log(`         ${optionsLine(then.options)}`);
  const report = await analyzeHand(record, { detail: detailAt > 0 ? process.argv[detailAt + 1] : flag.detail });
  const now = report.decisions.find((d) => d.index === flag.decisionIndex);
  if (!now) console.log('   Now: this decision is no longer graded');
  else {
    console.log(`   Now: ${now.street}, ${now.graded ? `${now.grade.label} (${now.score}), you ${now.actual.label}, GTO ${now.best.label}` : now.reason}`);
    if (now.graded) console.log(`         ${optionsLine(now.options)}`);
    for (const read of now.reads) console.log(`         ${read.position} range ~${Math.round(read.width * 100)}%: ${read.top.join(' ')}`);
  }
  console.log('');
}
