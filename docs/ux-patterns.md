# UX patterns

How screens in PokerWiz are put together, so a new one feels like the rest. The app is used mostly on an iPhone,
so every pattern starts from a small screen and grows to a desktop one.

## The rule: tap anything, land somewhere that makes sense

Every number, row, chip and badge that looks tappable leads somewhere inside its own branch, one level down: a
country opens its cities, a team its players, a stat all of its stats. In PokerWiz that reads as:

```
Leaks            the list of leaks, costliest first
  Facing a river bet     one leak: its numbers, your play against GTO's, a breakdown
    BB (a seat)            a group of it: the spots, narrowed to that seat
      AJo, called a bet      one decision: its sheet, with the hand, the bars and the way on
        Review / Replay / Drill / Open the hand
```

A dead end (a tap that does nothing, a number with no story) is a bug.

Every box with a number in it is a button: it opens a sheet with the story behind the number (`StatDetail`), and
the sheet ends with the way on. That holds for the home page's stats, goals and recent sessions, Game History's
totals and months, a session's numbers and grade, Hand Insights' boxes and bars, the profile's record, a live
session's numbers, the Goals score and the range tile. A list row follows the same order on a phone: a hand in
the hand list opens its short version first (`HandSheet`), with "Open the full hand" at its foot.

## The pieces

| Piece | What it is for | Where |
| --- | --- | --- |
| **TLDR card** (`TldrCard`, `InsightCard`) | The headline and one sentence up front; a tap opens the full story in a sheet. | `components/TldrCard` |
| **Detail** (`StatDetail`) | The inside of that sheet: a lead number, then facts, bars, a breakdown, a list, text and buttons that go on (`actions`). Built as plain data (`utils/insightDetails.js`, `coach/leakDetails.js`). | `components/StatDetail` |
| **Sheet** (`Modal`) | A bottom sheet on a phone: drag its handle down to close. It never goes full screen (no expand button, no pull up): a sheet is the short version, and it ends with the way on to the full page. A centered card on a larger screen. `DetailSheet` makes the card itself grow into a panel on desktop. | `components/Modal`, `DetailSheet` |
| **Drill row** (`DrillRow`) | The standard line of a list that leads somewhere: lead badge, title, subtitle, value, meter, chevron. 64px tall. | `components/DrillRow` |
| **Full screen** (`FullscreenView`) | A grid that needs every pixel. A sheet can open over it. | `components/FullscreenView` |
| **Full-screen graph** (`BankrollFullscreen`) | A graph, and only the graph: on an upright phone it is drawn on its side so turning the phone gives it the long edge. A dot for every session; a tap on one tells its story and leads to it. It lives in the address (`?view=…`, `useUrlFlag`) so Back closes it, and it can open over a sheet (the Full screen button on a detail's curve). | `components/BankrollFullscreen`, `hooks/useUrlFlag` |
| **Chips** (`FilterChips`, `ReadChip`) | Narrow a list, or show a setting that opens a sheet. | `components/FilterChips`, `ReadChip` |
| **Page header with a way back** | A page one level down says where up is. | `PageHeader back={{ to, label }}` |

## Levels

- **A page** is a level of the branch, with its own address (`/leaks`, `/leaks/river-vs-bet`), so Back works and a
  link can point at it. On a wide screen two levels share the screen: the list stays on the left and the open
  item fills the right (`Leaks`).
- **A sheet** is for what doesn't need a place of its own: the story behind a card, one decision, a picker.
- **Filters live in the address** (`?by=position&only=BB&kind=call`), so Back undoes the last tap.

## Small screens

- Tap targets are at least 44px. The main action sits under the thumb (a floating button, or the foot of a sheet).
- Text first, then a tap for more: one plain sentence on the card, the long version in the sheet.
- Numbers come with a word ("−4.2 bb", "early read"), never alone.
- Big blinds only where they add up. One hand or one session is always at one big blind, so it follows the
  BB/$ switch. A total, an average or a curve over several sessions or hands is in big blinds only when all of
  them were played at one big blind; otherwise it is in dollars and says why (`moneyScope` / `handScope` in
  `utils/format.js`, `UnitNote`). A stakes filter brings big blinds back.
- Anything animated respects `prefers-reduced-motion`.
- Check every screen at 390x844 in both themes, and again at 1280x800.
