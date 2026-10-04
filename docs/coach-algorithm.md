# How the coach works: the GTO engine

Since version 0.3.0 the coach and the Practice opponents run on a game-theory-optimal (GTO) engine
(`src/gto/`). Everyone is assumed to play GTO, and only position and stack depth matter. Player reads
(tendencies, skill levels) are still recorded with hands but aren't used yet (see "Player reads" below).

The engine follows the approach published poker AIs use (Libratus, Pluribus, and solvers like PioSolver and
postflop-solver), scaled to run in a phone's browser:

| | How | Where |
| --- | --- | --- |
| Preflop | Solved offline for 8-handed No-Limit Hold'em at 14 stack depths, cash and tournament (with a big-blind ante) | `scripts/gto/`, `src/gto/preflop/` |
| Postflop | Each street solved in the browser when it's reached, heads-up or multiway, from the ranges the players brought to it | `src/gto/postflop/` |
| A real hand | Followed action by action through both, narrowing every player's range | `src/gto/hand.js` |

## Preflop

### The game

`src/gto/preflop/tree.js` builds the preflop game for one stack depth: 8 seats (UTG, UTG+1, LJ, HJ, CO, BTN, SB,
BB), the sizes real games use, and at most three players seeing a flop.

- Opens: 2.5 bb (2.2 bb at 25-39 bb, 2 bb below that). The small blind raises to 3 bb or completes; the big
  blind checks or raises to 3.5 bb against a completed small blind.
- Facing an open: fold, call (pots of up to three players), or 3-bet: 3x in position, 3.75x from the blinds,
  plus one open size per caller (a squeeze).
- Facing a 3-bet: fold, call or 4-bet (2.3x). Facing a 4-bet: fold, call (heads-up) or all in. Facing all in:
  fold or call.
- A raise of 45% of the stack or more is an all in, and at 40 bb or less every raise spot also has an all-in
  option (opening included: short stacks can open-shove).

### Solving it

`scripts/gto/preflop/cfr.mjs` runs Discounted CFR (Brown and Sandholm 2019: alpha 1.5, beta 0, gamma 2) for
600 iterations. Every player's strategy for all 169 hand classes is updated in each pass of the tree ("vector"
CFR). Card removal between players in the pot is exact at the class level (an AKs player is less likely to
face aces).

Every action keeps a 0.1% probability during training. That way lines the solution avoids are still reached
and get sensible answers: after an unusual limp, or a 3-bet with a hand GTO doesn't 3-bet.

One node-lock: AA and KK facing a single raise always re-raise; the solver still picks between a 3-bet and a
shove. Every published chart plays them that way. The flop model below can't see how much more a big pot is
worth to them, so without the lock the solution drifted into flatting KK against early opens a third of the
time. Everyone else's strategy is solved against the lock.

When the betting ends, a hand is worth (`scripts/gto/preflop/payoffs.mjs`):

- **All in:** its equity. Heads-up it's class against class (Monte Carlo, 40,000 boards per matchup). 3-way
  it's a class against two hands from strength buckets (22 buckets, finer among strong hands). These tables
  are built by `scripts/gto/buildEquityTables.mjs`.
- **A flop is seen:** equity times realization. Each player's share of the pot is
  `e^g * r / (e^g * r + (1 - e)^g * r')`, where:
  - `r` grows in position and with playability: suited, connected, pairs, broadway.
  - `r` shrinks for disconnected offsuit hands.
  - The exponent `g` makes stronger hands win more than their raw equity.
  - All of these fade as the stack-to-pot ratio drops, because with little behind a flop is close to all in.

  This is the one model in the engine (a full postflop solve at every preflop leaf is far too big). Its
  settings were calibrated so the solution matches published solver behavior: premiums always raise and
  re-raise, opening widths grow toward the button, and the big blind defends about half its hands against a
  button open.

### Results (100 bb, cash)

