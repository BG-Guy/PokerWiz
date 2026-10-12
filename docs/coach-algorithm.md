# How the coach works: the GTO engine

Since version 0.3.0 the coach and the Practice opponents run on a game-theory-optimal (GTO) engine
(`src/gto/`). Everyone is assumed to play GTO, and only position and stack depth matter. The engine can also
play the best answer to a player's tendencies (see "Player models" below), but that's switched off in the app
for now.

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

One node-lock: the premiums (AA, KK, QQ, AKs, AKo) facing a single raise always re-raise; the solver still
picks between a 3-bet and a shove. Published charts play them that way almost always. The flop model below
can't see how much more a big pot is worth to them, so without the lock the solution drifted into flatting KK
against early opens a third of the time, and QQ flatted early opens at 20-40 bb. Everyone else's strategy is
solved against the lock.

When the betting ends, a hand is worth (`scripts/gto/preflop/payoffs.mjs`):

- **All in:** its equity. Heads-up it's class against class (Monte Carlo, 40,000 boards per matchup). 3-way
  it's a class against two hands from strength buckets (22 buckets, finer among strong hands). These tables
  are built by `scripts/gto/buildEquityTables.mjs`.
- **A flop is seen:** equity times realization. Each player's share of the pot is
  `e^g * r / (e^g * r + (1 - e)^g * r')`, where:
  - `r` grows in position and with playability: suited, connected, pairs, broadway.
  - `r` shrinks for disconnected offsuit hands.
  - The exponent `g` makes stronger hands win more than their raw equity.
  - In 3-way pots playability counts three times as much, and pairs below TT get a set-mining bonus: with two
    opponents, the hands that make the nuts (sets, straights, flushes) win the big pots and dominated offsuit
    hands make second-best ones. Without it the small blind flatted A9o and folded T9s into 3-way pots, and
    the big blind squeezed 44 instead of calling to hit a set.
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
- **Sampled runouts:** a set of turn cards and a few rivers per turn (heads-up flops: 16 turns x 8 rivers for
  reviews, 12 x 6 for Practice), the same sample everywhere in the tree. They're chosen, not drawn at random:
  spread evenly over the four suits and over the ranks, so every flush and straight draw sees its share of
  the cards that complete it. A random handful of turns can miss them, and backdoor draws then look worthless
  (measured against TexasSolver, see "Checked against TexasSolver" below).
  - Heads-up flop solves bet on the flop and the turn and check the river down.
  - Turn solves bet on the turn and the river.
  - Multiway solves bet on the street being solved and check the rest down.
  - River solves are exact.
  - Each training pass of a heads-up flop solve visits only 2 of a turn's rivers, a different spread-out pair
    each pass, so over a few passes every river counts the same. River showdowns are most of a pass's cost,
    so passes get cheaper, and that pays for a bigger sample. In the app the time limit, not a pass count, is
    what ends a solve: measured against TexasSolver at equal time, 16 x 8 with 2 rivers per pass loses 0.28%
    of the pot per decision with 0.1% big mistakes, against 0.38% and 0.7% for 12 x 4 with every river.
    (Run for hundreds of passes, sampling would leave a little noise that visiting every river doesn't; a
    solve in the app never gets that far.)
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

Everyone is graded the same way, against GTO, whatever level they're set to:
- The score comes from the value given up, as a share of the pot and in big blinds. Only half a percent of
  the pot is forgiven as solver noise. In a 20 bb pot, giving up 3% of it scores about 87 (Good), 5% about 77
  and 10% about 58 (Inaccuracy), 20% about 32 (Mistake), and 30% or more is a Blunder. Each big blind given
  up takes about 3% more off, so the same share of a bigger pot scores lower.
- GTO mixes its plays. An option it takes at least 20% of the time scores 100, and one it takes 5-20% of the
  time is at least "Good" (85-96), but only while the solve agrees it costs next to nothing (1.5% and 3% of
  the pot): a quick solve isn't fully converged, and a rare mix can hide a real loss.
- **Preflop**, an option GTO almost never takes stays below "Good", because the stored losses are coarse.
- **Postflop**, a play GTO doesn't make is never "Best move", and once it gives up more than 2% of the pot
  it's at most an "Inaccuracy". But the right kind of play in a rarely used size, at a cost under 2% of the
  pot, is still "Good".
- Grades: Best move 97+, Good 80+, Inaccuracy 55+, Mistake 30+, Blunder.
- Hand accuracy weighs bigger pots more (square root of the pot in big blinds), and bad decisions more (up to
  3x as the score falls), so a blunder isn't averaged away by the easy decisions around it.

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

- **3-bet pots only** (the "Pots" choice): deals that don't become one are dropped before any postflop solve.
  Heads-up and 3-way, the pot was 3-bet before the flop and called. Preflop, the spot is the decision the
  3-bet is about: the 3-bet you make facing one raise (the hand is played GTO to find it, then rebuilt up to
  your decision) or the 3-bet you face after opening or calling (facing one cold is nearly always a fold, so
  those aren't dealt).
- **Play again:** every spot keeps how it came about (the table, everyone's cards, and each action and card
  before your decision). Playing it again rebuilds it exactly, with the same cards still to come or new ones.

Everything runs in a web worker (`practice.worker.js`). "Next hand" while the opponents are thinking restarts
it at once. When the hand is over, the coach grades it (with the "fast" budget).

## Player models (`src/gto/players/`)

The engine can play against players who don't play GTO. A read (a tendency like Nit, Calling station, Maniac or
Drunk, plus a skill level; `coach/profiles.js`) becomes a **model** (`modelFor(profile)`), passed per seat to
`createGtoHand({ models })`. Seats without a read are GTO. The pickers are still hidden behind `PLAYER_READS`
in `src/gto/config.js`; the engine side is ready.

