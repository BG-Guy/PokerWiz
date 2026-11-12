# How the coach works: the GTO engine

Since version 0.3.0 the coach and the Practice opponents run on a game-theory-optimal (GTO) engine
(`src/gto/`). Everyone is assumed to play GTO, and only position and stack depth matter. A player you've set a
read on (a tendency and a skill level) is played as that kind of player instead, and the coach then shows the
best answer to them (see "Player models" below).

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

Two node-locks, both for hands facing a single raise (`src/gto/preflop/premiums.js`, `cfr.mjs`):
- **The premiums (AA, KK, QQ, AKs, AKo) always re-raise**; the solver still picks between a 3-bet and a shove.
  Published charts play them that way almost always. The flop model below can't see how much more a big pot is
  worth to them, so without the lock the solution drifted into flatting KK against early opens a third of the
  time, and QQ flatted early opens at 20-40 bb.
- **The middle pairs (22-99) only call or fold.** The model values a 3-bet with a pair (fold equity, and a pot
  share with no draw to it) above a call, so the unlocked solution 3-bet 55 to 99 every time, from the big blind
  and in position, and called 44 and below. Raising the pairs' implied-odds bonus didn't move it (three times
  the bonus changed nothing). Published solver charts call with all of them, hit a set and win a stack, and
  3-bet the top of the range and the bluffs instead. Where the tree has no call (two callers already in) the
  lock doesn't apply.

Everyone else's strategy is solved against the locks, and the coach shows what a lock rules out a little worse
than the play it allows (`lockedLosses`), so the cost agrees with the strategy.

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
  - Heads-up, pairs up to 99, suited connectors and one-gappers, and suited wheel aces get an implied-odds
    bonus while stacks are deep: they win whole stacks when they hit, which raw equity misses. It's gone by a
    3-bet pot, so it makes flatting them better than re-raising (the big blind used to 3-bet small pairs more
    than it called with them).
  - All of these fade as the stack-to-pot ratio drops, because with little behind a flop is close to all in.

  This is the one model in the engine (a full postflop solve at every preflop leaf is far too big). Its
  settings were calibrated against `scripts/gto/leakScan.mjs` so the solution matches published solver
  behavior: premiums always raise and re-raise, opening widths grow toward the button, and the big blind
  defends about 70% of its hands against a button open (no rake). They were retuned on 2026-11-02: the
  earlier settings folded half the big blind's hands to a button open and 83% to an UTG open, and 3-bet small
  pairs more than they called them. That left 55 to 99 still 3-bet every time (found on the Ranges page on
  2026-11-04), which no setting of the model fixed, so the middle pairs are node-locked to flat (see above).

### Results (100 bb, cash)