| | |
| --- | --- |
| Opens | UTG ~12%, HJ ~21%, CO ~28%, BTN ~42% |
| Small blind, folded to | about 1/3 fold, 2/5 complete, 1/4 raise |
| AA, KK | Always opened, and always re-raised against a single raise |
| QQ, AK | Always opened, re-raised against a single open almost always (QQ flats early opens at 30-40 bb) |
| Big blind vs a button open | Defends about half: mostly calls, ~13% 3-bets |

Each chart's headline numbers are in `src/gto/preflop/charts/manifest.json`.

### Charts

`scripts/gto/solvePreflop.mjs` solves 14 depths: cash 20, 30, 40, 60, 100, 150 and 200 bb, and with a 1 bb ante
10, 15, 20, 25, 30, 40 and 60 bb. For each it writes a chart (`src/gto/preflop/charts/<name>.pfc`, gzip, 50-220
KB; format in `chartFormat.js`).

A chart holds, for every spot the opponents reach at least 0.01% of the time, the share of each hand class
taking each action (2% steps). It also holds how much worse each action is than the best one (16 levels in big
blinds).

The app loads a chart when it needs it. It picks the nearest depth on a log scale, in the right family (cash,
or ante), for the stack that matters: your stack against the deepest opponent's.

### Real hands on the 8-max tree (`walker.js`)

- **Seats:**
  - 8-handed tables map one to one.
  - Shorter tables play as if the first seats folded: a 6-max UTG is the 8-max lojack.
  - On 9-handed tables, the earliest seat that folds is left out.
  - Players who aren't in a logged hand folded before acting.
- **Sizes:** a real raise maps to the nearest raise the tree has, on a log scale. A limp where GTO only opens
  or folds maps to the open for range purposes; the coach values it halfway between the two.
- **Ranges:** each action multiplies the actor's range by how often each class takes it. An action the
  solution (almost) never takes doesn't wipe the range out: it keeps its shape.
- **Spots not in the chart:** the closest stored spot stands in. That's the same player, betting level and
  price, with as many of the same players in the pot as possible.
- **Off the tree:** a fourth caller, or 9 players all in a pot, can't be followed exactly. The decisions after
  that are marked "not graded".

## Postflop (`src/gto/postflop/`)

Each street is solved when it's reached, from the start of the street, with the ranges the players arrived
with (`solver.js`). This is "re-solving", as in Libratus. It runs Discounted CFR:
- **Heads-up:** alternating updates, which converge faster.
- **Multiway:** simultaneous updates, so each iteration is one pass.

Every hand of every player is updated in each pass, and card removal is exact between each pair of players
(`showdown.js`).

What keeps it fast enough for a phone:

- **A few sizes** (`sizes.js`). On the street being solved, heads-up:
  - Flop: 33%, plus 75% in position.
  - Turn: 50%, plus 100% in position.
  - River: 33% and 75%, plus 125% in position, and all in.
  - Raises: 2.5-3x the bet.

  Later streets get one size each. All in is added whenever it isn't a giant overbet, and on the river always.
- **The real sizes:** every bet in the hand that isn't in the menu is added at its spot, so the coach values
  exactly what was done.
- **Sampled runouts:** a handful of turn cards and a few rivers per turn, the same sample everywhere in the
  tree.
  - Heads-up flop solves bet on the flop and the turn and check the river down.
  - Turn solves bet on the turn and the river.
  - Multiway solves bet on the street being solved and check the rest down.
  - River solves are exact.
- **Budgets:** about 7 s per street for reviews ("full"), 2.5 s for Practice opponents ("fast"). Less with
  fewer iterations on slow devices.

Heads-up and 3-way pots are solved (4-way solves don't converge in a phone's time budget; decisions in bigger
pots are marked "not graded"). In 3-way pots each player's opponents are treated as independent of each other
(their blockers on each other are left out), and ties are split exactly.

