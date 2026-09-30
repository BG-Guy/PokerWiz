# PokerWiz

A poker tracker for mobile and desktop: a React frontend and a small Express + SQLite backend.

**Features**
- **Play (live session):** start a session (game, stakes, venue, buy-in), then log hands, notes and rebuys on a timeline while you play. Finish with cash-out, a draggable 0 to 5 star rating (one decimal) and a 1 to 5 tilt scale with faces.
- **Add hand:** rebuild a hand on a poker table. You seat the hero and villains, set each stack (exact amount, or Short / Average / Big / Huge), pick known cards, then answer each player's action turn by turn in an animated carousel below the table. All-ins and side pots are handled.
- **Coach:** record a hand with reads on every player: a tendency (Nit, LAG, calling station, drunk...) and a skill level (Beginner to Pro), plus tilt and form, then get an accuracy score and a review of every decision: the best play, the value of every option in dollars, pot odds, equity against their ranges, and a range grid. Saved hands can be opened in the coach too. See [docs/coach-algorithm.md](docs/coach-algorithm.md).
- **Practice:** pick cash or tournament and a spot (preflop, heads-up, 3-way), describe each opponent's tendency, skill level and stack, then play random hands against them to the end, with the turn and river dealt at random or picked by you. Villains act on their real cards using the coach's models, and every decision is graded.
- **Highlights:** Hall of Fame, Wall of Shame, Tilt Tower, Monster Pots and more, from your ratings and results. The top three are on Home.
- **Hand review:** replay hands street by street with your hand and the villains' (face down unless shown), all-ins highlighted, plus verdict, star rating, tilt and notes. Every Hold'em hand has a **Coach** button (in the list and on the hand). Older hands without stacks are rebuilt from the action log, and the review shows what was assumed. Change the reads and it re-runs; the score is saved onto the hand.
- **Game history:** past sessions by month, with filters, rating and tilt.
- **Insights:** leaks and strengths plus hourly by venue, stakes, game and day, all from your sessions. Hand insights live in the Hands tab.
- **Goals:** measured from your real data (hands played, profit, hours, hands reviewed), with pace projections and a "focus next" pick.
- **Big blinds or dollars:** every amount shows in big blinds by default; the BB / $ switch (header on phones, sidebar on desktop) flips the whole app to dollars. Totals across stakes add up each session's result in its own big blinds.
- **Bankroll chart:** bankroll against hours played. Hover or tap it to read any point.
- **Equity calculator:** 2 to 6 hands plus an optional board. It gives exact results when possible and otherwise simulates random boards (in a web worker).

## Run it

```bash
npm install
npm run dev      # web (Vite) + API (Express on :3001); Vite proxies /api to the API
npm run build    # production build into dist/
npm start        # API that also serves dist/ on :3001
node scripts/test-coach.mjs              # coach sanity checks (scripted hands with known answers)
node scripts/generate-preflop-table.mjs  # rebuild the preflop hand ranking
```

The database is created and seeded with sample data on first run at `server/data/pokerwiz.db`. Delete that file to start fresh. It uses Node's built-in `node:sqlite` (Node 22.13+), so there are no native modules to compile.

## Deploy

PokerWiz needs its Node server running, so it can't be hosted on GitHub Pages (static files only).
`render.yaml` deploys it to [Render](https://render.com): **New > Blueprint**, pick this repo, and Render builds the app,
runs `npm start` and keeps the SQLite database on a persistent disk (`POKERWIZ_DB=/var/data/pokerwiz.db`).
Persistent disks need a paid plan. On the free plan the database is reset on every deploy or restart.

## Project structure

```
server/                  Express API
  index.js               App setup, routes, static hosting of dist/
  db/                    SQLite connection, schema.sql, first-run seeding
  models/                Data access (sessions, hands, goals)
  routes/                HTTP endpoints: /api/sessions, /api/hands, /api/goals
  db/migrations.js       One-time data changes (e.g. computed goals)
  seed/                  Sample data loaded on first run

src/
  main.jsx, App.jsx      Entry point and route table
  global.css             Theme tokens (light/dark), reset, base typography
  api/                   Fetch wrappers for each endpoint
  hooks/                 useApi (loading/error state), useMediaQuery
  constants/poker.js     Verdicts, stakes, venues, table positions
  utils/                 Formatting, session stats, goal analysis, cards, hand evaluator, betting engine,
                         highlights, hand and session insights
  coach/                 The coach: ranges, player profiles, equity, EV of every option, grading
  practice/              Practice spots: deals hands and plays villains from their reads
  components/            Reusable UI, one folder each with its CSS
                         (PlayingCard, CardPicker, StarRating, TiltMeter, Modal, NavBar, ...)
  pages/
    Dashboard/           Home, with a live-session banner
    LiveSession/         Start form, live view, timeline, finish sheet
    AddHand/             Records a hand with components/HandRecorder (table, seats, prompts)
    Coach/               Coach mode and its report (accuracy gauge, decision cards, range grid)
    HandHighlights/ HandInsights/
    HandReview/  GameHistory/  Insights/  Goals/
    Equity/              Calculator page + equity.worker.js
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/sessions` | Finished sessions, newest first |
| GET | `/api/sessions/live` | The running session with its timeline, or `null` |
| POST | `/api/sessions` | Start a session `{ game, stakes, bigBlind, venue, buyIn }` |
| POST | `/api/sessions/:id/events` | Timeline entry `{ type: note \| rebuy \| hand, text?, amount?, handId? }` |
| POST | `/api/sessions/:id/finish` | `{ cashOut, rating (0-5), tilt (1-5), notes, hands }` |
| DELETE | `/api/sessions/:id` | Discard a live session |
| GET / POST | `/api/hands` | List hands / save a recorded hand |
| PATCH | `/api/hands/:id` | Update `verdict`, `note`, `title`, `tags` |
| GET | `/api/goals`, `/api/player-stats` | Goals; tracker stats for Insights |

## Design

- **Palette:** `#12181B` ink, `#3F5A60` slate, `#7FC8C2` teal, `#D9F0EE` mist, `#F6FBFB` snow. The tokens are in `src/global.css`.
- **Fonts:** Fredoka for headings and numbers, Nunito for body text.
- **Breakpoints:**
  - Phones (below 768px) get bottom tabs with a raised Play button and a More sheet.
  - Tablets (768px and up) get an icon rail.
  - Desktops (1100px and up) get the full sidebar.
- **Icons**, card suits, card backs, and the hero/villain avatars are all inline SVG. There are no emojis.
