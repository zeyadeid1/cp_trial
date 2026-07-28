// Node harness for the schedule solver, fallback, per-day timing, audit, and
// persistence. Run with: node test-solver.mjs
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const documentStub = {
  addEventListener() {},
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: { setProperty() {} }, classList: { toggle() {}, add() {} }, append() {}, addEventListener() {} }),
  body: { classList: { toggle() {} }, append() {} },
};
const storageBacking = new Map();
const localStorageStub = {
  getItem: (key) => (storageBacking.has(key) ? storageBacking.get(key) : null),
  setItem: (key, value) => storageBacking.set(key, String(value)),
  removeItem: (key) => storageBacking.delete(key),
};

const factory = new Function(
  "document",
  "localStorage",
  "window",
  `${source}
  return { state, createLevel, createSubject, createTeacher, createClass, createGroupingRule, createElectiveRule, createBranch, req,
           classRequirements, syncBranchClasses, findLessonById,
           normalizeAvailability, validateSetup, buildCandidateSchedules, computeScheduleViolations,
           placeTasksExact, placeTasksRelaxed, expandTasks, orderTasks, emptySchedule, repairSchedule,
           levelTimes, effectivePeriodLengths, periodsForDay, maxPeriodsForLevel, dayConfig, levelMinPeriod,
           allowedSubjectPerDay, saveToStorage, loadFromStorage, loadDemo, refreshScheduleMeta,
           attemptMoveOrSwap, scoreSchedule, expectedWeeklyCount };`,
);
const app = factory(documentStub, localStorageStub, {});
const { state } = app;

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function baseConstraints() {
  return {
    honorAvailability: true,
    preventTeacherClashes: true,
    requireQualifiedTeacher: true,
    consistentTeacher: true,
    honorFixedTeachers: true,
    avoidSameSubjectDay: true,
    balanceTeacherLoad: true,
    avoidClassGaps: true,
    morningCore: true,
  };
}

function resetState({ settings = {}, levels = [] } = {}) {
  state.settings = Object.assign({ candidateLimit: 6, maxTeacherPerDay: 6, maxSubjectPerDay: 1, constraintPriorities: {} }, settings);
  state.constraints = baseConstraints();
  state.levels = levels;
  state.subjects = [];
  state.teachers = [];
  state.classes = [];
  state.departments = [];
  state.branches = [];
  state.groupingRules = [];
  state.electiveRules = [];
  state.schedules = [];
  state.selectedSchedule = 0;
  state.selectedLevelId = levels[0]?.id || "";
  state.published = null;
  state.session = null;
}

// Independent verifier (does not reuse the app's auditor internals): checks a
// schedule against requirements, clashes, availability, loads, repeats, and
// blocked slots straight from the class grids.
function independentProblems(schedule) {
  const problems = [];
  const teacherBusy = new Map();
  const seen = new Set();
  state.classes.forEach((klass) => {
    const level = state.levels.find((item) => item.id === klass.levelId);
    const grid = schedule.byClass[klass.id] || {};
    const weekly = {};
    level.days.forEach((day) => {
      const daily = {};
      (grid[day] || []).forEach((lesson, slot) => {
        if (!lesson) return;
        weekly[lesson.subject] = (weekly[lesson.subject] || 0) + 1;
        daily[lesson.subject] = (daily[lesson.subject] || 0) + 1;
        if (klass.blocked[day]?.[slot]) problems.push(`${klass.name} blocked slot used ${day} P${slot + 1}`);
        if (seen.has(lesson.id)) return;
        seen.add(lesson.id);
        const duties = lesson.parts?.length ? lesson.parts : [{ subject: lesson.subject, teacherId: lesson.teacherId }];
        duties.forEach((duty) => {
          const key = `${duty.teacherId}|${day}|${slot}`;
          if (teacherBusy.has(key)) problems.push(`teacher clash at ${key}`);
          teacherBusy.set(key, lesson.id);
          const teacher = state.teachers.find((item) => item.id === duty.teacherId);
          if (!teacher) problems.push(`missing teacher on lesson ${duty.subject}`);
          else {
            if (teacher.availability[day]?.[slot] === false) problems.push(`${teacher.name} unavailable ${day} P${slot + 1}`);
            if (!teacher.subjects.includes(duty.subject)) problems.push(`${teacher.name} unqualified for ${duty.subject}`);
          }
        });
      });
      Object.entries(daily).forEach(([subject, count]) => {
        if (count > app.allowedSubjectPerDay(level, subject)) problems.push(`${klass.name} ${subject} x${count} on ${day}`);
      });
    });
    app.classRequirements(klass).forEach((requirement) => {
      const expected = app.expectedWeeklyCount(requirement);
      if (!expected) return;
      if ((weekly[requirement.subject] || 0) !== expected) {
        problems.push(`${klass.name} ${requirement.subject}: ${weekly[requirement.subject] || 0}/${expected}`);
      }
    });
  });
  (state.electiveRules || []).forEach((rule) => {
    const level = state.levels.find((item) => item.id === rule.levelId);
    if (!level || !(rule.count > 0)) return;
    rule.classIds.forEach((classId) => {
      const grid = schedule.byClass[classId] || {};
      let actual = 0;
      level.days.forEach((day) => (grid[day] || []).forEach((lesson) => {
        if (lesson?.electiveRuleId === rule.id) actual += 1;
      }));
      if (actual !== rule.count) problems.push(`elective ${rule.name} for ${classId}: ${actual}/${rule.count}`);
    });
  });
  state.teachers.forEach((teacher) => {
    const perDay = {};
    teacherBusy.forEach((lessonId, key) => {
      const [teacherId, day] = key.split("|");
      if (teacherId !== teacher.id) return;
      perDay[day] = (perDay[day] || 0) + 1;
    });
    Object.entries(perDay).forEach(([day, count]) => {
      if (count > (teacher.maxPerDay || state.settings.maxTeacherPerDay)) problems.push(`${teacher.name} overloaded on ${day}: ${count}`);
    });
  });
  return problems;
}