Checks against theory (`tests/gto/postflop.test.mjs`):
- **River, polarized range against a bluff-catcher:** solved to under 1% of the pot from equilibrium (0.15% in
  0.3 s for typical spots). The nuts always bets, part of the air bluffs, and the bluff-catcher calls part of
  the time.
- **3-way:** strategies are proper mixes, and the nuts never folds.

## Grading (`src/coach/analyzeHand.js`, `grading.js`)

For each of your decisions the coach shows every option, how often GTO takes it with your hand, and what it's
worth:
- **Preflop:** the stored loss against the best option.
- **Postflop:** the solve's value for your exact hand, relative to folding.

- An option GTO takes at least 20% of the time is as good as the best one: at equilibrium every mixed option
  is worth the same. Score 100.
- 5-20% of the time: at least "Good" (85-96).
- Rarer than that, the score comes from the value given up: the share of the pot (3% tolerance for beginners,
  1% for pros) and the size in big blinds. On top of that:
  - **Preflop**, an option GTO almost never takes stays below "Good", because the stored losses are coarse.
  - **Postflop**, a play GTO doesn't make is never "Best move". But the right kind of play in a rarely used
    size, at little cost, is still "Good".
- Grades: Best move 97+, Good 80+, Inaccuracy 55+, Mistake 30+, Blunder. Hand accuracy weighs bigger pots more.

The notes explain:
- where the answer comes from
- the price (when facing a bet)
- what GTO does with your hand
- how your play compares, and what it gives up
- close spots
- your equity against their ranges, and against their real cards when they're known

Each villain's range at that point is shown as a grid.

## Practice (`src/practice/`)

Practice deals 8-handed hands where every opponent plays GTO with their real cards (`gtoBot.js`: it samples
the solution's frequencies for its hand). The deal runs until it's your turn in the spot you picked:
- **Preflop:** the whole table.
- **Heads-up or 3-way:** you take over on the flop, turn or river.

Your decisions before the spot are made the same way, so 3-bet and 4-bet pots come up as often as they would
at a table of solvers. From the spot on, the opponents answer with the GTO strategy. When you use a size the
solve doesn't have, the street is re-solved with it.

Everything runs in a web worker (`practice.worker.js`). "Next hand" while the opponents are thinking restarts
it at once. When the hand is over, the coach grades it (with the "fast" budget).

## Player reads (later)

Reads are kept everywhere they were (hands store them, `coach/profiles.js` maps them to model parameters), but
the engine ignores them and their pickers are hidden behind `PLAYER_READS` in `src/gto/config.js`. They would
plug into `src/gto/hand.js`:
- lock a read player's strategy at the spots the read describes (node-locking)
- narrow their range by that strategy
- let the solver answer everyone else against it

## Known limits

- The preflop solution rests on the realization model above, not on postflop solves. It's close to published
  solver charts, with some differences:
  - Early-position opens are a little tighter (UTG ~12% against ~15% in no-rake solves).
  - The big blind defends a little less than no-rake solves, close to raked games.
  - With antes, the small blind completes very wide at short stacks.
  - At 30-40 bb, QQ often flats an early-position open instead of 3-betting it.
- No rake and no ICM: chips are chips.
- Multiway postflop solves bet on one street and check the rest down, and side pots in multiway all-ins aren't
  modeled.
- Values postflop are estimates within the simplified game (a few sizes, sampled runouts), typically within
  1-2% of the pot.

## Regenerating

```bash
node scripts/gto/buildEquityTables.mjs           # equity tables (30-60 s), scripts/gto/data/equity.json
node scripts/gto/solvePreflop.mjs                # all 14 charts, a few minutes each, in parallel
node scripts/gto/solvePreflop.mjs --only cash-100 --iterations 800   # one chart
npm test                                         # includes chart and solver checks
```

The comparison against a full solve with postflop-solver is in `scripts/solver-benchmark/` (needs Rust).
