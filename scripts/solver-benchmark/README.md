# Coach vs solver benchmark

Measures how close the coach's best play is to a full game-theory-optimal solve, using
[postflop-solver](https://github.com/b-inary/postflop-solver) (open-source CFR solver, AGPL-3.0, fetched at
build time). Since version 0.3.0 the coach is itself a GTO engine (src/gto: solved preflop charts, and each
postflop street re-solved with a few bet sizes and sampled runouts), so this checks how much its
simplifications cost against a solve of the full game.

## What it tests

- **Spot:** single-raised pot, 8-handed, 100 bb. Button opens to 2.5 bb, big blind calls. Both sides use the
  coach's own preflop ranges (the GTO engine's 100 bb charts), so only the postflop logic is tested.
- **Boards:** five textures. K♠7♦2♣ (dry, high), T♦9♦6♥ (wet), A♥8♣3♦ (ace high), 7♣6♣5♦ (low, connected),
  Q♠9♥4♠ (two-tone). Line: flop checked to the button, 33% c-bet called, turn checked through.
- **Solves:** the full game from the flop, trimmed to fit in ~5 GB (flop 33%/75% with raises; turn and
  river 75%, all-in raises). Then the turn and the river are re-solved on their own from the exact ranges
  that reach them, with more sizes (turn 33/75/125%, river 33/75/150%, raises 2.5x and all in). Only the
  flop is scored from the full tree. All solves are within 0.3% of the pot of equilibrium.
- **Scoring:** at each decision point, 24 hands spread across the range. For each, the coach's best play is
  compared with the solver's strategy and its EV for every action:
  - **agree:** the coach's kind of play (fold / check / call / bet-or-raise) is the solver's main one, or
    one it uses 30%+ of the time.
  - **loss%pot:** solver EV of its best play minus solver EV of the coach's kind of play, as a share of the
    pot. This is what following the coach costs against a perfect opponent.
  - **big>5%:** decisions losing more than 5% of the pot.
- Spots the solver's strategy barely reaches (for example the big blind leading 75% on the turn) are
  skipped: their values aren't converged.

## Results

These numbers are from the coach before version 0.3.0 (a model of player tendencies, not a solver), kept for
reference. The GTO engine hasn't been scored yet: run the benchmark to fill this in.

1,560 decisions over the five boards. "Original" is the coach before calibration; "calibrated" is the
current one. Tuning started on K♠7♦2♣ and T♦9♦6♥; A♥8♣3♦ and 7♣6♣5♦ were added later (and helped with
the overbet fix); Q♠9♥4♠ was held out entirely and improved as much as the others (48% → 70% agreement,
1.19% → 0.51% of pot).

| | Original | Calibrated |
| --- | --- | --- |
| Agreement with the solver | 51% | 73% |
| Average loss vs perfect play | 1.12% of pot | 0.47% of pot |
| Big mistakes (over 5% of pot) | 6% | 2% |

By decision point (calibrated vs original):

| Spot | Agree | Loss % pot |
| --- | --- | --- |
| Flop, BB first | 46% (was 7%) | 0.19 (1.04) |
| Flop, BTN after a check | 75% (81%) | 0.05 (0.03) |
| Flop, BB facing 33% | 77% (53%) | 0.46 (2.38) |
| Flop, BB facing 75% | 78% (67%) | 0.12 (0.50) |
| Turn, BB first | 48% (48%) | 0.40 (0.45) |
| Turn, BTN after a check | 63% (68%) | 0.19 (0.20) |
| Turn, BB facing 33% / 75% / 125% | 86% / 80% / 82% (53% / 64% / 71%) | 0.54 / 0.45 / 0.66 (2.03 / 2.27 / 1.90) |
| River, BB first | 62% (54%) | 1.43 (1.07) |
| River, BTN after a check | 81% (40%) | 0.24 (1.04) |
| River, BTN facing a lead | 86% (76%) | 0.49 (0.36) |
| River, BB facing 33% / 75% / 150% | 87% / 79% / 75% (15% / 26% / 77%) | 0.36 / 0.65 / 1.01 (0.90 / 1.56 / 1.08) |

What calibration changed (see docs/coach-algorithm.md): bluffs sized to the value in a range, a defense
floor near minimum defense frequency, being raised back, and asymmetric future value.

Known remaining differences:
- **River, BB first:** the solver bluffs missed draws big and checks bottom pairs; the coach checks the
  draws and value bets bottom pair thin.
- **Turn, BTN after a check:** the coach checks some hands the solver bets, and the other way around. Small
  EV differences.

## Run it

Needs Rust (cargo), Node 22 and about 6 GB of free memory. A board takes 10-25 minutes the first time; results
are cached in `work/`.

```bash
cd scripts/solver-benchmark
cargo build --release          # add RUSTFLAGS="--cap-lints warn" on recent compilers
node run.mjs                   # all boards (or --boards K72,T96)
COACH_DIR=/path/to/other/copy node run.mjs --label old   # score another version of the app
```

Per-hand results land in `work/results_<label>.json`.