// ---------------------------------------------------------------------------
console.log("\n1. Exact solver rescues orders that kill a greedy placer (pigeonhole)");
{
  const level = app.createLevel("Pigeon", { days: ["Sunday"], periodsPerDay: 4, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 1 } });
  state.subjects = [app.createSubject("S", "S", "standard", "#176b5b", 3)];
  state.teachers = [app.createTeacher("Solo Teacher", ["S"], 6)];
  const blockPlans = [[1, 2, 3], [2, 3], [3], []];
  state.classes = blockPlans.map((blockedSlots, index) => {
    const klass = app.createClass(`P${index + 1}`, level.id);
    klass.requirements = [app.req("S", 1)];
    blockedSlots.forEach((slot) => (klass.blocked.Sunday[slot] = true));
    return klass;
  });
  app.normalizeAvailability();
  blockPlans.forEach((blockedSlots, index) => blockedSlots.forEach((slot) => (state.classes[index].blocked.Sunday[slot] = true)));

  let exactWins = 0;
  for (let seed = 0; seed < 8; seed++) {
    const tasks = app.orderTasks(app.expandTasks(seed), seed);
    const schedule = app.emptySchedule();
    const budget = { nodes: 5000, used: 0, deadline: Date.now() + 5000, exhausted: false };
    if (app.placeTasksExact(schedule, tasks, seed, budget)) exactWins += 1;
  }
  check("all 8 seeds solve the unique-solution instance", exactWins === 8, `only ${exactWins}/8`);

  const schedules = app.buildCandidateSchedules();
  check("at least one perfect schedule returned", schedules.length >= 1);
  check("perfect schedule has zero violations", schedules[0]?.violations.length === 0, JSON.stringify(schedules[0]?.violations));
  const slots = state.classes.map((klass) => schedules[0].byClass[klass.id].Sunday.findIndex(Boolean));
  check("unique solution found (C1@P1, C2@P2, C3@P3, C4@P4)", JSON.stringify(slots) === "[0,1,2,3]", JSON.stringify(slots));
  check("independent verifier agrees", independentProblems(schedules[0]).length === 0, independentProblems(schedules[0]).join("; "));
}

// ---------------------------------------------------------------------------
console.log("\n2. Fallback: teacher availability cannot be satisfied");
{
  const level = app.createLevel("Avail", { days: ["Sunday"], periodsPerDay: 2, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 2 } });
  state.subjects = [app.createSubject("Math", "Math", "core", "#176b5b", 5)];
  state.teachers = [app.createTeacher("Mr Adel", ["Math"], 6)];
  const klass = app.createClass("A1", level.id);
  klass.requirements = [app.req("Math", 2)];
  state.classes = [klass];
  app.normalizeAvailability();
  state.teachers[0].availability.Sunday[1] = false;

  const schedules = app.buildCandidateSchedules();
  check("fallback produced schedules", schedules.length >= 1);
  const violations = schedules[0]?.violations || [];
  check("exactly one broken constraint", violations.length === 1, JSON.stringify(violations.map((v) => v.type)));
  check("it is an availability break", violations[0]?.type === "availability", violations[0]?.type);
  check("text names the teacher", violations[0]?.text.includes("Mr Adel"), violations[0]?.text);
  const placedCount = schedules[0].byClass[klass.id].Sunday.filter(Boolean).length;
  check("both lessons still placed", placedCount === 2, String(placedCount));
  const flagged = schedules[0].byClass[klass.id].Sunday.filter((lesson) => lesson?.violations?.length).length;
  check("offending lesson is annotated for the UI", flagged === 1, String(flagged));
}

// ---------------------------------------------------------------------------
console.log("\n3. Fallback: unavoidable teacher clash between two classes");
{
  const level = app.createLevel("Clash", { days: ["Sunday"], periodsPerDay: 1, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 1 } });
  state.subjects = [app.createSubject("Chem", "Chem", "core", "#176b5b", 5)];
  const teacher = app.createTeacher("Ms Dina", ["Chem"], 6);
  state.teachers = [teacher];
  state.classes = ["A", "B"].map((name) => {
    const klass = app.createClass(name, level.id);
    klass.requirements = [app.req("Chem", 1, teacher.id)];
    return klass;
  });
  app.normalizeAvailability();

  const schedules = app.buildCandidateSchedules();
  check("fallback produced schedules", schedules.length >= 1);
  const violations = schedules[0]?.violations || [];
  check("exactly one broken constraint", violations.length === 1, JSON.stringify(violations.map((v) => `${v.type}:${v.text}`)));
  check("it is a clash", violations[0]?.type === "clash", violations[0]?.type);
  check("text names both classes", violations[0]?.text.includes("A") && violations[0]?.text.includes("B"), violations[0]?.text);
  check("both class grids still hold their lesson", Boolean(schedules[0].byClass[state.classes[0].id].Sunday[0]) && Boolean(schedules[0].byClass[state.classes[1].id].Sunday[0]));
}

