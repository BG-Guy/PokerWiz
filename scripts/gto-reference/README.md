# Engine vs TexasSolver

Measures how close PokerWiz's GTO engine (`src/gto`) is to a full solve of the same spot by
[TexasSolver](https://github.com/bupticybee/TexasSolver), an open-source CFR solver whose results match
PioSolver's. TexasSolver is only a measuring tool here: it isn't part of the app and isn't shipped.

## What it compares

- **Spots:** heads-up postflop pots that come up all the time. The starting ranges come from the engine's own
  preflop charts (see `ranges.mjs`), so both solvers start from exactly the same ranges and only the postflop
  is tested. Flops are in `spots.mjs`.
- **The reference:** TexasSolver solves the whole hand from the flop, dealing every turn and river and playing
  every street (see `FLOP_TREE`), to within 0.3% of the pot of equilibrium.
- **The engine:** the app's own solver on the same spot, at the budgets the app uses: `full` (hand reviews)
  and `fast` (Practice).
- **Scores**, at each decision point, for every hand the acting player can have there (weighted by how often
  it gets there):
  - **loss:** the reference's value of its best action minus its value of the engine's play, as a share of
    the pot. What following the engine costs against a perfect opponent.
  - **big:** the share of hands losing more than 5% of the pot.
  - **agree:** the engine's main play is one the reference makes at least 30% of the time.
  - the overall frequency of each action in both, and the reference's own loss (its convergence noise).

## Building TexasSolver

The app needs a local build with a small patch (`texassolver-ev.patch`) that writes each action's value per
hand next to the strategy (the console version only writes strategies). On macOS:

```bash
brew install cmake libomp
git clone -b console https://github.com/bupticybee/TexasSolver.git texassolver   # tested at 6dfb65b
cd texassolver && git apply ../texassolver-ev.patch
OMP=$(brew --prefix libomp)
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  -DOpenMP_C_FLAGS="-Xpreprocessor -fopenmp -I$OMP/include" -DOpenMP_CXX_FLAGS="-Xpreprocessor -fopenmp -I$OMP/include" \
  -DOpenMP_C_LIB_NAMES=omp -DOpenMP_CXX_LIB_NAMES=omp -DOpenMP_omp_LIBRARY=$OMP/lib/libomp.dylib \
  -DCMAKE_EXE_LINKER_FLAGS="-L$OMP/lib -lomp -Wl,-rpath,$OMP/lib"
make -j console_solver && make install
```

If the link step fails with "unknown architecture" in a `.tbd` file, the newest macOS SDK is ahead of the
installed linker: add `-DCMAKE_OSX_SYSROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk` (an older SDK).
The patch also turns off the Python bindings (unused) and raises the macOS target to 11.0.

The scripts look for the build in `scripts/gto-reference/texassolver/install` (a folder or a link to it), or
wherever `TEXAS_SOLVER` points.

## Running

```bash
node scripts/gto-reference/run.mjs                        # every flop, both budgets
node scripts/gto-reference/run.mjs --boards K72,T96 --detail full
node scripts/gto-reference/study.mjs --boards K72         # which shortcut costs what
node scripts/gto-reference/study.mjs --boards K72 --variants app@40,draw2@60   # at equal time
```

A reference flop takes about 35 minutes on a 10-core laptop and 6-10 GB of memory, so solve one at a time
(two at once swap, and both crawl). Results are cached in `work/` by their input, so later runs only solve the
engine side. Reports land in `work/report-<label>.json`.

In the app a solve stops at its time limit (about 7 s for reviews), not at an iteration count, so compare
budgets at equal time: time a pass of each variant, then give each the iterations that fit (`name@iterations`).

## Calibrating the preflop charts

The preflop solver can't play out every flop; it values seeing a flop with a model (raw equity plus what
position, playability and hand strength win or lose on later streets, `scripts/gto/preflop/payoffs.mjs`).
`realization.mjs` measures the real thing with TexasSolver and fits the model to it:

```bash
node scripts/gto-reference/realization.mjs --tag r0                         # measure the app's charts
node scripts/gto-reference/realization.mjs --fit r0 --out model.json        # fit the flop model
node scripts/gto/solvePreflop.mjs --only cash-100 --model model.json --out charts-r1
node scripts/gto-reference/realization.mjs --charts charts-r1 --tag r1 --seed 12
node scripts/gto-reference/realization.mjs --fit r0,r1 --out model.json     # and so on, until the charts settle
```

Each round solves a sample of flops (single-raised and 3-bet pots) from a set of charts, with every starting
hand added to both ranges at a small weight, so every hand is measured, including the ones the charts never
play that way. Measuring only the charts' own ranges keeps a wrong chart wrong: a chart that never flats 77
from the big blind has nothing telling it that flatting 77 is good. A round takes about an hour.

TexasSolver is AGPL-3.0; `texassolver-ev.patch` modifies it and is under the same license.