| | |
| --- | --- |
| Opens | UTG ~12%, HJ ~22%, CO ~28%, BTN ~40% |
| Small blind, folded to | about 3/10 fold, 46% complete, 1/4 raise |
| AA, KK | Always opened, and always re-raised against a single raise |
| QQ, AK | Always opened, and always re-raised against a single raise |
| Pairs 22-99 | Called against a single raise, never 3-bet (node-locked) |
| Big blind vs a button open | Defends ~71%: calls ~60%, 3-bets ~11% (TT+, A5s, KQs, KJs, JTs, AJo+, KQo) |
| Big blind vs an UTG open | Defends ~29% |
| Known edge | The button folds 54s, and 65s 42% of the time (0.05-0.2 bb decisions for this model) |

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
- **Sizes:** a real raise maps to the nearest raise the tree has, on a log scale.
- **Limps:** the tree has no limps except the small blind's, so a player who limps counts as folded in the
  tree. That keeps every later raise at its real level: an iso-raise is an open, a re-raise over it a 3-bet.
  - The limper's range is kept on the side: a typical live limper's, the opening range of the seat four places
    later, with most premiums removed (they're usually raised).
  - The tree's one limped pot, the small blind limping into the big blind, stands in for what limps lead to.
    The limpers play its small blind (facing a raise: fold, call or re-raise), and a big blind facing only
    limpers plays its big blind.
  - While limpers are in and nobody has raised, raises keep only the top 22% of hands (4% less for each extra
    limper): the limpers still act behind, and the big blind plays them out of position.
  - Your own limp is graded halfway between folding and raising, and advice in limped pots is marked as
    approximate.
  - Before this, a limp read as an open, so an iso-raise read as a 3-bet and a 3-bet over it as a cold 4-bet:
    a range of about AA-JJ and AK, against which QQ checked and folded on J85.
- **Ranges:** each action multiplies the actor's range by how often each class takes it. An action the
  solution (almost) never takes doesn't wipe the range out: it keeps its shape.
- **Spots not in the chart:** the closest stored spot stands in. That's the same player, betting level and
  price, with as many of the same players in the pot as possible.
- **Off the tree:** a fourth caller, or 9 players all in a pot, can't be followed exactly. The preflop
  decisions after that are marked "not graded". The extra caller still gets a range for the flop: the one they
  would call with as the third player in (as if the caller before them had folded), and so does every caller
  after them. Before 2026-11-12 they kept every hand, seven-deuce offsuit included, and so did every postflop
  answer that followed.

## Postflop (`src/gto/postflop/`)

Each street is solved when it's reached, from the start of the street, with the ranges the players arrived
with (`solver.js`). This is "re-solving", as in Libratus. It runs Discounted CFR:
- **Heads-up:** alternating updates, which converge faster.
- **Multiway:** simultaneous updates, so each iteration is one pass.

Every hand of every player is updated in each pass, and card removal is exact between each pair of players
(`showdown.js`).

The strategy a solve returns is the average of its passes, with pass t counting t^4. Discounted CFR's usual
t^2 suits long solves; at the 100 to 1,200 passes a solve gets here, t^4 is closer to equilibrium at every
budget measured (exact best responses, button against big blind: 0.55% of the pot instead of 0.68% on a K72
flop after 110 passes, 0.21% instead of 0.24% on a turn after 260, 3-way 0.054% instead of 0.071%), and it
leaves next to nothing of the first, random passes in the result.

**What a real action says about a range.** A player's range after an action is their range before it times
how often each hand takes that action in the solve. When the solution never takes the action (a bet it doesn't
make, which live players make all the time), three things decide what the range is:

- **Trembles by cost.** On the real line every hand takes the real action a little more often than its
  strategy says (as in the preflop solve), so the answers to it are trained against a range. How much more
  depends on what the action would cost the hand, by the solve's own values: 2% when it costs nothing, e times
  less for every 5% of the pot it gives up. A big bet the solution doesn't make is then made by the hands
  that lose least by making it (the strong ones and the cheapest bluffs). Until 2026-11-12 every hand got the
  same 0.1%, so such a bet was read as the player's whole range: the coach saw top pairs where a river lead
  after two calls is mostly flushes, and raised it all in with bottom set.
- **Sizes near the real one.** A real bet or raise also takes over part of what each hand does with the menu's
  sizes close to it (72% at 1.5 times the size, 38% at twice, 9% at three times). The solution spreads one
  betting range over the sizes it's offered, so a real size between two of them often ends up unused; it's
  then made by a blend of the hands that bet the sizes around it, which is balanced the way they are.
- **Merged sizes.** A real size within 12% of a menu size takes its place in the tree instead of standing
  next to it. Two sizes that close split one strategy between them, and the solve valued them apart by more
  than the difference can be worth (a raise to 44 bb worth 9 bb more than one to 45 bb).

What keeps it fast enough for a phone:

- **A few sizes** (`sizes.js`). On the street being solved, heads-up:
  - Flop: 33%, plus 75% in position.
  - Turn: 50%, plus 100% in position.
  - River: 33% and 75%, plus 125% in position, and all in.
  - Raises: 2.5-3x the bet.

  Later streets get one size each. All in is added whenever it isn't a giant overbet (1.6 pots), and on the
  river always. In reviews, the river of a heads-up turn solve also has it up to 4 pots: a turn play is often
  the first half of a line that ends in a river overbet (a check-raise, then a jam), and without the jam the
  turn half was valued as if the river could only be bet 75%.
- **The real sizes:** every bet in the hand that isn't in the menu is added at its spot (or takes the place
  of the size next to it, see above), so the coach values exactly what was done.
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
  fewer iterations on slow devices. A river solve has no cards to come, so it gets 1,200 passes (600 in
  Practice) in well under a second; it used to stop at 260, after 50 ms.