// ---------------------------------------------------------------------------
console.log("\n4. Fallback: structurally impossible load reports unplaced lessons");
{
  const level = app.createLevel("Tight", { days: ["Sunday"], periodsPerDay: 1, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 2 } });
  state.subjects = [app.createSubject("Sub", "Sub", "standard", "#176b5b", 3)];
  state.teachers = [app.createTeacher("Mr Omar", ["Sub"], 6)];
  const klass = app.createClass("T1", level.id);
  klass.requirements = [app.req("Sub", 2)];
  state.classes = [klass];
  app.normalizeAvailability();

  const schedules = app.buildCandidateSchedules();
  const violations = schedules[0]?.violations || [];
  check("exactly one broken constraint", violations.length === 1, JSON.stringify(violations.map((v) => v.type)));
  check("it is a missing-lesson report", violations[0]?.type === "missing", violations[0]?.type);
  check("text says 1 of 2 placed", violations[0]?.text.includes("1 of 2"), violations[0]?.text);
}

// ---------------------------------------------------------------------------
console.log("\n5. Per-day timing overrides and minimum period length");
{
  const level = app.createLevel("Timing", {
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
    periodsPerDay: 8,
    dayOverrides: { Monday: { startTime: "08:00", endTime: "12:00", periodsPerDay: 5, breakAfter: 2, breakLength: 15, periodLengths: null } },
  });
  resetState({ levels: [level] });
  check("periodsForDay honors the override", app.periodsForDay(level, "Monday") === 5 && app.periodsForDay(level, "Sunday") === 8);
  check("maxPeriodsForLevel spans all days", app.maxPeriodsForLevel(level) === 8);
  const mondayTimes = app.levelTimes(level, "Monday");
  check("Monday has 5 periods starting 08:00", mondayTimes.periods.length === 5 && mondayTimes.periods[0].start === "08:00", JSON.stringify(mondayTimes.periods[0]));
  const capacity = level.days.reduce((sum, day) => sum + app.periodsForDay(level, day), 0);
  check("weekly capacity is 4x8 + 5 = 37", capacity === 37, String(capacity));

  state.subjects = [app.createSubject("S", "S", "standard", "#176b5b", 3)];
  state.teachers = [app.createTeacher("T", ["S"], 8)];
  const klass = app.createClass("K", level.id);
  state.classes = [klass];
  app.normalizeAvailability();
  check("class blocked grid matches per-day sizes", klass.blocked.Monday.length === 5 && klass.blocked.Sunday.length === 8);
  const schedule = app.emptySchedule();
  check("schedule grids match per-day sizes", schedule.byClass[klass.id].Monday.length === 5 && schedule.byClass[klass.id].Thursday.length === 8);

  const shortLevel = app.createLevel("Short", { days: ["Sunday"], startTime: "07:30", endTime: "10:00", periodsPerDay: 5, periodLength: 45, breakAfter: 0, breakLength: 0, minPeriodLength: 25 });
  const lengths = app.effectivePeriodLengths(shortLevel);
  check("shortened periods never drop below the minimum", Math.min(...lengths) === 25, JSON.stringify(lengths));
  const shortTimes = app.levelTimes(shortLevel);
  check("impossible day is flagged as not fitting", shortTimes.fits === false);
}

// ---------------------------------------------------------------------------
console.log("\n6. Solver respects per-day period counts");
{
  const level = app.createLevel("PerDay", {
    days: ["Sunday", "Monday"],
    periodsPerDay: 3,
    breakAfter: 0,
    breakLength: 0,
    dayOverrides: { Monday: { periodsPerDay: 2 } },
  });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 3 } });
  state.subjects = [app.createSubject("S", "S", "standard", "#176b5b", 3)];
  state.teachers = [app.createTeacher("T", ["S"], 6)];
  const klass = app.createClass("K", level.id);
  klass.requirements = [app.req("S", 5)];
  state.classes = [klass];
  app.normalizeAvailability();

  const schedules = app.buildCandidateSchedules();
  check("full-capacity week solved perfectly", schedules.length >= 1 && schedules[0].violations.length === 0, JSON.stringify(schedules[0]?.violations));
  const sunday = schedules[0].byClass[klass.id].Sunday;
  const monday = schedules[0].byClass[klass.id].Monday;
  check("Monday grid has exactly 2 slots, both used", monday.length === 2 && monday.every(Boolean));
  check("Sunday grid has exactly 3 slots, all used", sunday.length === 3 && sunday.every(Boolean));
}

// ---------------------------------------------------------------------------
console.log("\n7. Grouped classes with exact 2+3+1 session pattern (regression)");
{
  const level = app.createLevel("Pattern Test", {
    days: ["Sunday", "Monday", "Tuesday"],
    periodsPerDay: 3,
    breakAfter: 0,
    breakLength: 0,
    sessionPatterns: { Math: [2, 3, 1] },
    subjectBlocks: { Math: 3 },
  });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 1 } });
  state.subjects = [app.createSubject("Math", "Math", "core", "#176b5b", 5)];
  state.teachers = [app.createTeacher("Pattern Teacher", ["Math"], 6)];
  const classA = app.createClass("Pattern A", level.id);
  const classB = app.createClass("Pattern B", level.id);
  const rule = app.createGroupingRule({
    id: "grp_pattern_math",
    subject: "Math",
    levelId: level.id,
    mode: "mandatory",
    groupName: "Pattern Math Group",
    classCount: 2,
    groupCount: 1,
    classIds: [classA.id, classB.id],
    teacherId: state.teachers[0].id,
    periodsPerGroup: 6,
  });
  classA.requirements = [app.req("Math", 6, state.teachers[0].id, false, { groupRuleId: rule.id })];
  classB.requirements = [app.req("Math", 6, state.teachers[0].id, false, { groupRuleId: rule.id })];
  state.classes = [classA, classB];
  state.groupingRules = [rule];
  app.normalizeAvailability();

  const validation = app.validateSetup();
  check("setup validates", validation.ok, validation.messages.join("; "));
  const schedules = app.buildCandidateSchedules();
  check("grouped 2+3+1 pattern generates", schedules.length >= 1);
  check("no violations", schedules[0]?.violations.length === 0, JSON.stringify(schedules[0]?.violations));
  const classLessons = [];
  level.days.forEach((day) => {
    schedules[0].byClass[classA.id][day].forEach((lesson, slot) => {
      if (lesson) classLessons.push({ day, slot, lesson });
    });
  });
  const lengths = [...classLessons.reduce((groups, { lesson }) => groups.set(lesson.groupId, (groups.get(lesson.groupId) || 0) + 1), new Map()).values()].sort((a, b) => a - b).join("+");
  check("block lengths are 1+2+3", lengths === "1+2+3", lengths);
  const mirrored = classLessons.every(({ day, slot, lesson }) => schedules[0].byClass[classB.id][day][slot]?.id === lesson.id);
  check("grouped lessons mirrored across both classes", mirrored);
}

