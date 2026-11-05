# Roadmap: what GTO Wizard has that PokerWiz doesn't (yet)

Written 2026-11-03 from a web comparison (third-party reviews, some promotional; check gtowizard.com for exact plans and prices). Fill the gaps over time, in the order below.

## Comparison

| GTO Wizard | PokerWiz today | Gap |
|---|---|---|
| Hand analyzer: upload hands, EV loss and GTO score per decision, filters, stats, saved reports to find your biggest leaks | Per-hand grades (A-F) on every decision | Big. Grades one hand at a time; nothing adds up where you lose the most |
| Nodelocking: tell the solver a player is too passive or aggressive and see how your strategy changes | Built in the engine (Nit, Calling station, Maniac, Drunk, soft lock; `src/gto/players/`, `src/coach/profiles.js`), hidden behind `PLAYER_READS` in `src/gto/config.js` | Mostly UI work |
| Custom drills / Trainer: practice any spot preflop to river, with mistake stats | Practice by position, street and pot type, plus Play again | Small. Missing "drill the spot I keep losing in" |
| Aggregate flop reports across all 1,755 flops | Nothing | Medium. Heavy, but can be computed offline |
| Study browser: range charts, heat maps, EV graphs | Range grids inside reviews only | Small. Charts exist; no page to browse them |
| Multiway preflop, up to 9 players | 8-max tree, limps handled off-tree | Engine work. The user's game is 9-handed |
| AI bet sizing | Fixed size set; street re-solved when a different size is used | Low priority |

## Build order (for a live $1/$3 player)

Status as of 0.7.0 (how the screens fit together is in `docs/ux-patterns.md`):

1. **Leak report. Built** (`/leaks`). Every saved hand is graded in the background; losses are grouped by kind of
   spot (eleven areas, each split by seat, hand, pot, position, role); each area says which way you lean against GTO,
   and tapping goes down to the decision, the hand, a Coach review, a Practice replay or a drill.
2. **Reads on villains. Built.** A read sheet on a saved hand's review (a chip per villain) and on Practice's
   opponents; with a read set the best play and the grade are against that player, and the labels say so. The leak
   report ignores reads.
3. **Drill your leaks. Built.** "Drill it" on any leak (or one group of it, or one decision) deals only that kind of
   spot in Practice (`/practice?drill=...`).
4. **Chart browser. Built** (`/ranges`): see the Ranges page; limped pots aren't in it, because they aren't solved.
5. **Later:** flop reports for common spots (offline, our solver); a true 9-handed preflop tree.

## Next ideas, in the same spirit

- Practice results into the leak report (a "Practice" source next to "Your hands"), so a drilled leak can be seen
  getting smaller.
- A leak's trend by month (is it shrinking?), and a leak card in the session story.
- Spaced repetition: flagged and costly spots come back as a short daily set.
- Hand history import from other sites, so the report has more than the hands saved by hand.

## Not worth copying

Credit-based solving, tournament/ICM formats, the cloud custom solver.

## Housekeeping

- The "Known limits" section of `docs/coach-algorithm.md` still describes the old preflop chart numbers; update before shipping.
- Weak spots to watch: BTN 65s/54s/76s fold slightly too often; limped and multi-limper pots are approximated from the nearest solved spot; odd bet sizes blur grades.
- Flags (Profile > Flagged decisions > Export, then `node scripts/reviewFlags.mjs <file>`) are the feedback loop for all of this.
