// Node harness: runs the app's Excel import pipeline against the bundled
// sample workbook, then validates the setup, generates schedules, and builds
// the PDF/ZIP exports. Run with: node test-import.mjs
import { readFileSync, writeFileSync } from "node:fs";

const source = readFileSync("app.js", "utf8");
const documentStub = {
  addEventListener() {},
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: { setProperty() {} }, classList: { toggle() {} }, append() {}, addEventListener() {} }),
  body: { classList: { toggle() {} }, append() {} },
};
const localStorageStub = { getItem: () => null, setItem() {}, removeItem() {} };

const factory = new Function(
  "document",
  "localStorage",
  "window",
  `${source}
  return { state, readWorkbook, readWorkbookRows, parseWorkbookImport, parseTeacherWorkbook, applyImport, validateSetup,
           buildCandidateSchedules, normalizeAvailability, levelTimes, levelById,
           effectivePeriodLengths, classPdf, teacherPdf, zipStore, safeFileName,
           teacherCredentials, currentRole, attemptMoveOrSwap, scheduleForRole,
           createLevel, createSubject, createTeacher, createClass, createGroupingRule, req };`,
);
const app = factory(documentStub, localStorageStub, {});
const { state } = app;

const buffer = readFileSync("mr_hossam_category_linked_schedule_template.xlsx");
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const workbook = await app.readWorkbook(arrayBuffer);
const parsed = app.parseWorkbookImport(workbook);
console.log(`Teachers parsed: ${parsed.teachers.length}, notes: ${parsed.notes.length}, warnings: ${parsed.warnings.length}`);
console.log(`Workbook sheets: ${workbook.sheets.map((sheet) => sheet.name).join(", ")}`);

const alerts = app.applyImport(parsed);
console.log("\nImport alerts:");
alerts.forEach((alert) => console.log(`  [${alert.type || "note"}] ${alert.text}`));

console.log(`\nState: ${state.subjects.length} subjects, ${state.teachers.length} teachers, ${state.classes.length} classes, ${state.departments.length} departments, ${state.levels.length} levels`);
console.log("Departments:", state.departments.map((d) => `${d.name} [${d.subjectNames.join(", ")}]`).join(" | "));
console.log("Grouping rules:", state.groupingRules.map((rule) => `${rule.groupName}: ${rule.classCount} classes -> ${rule.groupCount} auto-split groups`).join(" | ") || "none");

console.log("\nLevel timing (auto-fit):");
state.levels.forEach((level) => {
  const times = app.levelTimes(level);
  const lengths = app.effectivePeriodLengths(level).join(",");
  console.log(`  ${level.name}: ${level.periodsPerDay} periods [${lengths}] min, break after P${level.breakAfter}, ends ${times.endsAt} (limit ${level.endTime}, fits: ${times.fits})`);
});

console.log("\nFirst Secondary subject check (no Chem/Phy/Bio expected):");
const firstLevel = state.levels[0];
const firstSubjects = new Set();
state.classes.filter((k) => k.levelId === firstLevel.id).forEach((k) => k.requirements.filter((r) => r.count > 0).forEach((r) => firstSubjects.add(r.subject)));
console.log(`  ${[...firstSubjects].join(", ")}`);

["First Secondary A", "Second Secondary A", "Third Secondary A"].forEach((name) => {
  const klass = state.classes.find((item) => item.name === name);
  if (!klass) return;
  const total = klass.requirements.reduce((sum, item) => sum + item.count, 0);
  console.log(`  ${name} (${total}/week): ${klass.requirements.filter((r) => r.count > 0).map((r) => `${r.subject} x${r.count}`).join(", ")}`);
});

state.settings.candidateLimit = 2;
const validation = app.validateSetup();
console.log(`\nValidation: ${validation.ok ? "OK" : "FAILED"}`);
validation.messages.forEach((message) => console.log(`  - ${message}`));

console.time("generate");
const schedules = app.buildCandidateSchedules();
console.timeEnd("generate");
console.log(`Generated ${schedules.length} candidate schedule(s).`);
state.schedules = schedules;
state.selectedSchedule = 0;