// ---------------------------------------------------------------------------
console.log("\n8. Grouped classes auto-split by feasibility (regression)");
{
  const level = app.createLevel("Auto Split Test", { days: ["Sunday"], periodsPerDay: 2, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level], settings: { candidateLimit: 8, maxTeacherPerDay: 6, maxSubjectPerDay: 2 } });
  state.subjects = [app.createSubject("Math", "Math", "core", "#176b5b", 5)];
  state.teachers = [app.createTeacher("Split Teacher", ["Math"], 6)];
  const splitA = app.createClass("Split A", level.id);
  const splitB = app.createClass("Split B", level.id);
  const splitC = app.createClass("Split C", level.id);
  const splitRule = app.createGroupingRule({
    id: "grp_auto_split_math",
    subject: "Math",
    levelId: level.id,
    mode: "mandatory",
    groupName: "Auto Split Math",
    classCount: 3,
    groupCount: 2,
    classIds: [splitA.id, splitB.id, splitC.id],
    teacherId: state.teachers[0].id,
    periodsPerGroup: 1,
  });
  [splitA, splitB, splitC].forEach((klass) => {
    klass.requirements = [app.req("Math", 1, state.teachers[0].id, false, { groupRuleId: splitRule.id })];
  });
  state.classes = [splitA, splitB, splitC];
  state.groupingRules = [splitRule];
  app.normalizeAvailability();
  splitA.blocked.Sunday = [false, true];
  splitB.blocked.Sunday = [false, true];
  splitC.blocked.Sunday = [true, false];

  const schedules = app.buildCandidateSchedules();
  check("auto-split generates", schedules.length >= 1);
  check("no violations", schedules[0]?.violations.length === 0, JSON.stringify(schedules[0]?.violations?.map((v) => v.text)));
  const first = schedules[0];
  const abTogether = first.byClass[splitA.id].Sunday[0]?.id === first.byClass[splitB.id].Sunday[0]?.id;
  const cSeparate = Boolean(first.byClass[splitC.id].Sunday[1]);
  check("feasible partition chosen (A+B together, C alone)", abTogether && cSeparate);
}

// ---------------------------------------------------------------------------
console.log("\n9. Persistence: save and reload the full state");
{
  const level = app.createLevel("Persist", {
    days: ["Sunday", "Monday"],
    periodsPerDay: 3,
    breakAfter: 0,
    breakLength: 0,
    minPeriodLength: 30,
    dayOverrides: { Monday: { startTime: "09:00", endTime: "12:00", periodsPerDay: 2, breakAfter: 0, breakLength: 0, periodLengths: [50, 40] } },
  });
  resetState({ levels: [level], settings: { candidateLimit: 3, maxTeacherPerDay: 6, maxSubjectPerDay: 3 } });
  state.subjects = [app.createSubject("S", "S", "standard", "#176b5b", 3), app.createSubject("S2", "S2", "standard", "#c05621", 3), app.createSubject("S3", "S3", "standard", "#2b6cb0", 3)];
  state.teachers = [app.createTeacher("Keep Me", ["S"], 6), app.createTeacher("T2", ["S2"], 6), app.createTeacher("T3", ["S3"], 6)];
  const klass = app.createClass("Persist A", level.id);
  klass.requirements = [app.req("S", 4)];
  state.classes = [klass];
  state.electiveRules = [app.createElectiveRule({ name: "Keep Split", levelId: level.id, classIds: [klass.id], count: 1, options: [{ subject: "S2", teacherId: "" }, { subject: "S3", teacherId: "" }] })];
  app.normalizeAvailability();
  state.schedules = app.buildCandidateSchedules();
  state.selectedSchedule = Math.min(1, state.schedules.length - 1);
  state.session = { role: "admin" };
  const savedScheduleCount = state.schedules.length;
  const savedSelected = state.selectedSchedule;

  check("saveToStorage succeeds", app.saveToStorage() === true);
  app.loadDemo();
  check("state replaced by demo", state.levels.length === 3 && state.classes.length === 15);
  check("loadFromStorage succeeds", app.loadFromStorage() === true);
  check("level with overrides restored", state.levels.length === 1 && state.levels[0].name === "Persist");
  check("day override values restored", state.levels[0].dayOverrides.Monday.periodsPerDay === 2 && JSON.stringify(state.levels[0].dayOverrides.Monday.periodLengths) === "[50,40]");
  check("min period length restored", state.levels[0].minPeriodLength === 30);
  check("all schedules restored", state.schedules.length === savedScheduleCount, `${state.schedules.length} vs ${savedScheduleCount}`);
  check("selected schedule index restored", state.selectedSchedule === savedSelected);
  check("session restored (stay signed in)", state.session?.role === "admin");
  check("teacher restored", state.teachers[0]?.name === "Keep Me");
  check("elective rule restored", state.electiveRules[0]?.name === "Keep Split" && state.electiveRules[0]?.options.length === 2);
}

