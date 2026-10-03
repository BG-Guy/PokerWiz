// CSV import tests: reading a Regroup session export (utils/csvImport.js) and the session math it feeds
// (utils/stats.js). The fixture is made up but shaped like a real export: quoted notes with commas, line breaks
// and quotes, a missing cash-out, an expense, a tournament, a duplicate row and a broken row.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, readRegroupCsv, importPreview } from '../../src/utils/csvImport.js';
import { sessionProfit, cashGames, tournamentSummary } from '../../src/utils/stats.js';

const HEADER = 'date,format,type,location,buyin,totalExpenses,hours,cashout,bigBlind,smallBlind,ante,notes';
const EXPORT = [
  HEADER,
  '2026-09-30T12:00:00.000Z,CASH,NLH,Philly,900,0,5.5,963,3,1,,"Won a 3 barrel bluff, then lost AJ vs AK\n\nShe said ""nice hand""\n"',
  '2026-08-07T12:00:00.000Z,CASH,NLH,New jersey,300,8,5.55,850,3,1,,Tipped the dealer',
  '2026-08-01T12:00:00.000Z,CASH,NLH,New jersey,1000,0,1,,3,1,,"Very bad game"',
  '2026-07-31T12:00:00.000Z,TOURNAMENT,NLH,Cleveland,250,0,2,,,,,"Lost 2 flips"',
  '2026-07-31T12:00:00.000Z,TOURNAMENT,NLH,Cleveland,250,0,2,,,,,"Lost 2 flips"',
  'not a date,CASH,NLH,Philly,100,0,1,50,2,1,,',
].join('\r\n');

describe('parseCsv', () => {
  it('keeps commas, line breaks and doubled quotes inside quoted fields', () => {
    const rows = parseCsv('a,b\r\n1,"x, y\nz ""q"""\r\n');
    assert.deepEqual(rows, [['a', 'b'], ['1', 'x, y\nz "q"']]);
  });

  it('ignores a byte-order mark and blank lines', () => {
    assert.deepEqual(parseCsv('﻿a,b\n\n1,2\n'), [['a', 'b'], ['1', '2']]);
  });
});

describe('readRegroupCsv', () => {
  const { sessions, warnings, skipped, error } = readRegroupCsv(EXPORT);
  const [first, second, third, tournament] = sessions;

  it('reads every good row once and reports the rest', () => {
    assert.equal(error, null);
    assert.equal(sessions.length, 4);
    assert.equal(skipped.length, 2); // the duplicate tournament and the row without a date
    assert.ok(skipped.some((reason) => reason.includes('twice')));
    assert.ok(skipped.some((reason) => reason.includes("can't be read")));
  });

  it('maps a cash session: stakes, length, money and notes with their line breaks', () => {
    assert.equal(first.date, '2026-09-30');
    assert.equal(first.format, 'cash');
    assert.equal(first.game, 'NLH');
    assert.equal(first.stakes, '$1/$3');
    assert.equal(first.bigBlind, 3);
    assert.equal(first.smallBlind, 1);
    assert.equal(first.venue, 'Philly');
    assert.equal(first.durationMin, 330);
    assert.equal(first.buyIn, 900);
    assert.equal(first.cashOut, 963);
    assert.equal(first.notes, 'Won a 3 barrel bluff, then lost AJ vs AK\n\nShe said "nice hand"');
    assert.ok(first.externalId.startsWith('regroup:2026-09-30T12:00:00.000Z:cash'));
  });

  it('keeps expenses', () => {
    assert.equal(second.expenses, 8);
    assert.equal(sessionProfit(second), 850 - 300 - 8);
  });

  it('counts a missing cash-out as $0 and says so', () => {
    assert.equal(third.cashOut, 0);
    assert.ok(warnings.some((w) => w.includes('no cash-out') && w.includes('$1,000')));
  });

  it('maps a tournament without a big blind', () => {
    assert.equal(tournament.format, 'tournament');
    assert.equal(tournament.stakes, 'Tournament');
    assert.equal(tournament.bigBlind, 0);
    assert.equal(tournament.cashOut, 0);
  });

  it('refuses a file that is not a session export', () => {
    assert.match(readRegroupCsv('name,score\nann,3').error, /missing the date, format, buyin, hours, cashout columns/);
    assert.equal(readRegroupCsv('').error, 'The file is empty.');
  });
});

describe('session math with imports', () => {
  const { sessions } = readRegroupCsv(EXPORT);

  it('previews counts, dates and the net result after expenses', () => {
    const preview = importPreview(sessions);
    assert.equal(preview.count, 4);
    assert.equal(preview.cash, 3);
    assert.equal(preview.tournaments, 1);
    assert.equal(preview.first, '2026-07-31');
    assert.equal(preview.last, '2026-09-30');
    assert.equal(preview.net, 63 + 542 - 1000 - 250);
  });

  it('keeps tournaments out of cash-game stats and sums them on their own', () => {
    assert.equal(cashGames(sessions).length, 3);
    const t = tournamentSummary(sessions);
    assert.equal(t.count, 1);
    assert.equal(t.net, -250);
    assert.equal(t.roi, -1);
  });
});