- **Steady solves:** with `steady: true` (`analyzeHand`, `createGtoHand`, `solvePostflop`) a solve runs the
  number of passes it typically gets, with no time limit, so the answer is the same on every run and machine.
  The time limit makes a close verdict depend on how busy the CPU is; comparisons and tests use steady solves.

Heads-up and 3-way pots are solved (4-way solves don't converge in a phone's time budget; decisions in bigger
pots are marked "not graded"). In 3-way pots each player's opponents are treated as independent of each other
(their blockers on each other are left out), and ties are split exactly.

A street with four or more players still narrows the ranges (`postflop/unsolved.js`): each real action
multiplies the actor's range by how often a player of their kind takes it with each hand (their read's model,
or a typical player's with no read; see "Player models"), keeping a tenth of every hand whatever the action.
So when the pot gets down to three players, the solve starts from ranges that fit the flop: the player who
bet into three opponents on K-7-2 has a king far more often than their preflop range does. Before 2026-11-12
such a street narrowed nothing and the next one started again from the preflop ranges.

Checks against theory (`tests/gto/postflop.test.mjs`):
- **River, polarized range against a bluff-catcher:** solved to under 1% of the pot from equilibrium (0.15% in
  0.3 s for typical spots). The nuts always bets, part of the air bluffs, and the bluff-catcher calls part of
  the time.
- **3-way:** strategies are proper mixes, and the nuts never folds.

Range play from common spots (`tests/gto/ranges.test.mjs`), on the real charts:
- **Ranges by seat and action:** the big blind defends a much wider range against a button open than against
  an UTG open and flats small pairs; a limp keeps every later raise at its real level; a limper's range is
  wide with few premiums.
- **Range against range:** the button bets K72 far more than 765, where the big blind leads more instead;
  against a range capped to high cards it bets 765 almost every time; an iso-raiser bets a king-high board
  against the limper's range.
- **Value against the worse hands in a range:** QQ isolates a limper and bets J85 when the 3-bettor checks.

## Flagging decisions for review (`src/utils/flags.js`)

Every graded decision (hand reviews and Practice) has a **Flag** button with an optional note on what looks
wrong. Flags stay on the device (localStorage, with the whole hand as it was graded) until they're exported
from Profile > Flagged decisions as one JSON file (on iPhone through the share sheet: AirDrop). To review an
exported file against the current engine:

```bash
node scripts/reviewFlags.mjs pokerwiz-flags-2026-11-02.json    # each spot, the note, the verdict then and now
```

## Grading (`src/coach/analyzeHand.js`, `grading.js`)

For each of your decisions the coach shows every option, how often GTO takes it with your hand, and what it's
worth:
- **Preflop:** the stored loss against the best option.
- **Postflop:** the solve's value for your exact hand, relative to folding. When your hand (almost) never
  reaches the spot under the solution (under 2% of the time, because it would have played differently earlier
  on the street), how often GTO takes each option is its best response: the option worth the most. The
  solution's average strategy for such a hand comes from early, unconverged iterations and can contradict its
  values.

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
- Scores stay 0-100 in the data, but the app shows them as letters (src/utils/letterGrade.js, the same scale as
  session grades): A from 85, B from 70, C from 55, D from 40, F below.

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

## Leaks and drills (`src/coach/spots.js`, `leaks.js`, `leakScan.js`, `leakDetails.js`)

The coach grades one hand at a time; the leak report adds the decisions up.