// ---------------------------------------------------------------------------
console.log("\n8b. Elective splits: German/French co-timed across four classes");
{
  const level = app.createLevel("Elect", { days: ["Sunday", "Monday"], periodsPerDay: 3, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 8, maxSubjectPerDay: 1 } });
  state.subjects = [
    app.createSubject("German", "Ger", "standard", "#176b5b", 3),
    app.createSubject("French", "Fr", "standard", "#c05621", 3),
    app.createSubject("Math", "Math", "core", "#2b6cb0", 5),
  ];
  const german = app.createTeacher("Herr Weber", ["German"], 8);
  const french = app.createTeacher("Mme Claire", ["French"], 8);
  const math = app.createTeacher("Mr Nabil", ["Math"], 8);
  const math2 = app.createTeacher("Ms Hala", ["Math"], 8);
  state.teachers = [german, french, math, math2];
  const classes = ["4A", "4B", "4C", "4D"].map((name) => {
    const klass = app.createClass(name, level.id);
    klass.requirements = [app.req("Math", 2)];
    return klass;
  });
  state.classes = classes;
  const rule = app.createElectiveRule({
    name: "Second Language",
    levelId: level.id,
    classIds: classes.map((klass) => klass.id),
    count: 2,
    options: [
      { subject: "German", teacherId: "" },
      { subject: "French", teacherId: "" },
    ],
  });
  state.electiveRules = [rule];
  app.normalizeAvailability();

  const validation = app.validateSetup();
  check("elective setup validates", validation.ok, validation.messages.join("; "));

  // Validation must catch a duplicate per-class requirement for a split subject.
  classes[0].requirements.push(app.req("German", 2));
  const dupCheck = app.validateSetup();
  check("duplicate German requirement is flagged", dupCheck.messages.some((m) => m.includes("already covered")), dupCheck.messages.join("; "));
  classes[0].requirements = classes[0].requirements.filter((r) => r.subject !== "German");

  const schedules = app.buildCandidateSchedules();
  check("elective schedules generated", schedules.length >= 1);
  check("zero violations", schedules[0]?.violations.length === 0, JSON.stringify(schedules[0]?.violations));
  const first = schedules[0];
  const electiveSlots = [];
  level.days.forEach((day) => first.byClass[classes[0].id][day].forEach((lesson, slot) => {
    if (lesson?.electiveRuleId === rule.id) electiveSlots.push({ day, slot, lesson });
  }));
  check("two elective periods placed for 4A", electiveSlots.length === 2, String(electiveSlots.length));
  check("class cell shows combined subject", electiveSlots.every(({ lesson }) => lesson.subject === "German / French"), electiveSlots[0]?.lesson.subject);
  const coTimed = electiveSlots.every(({ day, slot, lesson }) => classes.every((klass) => first.byClass[klass.id][day][slot]?.id === lesson.id));
  check("all four classes share the same elective lessons (co-timed)", coTimed);
  const teachersOk = electiveSlots.every(({ day, slot }) => {
    const gerLesson = first.teacherSlots[german.id][day][slot];
    const frLesson = first.teacherSlots[french.id][day][slot];
    return gerLesson?.subject === "German" && frLesson?.subject === "French"
      && ["4A", "4B", "4C", "4D"].every((name) => gerLesson.className.includes(name));
  });
  check("both teachers booked simultaneously covering all four classes", teachersOk);
  check("independent verifier agrees", independentProblems(first).length === 0, independentProblems(first).join("; "));
}

// ---------------------------------------------------------------------------
console.log("\n8c. Elective splits: fallback reports the broken constraint");
{
  const level = app.createLevel("ElectTight", { days: ["Sunday"], periodsPerDay: 1, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 1 } });
  state.subjects = [
    app.createSubject("German", "Ger", "standard", "#176b5b", 3),
    app.createSubject("French", "Fr", "standard", "#c05621", 3),
  ];
  const german = app.createTeacher("Herr Weber", ["German"], 6);
  const french = app.createTeacher("Mme Claire", ["French"], 6);
  state.teachers = [german, french];
  const classA = app.createClass("5A", level.id);
  state.classes = [classA];
  state.electiveRules = [app.createElectiveRule({
    name: "Second Language",
    levelId: level.id,
    classIds: [classA.id],
    count: 1,
    options: [
      { subject: "German", teacherId: "" },
      { subject: "French", teacherId: "" },
    ],
  })];
  app.normalizeAvailability();
  german.availability.Sunday[0] = false;

  const schedules = app.buildCandidateSchedules();
  check("fallback produced schedules", schedules.length >= 1);
  const violations = schedules[0]?.violations || [];
  check("exactly one broken constraint", violations.length === 1, JSON.stringify(violations.map((v) => `${v.type}:${v.text}`)));
  check("it is Herr Weber's availability", violations[0]?.type === "availability" && violations[0]?.text.includes("Herr Weber"), violations[0]?.text);
}

// ---------------------------------------------------------------------------
console.log("\n9b. Constraint toggles are respected by solver and auditor");
{
  const level = app.createLevel("Toggle", { days: ["Sunday"], periodsPerDay: 2, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 2 } });
  state.constraints.honorAvailability = false;
  state.subjects = [app.createSubject("Math", "Math", "core", "#176b5b", 5)];
  state.teachers = [app.createTeacher("Mr Adel", ["Math"], 6)];
  const klass = app.createClass("A1", level.id);
  klass.requirements = [app.req("Math", 2)];
  state.classes = [klass];
  app.normalizeAvailability();
  state.teachers[0].availability.Sunday[1] = false;

  const schedules = app.buildCandidateSchedules();
  check("with availability off, schedule is perfect", schedules.length >= 1 && schedules[0].violations.length === 0, JSON.stringify(schedules[0]?.violations));
}

