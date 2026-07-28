# Schedule Studio

A single-file school timetable builder (plain HTML/CSS/JS, no build step). Open `index.html` in a browser, or serve the folder with any static server.

Sign in as `admin` / `admin`. Teachers sign in as `firstname_secondname` with the second name as the password (shown on each teacher card).

## The solver

Generation runs in two phases:

1. **Exact phase** — a depth-first search with backtracking, run across many seeds with most-constrained-first task ordering (subjects whose weekly demand nearly exhausts their teachers' capacity are placed first). Only schedules meeting **every** hard constraint are accepted. Within its node/time budget the search is exact: if a valid timetable exists for a task order, it is found.
2. **Fallback phase** — only when no perfect timetable exists. Every lesson is placed at the spot that breaks the fewest (lowest-weight) constraints, a repair pass relocates offending lessons when that reduces total violations, and the requested number of schedules is returned ranked by fewest broken constraints. Each option lists exactly which constraints it breaks (grouped by type above the timetable) and outlines the affected lessons in red.

An independent audit (`computeScheduleViolations`) re-checks every finished schedule against the configured constraints — availability, clashes, qualification, daily loads, repeat limits, blocked slots, unplaced/extra lessons, and late-cover feasibility — and is re-run after every manual edit.

**Subjects across levels.** A subject name is a curriculum label; Science (First Secondary) and Science (Second Secondary) are distinct *teaching assignments*. Rather than duplicating subjects per level, each teacher card has "Levels taught per subject": untick a level to say the teacher does not teach that subject there. The solver, validation, audit, and every teacher dropdown are level-aware, and the Excel import scopes teachers automatically from their per-level assignments.

**Teacher assignment is a solver decision.** By default each class keeps one teacher per subject for the whole week ("Same teacher all week"), and the solver picks which teacher fits which class best (weekly-capacity aware). "Specific Teacher" picks are honored unless you switch off "Honor fixed teacher picks", which frees the solver to match teachers to classes entirely on its own.

**Constraint priorities.** Each constraint type can be set to High / Normal / Low importance (Constraints tab). When no perfect timetable exists, low-priority constraints are broken first and high-priority ones protected — and candidates are always ranked by *fewest broken constraints*, even over a better overall score.

**Manual edits are permissive.** Moving, swapping, or editing lessons is only blocked when structurally impossible (nonexistent period, two lessons in one class cell). Anything else — clashes, availability, loads, blocked slots — is allowed and immediately flagged in the broken-constraints panel, so deliberate exceptions are possible.

## Branches (streams) and student sectioning

A level can split into branches (e.g. Third Secondary → Art / Science / Math), managed in the **Branches** tab. Branches are per-level objects — an "Art" branch in two levels is two independent things.

- **Students, not classes.** A branch declares its **student count**; the level declares its **number of classes** (0 = auto) and **min/max students per class**. The program packs students into classes automatically.
- **Sharing.** A branch can be allowed to share classes with another branch. Shared branches may be packed into mixed classes (e.g. Science 5 + Engineering 15) and attend their **common subjects together** as one room.
- **Choice subjects.** A requirement row's **Students** field says how many of the branch take that subject (empty = all). Partial-taker subjects (Science: Math *or* Physics; Engineering: Math *or* Chemistry) run as **co-timed choice blocks**: takers from any classes/branches are pooled into teaching groups within the min/max size limits, each group with its own teacher, all simultaneously — so a class's students split to their groups and re-merge afterwards.
- **Size constraints.** Class sizes and group sizes outside [min, max] are flagged as broken constraints on every generated schedule (types "Class size out of bounds" / "Student group size out of bounds", both prioritizable). Exception: a group (or lone class) below the minimum is accepted when the subject's total takers (or the branch's total students) are themselves below the minimum.
- The Branches tab shows the full formation result: every formed class with its branch composition, and every choice group with its member counts and size flags.

## Elective splits (parallel subjects)

Under **Constraints → Elective splits**, part of each selected class can take one subject while the rest take another, at the same time (e.g. German/French). Select **any number of classes** — the matching students from all of them combine into one teaching group per subject, so each weekly occurrence books one teacher per subject simultaneously and every selected class shows a combined cell like "German / French" in that slot. Each teacher's own timetable shows only their subject with the participating classes. A split can also have more than two parallel subjects ("Add Parallel Subject"). Do not additionally give those classes separate weekly requirements for the listed subjects — validation flags that. Need two independent German/French groups (e.g. A-C and D-E)? Create two split rules.

## Timing options

Per level:

- Week-wide start/end time, period length, **minimum period length**, periods per day, and break.
- **Advanced: custom period lengths** — set each period's minutes by hand.
- **Advanced: per-day timing** — any school day can override the level's start/end times, period count, break, and per-period lengths. Days with fewer periods render hatched (unusable) cells in the timetable.

If full-length periods do not fit before the end time, periods after the break are shortened automatically, but never below the minimum period length; start and end times are never broken.

## UX details

- Click a day's name in any availability/blocked grid to toggle the **whole day** on/off at once.
- Adding a teacher scrolls to and focuses the new card.
- Subjects a class/branch doesn't take are collapsed under "N subjects not taken — expand to add or restore".

## Saving

Everything autosaves to this browser's localStorage on every change (and on tab close), so refreshing or signing out and back in restores the last state — including generated schedules, the selected option, and the session. The **Save Draft** button saves immediately and the sidebar shows the last saved time. If storage runs out, generated schedules are trimmed from the save before the setup itself is ever sacrificed.

## Tests

```
node test-solver.mjs    # solver, fallback + violation audit, per-day timing, persistence (54 checks)
node test-import.mjs    # Excel import pipeline (needs the sample workbook .xlsx next to it)
```