- **Spots.** Every graded decision is labelled with the kind of spot it was (`classifySpot`, read from the hand
  engine's state when you act): one of eleven *areas* (opening, limped pots, facing an open, a 3-bet or a 4-bet,
  and betting or facing a bet on the flop, turn and river), plus your seat, the pot type (limped, single-raised,
  3-bet, 4-bet), whether you were the preflop raiser, whether you were in position and how many players were in.
- **Kept on the hand.** `hand.coachDecisions` holds one small row per graded decision (`packDecisions`): the
  spot, the starting hand and how strong it was on the board, what you did, how often GTO folds, checks, calls
  and raises with that hand, the EV given up (in bb), the pot and the score. The server drops it when the hand
  itself is edited (cards, board, action, stakes, players) so it never describes a different hand; `LEAK_VERSION`
  retires old rows when the labelling changes.
- **The scan.** Opening Leaks grades the hands that have no record yet, one at a time in the coach's worker
  (`leakScan.js`). A hand with decisions after the flop first gets an instant preflop-only pass
  (`analyzeHand(..., { preflopOnly: true })`), then the whole hand with the "fast" budget, biggest pots first.
  Reads set on a hand's players are ignored, so the report always compares you with GTO. A full Coach review
  also saves its decisions (unless it was graded against a read).
- **Adding up.** Per area, and per split of it (seat, kind of hand, hand strength, pot, position, role): how many
  spots, the EV given up, the average score, and *which way you lean*: the play where your share and GTO's share
  (over the hands you actually held) differ the most, when there are at least 5 spots and the gap is 10 points
  or more ("You fold 62% of these; GTO folds 41%"). Under 5 spots is an early read; 12 or more is solid.
- **Drills.** A leak's "Drill it" opens `/practice?drill=river-vs-bet&pos=BB&...`. Practice then deals only that
  kind of spot (`setup.focus`, matched with the same `classifySpot`): preflop, everyone (you too) plays GTO's way
  until your first decision of that kind; postflop, the street is played on, so an out-of-position check can lead
  to facing a bet. A drill isn't remembered for the next visit.

## Player models (`src/gto/players/`)