if (schedules.length) {
  const schedule = schedules[0];
  const klass = state.classes.find((item) => item.name === "First Secondary A");
  console.log(`\nFirst Secondary A, option 1 (score ${schedule.score}):`);
  firstLevel.days.forEach((day) => {
    const lessons = schedule.byClass[klass.id][day].map((lesson) => (lesson ? lesson.subject.slice(0, 6) : "-"));
    console.log(`  ${day.padEnd(10)} ${lessons.join(" | ")}`);
  });
  // Verify English doubles are consecutive with the same teacher.
  let doubles = 0;
  state.classes.filter((k) => k.levelId === firstLevel.id).forEach((k) => {
    firstLevel.days.forEach((day) => {
      const dayLessons = schedule.byClass[k.id][day];
      for (let s = 0; s + 1 < dayLessons.length; s++) {
        const a = dayLessons[s];
        const b = dayLessons[s + 1];
        if (a && b && a.subject === "English" && b.subject === "English" && a.groupId && a.groupId === b.groupId && a.teacherId === b.teacherId) doubles++;
      }
    });
  });
  console.log(`English double blocks found in First Secondary: ${doubles}`);

  // Build exports.
  const classFiles = state.classes.slice(0, 3).map((k) => ({ name: `Classes/${app.safeFileName(k.name)}.pdf`, data: app.classPdf(schedule, k) }));
  const teacherFiles = state.teachers.slice(0, 3).map((t) => ({ name: `Teachers/${app.safeFileName(t.name)}.pdf`, data: app.teacherPdf(schedule, t) }));
  const files = [...classFiles, ...teacherFiles];
  files.forEach((file) => {
    const head = String.fromCharCode(...file.data.slice(0, 5));
    if (head !== "%PDF-") throw new Error(`Bad PDF header for ${file.name}`);
  });
  const blob = app.zipStore(files);
  const zipBytes = new Uint8Array(await blob.arrayBuffer());
  writeFileSync("test-output.zip", zipBytes);
  writeFileSync("test-output.pdf", classFiles[0].data);
  console.log(`\nZIP built: ${zipBytes.length} bytes with ${files.length} PDFs (written to test-output.zip, first PDF to test-output.pdf)`);

  // --- Login / roles ---
  console.log("\nSample teacher credentials:");
  state.teachers.slice(0, 3).forEach((t) => {
    const creds = app.teacherCredentials(t);
    console.log(`  ${t.name} -> ${creds.username} / ${creds.password}`);
  });
  const hossam = state.teachers.find((t) => t.name.includes("Hossam"));
  console.log(`  ${hossam.name} -> ${app.teacherCredentials(hossam).username} / ${app.teacherCredentials(hossam).password}`);

  state.session = { role: "teacher", teacherId: hossam.id };
  console.log(`Role for ${hossam.name}: ${app.currentRole().type}`);
  const scienceDept = state.departments.find((d) => d.name === "Science");
  scienceDept.hodTeacherId = hossam.id;
  console.log(`Role after HOD assignment: ${app.currentRole().type} of ${app.currentRole().department?.name}`);

  // --- Publish (official schedule) ---
  state.published = JSON.parse(JSON.stringify({ byClass: schedule.byClass, teacherSlots: schedule.teacherSlots, score: schedule.score }));
  state.published.publishedAt = new Date().toISOString();
  const viewerSchedule = app.scheduleForRole(app.currentRole());
  console.log(`HOD sees published schedule: ${viewerSchedule === state.published}`);
  state.session = { role: "admin" };
  console.log(`Admin sees working schedule: ${app.scheduleForRole(app.currentRole()) === schedule}`);

  // --- Swap two lessons in First Secondary A ---
  const grid = schedule.byClass[klass.id];
  const filled = [];
  firstLevel.days.forEach((day) => grid[day].forEach((lesson, slot) => {
    if (lesson) filled.push({ day, slot, lesson });
  }));
  const a = filled[0];
  const b = filled.find((item) => item.lesson.subject !== a.lesson.subject && item.day !== a.day);
  const collectionLike = { type: "class", id: klass.id, grid };
  const error = app.attemptMoveOrSwap(schedule, a.lesson.id, b.day, b.slot, collectionLike);
  if (error) {
    console.log(`Swap attempt (${a.lesson.subject} <-> ${b.lesson.subject}): rejected with "${error}" (constraints held)`);
  } else {
    const nowAtB = grid[b.day][b.slot];
    const nowAtA = grid[a.day][a.slot];
    console.log(`Swap attempt (${a.lesson.subject} <-> ${b.lesson.subject}): success = ${nowAtB?.id === a.lesson.id && nowAtA?.id === b.lesson.id}`);
  }
}

