# Schedule Studio

A single-file school timetable builder (plain HTML/CSS/JS, no build step). Open `index.html` in a browser, or serve the folder with any static server.

Sign in as `admin` / `admin`. Teachers sign in as `firstname_secondname` with the second name as the password (shown on each teacher card).

## The solver

Generation runs in two phases:

1. **Exact phase** — a depth-first search with backtracking, run across many seeds with most-constrained-first task ordering (subjects whose weekly demand nearly exhausts their teachers' capacity are placed first). Only schedules meeting **every** hard constraint are accepted. Within its node/time budget the search is exact: if a valid timetable exists for a task order, it is found.
2. **Fallback phase** — only when no perfect timetable exists. Every lesson is placed at the spot that breaks the fewest (lowest-weight) constraints, a repair pass relocates offending lessons when that reduces total violations, and the requested number of schedules is returned ranked by fewest broken constraints. Each option lists exactly which constraints it breaks (grouped by type above the timetable) and outlines the affected lessons in red.

An independent audit (`computeScheduleViolations`) re-checks every finished schedule against the configured constraints — availability, clashes, qualification, daily loads, repeat limits, blocked slots, unplaced/extra lessons, and late-cover feasibility — and is re-run after every manual edit.

## Elective splits (parallel subjects)

Under **Constraints → Elective splits**, part of each selected class can take one subject while the rest take another, at the same time (e.g. German/French). Select **any number of classes** — the matching students from all of them combine into one teaching group per subject, so each weekly occurrence books one teacher per subject simultaneously and every selected class shows a combined cell like "German / French" in that slot. Each teacher's own timetable shows only their subject with the participating classes. A split can also have more than two parallel subjects ("Add Parallel Subject"). Do not additionally give those classes separate weekly requirements for the listed subjects — validation flags that. Need two independent German/French groups (e.g. A-C and D-E)? Create two split rules.

## Timing options

Per level:

- Week-wide start/end time, period length, **minimum period length**, periods per day, and break.
- **Advanced: custom period lengths** — set each period's minutes by hand.
- **Advanced: per-day timing** — any school day can override the level's start/end times, period count, break, and per-period lengths. Days with fewer periods render hatched (unusable) cells in the timetable.

If full-length periods do not fit before the end time, periods after the break are shortened automatically, but never below the minimum period length; start and end times are never broken.

## Saving

Everything autosaves to this browser's localStorage on every change (and on tab close), so refreshing or signing out and back in restores the last state — including generated schedules, the selected option, and the session. The **Save Draft** button saves immediately and the sidebar shows the last saved time. If storage runs out, generated schedules are trimmed from the save before the setup itself is ever sacrificed.

## Tests

```
node test-solver.mjs    # solver, fallback + violation audit, per-day timing, persistence (54 checks)
node test-import.mjs    # Excel import pipeline (needs the sample workbook .xlsx next to it)
```