The engine can play against players who don't play GTO. A read (a tendency like Nit, Calling station, Maniac or
Drunk, plus a skill level; `coach/profiles.js`) becomes a **model** (`modelFor(profile)`), passed per seat to
`createGtoHand({ models })`. Seats without a read are GTO. Reads are set in the app (`PLAYER_READS` in
`src/gto/config.js` switches them on): a chip per villain on a saved hand's coach review (it opens the read
sheet: player types with their usual numbers, a line on how to adjust, and a skill level), the Coach's recorder
(a Reads step) and, for all opponents at once, in Practice's setup. With a read set, the best play and the grade
are against that player, and every label says so (the report's "Graded against your reads" box, "Best" for "GTO");
the leak report ignores reads and always compares you with GTO.

A model is part tendency, part GTO. The tendency's share (its **weight**) is `1 - skill^2`: 97% for a
beginner, 95% for a recreational player, three quarters for a regular, 44% for a strong regular, 10% for a
pro.

- **Preflop** (`players/models.js`): the seat plays the charts bent toward its tendency, mixed with the chart
  by its weight. That shapes the range it brings to the flop.
  - *How many hands:* strongest first. A tighter player plays that share of the chart's hands. A looser one
    folds that much less of what the chart folds, and at least the chart's hands plus the extra ones they
    play overall (their VPIP above an average player's): the chart calls a raise cold with 6% of hands, a
    loose-passive player with about a quarter.
  - *Opening:* the share raised moves toward the profile's raise ratio.
  - *Facing a raise:* the top share of all hands re-raises (2% for a calling station, 4% for a recreational
    player, 7% for a TAG, 14% for a maniac; less than half of that again against a 3-bet) and the rest of the
    hands played call. So a passive player's flatting range holds the hands a solver 3-bets (AQ, AT in the
    blinds) and, now and then, the big pairs.
  - *Limping:* a limper with a read limps as wide as their model plays the seat the limp range comes from.
- **Postflop** (`players/policy.js`): a policy for every hand at every decision, from what the hand is on the
  board: its made strength among all the hands possible there (so "the top 3%" is sets on a dry board and
  the big flushes on a four-flush one) and its draws.
  - *Calling:* by price. The strength a call needs rises with the equity the bet asks for, so the same player
    calls a third of the pot with any pair and folds top pair to four pots. A sticky player's bar is lower, a
    nit's higher; it's higher against a raise, or a bet from the player who raised the street before. Strong
    draws call.
  - *Raising for value:* only near the top of what's possible: about the top 7% on the flop, 5% on the turn
    and 3% on the river against a small bet, less against a big bet or with a big raise, more for an
    aggressive player. So a turn or river raise is two pair or better, and a check-raise all in over a
    pot-sized river bet is the nuts. Passive players slowplay those hands a third of the time or more, so
    their calling range keeps its monsters.
  - *Other raises* come as a share of the value raises: a few bluffs per hundred value raises for a
    recreational player on the river, about one for every two for a maniac; raises with a draw mostly on the
    flop, and mostly by players who play draws fast.
  - *Betting:* for value when the hand is strong enough for the size (bigger bets need stronger hands, and
    unskilled players size by strength: the nuts go big, a thin value bet small). Weak hands bluff at the
    player's rate, small when they're shy of big bluffs. A lead into the last street's aggressor needs a much
    stronger hand; a continuation bet is looser.
  - Noise blurs the thresholds. Only wild players (drunk, tilted) also act at random.
- **In a solve** (`postflop/solver.js`): the street is first solved with everyone playing GTO (60% of the
  budget). Then every modelled player is fixed, at each of their decisions, to a blend of that GTO strategy
  and the policy: per hand, `(GTO + 0.02)^(1 - weight) x policy^weight`, scaled to add up to 1. On that scale a
  play needs both to allow it: what the policy all but rules out (a bluff raise on the river) stays out however
  often GTO makes it, and the 0.02 keeps GTO from ruling out what the policy does (a slowplay).
- **Everyone else** keeps solving against that fixed player, so their strategy becomes the best answer to
  them: against a calling station the bluffs disappear and thin value bets appear, against a nit the bluffs go
  up, and top pair folds to a recreational player's river raise (`tests/gto/models.test.mjs`).

The modelled player doesn't answer back. Until 2026-11-12 their GTO share was its own CFR strategy inside the
same solve (a restricted Nash response), and a model was `skill x that + (1 - skill) x policy`. It was safer
against a wrong read, but it hid the read: a player who "never bluff-raises" got the missing bluffs back from
their adaptive share until calling was right again, so the coach never folded to them. Three more things
drowned the read: a recreational player was still 22% GTO, 15% of every decision was random (so 5% of all
hands jammed any river), and the value threshold was so blurry that a river raise was mostly one pair. Their
river and turn raises came out 80% to 100% hands that a strong bluff-catcher beats. The answer is now a full
exploit of the read, so it's only as good as the read: that's what "Graded against your reads" means.

The policy's numbers are hand-written from how live low-stakes players are known to play (they call too much
before the river, don't fold top pair to a normal bet, rarely bluff big, and raise the turn and river with
the top of their range), not fitted to a database of hands. The hands below are the one outside check.

## Checked against a live coach's hands (`tests/fixtures/hungry-horse/`)

30 spots from the Hungry Horse Poker channel (live $1/$2 to $20/$40, mostly $5/$5), with the play the video
recommends at each of 37 key decisions and the reads it gives the villains. `scripts/youtube/compareSpots.mjs`
runs the coach on each spot twice, everyone GTO and with those reads, and compares. The coach **agrees** when
it makes the video's play at least half the time, is **mixed** from 15%, **close** when it prefers another play
but values the video's within 1% of the pot, and **disagrees** otherwise. Solves are steady, so the table is
the same on every run.

| | Agree | Mixed | Close | Disagree | Not graded | The video's play costs (average) |
|---|---|---|---|---|---|---|
| Everyone GTO, before 2026-11-12 | 9 | 3 | 1 | 23 | 1 | 14.1% of the pot |
| Everyone GTO, now | 6 | 1 | 6 | 23 | 1 | 10.8% |
| With the video's reads, before | 9 | 1 | 1 | 22 | 1 | 26.7% |
| With the video's reads, now | 19 | 0 | 1 | 13 | 1 | 4.9% |