// ---------------------------------------------------------------------------
console.log("\n9c. Consistent teacher: one teacher per class-subject all week");
{
  const level = app.createLevel("Consist", { days: ["Sunday", "Monday", "Tuesday", "Wednesday"], periodsPerDay: 2, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 1 } });
  state.subjects = [app.createSubject("Math", "Math", "core", "#176b5b", 5)];
  state.teachers = [app.createTeacher("T1", ["Math"], 6), app.createTeacher("T2", ["Math"], 6)];
  const klass = app.createClass("C1", level.id);
  klass.requirements = [app.req("Math", 4)];
  state.classes = [klass];
  app.normalizeAvailability();

  const schedules = app.buildCandidateSchedules();
  check("schedule generated", schedules.length >= 1 && schedules[0].violations.length === 0);
  const teacherIds = new Set();
  level.days.forEach((day) => schedules[0].byClass[klass.id][day].forEach((lesson) => {
    if (lesson) teacherIds.add(lesson.teacherId);
  }));
  check("all 4 Math periods share one teacher", teacherIds.size === 1, `teachers used: ${teacherIds.size}`);

  state.constraints.consistentTeacher = false;
  const loose = app.buildCandidateSchedules();
  check("with the toggle off, schedules still generate", loose.length >= 1 && loose[0].violations.length === 0);
}

// ---------------------------------------------------------------------------
console.log("\n9d. Free teacher-class matching when fixed picks are off");
{
  const level = app.createLevel("Fit", { days: ["Sunday"], periodsPerDay: 2, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 2 } });
  state.subjects = [app.createSubject("Math", "Math", "core", "#176b5b", 5)];
  const busy = app.createTeacher("Pinned But Unavailable", ["Math"], 6);
  const free = app.createTeacher("Better Fit", ["Math"], 6);
  state.teachers = [busy, free];
  const klass = app.createClass("F1", level.id);
  klass.requirements = [app.req("Math", 2, busy.id)];
  state.classes = [klass];
  app.normalizeAvailability();
  busy.availability.Sunday = [false, false];

  const pinned = app.buildCandidateSchedules();
  check("honoring the pinned teacher breaks constraints", pinned[0]?.violations.length > 0);

  state.constraints.honorFixedTeachers = false;
  const dynamic = app.buildCandidateSchedules();
  check("solver-picked teacher gives a perfect schedule", dynamic.length >= 1 && dynamic[0].violations.length === 0, JSON.stringify(dynamic[0]?.violations));
  const lesson = dynamic[0].byClass[klass.id].Sunday.find(Boolean);
  check("the better-fit teacher was chosen", lesson?.teacherId === free.id);
}

// ---------------------------------------------------------------------------
console.log("\n9e. Branches: classes auto-formed from student counts");
{
  const level = app.createLevel("Third Sec", { days: ["Sunday", "Monday", "Tuesday"], periodsPerDay: 3, breakAfter: 0, breakLength: 0, classCount: 3, maxClassSize: 30 });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 2 } });
  state.subjects = [
    app.createSubject("Math", "Math", "core", "#176b5b", 5),
    app.createSubject("Physics", "Phys", "core", "#c05621", 5),
    app.createSubject("Drawing", "Draw", "light", "#2b6cb0", 2),
  ];
  state.teachers = [
    app.createTeacher("MathT", ["Math"], 6),
    app.createTeacher("PhysT", ["Physics"], 6),
    app.createTeacher("DrawT", ["Drawing"], 6),
  ];
  const science = app.createBranch("Science", level.id, { studentCount: 40, requirements: [app.req("Math", 3), app.req("Physics", 3)] });
  const art = app.createBranch("Art", level.id, { studentCount: 20, requirements: [app.req("Math", 2), app.req("Drawing", 4)] });
  state.branches = [science, art];
  app.syncBranchClasses();
  app.normalizeAvailability();

  check("3 classes formed (2 Science + 1 Art)", state.classes.length === 3, String(state.classes.length));
  check("class names derived from branch", state.classes[0].name === "Third Sec Science 1", state.classes[0].name);
  const sizes = state.classes.map((klass) => (klass.composition || []).reduce((sum, part) => sum + part.students, 0));
  check("students split 20/20/20", JSON.stringify(sizes) === "[20,20,20]", JSON.stringify(sizes));
  const artClass = state.classes.find((klass) => klass.branchId === art.id);
  check("branch requirements flow to classes", app.classRequirements(artClass).find((r) => r.subject === "Drawing")?.count === 4);
  check("Art branch does not take Physics", !app.classRequirements(artClass).some((r) => r.subject === "Physics" && r.count > 0));

  const validation = app.validateSetup();
  check("branch setup validates", validation.ok, validation.messages.join("; "));
  const schedules = app.buildCandidateSchedules();
  check("branch schedules solve perfectly", schedules.length >= 1 && schedules[0].violations.length === 0, JSON.stringify(schedules[0]?.violations));
  check("independent verifier agrees", independentProblems(schedules[0]).length === 0, independentProblems(schedules[0]).join("; "));

  level.classCount = 4;
  app.syncBranchClasses();
  check("raising the level class count re-packs into 4 classes", state.classes.filter((klass) => klass.branchId).length === 4);
  level.classCount = 3;
  app.syncBranchClasses();
  check("lowering it packs back into 3", state.classes.filter((klass) => klass.branchId).length === 3);
}

