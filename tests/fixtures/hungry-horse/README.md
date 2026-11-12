# YouTube hands: Hungry Horse Poker

Hands from the 24 most-viewed videos of the Hungry Horse Poker channel, read from the videos' auto-captions on
2026-11-11, kept as test data for the coach.

| File | What it holds |
|---|---|
| `hands.json` | All 346 hands found in the transcripts, as described in the video: positions, cards, action by street, what happened and the narrator's reasoning, with a link to the moment in the video. Details the video doesn't give are `null`. |
| `spots.json` | 30 of them as playable app hands (stakes, stacks, cards, every action), with the play the video recommends at each key decision (37 decisions) and the reads it gives the villains. `assumptions` lists what was filled in (suits, a missing bet size, stacks). |
| `results.json` | The latest comparison: what the coach plays at each key decision, everyone GTO and with the video's reads, next to the video's play. |

## Rerun the comparison

```
node scripts/youtube/compareSpots.mjs --jobs 6        # all 30 spots, rewrites results.json (about 3 minutes; 10 without --jobs)
node scripts/youtube/compareSpots.mjs --only hh-04    # one spot, printed only
node scripts/youtube/compareSpots.mjs --out file.json # ... or written somewhere else, to compare two versions
```

Solves are steady (a fixed number of passes, no time limit), so the same code gives the same file on every run
and machine. `--timed` stops them at the app's time limit instead, the way a review in the app does; verdicts
on close spots then change with how busy the CPU is.

Each key decision gets a verdict from how often the coach makes the video's play: **agree** (50% or more) or
**mixed** (15% to 50%). Under 15% it's **close** when the video's play gives up at most 1% of the pot by the
coach's numbers (the coach prefers another play but has no real objection: with two plays worth the same,
which one it calls best is a coin flip) and **disagree** otherwise. **Not offered** means the play isn't
among the coach's options (a size its menu doesn't have), **not graded** that the coach can't solve the spot
(4 players on the flop). `youtubeEvLossBB` is what the video's play costs by the coach's numbers,
`youtubeEvLossPot` the same as a share of the pot, and the totals carry its average (`averageLossPot`).

The results, before and after the engine changes of 2026-11-12, are in `docs/coach-algorithm.md` ("Checked
against a live coach's hands").

## Things to know

- The app has no straddle: a straddled pot is played with the straddle as the big blind.
- The videos are mostly live $5/$5 at 9-handed tables, so the coach maps them onto its 8-max charts.
- The video's play is often an exploit of low-stakes players (they don't bluff big, they don't fold a pair). The
  run with reads is the fair comparison for those; the GTO run shows where the two philosophies differ.
- `tests/coach/youtubeSpots.test.mjs` checks that every spot still replays and that `results.json` covers it.