(Three decisions have no reads to apply; one, a flop with four players, isn't graded.)

- **With reads** the coach now makes the video's play in 19 of 33 decisions, from 9: it folds an overpair to a
  recreational player's turn raise in a 3-bet pot, bottom set to a big river lead when the flush comes in, top
  pair to a river raise at 5.6 to 1 and to a rec's triple barrel, and it bets big for value against players
  who don't fold top pair. Before, the reads made things worse than no read (26.7% against 14.1%): the old
  models read every raise as weak.
- **Everyone GTO** it disagrees as often as before, as it should: most of these plays are exploits (folding
  the second nut flush because a recreational player's river check-raise is never a bluff), and a GTO
  opponent does bluff there. What changed is what the coach thinks of them. It no longer gives the second nut
  flush 100% equity against a check-raise (it had ruled the nut flush out of the raiser's range; it's now a
  close call, 20% equity where 22% is needed), or raises a river lead all in with bottom set. The verdicts
  that moved are plays within a big blind or two of each other.
- **Still disagreeing with reads** (13):
  - six big folds of very strong hands (the nut flush on a double-paired board, a rivered set, the second nut
    flush, a low straight). The coach now puts the raiser on the hands the video does, but still finds enough
    worse ones to call at the price: against the second nut flush, a recreational player's river check-raise
    is the nut flush about half the time by the model, and the video folds to it always;
  - three value sizings (it bets 75% of the pot where the video goes small with thin value, or overbets, and
    bets half the pot where the video jams kings in a 4-bet pot);
  - three bluffs: two where the video expects top pair to fold to a big river raise, or to a jam after a turn
    check-raise, and the model's players call; and one size (2 pots against a calling station where the video
    goes 4);
  - one bluff-catch: third pair against a half-pot river bet, a fold by 0.6 bb.

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

- The preflop solution rests on the realization model above, not on postflop solves. It was calibrated to
  published solver behavior and checked against TexasSolver, but a hand-against-hand model can't express
  everything that drives what a hand earns after the flop: implied odds (small pairs and suited connectors win
  stacks from overpairs, which the implied-odds bonus covers) and a capped range (a hand the big blind rarely
  flats does unusually well when it does). `scripts/gto-reference/realization.mjs` measures, with TexasSolver,
  what every hand earns after the flop; fitting the model to that per hand brought worse oddities (opening
  75o under the gun, folding A2s on the button), so the charts keep the hand-written model.
  `scripts/gto/leakScan.mjs` checks every chart for the plays that would look wrong to a player. Remaining
  differences from published charts:
  - Early-position opens are a little tighter (UTG ~12% against ~15% in no-rake solves).
  - The button folds 65s and 54s, and 76s a tenth of the time.
  - With antes, the small blind completes very wide at short stacks.
  - Limped pots aren't solved: the walker plays them off the nearest solved spot (see above).
- No rake and no ICM: chips are chips.
- Multiway postflop solves bet on one street and check the rest down, and side pots in multiway all-ins aren't
  modeled.
- Values postflop are estimates within the simplified game (a few sizes, sampled runouts): about 0.3% of the
  pot per flop decision against TexasSolver (above; measured before 2026-11-12 and not rerun since, because
  TexasSolver isn't built on this machine. The changes of that day were checked with exact best responses
  inside the engine's own game instead). Turn and river decisions haven't been checked yet.
- Player models:
  - A read is a tendency and a level, not this player. The answer is a full exploit of the model, so a wrong
    read costs more than it did while the model answered back.
  - The policy doesn't remember earlier streets beyond who bet last and whether they raised: a line like
    "check-raised the turn, jams the river" gets more credit only through that.
  - With several players modelled (Practice gives every opponent the same read), each is fixed to their own
    blend; they don't adjust to one another.
  - Its numbers are hand-written, and 30 spots from one coach are the only outside check.

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