// Focused regression: grouped classes plus exact 2+3+1 session pattern.
const level = app.createLevel("Pattern Test", {
  days: ["Sunday", "Monday", "Tuesday"],
  periodsPerDay: 3,
  breakAfter: 0,
  breakLength: 0,
  sessionPatterns: { Math: [2, 3, 1] },
  subjectBlocks: { Math: 3 },
});
state.settings = { candidateLimit: 4, maxTeacherPerDay: 6, maxSubjectPerDay: 1 };
state.constraints = {
  honorAvailability: true,
  preventTeacherClashes: true,
  requireQualifiedTeacher: true,
  avoidSameSubjectDay: true,
  balanceTeacherLoad: true,
  avoidClassGaps: true,
  morningCore: true,
};
state.levels = [level];
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
state.departments = [];
state.groupingRules = [rule];
state.schedules = [];
app.normalizeAvailability();
const focusedValidation = app.validateSetup();
console.log(`\nFocused grouped pattern validation: ${focusedValidation.ok ? "OK" : "FAILED"}`);
focusedValidation.messages.forEach((message) => console.log(`  - ${message}`));
const focusedSchedules = app.buildCandidateSchedules();
console.log(`Focused grouped pattern schedules: ${focusedSchedules.length}`);
if (!focusedSchedules.length) throw new Error("Focused grouped 2+3+1 schedule did not generate.");
const focused = focusedSchedules[0];
const classLessons = [];
level.days.forEach((day) => {
  focused.byClass[classA.id][day].forEach((lesson, slot) => {
    if (lesson) classLessons.push({ day, slot, lesson });
  });
});
const lengthsByGroup = [...classLessons.reduce((groups, { lesson }) => {
  groups.set(lesson.groupId, (groups.get(lesson.groupId) || 0) + 1);
  return groups;
}, new Map()).values()];
const sameIds = classLessons.every(({ day, slot, lesson }) => focused.byClass[classB.id][day][slot]?.id === lesson.id);
if (!sameIds) throw new Error("Grouped class lessons were not mirrored into both class grids.");
const sortedLengths = lengthsByGroup.sort((a, b) => a - b).join("+");
if (sortedLengths !== "1+2+3") throw new Error(`Expected focused block lengths 1+2+3, got ${sortedLengths}.`);
console.log(`Focused block lengths: ${sortedLengths} (expected 1+2+3 sorted)`);

// Focused regression: auto-split grouped classes by feasibility.
const splitLevel = app.createLevel("Auto Split Test", {
  days: ["Sunday"],
  periodsPerDay: 2,
  breakAfter: 0,
  breakLength: 0,
});
state.settings = { candidateLimit: 8, maxTeacherPerDay: 6, maxSubjectPerDay: 2 };
state.levels = [splitLevel];
state.subjects = [app.createSubject("Math", "Math", "core", "#176b5b", 5)];
state.teachers = [app.createTeacher("Split Teacher", ["Math"], 6)];
const splitA = app.createClass("Split A", splitLevel.id);
const splitB = app.createClass("Split B", splitLevel.id);
const splitC = app.createClass("Split C", splitLevel.id);
splitA.blocked.Sunday = [false, true];
splitB.blocked.Sunday = [false, true];
splitC.blocked.Sunday = [true, false];
const splitRule = app.createGroupingRule({
  id: "grp_auto_split_math",
  subject: "Math",
  levelId: splitLevel.id,
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
state.departments = [];
state.groupingRules = [splitRule];
state.schedules = [];
app.normalizeAvailability();
splitA.blocked.Sunday = [false, true];
splitB.blocked.Sunday = [false, true];
splitC.blocked.Sunday = [true, false];
const splitValidation = app.validateSetup();
console.log(`\nFocused auto-split validation: ${splitValidation.ok ? "OK" : "FAILED"}`);
splitValidation.messages.forEach((message) => console.log(`  - ${message}`));
const splitSchedules = app.buildCandidateSchedules();
console.log(`Focused auto-split schedules: ${splitSchedules.length}`);
if (!splitSchedules.length) throw new Error("Focused auto-split schedule did not generate.");
const splitSchedule = splitSchedules[0];
const abTogether = splitSchedule.byClass[splitA.id].Sunday[0]?.id === splitSchedule.byClass[splitB.id].Sunday[0]?.id;
const cSeparate = Boolean(splitSchedule.byClass[splitC.id].Sunday[1]);
if (!abTogether || !cSeparate) throw new Error("Auto split did not choose the feasible grouped class partition.");
console.log("Focused auto-split chose Split A + Split B, with Split C separate.");