// ---------------------------------------------------------------------------
console.log("\n9i. Shared branches + choice subjects: mixed classes and pooled student groups");
{
  const level = app.createLevel("Sec3", {
    days: ["Sunday", "Monday", "Tuesday"],
    periodsPerDay: 4,
    breakAfter: 0,
    breakLength: 0,
    classCount: 3,
    minClassSize: 12,
    maxClassSize: 25,
  });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 2 } });
  state.subjects = ["CoreA", "CoreB", "Math", "Physics", "Chemistry"].map((name, i) => app.createSubject(name, name.slice(0, 4), "core", ["#176b5b", "#c05621", "#2b6cb0", "#6b46c1", "#b83280"][i], 4));
  state.teachers = [
    app.createTeacher("CoreA T", ["CoreA"], 6),
    app.createTeacher("CoreB T", ["CoreB"], 6),
    app.createTeacher("Math T1", ["Math"], 6),
    app.createTeacher("Math T2", ["Math"], 6),
    app.createTeacher("Phys T", ["Physics"], 6),
    app.createTeacher("Chem T", ["Chemistry"], 6),
  ];
  const eng = app.createBranch("Eng", level.id, {
    studentCount: 15,
    requirements: [app.req("CoreA", 3), app.req("CoreB", 3), Object.assign(app.req("Math", 3), { students: 5 }), Object.assign(app.req("Chemistry", 3), { students: 10 })],
  });
  const science = app.createBranch("Science", level.id, {
    studentCount: 45,
    shareWithBranchIds: [eng.id],
    requirements: [app.req("CoreA", 3), app.req("CoreB", 3), Object.assign(app.req("Math", 3), { students: 25 }), Object.assign(app.req("Physics", 3), { students: 20 })],
  });
  state.branches = [science, eng];
  app.syncBranchClasses();
  app.normalizeAvailability();

  const formed = state.classes.filter((klass) => klass.branchId);
  check("3 classes formed", formed.length === 3, String(formed.length));
  const mixedClass = formed.find((klass) => (klass.composition || []).length > 1);
  check("one class mixes Science and Eng students", Boolean(mixedClass), JSON.stringify(formed.map((k) => k.composition)));
  check("mixed class is Science 5 + Eng 15", JSON.stringify(mixedClass?.composition.map((p) => p.students)) === "[5,15]", JSON.stringify(mixedClass?.composition));
  const mixedCommon = app.classRequirements(mixedClass).map((r) => r.subject).sort().join(",");
  check("mixed class attends only common subjects together", mixedCommon === "CoreA,CoreB", mixedCommon);

  const schedules = app.buildCandidateSchedules();
  check("schedules generated", schedules.length >= 1);
  const violations = schedules[0]?.violations || [];
  check("exactly one broken constraint (Math overflow group below min)", violations.length === 1 && violations[0].type === "groupSize", JSON.stringify(violations.map((v) => `${v.type}: ${v.text}`)));
  check("violation names Math group 2", violations[0]?.text.includes("Math group 2"), violations[0]?.text);
  check("Chemistry group of 10 is exempt (total takers below minimum)", !violations.some((v) => v.text.includes("Chemistry")));

  const first = schedules[0];
  const secId = `sec_${level.id}`;
  const choiceLessons = [];
  level.days.forEach((day) => first.byClass[formed[0].id][day].forEach((lesson, slot) => {
    if (lesson?.electiveRuleId === secId) choiceLessons.push({ day, slot, lesson });
  }));
  check("3 weekly choice blocks placed", choiceLessons.length === 3, String(choiceLessons.length));
  const coTimed = choiceLessons.every(({ day, slot, lesson }) => formed.every((klass) => first.byClass[klass.id][day][slot]?.id === lesson.id));
  check("choice blocks co-timed across all 3 classes", coTimed);
  const partsOk = choiceLessons.every(({ lesson }) => lesson.parts.length === 4
    && new Set(lesson.parts.map((part) => part.teacherId)).size === 4
    && lesson.parts.filter((part) => part.subject === "Math").length === 2);
  check("each block books 4 groups with 4 distinct teachers (2x Math)", partsOk, JSON.stringify(choiceLessons[0]?.lesson.parts.map((p) => `${p.subject}:${p.students}`)));
  formed.forEach((klass) => {
    const counts = {};
    level.days.forEach((day) => first.byClass[klass.id][day].forEach((lesson) => {
      if (lesson && !lesson.electiveRuleId) counts[lesson.subject] = (counts[lesson.subject] || 0) + 1;
    }));
    check(`${klass.name} attends CoreA x3 and CoreB x3 together`, counts.CoreA === 3 && counts.CoreB === 3, JSON.stringify(counts));
  });
  check("independent verifier agrees", independentProblems(first).length === 0, independentProblems(first).join("; "));
}

// ---------------------------------------------------------------------------
console.log("\n9f. Constraint priorities steer which constraint gets broken");
{
  const level = app.createLevel("Prio", { days: ["Sunday"], periodsPerDay: 2, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 1 } });
  state.subjects = [app.createSubject("Math", "Math", "core", "#176b5b", 5)];
  state.teachers = [app.createTeacher("PT", ["Math"], 6)];
  const klass = app.createClass("P1", level.id);
  klass.requirements = [app.req("Math", 1)];
  state.classes = [klass];
  app.normalizeAvailability();
  state.teachers[0].availability.Sunday = [false, true];
  klass.blocked.Sunday = [false, true];
  // P1 breaks availability (weight 14), P2 breaks blocked slot (weight 12).

  const defaults = app.buildCandidateSchedules();
  check("by default the cheaper constraint breaks (blocked)", defaults[0]?.violations[0]?.type === "blocked", defaults[0]?.violations[0]?.type);

  state.settings.constraintPriorities = { blocked: "high", availability: "low" };
  const reprioritized = app.buildCandidateSchedules();
  check("with blocked=high, availability breaks instead", reprioritized[0]?.violations[0]?.type === "availability", reprioritized[0]?.violations[0]?.type);
  state.settings.constraintPriorities = {};
}