- **Preflop:** the seat plays the charts bent toward its tendency (`players/models.js`): it plays more or fewer
  hands by its width (strongest first), and more calls or more raises by its raise ratio, mixed with the chart
  by its skill. That shapes the range it brings to the flop.
- **Postflop:** at each of its decisions the seat plays its tendency's policy (`players/policy.js`) mixed with
  its own CFR strategy: `(1 - weight) x CFR + weight x policy`, with weight = 1 - skill. The policy works from
  each hand's effective strength on the board (made hand plus draws):
  - facing a bet it continues with the share of its range minimum defence asks for, divided by its fold
    multiplier (a nit folds about 20% more than correct, a calling station about half as often), raises the
    top of its range by aggression, and bluff-raises now and then;
  - checked to, it bets the top of its range (wider when aggressive) and bluffs weak hands (less with big
    sizes for recreational players); aggressive players pick bigger sizes;
  - noise blurs every threshold and adds random play (a drunk is mostly noise).
- **Everyone else** keeps solving with CFR, so their strategy becomes the best answer to that mix: against a
  calling station the bluffs disappear and thin value bets appear; against a nit the bluffs go up
  (`tests/gto/models.test.mjs`). This is node-locking with a soft lock (a restricted Nash response), so a
  wrong read costs less than a full exploit would.

## Checked against TexasSolver (`scripts/gto-reference/`)

TexasSolver (open source, AGPL; built locally, not part of the app) solves the same heads-up flop spots in full
(every runout; its solutions are about 0.3% of the pot from equilibrium), starting from the engine's own
preflop ranges. Each of the engine's decisions is then scored with TexasSolver's values: how much of the pot
following the engine gives up against TexasSolver's best play.

- Button opens, big blind calls; flops K72, T96 and A83; the button after a check and the big blind facing a
  75% bet. Run the way the app runs them (stopped at the time limit), reviews give up 0.28% of the pot per
  decision on average, with big mistakes (over 5% of the pot) on 0.1% of hands, and pick TexasSolver's main
  action 98% of the time. Practice solves: 0.29%.
- The biggest gap left is calling big bets on wet boards (about 0.5% of the pot on T96), from checking the
  river down in flop solves. Betting the river there fixes most of it but takes about five times as long.
- Not checked yet: turn and river decisions, 3-bet pots, and 3-way pots (TexasSolver is heads-up only).

## Known limits

- The preflop solution rests on the realization model above, not on postflop solves, and the model underrates
  calling. Measured against TexasSolver (below), the 100 bb chart is tight where it calls: the big blind folds
  about half the time to a button open (no-rake solves fold well under 40%) and 84% to an UTG open (solves:
  roughly 70%), 3-bets small pairs more than it calls them, and the button flats a cutoff open only about 5% of
  the time.
  `scripts/gto-reference/realization.mjs` measures, with TexasSolver, what every hand earns after the flop.
  Fitting the flop model to that (per hand, or from hand features) fixed the button spots but brought worse
  oddities (opening 75o under the gun, folding A2s on the button, defending three quarters of hands against
  the button). A hand-against-hand model can't express what drives it: implied odds (small pairs and suited
  connectors win stacks from overpairs) and a capped range (a hand the big blind rarely flats does unusually
  well when it does). So the charts keep the hand-written model until the flop model can. `scripts/gto/
  leakScan.mjs` checks every chart for the plays that would look wrong to a player. Other differences from
  published charts:
  - Early-position opens are a little tighter (UTG ~12% against ~15% in no-rake solves).
  - With antes, the small blind completes very wide at short stacks.
- No rake and no ICM: chips are chips.
- Multiway postflop solves bet on one street and check the rest down, and side pots in multiway all-ins aren't
  modeled.
- Values postflop are estimates within the simplified game (a few sizes, sampled runouts): about 0.3% of the
  pot per flop decision against TexasSolver (below). Turn and river decisions haven't been checked yet.

## Regenerating

```bash
node scripts/gto/buildEquityTables.mjs           # equity tables (30-60 s), scripts/gto/data/equity.json
node scripts/gto/solvePreflop.mjs                # all 14 charts, a few minutes each, in parallel
node scripts/gto/solvePreflop.mjs --only cash-100 --iterations 800   # one chart
node scripts/gto/leakScan.mjs                    # rules any sound strategy keeps (premiums re-raise, strong
                                                 # hands bet when checked to, ...): run it before shipping charts
npm test                                         # includes chart and solver checks
```

The comparison against a full solve with postflop-solver is in `scripts/solver-benchmark/` (needs Rust); the
comparison against TexasSolver is in `scripts/gto-reference/` (see its README to build TexasSolver).