// ---------------------------------------------------------------------------
console.log("\n9g. Manual edits may break constraints and get flagged");
{
  const level = app.createLevel("Manual", { days: ["Sunday"], periodsPerDay: 3, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level], settings: { candidateLimit: 2, maxTeacherPerDay: 6, maxSubjectPerDay: 1 } });
  state.subjects = [app.createSubject("Math", "Math", "core", "#176b5b", 5)];
  state.teachers = [app.createTeacher("MT", ["Math"], 6)];
  const klass = app.createClass("M1", level.id);
  klass.requirements = [app.req("Math", 1)];
  state.classes = [klass];
  app.normalizeAvailability();
  state.teachers[0].availability.Sunday = [true, false, true];

  const schedules = app.buildCandidateSchedules();
  check("perfect schedule found", schedules[0]?.violations.length === 0);
  const schedule = schedules[0];
  const placed = ["Sunday"].flatMap((day) => schedule.byClass[klass.id][day].map((lesson, slot) => ({ lesson, slot })).filter((x) => x.lesson));
  const collectionLike = { type: "class", id: klass.id, grid: schedule.byClass[klass.id] };
  const error = app.attemptMoveOrSwap(schedule, placed[0].lesson.id, "Sunday", 1, collectionLike);
  check("moving into an unavailable slot is allowed", error === "", error);
  app.refreshScheduleMeta(schedule);
  check("the broken constraint is flagged after the move", schedule.violations.length === 1 && schedule.violations[0].type === "availability", JSON.stringify(schedule.violations));
}

// ---------------------------------------------------------------------------
console.log("\n9h. Level-scoped teaching: same subject name, different levels");
{
  const level1 = app.createLevel("First Sec", { days: ["Sunday"], periodsPerDay: 2, breakAfter: 0, breakLength: 0 });
  const level2 = app.createLevel("Second Sec", { days: ["Sunday"], periodsPerDay: 2, breakAfter: 0, breakLength: 0 });
  resetState({ levels: [level1, level2], settings: { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 2 } });
  state.subjects = [app.createSubject("Science", "Sci", "core", "#176b5b", 5)];
  const junior = app.createTeacher("Junior Sci", ["Science"], 6);
  const senior = app.createTeacher("Senior Sci", ["Science"], 6);
  state.teachers = [junior, senior];
  junior.subjectLevels = { Science: [level1.id] };
  senior.subjectLevels = { Science: [level2.id] };
  const class1 = app.createClass("1A", level1.id);
  class1.requirements = [app.req("Science", 2)];
  const class2 = app.createClass("2A", level2.id);
  class2.requirements = [app.req("Science", 2)];
  state.classes = [class1, class2];
  app.normalizeAvailability();

  check("scoped pools: only Junior teaches Science in First Sec",
    JSON.stringify(state.teachers.filter((t) => t.subjects.includes("Science") && (!Array.isArray(t.subjectLevels.Science) || t.subjectLevels.Science.includes(level1.id))).map((t) => t.name)) === '["Junior Sci"]');

  const schedules = app.buildCandidateSchedules();
  check("both levels schedule perfectly", schedules.length >= 1 && schedules[0].violations.length === 0, JSON.stringify(schedules[0]?.violations));
  const teacher1 = new Set(schedules[0].byClass[class1.id].Sunday.filter(Boolean).map((lesson) => lesson.teacherId));
  const teacher2 = new Set(schedules[0].byClass[class2.id].Sunday.filter(Boolean).map((lesson) => lesson.teacherId));
  check("First Sec Science taught by Junior only", teacher1.size === 1 && teacher1.has(junior.id));
  check("Second Sec Science taught by Senior only", teacher2.size === 1 && teacher2.has(senior.id));

  // Remove the senior teacher's scope entirely: Second Sec Science becomes
  // unteachable, validation warns, and the fallback names the level.
  senior.subjectLevels = { Science: [] };
  const validation = app.validateSetup();
  check("validation flags the level-less subject", validation.messages.some((m) => m.includes("no teacher teaches it in Second Sec")), validation.messages.join("; "));
  const fallback = app.buildCandidateSchedules();
  const unq = fallback[0]?.violations.find((v) => v.type === "unqualified");
  check("fallback reports level-scoped unqualified teaching", Boolean(unq) && unq.text.includes("in Second Sec"), JSON.stringify(fallback[0]?.violations.map((v) => v.text)));
}

// ---------------------------------------------------------------------------
console.log("\n10. Demo end-to-end: full-size problem solves with zero violations");
{
  app.loadDemo();
  state.settings.candidateLimit = 3;
  app.normalizeAvailability();
  const validation = app.validateSetup();
  check("demo setup validates", validation.ok, validation.messages.join("; "));
  console.time("  generate (demo)");
  const schedules = app.buildCandidateSchedules();
  console.timeEnd("  generate (demo)");
  check("demo schedules generated", schedules.length >= 1);
  check("best demo schedule has zero violations", schedules[0]?.violations.length === 0, JSON.stringify(schedules[0]?.violations?.slice(0, 3)));
  const problems = independentProblems(schedules[0]);
  check("independent verifier finds no problems", problems.length === 0, problems.slice(0, 5).join("; "));
  const auditor = app.computeScheduleViolations(schedules[0]);
  check("auditor agrees with verifier", auditor.length === 0, JSON.stringify(auditor.slice(0, 3)));
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
