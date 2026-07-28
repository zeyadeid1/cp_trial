const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const COLORS = ["#2c7a7b", "#c05621", "#2f855a", "#6b46c1", "#b83280", "#2b6cb0", "#b7791f", "#4a5568"];
const MIN_PERIOD_LENGTH = 20;
const EARLY_END = "14:30";
const STORAGE_KEY = "school-schedule-studio-v2";

const state = {
  settings: {
    candidateLimit: 12,
    maxTeacherPerDay: 6,
    maxSubjectPerDay: 1,
    constraintPriorities: {},
  },
  constraints: {
    honorAvailability: true,
    preventTeacherClashes: true,
    requireQualifiedTeacher: true,
    consistentTeacher: true,
    honorFixedTeachers: true,
    avoidSameSubjectDay: true,
    balanceTeacherLoad: true,
    avoidClassGaps: true,
    morningCore: true,
  },
  levels: [],
  subjects: [],
  teachers: [],
  classes: [],
  departments: [],
  branches: [],
  groupingRules: [],
  electiveRules: [],
  schedules: [],
  selectedSchedule: 0,
  selectedLevelId: "",
  selectedClassId: "",
  selectedTeacherId: "",
  selectedDepartmentId: "",
  selectedDeptSubject: "",
  view: "class",
  session: null,
  published: null,
  teacherSearch: "",
  editTarget: null,
  dragLesson: null,
  moveSource: null,
  lastSavedAt: null,
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindGlobalEvents();
  loadFromStorage() || loadDemo();
  renderAll();
});

function cacheElements() {
  [
    "levelPicker",
    "addLevelBtn",
    "removeLevelBtn",
    "levelName",
    "levelStart",
    "levelEnd",
    "levelPeriodLength",
    "levelMinPeriod",
    "levelPeriods",
    "levelBreakAfter",
    "levelBreakLength",
    "levelDayPicker",
    "levelTimesPreview",
    "customLengthsToggle",
    "customLengthsWrap",
    "dayOverridesToggle",
    "dayOverridesWrap",
    "teacherSearch",
    "teacherSearchInfo",
    "teacherList",
    "addTeacherBtn",
    "subjectList",
    "addSubjectBtn",
    "departmentList",
    "addDepartmentBtn",
    "branchLevelPicker",
    "addBranchBtn",
    "branchList",
    "constraintPriorities",
    "classPicker",
    "addClassBtn",
    "classList",
    "maxTeacherPerDay",
    "maxSubjectPerDay",
    "candidateLimit",
    "blockRules",
    "loginOverlay",
    "loginUsername",
    "loginPassword",
    "loginBtn",
    "loginError",
    "sessionStatus",
    "logoutBtn",
    "validateBtn",
    "generateBtn",
    "publishBtn",
    "printBtn",
    "zipBtn",
    "classViewBtn",
    "teacherViewBtn",
    "departmentViewBtn",
    "scheduleClassPicker",
    "scheduleTeacherPicker",
    "scheduleDepartmentPicker",
    "scheduleSubjectPicker",
    "classPickerWrap",
    "teacherPickerWrap",
    "departmentPickerWrap",
    "subjectPickerWrap",
    "alerts",
    "violationPanel",
    "scheduleTabs",
    "scheduleCanvas",
    "outputTitle",
    "saveStatus",
    "lessonDialog",
    "editSubject",
    "editTeacher",
    "editNote",
    "editLate",
    "saveLessonBtn",
    "clearLessonBtn",
    "moveLessonBtn",
    "importExcelBtn",
    "excelFileInput",
    "loadDemoBtn",
    "saveBtn",
    "resetBtn",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindGlobalEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.section));
  });

  els.levelPicker.addEventListener("change", () => {
    state.selectedLevelId = els.levelPicker.value;
    renderAll();
  });
  els.addLevelBtn.addEventListener("click", () => {
    const level = createLevel(`Level ${state.levels.length + 1}`);
    state.levels.push(level);
    state.selectedLevelId = level.id;
    normalizeAvailability();
    renderAll();
  });
  els.removeLevelBtn.addEventListener("click", () => {
    const level = selectedLevel();
    if (!level) return;
    if (state.classes.some((klass) => klass.levelId === level.id)) {
      showAlerts([{ type: "error", text: `${level.name} still has classes. Remove or reassign them first.` }]);
      return;
    }
    state.levels = state.levels.filter((item) => item.id !== level.id);
    state.groupingRules = state.groupingRules.filter((rule) => rule.levelId !== level.id);
    state.electiveRules = (state.electiveRules || []).filter((rule) => rule.levelId !== level.id);
    state.branches = (state.branches || []).filter((branch) => branch.levelId !== level.id);
    state.teachers.forEach((teacher) => {
      Object.keys(teacher.subjectLevels || {}).forEach((subjectName) => {
        // An emptied list means "teaches this subject nowhere" - safer than
        // silently expanding a narrowly-scoped teacher to every level.
        teacher.subjectLevels[subjectName] = teacher.subjectLevels[subjectName].filter((id) => id !== level.id);
      });
    });
    syncBranchClasses();
    state.selectedLevelId = state.levels[0]?.id || "";
    normalizeAvailability();
    renderAll();
  });
  els.levelName.addEventListener("change", () => {
    const level = selectedLevel();
    if (!level) return;
    level.name = els.levelName.value || level.name;
    renderAll();
  });
  [
    ["levelStart", (level, value) => (level.startTime = value || level.startTime)],
    ["levelEnd", (level, value) => (level.endTime = value || level.endTime)],
    ["levelPeriodLength", (level, value) => (level.periodLength = clampNumber(value, levelMinPeriod(level), 240, level.periodLength))],
    ["levelMinPeriod", (level, value) => (level.minPeriodLength = clampNumber(value, 5, 120, MIN_PERIOD_LENGTH))],
    ["levelPeriods", (level, value) => setLevelPeriods(level, clampNumber(value, 1, 12, level.periodsPerDay))],
    ["levelBreakAfter", (level, value) => (level.breakAfter = clampNumber(value, 0, 12, level.breakAfter))],
    ["levelBreakLength", (level, value) => (level.breakLength = clampNumber(value, 0, 90, level.breakLength))],
  ].forEach(([id, apply]) => {
    els[id].addEventListener("change", () => {
      const level = selectedLevel();
      if (!level) return;
      apply(level, els[id].value);
      normalizeAvailability();
      renderAll();
    });
  });
  els.customLengthsToggle.addEventListener("change", () => {
    const level = selectedLevel();
    if (!level) return;
    level.customLengths = els.customLengthsToggle.checked ? effectivePeriodLengths(level) : null;
    renderAll();
  });
  els.dayOverridesToggle.addEventListener("change", () => {
    const level = selectedLevel();
    if (!level) return;
    level.showDayOverrides = els.dayOverridesToggle.checked;
    if (!els.dayOverridesToggle.checked) {
      level.dayOverrides = {};
      normalizeAvailability();
    }
    renderAll();
  });

  els.teacherSearch.addEventListener("input", () => {
    state.teacherSearch = els.teacherSearch.value;
    renderTeachers();
  });

  Object.keys(state.constraints).forEach((key) => {
    const input = document.getElementById(key);
    input.addEventListener("change", () => {
      state.constraints[key] = input.checked;
      saveToStorage();
    });
  });
  els.maxTeacherPerDay.addEventListener("change", () => {
    state.settings.maxTeacherPerDay = clampNumber(els.maxTeacherPerDay.value, 1, 12, 6);
    saveToStorage();
  });
  els.maxSubjectPerDay.addEventListener("change", () => {
    state.settings.maxSubjectPerDay = clampNumber(els.maxSubjectPerDay.value, 1, 5, 1);
    saveToStorage();
  });
  els.candidateLimit.addEventListener("change", () => {
    state.settings.candidateLimit = clampNumber(els.candidateLimit.value, 1, 80, 12);
    saveToStorage();
  });

  els.addTeacherBtn.addEventListener("click", () => {
    state.teachers.push(createTeacher());
    state.teacherSearch = "";
    els.teacherSearch.value = "";
    renderAll();
    const cards = els.teacherList.querySelectorAll(".teacher-card");
    const last = cards[cards.length - 1];
    if (last) {
      last.scrollIntoView({ behavior: "smooth", block: "center" });
      last.querySelector('[data-field="name"]')?.focus();
    }
  });
  els.addSubjectBtn.addEventListener("click", () => {
    state.subjects.push(createSubject(`Subject ${state.subjects.length + 1}`));
    renderAll();
  });
  els.addDepartmentBtn.addEventListener("click", () => {
    state.departments.push(createDepartment(`Department ${state.departments.length + 1}`));
    renderAll();
  });
  els.addClassBtn.addEventListener("click", () => {
    const klass = createClass(`Class ${state.classes.length + 1}`, selectedLevel()?.id || state.levels[0]?.id || "");
    state.classes.push(klass);
    state.selectedClassId = klass.id;
    renderAll();
  });
  els.branchLevelPicker.addEventListener("change", () => {
    state.selectedLevelId = els.branchLevelPicker.value;
    renderAll();
  });
  els.addBranchBtn.addEventListener("click", () => {
    const level = selectedLevel();
    if (!level) return;
    const count = (state.branches || []).filter((branch) => branch.levelId === level.id).length;
    state.branches.push(createBranch(`Branch ${count + 1}`, level.id));
    renderAll();
  });
  els.classPicker.addEventListener("change", () => {
    state.selectedClassId = els.classPicker.value;
    renderAll();
  });

  els.scheduleClassPicker.addEventListener("change", () => {
    state.selectedClassId = els.scheduleClassPicker.value;
    renderAll();
  });
  els.scheduleTeacherPicker.addEventListener("change", () => {
    state.selectedTeacherId = els.scheduleTeacherPicker.value;
    renderSchedules();
    saveToStorage();
  });
  els.scheduleDepartmentPicker.addEventListener("change", () => {
    state.selectedDepartmentId = els.scheduleDepartmentPicker.value;
    state.selectedDeptSubject = "";
    renderSchedules();
    saveToStorage();
  });
  els.scheduleSubjectPicker.addEventListener("change", () => {
    state.selectedDeptSubject = els.scheduleSubjectPicker.value;
    renderSchedules();
    saveToStorage();
  });

  els.validateBtn.addEventListener("click", () => showValidation(validateSetup().messages));
  els.generateBtn.addEventListener("click", generateSchedules);
  els.publishBtn.addEventListener("click", publishSchedule);
  els.printBtn.addEventListener("click", () => window.print());
  els.zipBtn.addEventListener("click", downloadAllPdfs);

  els.classViewBtn.addEventListener("click", () => switchView("class"));
  els.teacherViewBtn.addEventListener("click", () => switchView("teacher"));
  els.departmentViewBtn.addEventListener("click", () => switchView("department"));

  els.loginBtn.addEventListener("click", attemptLogin);
  [els.loginUsername, els.loginPassword].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") attemptLogin();
    });
  });
  els.logoutBtn.addEventListener("click", () => {
    state.session = null;
    state.moveSource = null;
    renderAll();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancelMoveLesson();
  });

  els.importExcelBtn.addEventListener("click", () => els.excelFileInput.click());
  els.excelFileInput.addEventListener("change", () => {
    const file = els.excelFileInput.files[0];
    els.excelFileInput.value = "";
    if (file) importExcelFile(file);
  });
  els.loadDemoBtn.addEventListener("click", () => {
    loadDemo();
    renderAll();
    showAlerts([{ type: "success", text: "Demo data loaded." }]);
  });
  els.saveBtn.addEventListener("click", () => {
    const saved = saveToStorage();
    showAlerts([saved
      ? { type: "success", text: "Saved. Your setup and schedules are restored automatically when you come back, refresh, or sign out and in again on this browser." }
      : { type: "error", text: "Saving failed - this browser's storage is full or unavailable. Your work stays in memory for this session only." }]);
  });
  els.resetBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    loadDemo();
    state.subjects = [];
    state.teachers = [];
    state.classes = [];
    state.departments = [];
    state.branches = [];
    state.electiveRules = [];
    renderAll();
    showAlerts([{ type: "success", text: "Draft reset." }]);
  });
  // Autosave runs on every change already; this catches anything in-flight
  // when the tab closes or refreshes.
  window.addEventListener("beforeunload", () => {
    saveToStorage();
  });

  els.saveLessonBtn.addEventListener("click", (event) => {
    event.preventDefault();
    saveEditedLesson();
  });
  els.clearLessonBtn.addEventListener("click", (event) => {
    event.preventDefault();
    clearEditedLesson();
  });
  els.moveLessonBtn.addEventListener("click", (event) => {
    event.preventDefault();
    beginMoveLesson();
  });
}

function showSection(section) {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.section === section));
  document.querySelectorAll(".panel-section").forEach((panel) => panel.classList.toggle("active", panel.id === section));
  const workspace = document.querySelector(".workspace");
  if (workspace) workspace.scrollTop = 0;
  window.scrollTo(0, 0);
}

function switchView(view) {
  state.view = view;
  renderSchedules();
  saveToStorage();
}

// ---------------------------------------------------------------------------
// Levels and timing
// ---------------------------------------------------------------------------

function createLevel(name = "Level", overrides = {}) {
  return Object.assign({
    id: uid("lvl"),
    name,
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
    startTime: "07:30",
    endTime: "14:30",
    periodLength: 45,
    minPeriodLength: MIN_PERIOD_LENGTH,
    periodsPerDay: 7,
    breakAfter: 3,
    breakLength: 25,
    classCount: 0,
    minClassSize: 0,
    maxClassSize: 0,
    customLengths: null,
    dayOverrides: {},
    showDayOverrides: false,
    subjectBlocks: {},
    sessionPatterns: {},
  }, overrides);
}

function levelById(id) {
  return state.levels.find((level) => level.id === id) || null;
}

function ensureSelectedLevel() {
  if (!state.levels.length) {
    const level = createLevel("Level 1");
    state.levels.push(level);
  }
  if (!state.selectedLevelId || !levelById(state.selectedLevelId)) {
    state.selectedLevelId = state.levels[0].id;
  }
}

function selectedLevel() {
  ensureSelectedLevel();
  return levelById(state.selectedLevelId);
}

function setLevelPeriods(level, periods) {
  level.periodsPerDay = periods;
  if (Array.isArray(level.customLengths)) {
    const next = Array.from({ length: periods }, (_, index) => level.customLengths[index] ?? level.periodLength);
    level.customLengths = next;
  }
}

function unionDays() {
  const present = new Set();
  state.levels.forEach((level) => level.days.forEach((day) => present.add(day)));
  const days = DAY_ORDER.filter((day) => present.has(day));
  return days.length ? days : ["Sunday"];
}

function maxSlots() {
  return Math.max(1, ...state.levels.map((level) => maxPeriodsForLevel(level)));
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "0:0").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function minutesToTime(total) {
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function levelMinPeriod(level) {
  return clampNumber(level.minPeriodLength ?? MIN_PERIOD_LENGTH, 5, 120, MIN_PERIOD_LENGTH);
}

// A day override lets one day of the week diverge from the level's base
// timing (start, end, period count, break, and per-period lengths).
function dayOverride(level, day) {
  const override = level.dayOverrides?.[day];
  return override && typeof override === "object" ? override : null;
}

// Effective timing config for one day of a level (base values merged with the
// day's override). Pass no day to get the level's base config.
function dayConfig(level, day = null) {
  const override = day ? dayOverride(level, day) : null;
  return {
    startTime: override?.startTime || level.startTime,
    endTime: override?.endTime || level.endTime,
    periodsPerDay: clampNumber(override?.periodsPerDay ?? level.periodsPerDay, 1, 12, level.periodsPerDay),
    breakAfter: clampNumber(override?.breakAfter ?? level.breakAfter, 0, 12, level.breakAfter),
    breakLength: clampNumber(override?.breakLength ?? level.breakLength, 0, 90, level.breakLength),
    periodLength: level.periodLength,
    customLengths: Array.isArray(override?.periodLengths) && override.periodLengths.length
      ? override.periodLengths
      : level.customLengths,
  };
}

function periodsForDay(level, day) {
  return dayConfig(level, day).periodsPerDay;
}

function maxPeriodsForLevel(level) {
  return Math.max(1, level.periodsPerDay, ...level.days.map((day) => periodsForDay(level, day)));
}

function effectiveBreakLength(config) {
  return config.breakAfter > 0 && config.breakAfter < config.periodsPerDay && config.breakLength > 0 ? config.breakLength : 0;
}

// Period lengths for a level on a given day. If full-length periods do not
// fit between the start and end times, periods after the break are shortened
// evenly (never below the level's minimum period length). For days that end
// before 14:30, only the first 3 periods keep full length. The end time is a
// hard limit; validation flags days that cannot fit at all.
function effectivePeriodLengths(level, day = null) {
  const config = dayConfig(level, day);
  const minLength = levelMinPeriod(level);
  const count = Math.max(1, config.periodsPerDay);
  if (Array.isArray(config.customLengths) && config.customLengths.length === count) {
    return config.customLengths.map((length) => clampNumber(length, minLength, 240, config.periodLength));
  }
  const window = timeToMinutes(config.endTime) - timeToMinutes(config.startTime) - effectiveBreakLength(config);
  const lengths = Array.from({ length: count }, () => config.periodLength);
  if (count * config.periodLength <= window) return lengths;
  const endsEarly = timeToMinutes(config.endTime) < timeToMinutes(EARLY_END);
  const fixedCount = Math.max(0, Math.min(endsEarly ? 3 : config.breakAfter, count - 1));
  const rest = count - fixedCount;
  const restLength = Math.max(minLength, Math.min(config.periodLength, Math.floor((window - fixedCount * config.periodLength) / rest)));
  for (let index = fixedCount; index < count; index++) lengths[index] = restLength;
  return lengths;
}

function levelTimes(level, day = null) {
  const config = dayConfig(level, day);
  const lengths = effectivePeriodLengths(level, day);
  const periods = [];
  let current = timeToMinutes(config.startTime);
  let breakInfo = null;
  lengths.forEach((length, index) => {
    periods.push({ start: minutesToTime(current), end: minutesToTime(current + length), length });
    current += length;
    if (config.breakAfter === index + 1 && effectiveBreakLength(config)) {
      breakInfo = { afterIndex: index, start: minutesToTime(current), end: minutesToTime(current + config.breakLength), length: config.breakLength };
      current += config.breakLength;
    }
  });
  return { periods, breakInfo, endsAt: minutesToTime(current), fits: current <= timeToMinutes(config.endTime) };
}

function referenceLevel() {
  return state.levels.slice().sort((a, b) => b.periodsPerDay - a.periodsPerDay)[0] || createLevel("Default");
}

// ---------------------------------------------------------------------------
// Factories and demo data
// ---------------------------------------------------------------------------

function createSubject(name = "", shortName = "", priority = "standard", color = null, difficulty = 3) {
  return {
    id: uid("sub"),
    name,
    shortName: shortName || name.slice(0, 5),
    priority,
    color: color || COLORS[state.subjects.length % COLORS.length],
    difficulty,
  };
}

function createTeacher(name = "", subjects = [], maxPerDay = null) {
  const teacher = {
    id: uid("tea"),
    name,
    subjects,
    // Optional level scoping per subject: { "Science": [levelId, ...] }.
    // A subject with no entry is teachable in every level. This is how
    // "Science (First Secondary)" and "Science (Second Secondary)" can have
    // different teachers without duplicating the subject itself.
    subjectLevels: {},
    maxPerDay: maxPerDay || state.settings.maxTeacherPerDay,
    replacementIds: [],
    availability: {},
  };
  unionDays().forEach((day) => {
    teacher.availability[day] = Array.from({ length: maxSlots() }, () => true);
  });
  return teacher;
}

function createClass(name = "", levelId = "", requirements = []) {
  const level = levelById(levelId) || state.levels[0] || null;
  const item = {
    id: uid("cls"),
    name,
    levelId: level?.id || "",
    blocked: {},
    requirements,
  };
  (level?.days || []).forEach((day) => {
    item.blocked[day] = Array.from({ length: periodsForDay(level, day) }, () => false);
  });
  return item;
}

function createDepartment(name = "", subjectNames = [], hodTeacherId = "") {
  return { id: uid("dep"), name, subjectNames, hodTeacherId };
}

// A branch (stream) of a level, e.g. Third Secondary "Science". Branches are
// per-level objects: two levels can both have an "Art" branch and they stay
// completely independent. A branch declares how many STUDENTS it has and
// which subjects they take. A requirement row's `students` field (0 = all)
// says how many of the branch's students take that subject - partial takers
// become co-timed choice groups pooled across classes and shareable branches.
// Class objects are formed automatically from student counts and the level's
// class count / size limits.
function createBranch(name = "Branch", levelId = "", overrides = {}) {
  return Object.assign({
    id: uid("brn"),
    name,
    levelId,
    studentCount: 30,
    shareWithBranchIds: [],
    requirements: [],
  }, overrides);
}

function branchTakers(branch, subjectName) {
  const requirement = branch.requirements.find((item) => item.subject === subjectName && item.count > 0);
  if (!requirement) return 0;
  const takers = Number(requirement.students || 0);
  return takers > 0 ? Math.min(takers, Number(branch.studentCount) || 0) : Number(branch.studentCount) || 0;
}

// Largest-remainder split of `total` across weights (keeps the sum exact).
function distributeCount(weights, total) {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (weight * total) / sum);
  const result = raw.map(Math.floor);
  let remainder = total - result.reduce((acc, value) => acc + value, 0);
  const order = raw.map((value, index) => ({ index, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < order.length && remainder > 0; i++, remainder--) result[order[i].index] += 1;
  return result;
}

function branchById(id) {
  return (state.branches || []).find((branch) => branch.id === id) || null;
}

// The weekly subjects a class attends TOGETHER as one room. For branch-formed
// classes these are the subjects fully taken by every branch represented in
// the class (partial-taker "choice" subjects are scheduled separately as
// pooled student groups by the sectioning plan). Plain classes keep their own
// list.
function classRequirements(klass) {
  if (!klass.branchId) return klass.requirements;
  const composition = (klass.composition?.length ? klass.composition : [{ branchId: klass.branchId, students: 0 }])
    .map((part) => ({ ...part, branch: branchById(part.branchId) }))
    .filter((part) => part.branch);
  if (!composition.length) return klass.requirements;
  const subjects = new Map();
  composition.forEach(({ branch }) => branch.requirements.forEach((requirement) => {
    if (!(requirement.count > 0)) return;
    if (!subjects.has(requirement.subject)) subjects.set(requirement.subject, []);
    subjects.get(requirement.subject).push({ branch, requirement });
  }));
  const rows = [];
  subjects.forEach((entries, subjectName) => {
    const commonForAll = composition.every(({ branch }) =>
      branch.requirements.some((item) => item.subject === subjectName && item.count > 0)
      && branchTakers(branch, subjectName) >= (Number(branch.studentCount) || 0));
    if (!commonForAll) return;
    const count = Math.max(...entries.map((entry) => Number(entry.requirement.count)));
    const teacherId = entries.find((entry) => entry.requirement.teacherId)?.requirement.teacherId || "";
    const groupRuleId = entries.find((entry) => entry.requirement.groupRuleId)?.requirement.groupRuleId;
    rows.push(req(subjectName, count, teacherId, entries.some((entry) => entry.requirement.possiblyLate), groupRuleId ? { groupRuleId } : {}));
  });
  return rows;
}

// Packs the level's branch students into level.classCount classes. Branches
// allowed to share classes are packed together (mixed classes happen at the
// boundaries); other branches never mix. Existing class objects are reused in
// order so ids and blocked slots survive re-packing.
function packBranchClasses(level, branches) {
  const active = branches.filter((branch) => (Number(branch.studentCount) || 0) > 0);
  if (!active.length) return [];
  const maxSize = Number(level.maxClassSize) > 0 ? Number(level.maxClassSize) : 30;
  const total = active.reduce((sum, branch) => sum + Number(branch.studentCount), 0);
  const canShare = (a, b) => (a.shareWithBranchIds || []).includes(b.id) || (b.shareWithBranchIds || []).includes(a.id);
  const components = [];
  active.forEach((branch) => {
    const touching = components.filter((component) => component.some((member) => canShare(member, branch)));
    if (!touching.length) {
      components.push([branch]);
    } else {
      const merged = [branch, ...touching.flat()];
      touching.forEach((component) => components.splice(components.indexOf(component), 1));
      components.push(merged);
    }
  });
  let classCount = Number(level.classCount) > 0 ? Number(level.classCount) : Math.max(1, Math.ceil(total / maxSize));
  classCount = Math.max(classCount, components.length);
  const comps = components.map((members) => ({
    members: members.slice().sort((a, b) => Number(b.studentCount) - Number(a.studentCount)),
    students: members.reduce((sum, branch) => sum + Number(branch.studentCount), 0),
  }));
  const classShares = distributeCount(comps.map((comp) => comp.students), classCount - comps.length);
  comps.forEach((comp, index) => {
    comp.classes = 1 + classShares[index];
  });
  const specs = [];
  comps.forEach((comp) => {
    const sizes = distributeCount(Array.from({ length: comp.classes }, () => 1), comp.students);
    const stream = comp.members.map((branch) => ({ branch, remaining: Number(branch.studentCount) }));
    sizes.forEach((size) => {
      const composition = [];
      let filled = 0;
      while (filled < size && stream.length) {
        const head = stream[0];
        const take = Math.min(head.remaining, size - filled);
        if (take > 0) {
          composition.push({ branchId: head.branch.id, students: take });
          filled += take;
          head.remaining -= take;
        }
        if (head.remaining <= 0) stream.shift();
      }
      if (composition.length) specs.push({ composition });
    });
  });
  specs.forEach((spec, index) => {
    const names = [...new Set(spec.composition.map((part) => branchById(part.branchId)?.name).filter(Boolean))];
    spec.name = `${level.name} ${names.join("/")} ${index + 1}`;
  });
  return specs;
}

function syncBranchClasses() {
  const keepIds = new Set();
  const branchIds = new Set((state.branches || []).map((branch) => branch.id));
  const byLevel = new Map();
  (state.branches || []).forEach((branch) => {
    if (!levelById(branch.levelId)) return;
    if (!byLevel.has(branch.levelId)) byLevel.set(branch.levelId, []);
    byLevel.get(branch.levelId).push(branch);
  });
  byLevel.forEach((branches, levelId) => {
    const level = levelById(levelId);
    const specs = packBranchClasses(level, branches);
    const existing = state.classes.filter((klass) => klass.levelId === levelId && klass.branchId);
    specs.forEach((spec, index) => {
      let klass = existing[index];
      if (!klass) {
        klass = createClass(spec.name, levelId);
        state.classes.push(klass);
      }
      klass.name = spec.name;
      klass.levelId = levelId;
      klass.branchId = spec.composition[0].branchId;
      klass.composition = spec.composition;
      keepIds.add(klass.id);
    });
  });
  state.classes = state.classes.filter((klass) => !klass.branchId || (branchIds.has(klass.branchId) && keepIds.has(klass.id)));
}

// The sectioning plan for one level: which subjects are "choice" subjects
// (taken by only part of the students), how their takers distribute across
// the formed classes, and how those takers pool into teaching groups within
// the level's min/max class-size limits. Choice subjects run co-timed so a
// class's students can split to their own group and re-merge afterwards.
function levelSectioningPlan(level) {
  const branches = (state.branches || []).filter((branch) => branch.levelId === level.id && (Number(branch.studentCount) || 0) > 0);
  if (!branches.length) return null;
  const classes = state.classes.filter((klass) => klass.levelId === level.id && klass.branchId);
  const minSize = Number(level.minClassSize) || 0;
  const maxSize = Number(level.maxClassSize) || 0;
  const warnings = [];
  const partsByBranch = {};
  classes.forEach((klass) => (klass.composition || []).forEach((part) => {
    (partsByBranch[part.branchId] ||= []).push({ classId: klass.id, students: part.students });
  }));
  const choiceMap = new Map();
  branches.forEach((branch) => {
    branch.requirements.forEach((requirement) => {
      if (!(requirement.count > 0)) return;
      const takers = branchTakers(branch, requirement.subject);
      if (takers <= 0 || takers >= (Number(branch.studentCount) || 0)) return;
      if (!choiceMap.has(requirement.subject)) {
        choiceMap.set(requirement.subject, { subject: requirement.subject, weekly: 0, weeklySet: new Set(), takersByClass: new Map(), totalTakers: 0 });
      }
      const entry = choiceMap.get(requirement.subject);
      entry.weeklySet.add(Number(requirement.count));
      entry.weekly = Math.max(entry.weekly, Number(requirement.count));
      entry.totalTakers += takers;
      const parts = partsByBranch[branch.id] || [];
      const split = distributeCount(parts.map((part) => part.students), takers);
      parts.forEach((part, index) => {
        if (split[index] > 0) entry.takersByClass.set(part.classId, (entry.takersByClass.get(part.classId) || 0) + split[index]);
      });
    });
  });
  const classOrder = classes.map((klass) => klass.id);
  const choiceSubjects = [...choiceMap.values()].map((entry) => {
    if (entry.weeklySet.size > 1) warnings.push(`${level.name}: ${entry.subject} has different weekly counts across branches; using ${entry.weekly}.`);
    const chunks = classOrder
      .filter((classId) => entry.takersByClass.has(classId))
      .map((classId) => ({ classId, students: entry.takersByClass.get(classId) }));
    return { subject: entry.subject, weekly: entry.weekly, totalTakers: entry.totalTakers, groups: buildGroups(chunks, minSize, maxSize, entry.totalTakers) };
  });
  const weekly = choiceSubjects.reduce((most, subject) => Math.max(most, subject.weekly), 0);
  if (choiceSubjects.some((subject) => subject.weekly !== weekly)) {
    warnings.push(`${level.name}: choice subjects share timetable slots, so their weekly periods should match; using ${weekly} for all.`);
  }
  const clusterClassIds = classOrder.filter((classId) => choiceSubjects.some((subject) => subject.groups.some((group) => group.chunks.some((chunk) => chunk.classId === classId))));
  const classSizeIssues = [];
  classes.forEach((klass) => {
    const size = (klass.composition || []).reduce((sum, part) => sum + part.students, 0);
    if (maxSize > 0 && size > maxSize) classSizeIssues.push({ classId: klass.id, size, kind: "max", limit: maxSize });
    if (minSize > 0 && size < minSize) {
      const wholeBranches = (klass.composition || []).reduce((sum, part) => sum + (Number(branchById(part.branchId)?.studentCount) || 0), 0);
      const exempt = size === wholeBranches;
      if (!exempt) classSizeIssues.push({ classId: klass.id, size, kind: "min", limit: minSize });
    }
  });
  return { level, choiceSubjects, weekly, clusterClassIds, warnings, classSizeIssues };
}

// Greedy pooling of per-class taker chunks into teaching groups. A chunk can
// split across groups (part of a class's takers with one group, the rest with
// another). Below-minimum groups are only legal when the subject's total
// takers are below the minimum themselves.
function buildGroups(chunks, minSize, maxSize, totalTakers) {
  const groups = [];
  let current = { students: 0, chunks: [] };
  const push = () => {
    if (current.students > 0) groups.push(current);
    current = { students: 0, chunks: [] };
  };
  chunks.forEach(({ classId, students }) => {
    let remaining = students;
    while (remaining > 0) {
      const space = maxSize > 0 ? maxSize - current.students : remaining;
      if (space <= 0) {
        push();
        continue;
      }
      const take = Math.min(space, remaining);
      current.chunks.push({ classId, students: take });
      current.students += take;
      remaining -= take;
    }
  });
  push();
  groups.forEach((group) => {
    group.aboveMax = maxSize > 0 && group.students > maxSize;
    group.belowMin = minSize > 0 && group.students < minSize && totalTakers >= minSize;
  });
  return groups;
}

function createGroupingRule(overrides = {}) {
  return Object.assign({
    id: uid("grp"),
    subject: "",
    levelId: "",
    mode: "mandatory",
    groupName: "",
    classCount: 0,
    groupCount: 0,
    groupSizes: [],
    classIds: [],
    teacherId: "",
    periodsPerGroup: 0,
    notes: "",
  }, overrides);
}

// An elective split: part of each listed class takes one subject while the
// rest take another, at the same time. The matching students from all listed
// classes combine into one teaching group per subject, so every occurrence
// needs one free teacher per option simultaneously and shows as a combined
// "German / French" cell on the class schedules.
function createElectiveRule(overrides = {}) {
  return Object.assign({
    id: uid("elx"),
    name: "Second language",
    levelId: "",
    classIds: [],
    count: 0,
    options: [
      { subject: "", teacherId: "" },
      { subject: "", teacherId: "" },
    ],
  }, overrides);
}

function req(subject, count, teacherId = "", possiblyLate = false, extras = {}) {
  return Object.assign({ subject, count, teacherId, possiblyLate }, extras);
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function loadDemo() {
  state.settings = { candidateLimit: 12, maxTeacherPerDay: 6, maxSubjectPerDay: 2, constraintPriorities: {} };
  state.constraints = {
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
  state.levels = [
    createLevel("First Secondary", { periodsPerDay: 8 }),
    createLevel("Second Secondary", { periodsPerDay: 8 }),
    createLevel("Third Secondary", { periodsPerDay: 8 }),
  ];
  state.subjects = buildDefaultSubjects();
  state.teachers = buildDefaultTeachers();
  state.classes = buildDefaultClasses();
  state.departments = buildDefaultDepartments();
  state.branches = [];
  state.groupingRules = [];
  state.electiveRules = buildDefaultElectiveRules();
  state.schedules = [];
  state.selectedSchedule = 0;
  state.selectedLevelId = state.levels[0].id;
  state.selectedClassId = state.classes[0]?.id || "";
  state.selectedTeacherId = state.teachers[0]?.id || "";
  state.selectedDepartmentId = state.departments[0]?.id || "";
  state.selectedDeptSubject = "";
  state.view = "class";
  state.published = null;
  state.moveSource = null;
  state.teacherSearch = "";
}

function buildDefaultSubjects() {
  const definitions = [
    ["Science", "Sci", "core", 5],
    ["Arabic", "Ar", "core", 4],
    ["English", "Eng", "core", 4],
    ["Math", "Math", "core", 5],
    ["History", "Hist", "standard", 3],
    ["French", "Fr", "standard", 3],
    ["German", "Ger", "standard", 3],
    ["Philosophy", "Phil", "standard", 3],
    ["Religion", "Rel", "light", 1],
    ["Geography", "Geo", "standard", 3],
    ["Psychology", "Psych", "standard", 3],
    ["Physics", "Phys", "core", 5],
    ["Chemistry", "Chem", "core", 5],
    ["Biology", "Bio", "core", 5],
    ["Statistics", "Stat", "standard", 4],
  ];
  return definitions.map(([name, shortName, priority, difficulty], index) => createSubject(name, shortName, priority, COLORS[index % COLORS.length], difficulty));
}

function buildDefaultTeachers() {
  const teachers = [];
  state.subjects.forEach((subject) => {
    const count = ["Arabic", "English", "Math", "History", "Science"].includes(subject.name) ? 3 : 2;
    for (let index = 1; index <= count; index++) {
      teachers.push(createTeacher(`${subject.shortName || subject.name} Teacher ${index}`, [subject.name]));
    }
  });
  teachers.forEach((teacher, index) => {
    const sameSubject = teachers.filter((item) => item.id !== teacher.id && item.subjects.some((subject) => teacher.subjects.includes(subject)));
    teacher.replacementIds = sameSubject.slice(0, 2).map((item) => item.id);
    if (!teacher.replacementIds.length && teachers.length > 1) teacher.replacementIds = [teachers[(index + 1) % teachers.length].id];
  });
  return teachers;
}

function buildDefaultClasses() {
  const letters = "ABCDE".split("");
  const classes = [];
  const plans = [
    // First Secondary second language comes from an elective split rule
    // (French/German at the same time), not per-class requirements.
    [state.levels[0], () => [
      req("Science", 6),
      req("Arabic", 6),
      req("English", 6),
      req("Math", 6),
      req("History", 5),
      req("Philosophy", 4),
      req("Religion", 2),
    ]],
    [state.levels[1], (index) => [
      req("Arabic", 6),
      req("English", 6),
      req("Math", 6),
      req("History", 5),
      req(index % 2 === 0 ? "Chemistry" : "Physics", 5),
      req(index % 2 === 0 ? "French" : "German", 4),
      req("Psychology", 3),
    ]],
    [state.levels[2], (index) => [
      req("Arabic", 4),
      req("English", 4),
      req("Math", 4),
      req(index % 2 === 0 ? "Chemistry" : "Biology", 4),
      req(index % 2 === 0 ? "Geography" : "History", 5),
      req("Statistics", 4),
      req(index % 2 === 0 ? "French" : "German", 2),
      req("Religion", 1),
    ]],
  ];
  plans.forEach(([level, planFor]) => {
    letters.forEach((letter, index) => {
      classes.push(createClass(`${level.name} ${letter}`, level.id, planFor(index)));
    });
  });
  return classes;
}

function buildDefaultElectiveRules() {
  const level = state.levels[0];
  if (!level) return [];
  const classes = state.classes.filter((klass) => klass.levelId === level.id);
  if (!classes.length) return [];
  const half = Math.ceil(classes.length / 2);
  const groups = [classes.slice(0, half), classes.slice(half)].filter((group) => group.length);
  return groups.map((group, index) => createElectiveRule({
    name: groups.length > 1 ? `Second Language ${String.fromCharCode(65 + index)}` : "Second Language",
    levelId: level.id,
    classIds: group.map((klass) => klass.id),
    count: 3,
    options: [
      { subject: "French", teacherId: "" },
      { subject: "German", teacherId: "" },
    ],
  }));
}

function buildDefaultDepartments() {
  const groups = [
    ["English", ["English"]],
    ["Arabic", ["Arabic", "Religion"]],
    ["Math", ["Math", "Statistics"]],
    ["Science", ["Science", "Physics", "Chemistry", "Biology"]],
    ["Social Studies", ["History", "Geography", "Philosophy", "Psychology"]],
    ["French", ["French"]],
    ["German", ["German"]],
  ];
  return groups
    .map(([name, subjects]) => createDepartment(name, subjects.filter((subject) => state.subjects.some((item) => item.name === subject))))
    .filter((department) => department.subjectNames.length);
}

// ---------------------------------------------------------------------------
// Rendering: setup sections
// ---------------------------------------------------------------------------

function renderAll() {
  syncBranchClasses();
  writeGlobalInputs();
  renderLevels();
  renderTeachers();
  renderSubjects();
  renderDepartments();
  renderBranches();
  renderClasses();
  renderBlockRules();
  renderSession();
  renderSchedules();
  saveToStorage();
}

function writeGlobalInputs() {
  els.maxTeacherPerDay.value = state.settings.maxTeacherPerDay;
  els.maxSubjectPerDay.value = state.settings.maxSubjectPerDay;
  els.candidateLimit.value = state.settings.candidateLimit;
  Object.keys(state.constraints).forEach((key) => {
    const input = document.getElementById(key);
    if (input) input.checked = state.constraints[key];
  });
  renderConstraintPriorities();
}

const PRIORITY_TYPES = ["clash", "availability", "unqualified", "classSize", "groupSize", "blocked", "overload", "repeat", "lateCover"];

function renderConstraintPriorities() {
  if (!els.constraintPriorities) return;
  els.constraintPriorities.innerHTML = "";
  PRIORITY_TYPES.forEach((type) => {
    const field = document.createElement("label");
    field.className = "field";
    const span = document.createElement("span");
    span.textContent = VIOLATION_LABELS[type] || type;
    const select = document.createElement("select");
    [["high", "High - protect first"], ["normal", "Normal"], ["low", "Low - break first"]].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = (state.settings.constraintPriorities?.[type] || "normal") === value;
      select.append(option);
    });
    select.addEventListener("change", () => {
      (state.settings.constraintPriorities ||= {})[type] = select.value;
      saveToStorage();
    });
    field.append(span, select);
    els.constraintPriorities.append(field);
  });
}

function renderLevels() {
  ensureSelectedLevel();
  populateOptions(els.levelPicker, state.levels.map((level) => level.id), [state.selectedLevelId], (id) => levelById(id)?.name || id);
  const level = selectedLevel();
  if (!level) return;
  els.levelName.value = level.name;
  els.levelStart.value = level.startTime;
  els.levelEnd.value = level.endTime;
  els.levelPeriodLength.value = level.periodLength;
  els.levelMinPeriod.value = levelMinPeriod(level);
  els.levelPeriods.value = level.periodsPerDay;
  els.levelBreakAfter.value = level.breakAfter;
  els.levelBreakLength.value = level.breakLength;

  els.levelDayPicker.innerHTML = "";
  DAY_ORDER.forEach((day) => {
    const label = document.createElement("label");
    label.className = "day-pill";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = level.days.includes(day);
    input.addEventListener("change", () => {
      if (input.checked) {
        level.days.push(day);
      } else {
        level.days = level.days.filter((item) => item !== day);
      }
      level.days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
      normalizeAvailability();
      renderAll();
    });
    label.append(input, document.createTextNode(day));
    els.levelDayPicker.append(label);
  });

  renderLevelTimesPreview(level);

  els.customLengthsToggle.checked = Array.isArray(level.customLengths);
  els.customLengthsWrap.innerHTML = "";
  if (Array.isArray(level.customLengths)) {
    const minLength = levelMinPeriod(level);
    level.customLengths.forEach((length, index) => {
      const field = document.createElement("label");
      field.className = "field";
      field.innerHTML = `<span>P${index + 1} (min)</span><input type="number" min="${minLength}" max="240" value="${length}" />`;
      field.querySelector("input").addEventListener("change", (event) => {
        level.customLengths[index] = clampNumber(event.target.value, minLength, 240, level.periodLength);
        renderAll();
      });
      els.customLengthsWrap.append(field);
    });
  }

  renderDayOverrides(level);
}

// Daily timing preview. One line for the level's base timing, plus one line
// per day that has its own override.
function renderLevelTimesPreview(level) {
  els.levelTimesPreview.innerHTML = "";
  const overrideDays = level.days.filter((day) => dayOverride(level, day));
  const rows = [{ label: overrideDays.length ? "Default days" : "", day: null }];
  overrideDays.forEach((day) => rows.push({ label: day, day }));
  rows.forEach(({ label, day }) => {
    const line = document.createElement("div");
    line.className = "level-times-line";
    if (label) {
      const tag = document.createElement("span");
      tag.className = "time-chip day-chip";
      tag.textContent = label;
      line.append(tag);
    }
    const config = dayConfig(level, day);
    const times = levelTimes(level, day);
    times.periods.forEach((period, index) => {
      const chip = document.createElement("span");
      chip.className = "time-chip";
      chip.textContent = `P${index + 1} ${period.start}-${period.end} (${period.length}m)`;
      line.append(chip);
      if (times.breakInfo && times.breakInfo.afterIndex === index) {
        const breakChip = document.createElement("span");
        breakChip.className = "time-chip break-chip";
        breakChip.textContent = `Break ${times.breakInfo.start}-${times.breakInfo.end} (${times.breakInfo.length}m)`;
        line.append(breakChip);
      }
    });
    const status = document.createElement("span");
    status.className = `time-chip ${times.fits ? "ok-chip" : "error-chip"}`;
    status.textContent = times.fits ? `Ends ${times.endsAt} (limit ${config.endTime})` : `Does not fit: ends ${times.endsAt}, limit ${config.endTime}`;
    line.append(status);
    els.levelTimesPreview.append(line);
  });
}

// Advanced per-day options: each school day can override the level's start,
// end, period count, break, and individual period lengths.
function renderDayOverrides(level) {
  const anyOverrides = level.days.some((day) => dayOverride(level, day));
  const open = Boolean(level.showDayOverrides || anyOverrides);
  els.dayOverridesToggle.checked = open;
  els.dayOverridesWrap.classList.toggle("hidden", !open);
  els.dayOverridesWrap.innerHTML = "";
  if (!open) return;
  level.days.forEach((day) => {
    const override = dayOverride(level, day);
    const row = document.createElement("div");
    row.className = `day-override-row${override ? " active" : ""}`;

    const head = document.createElement("label");
    head.className = "day-override-head";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = Boolean(override);
    check.addEventListener("change", () => {
      level.dayOverrides ||= {};
      if (check.checked) {
        level.dayOverrides[day] = {
          startTime: level.startTime,
          endTime: level.endTime,
          periodsPerDay: level.periodsPerDay,
          breakAfter: level.breakAfter,
          breakLength: level.breakLength,
          periodLengths: null,
        };
      } else {
        delete level.dayOverrides[day];
      }
      normalizeAvailability();
      renderAll();
    });
    const dayName = document.createElement("strong");
    dayName.textContent = day;
    const summary = document.createElement("small");
    summary.textContent = override
      ? `${dayConfig(level, day).startTime}-${dayConfig(level, day).endTime}, ${periodsForDay(level, day)} periods`
      : "Uses the level's default timing";
    head.append(check, dayName, summary);
    row.append(head);

    if (override) {
      const grid = document.createElement("div");
      grid.className = "day-override-grid";
      const commit = (field, value) => {
        override[field] = value;
        normalizeAvailability();
        renderAll();
      };
      grid.append(
        overrideField("Start", "time", override.startTime || level.startTime, (value) => commit("startTime", value || level.startTime)),
        overrideField("End", "time", override.endTime || level.endTime, (value) => commit("endTime", value || level.endTime)),
        overrideField("Periods", "number", override.periodsPerDay ?? level.periodsPerDay, (value) => {
          const periods = clampNumber(value, 1, 12, level.periodsPerDay);
          if (Array.isArray(override.periodLengths)) {
            override.periodLengths = Array.from({ length: periods }, (_, index) => override.periodLengths[index] ?? level.periodLength);
          }
          commit("periodsPerDay", periods);
        }, { min: 1, max: 12 }),
        overrideField("Break After", "number", override.breakAfter ?? level.breakAfter, (value) => commit("breakAfter", clampNumber(value, 0, 12, level.breakAfter)), { min: 0, max: 12 }),
        overrideField("Break (min)", "number", override.breakLength ?? level.breakLength, (value) => commit("breakLength", clampNumber(value, 0, 90, level.breakLength)), { min: 0, max: 90 }),
      );
      row.append(grid);

      const lengthsToggle = document.createElement("label");
      lengthsToggle.className = "check-card advanced-toggle";
      const lengthsCheck = document.createElement("input");
      lengthsCheck.type = "checkbox";
      lengthsCheck.checked = Array.isArray(override.periodLengths) && override.periodLengths.length > 0;
      const lengthsLabel = document.createElement("span");
      lengthsLabel.textContent = "Custom period lengths for this day";
      const lengthsHint = document.createElement("small");
      lengthsHint.textContent = "Set each period's minutes for this day only.";
      lengthsToggle.append(lengthsCheck, lengthsLabel, lengthsHint);
      lengthsCheck.addEventListener("change", () => {
        override.periodLengths = lengthsCheck.checked ? effectivePeriodLengths(level, day) : null;
        renderAll();
      });
      row.append(lengthsToggle);

      if (Array.isArray(override.periodLengths) && override.periodLengths.length) {
        const lengthGrid = document.createElement("div");
        lengthGrid.className = "custom-length-grid";
        const minLength = levelMinPeriod(level);
        override.periodLengths.forEach((length, index) => {
          const field = document.createElement("label");
          field.className = "field";
          field.innerHTML = `<span>P${index + 1} (min)</span><input type="number" min="${minLength}" max="240" value="${length}" />`;
          field.querySelector("input").addEventListener("change", (event) => {
            override.periodLengths[index] = clampNumber(event.target.value, minLength, 240, level.periodLength);
            renderAll();
          });
          lengthGrid.append(field);
        });
        row.append(lengthGrid);
      }
    }
    els.dayOverridesWrap.append(row);
  });
}

function overrideField(label, type, value, onChange, attrs = {}) {
  const field = document.createElement("label");
  field.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = type;
  if (attrs.min !== undefined) input.min = String(attrs.min);
  if (attrs.max !== undefined) input.max = String(attrs.max);
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  field.append(span, input);
  return field;
}

function renderTeachers() {
  els.teacherList.innerHTML = "";
  const query = state.teacherSearch.trim().toLowerCase();
  const matches = query ? state.teachers.filter((teacher) => teacher.name.toLowerCase().includes(query)) : state.teachers;
  els.teacherSearchInfo.textContent = query
    ? `Showing ${matches.length} of ${state.teachers.length} teachers.`
    : `${state.teachers.length} teachers. Type a name to filter the list.`;
  const template = document.getElementById("teacherTemplate");
  matches.forEach((teacher) => {
    const card = template.content.firstElementChild.cloneNode(true);
    bindInput(card, "name", teacher.name, (value) => {
      teacher.name = value;
      renderTeachers();
    });
    const credentials = teacherCredentials(teacher);
    const loginLine = document.createElement("p");
    loginLine.className = "teacher-login";
    loginLine.textContent = credentials ? `Sign-in: ${credentials.username} / ${credentials.password}` : "Sign-in: set a name first";
    card.querySelector(".entity-card-header").after(loginLine);
    bindInput(card, "maxPerDay", teacher.maxPerDay, (value) => {
      teacher.maxPerDay = clampNumber(value, 1, 12, state.settings.maxTeacherPerDay);
    });
    const subjectSelect = card.querySelector('[data-field="subjects"]');
    populateOptions(subjectSelect, state.subjects.map((subject) => subject.name), teacher.subjects);
    subjectSelect.addEventListener("change", () => {
      teacher.subjects = [...subjectSelect.selectedOptions].map((option) => option.value);
      Object.keys(teacher.subjectLevels || {}).forEach((subjectName) => {
        if (!teacher.subjects.includes(subjectName)) delete teacher.subjectLevels[subjectName];
      });
      renderTeacherSubjectLevels(card.querySelector(".subject-levels"), teacher);
      saveToStorage();
    });
    const subjectLevelsWrap = document.createElement("div");
    subjectLevelsWrap.className = "subject-levels";
    card.querySelector(".form-grid").after(subjectLevelsWrap);
    renderTeacherSubjectLevels(subjectLevelsWrap, teacher);
    const replacementSelect = card.querySelector('[data-field="replacements"]');
    populateOptions(
      replacementSelect,
      state.teachers.filter((item) => item.id !== teacher.id).map((item) => item.id),
      teacher.replacementIds || [],
      (value) => state.teachers.find((item) => item.id === value)?.name || value,
    );
    replacementSelect.addEventListener("change", () => {
      teacher.replacementIds = [...replacementSelect.selectedOptions].map((option) => option.value);
      saveToStorage();
    });
    renderSlotGrid(card.querySelector(".availability-grid"), teacher.availability, unionDays(), maxSlots(), true, (day, slot, checked) => {
      teacher.availability[day][slot] = checked;
      saveToStorage();
    }, "On", "Off");
    card.querySelector(".remove-entity").addEventListener("click", () => {
      state.teachers = state.teachers.filter((item) => item.id !== teacher.id);
      state.teachers.forEach((item) => {
        item.replacementIds = (item.replacementIds || []).filter((id) => id !== teacher.id);
      });
      state.classes.forEach((klass) => klass.requirements.forEach((requirement) => {
        if (requirement.teacherId === teacher.id) requirement.teacherId = "";
      }));
      (state.branches || []).forEach((branch) => branch.requirements.forEach((requirement) => {
        if (requirement.teacherId === teacher.id) requirement.teacherId = "";
      }));
      state.departments.forEach((department) => {
        if (department.hodTeacherId === teacher.id) department.hodTeacherId = "";
      });
      (state.electiveRules || []).forEach((rule) => rule.options.forEach((option) => {
        if (option.teacherId === teacher.id) option.teacherId = "";
      }));
      if (state.session?.teacherId === teacher.id) state.session = null;
      renderAll();
    });
    els.teacherList.append(card);
  });
}

// Per-subject level scoping on a teacher card. Every teachable subject gets
// one pill per level; all pills on = teaches the subject in every level
// (stored as "no restriction"). Same-named subjects across levels are
// distinct teaching assignments, so scoping is set per subject.
function renderTeacherSubjectLevels(container, teacher) {
  if (!container) return;
  container.innerHTML = "";
  if (!teacher.subjects.length || state.levels.length < 2) return;
  const heading = document.createElement("div");
  heading.className = "mini-heading";
  heading.textContent = "Levels taught per subject";
  container.append(heading);
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Science in one level is not the same as Science in another. Untick a level to say this teacher does not teach the subject there.";
  container.append(hint);
  teacher.subjects.forEach((subjectName) => {
    const row = document.createElement("div");
    row.className = "subject-level-row";
    const label = document.createElement("strong");
    label.textContent = subjectName;
    row.append(label);
    const allLevelIds = state.levels.map((level) => level.id);
    const restriction = teacher.subjectLevels?.[subjectName];
    const allowed = Array.isArray(restriction) ? restriction : allLevelIds;
    state.levels.forEach((level) => {
      const pill = document.createElement("label");
      pill.className = "day-pill level-pill";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = allowed.includes(level.id);
      input.addEventListener("change", () => {
        const current = Array.isArray(teacher.subjectLevels?.[subjectName]) ? teacher.subjectLevels[subjectName] : [...allLevelIds];
        const next = input.checked ? [...new Set([...current, level.id])] : current.filter((id) => id !== level.id);
        teacher.subjectLevels ||= {};
        if (next.length === allLevelIds.length) {
          delete teacher.subjectLevels[subjectName];
        } else {
          teacher.subjectLevels[subjectName] = next;
        }
        saveToStorage();
      });
      pill.append(input, document.createTextNode(level.name));
      row.append(pill);
    });
    container.append(row);
  });
}

function renderSubjects() {
  els.subjectList.innerHTML = "";
  const template = document.getElementById("subjectTemplate");
  state.subjects.forEach((subject) => {
    const card = template.content.firstElementChild.cloneNode(true);
    bindInput(card, "name", subject.name, (value) => {
      updateSubjectName(subject, value);
    });
    bindInput(card, "shortName", subject.shortName, (value) => {
      subject.shortName = value;
    });
    bindInput(card, "priority", subject.priority, (value) => {
      subject.priority = value;
    });
    bindInput(card, "color", subject.color, (value) => {
      subject.color = value;
    });
    const difficulty = document.createElement("label");
    difficulty.className = "field";
    difficulty.innerHTML = `<span>Difficulty Score</span><input type="number" min="1" max="5" value="${subject.difficulty || 3}" />`;
    difficulty.querySelector("input").addEventListener("change", (event) => {
      subject.difficulty = clampNumber(event.target.value, 1, 5, 3);
      saveToStorage();
    });
    card.querySelector(".form-grid").append(difficulty);
    card.querySelector(".remove-entity").addEventListener("click", () => {
      state.subjects = state.subjects.filter((item) => item.id !== subject.id);
      state.teachers.forEach((teacher) => {
        teacher.subjects = teacher.subjects.filter((item) => item !== subject.name);
        if (teacher.subjectLevels) delete teacher.subjectLevels[subject.name];
      });
      state.classes.forEach((klass) => {
        klass.requirements = klass.requirements.filter((item) => item.subject !== subject.name);
      });
      (state.branches || []).forEach((branch) => {
        branch.requirements = branch.requirements.filter((item) => item.subject !== subject.name);
      });
      state.departments.forEach((department) => {
        department.subjectNames = department.subjectNames.filter((item) => item !== subject.name);
      });
      state.levels.forEach((level) => {
        delete level.subjectBlocks[subject.name];
        delete level.sessionPatterns?.[subject.name];
      });
      state.groupingRules = state.groupingRules.filter((rule) => rule.subject !== subject.name);
      (state.electiveRules || []).forEach((rule) => {
        rule.options = rule.options.filter((option) => option.subject !== subject.name);
      });
      if (state.selectedDeptSubject === subject.name) state.selectedDeptSubject = "";
      renderAll();
    });
    els.subjectList.append(card);
  });
}

function updateSubjectName(subject, value) {
  const oldName = subject.name;
  subject.name = value;
  state.teachers.forEach((teacher) => {
    teacher.subjects = teacher.subjects.map((item) => (item === oldName ? value : item));
    if (teacher.subjectLevels?.[oldName]) {
      teacher.subjectLevels[value] = teacher.subjectLevels[oldName];
      delete teacher.subjectLevels[oldName];
    }
  });
  state.classes.forEach((klass) => {
    klass.requirements.forEach((requirement) => {
      if (requirement.subject === oldName) requirement.subject = value;
    });
  });
  (state.branches || []).forEach((branch) => {
    branch.requirements.forEach((requirement) => {
      if (requirement.subject === oldName) requirement.subject = value;
    });
  });
  state.departments.forEach((department) => {
    department.subjectNames = department.subjectNames.map((item) => (item === oldName ? value : item));
  });
  state.levels.forEach((level) => {
    if (level.subjectBlocks[oldName]) {
      level.subjectBlocks[value] = level.subjectBlocks[oldName];
      delete level.subjectBlocks[oldName];
    }
    if (level.sessionPatterns?.[oldName]) {
      level.sessionPatterns[value] = level.sessionPatterns[oldName];
      delete level.sessionPatterns[oldName];
    }
  });
  state.groupingRules.forEach((rule) => {
    if (rule.subject === oldName) rule.subject = value;
  });
  (state.electiveRules || []).forEach((rule) => rule.options.forEach((option) => {
    if (option.subject === oldName) option.subject = value;
  }));
  if (state.selectedDeptSubject === oldName) state.selectedDeptSubject = value;
}

function renderDepartments() {
  els.departmentList.innerHTML = "";
  const template = document.getElementById("departmentTemplate");
  state.departments.forEach((department) => {
    const card = template.content.firstElementChild.cloneNode(true);
    bindInput(card, "name", department.name, (value) => {
      department.name = value;
      renderSchedules();
    });
    const subjectSelect = card.querySelector('[data-field="subjects"]');
    populateOptions(subjectSelect, state.subjects.map((subject) => subject.name), department.subjectNames);
    subjectSelect.addEventListener("change", () => {
      department.subjectNames = [...subjectSelect.selectedOptions].map((option) => option.value);
      saveToStorage();
      renderSchedules();
    });
    const hodSelect = card.querySelector('[data-field="hod"]');
    populateOptions(hodSelect, ["", ...state.teachers.map((teacher) => teacher.id)], [department.hodTeacherId || ""], (value) => {
      if (!value) return "No HOD assigned";
      return state.teachers.find((teacher) => teacher.id === value)?.name || value;
    });
    hodSelect.addEventListener("change", () => {
      department.hodTeacherId = hodSelect.value;
      saveToStorage();
      renderSession();
    });
    card.querySelector(".remove-entity").addEventListener("click", () => {
      state.departments = state.departments.filter((item) => item.id !== department.id);
      if (state.selectedDepartmentId === department.id) state.selectedDepartmentId = "";
      renderAll();
    });
    els.departmentList.append(card);
  });
}

function renderClasses() {
  els.classList.innerHTML = "";
  ensureSelectedClass();
  renderClassPickers();
  const template = document.getElementById("classTemplate");
  const klass = selectedClass();
  if (!klass) {
    els.classList.innerHTML = `<div class="empty-state"><h4>No classes yet</h4><p>Add a class to start assigning weekly requirements.</p></div>`;
    return;
  }
  const card = template.content.firstElementChild.cloneNode(true);
  const branch = klass.branchId ? branchById(klass.branchId) : null;
  bindInput(card, "name", klass.name, (value) => {
    klass.name = value;
    renderClassPickers();
    renderSchedules();
  });
  const levelSelect = card.querySelector('[data-field="level"]');
  populateOptions(levelSelect, state.levels.map((level) => level.id), [klass.levelId], (id) => levelById(id)?.name || id);
  levelSelect.addEventListener("change", () => {
    klass.levelId = levelSelect.value;
    normalizeAvailability();
    renderAll();
  });
  if (branch) {
    card.querySelector('[data-field="name"]').disabled = true;
    levelSelect.disabled = true;
    card.querySelector(".remove-entity").classList.add("hidden");
    const size = (klass.composition || []).reduce((sum, part) => sum + part.students, 0);
    const parts = (klass.composition || []).map((part) => `${branchById(part.branchId)?.name || "?"} ${part.students}`).join(" + ");
    const notice = document.createElement("p");
    notice.className = "hint branch-notice";
    notice.textContent = `Auto-formed class: ${size} students (${parts}). Subjects are managed on the Branches tab; common subjects are attended together, and partial-taker subjects run as co-timed choice groups shared across classes.`;
    card.querySelector(".entity-card-header").after(notice);
  } else {
    card.querySelector(".remove-entity").addEventListener("click", () => {
      state.classes = state.classes.filter((item) => item.id !== klass.id);
      state.selectedClassId = state.classes[0]?.id || "";
      renderAll();
    });
  }
  card.querySelector(".block-slots-btn").addEventListener("click", () => {
    toggleBlockedGrid(card, klass);
  });
  const mixed = (klass.composition || []).length > 1;
  if (branch && mixed) {
    const summary = document.createElement("p");
    summary.className = "hint";
    summary.textContent = "This class mixes branches, so its subjects come from each branch's plan. Edit them per branch in the Branches tab.";
    card.querySelector(".requirements").append(summary);
  } else {
    const owner = branch
      ? { key: branch.id, levelId: klass.levelId, requirements: branch.requirements, branch }
      : { key: klass.id, levelId: klass.levelId, requirements: klass.requirements };
    renderRequirements(card.querySelector(".requirements"), owner);
  }
  els.classList.append(card);
}

function renderBranches() {
  if (!els.branchList) return;
  ensureSelectedLevel();
  populateOptions(els.branchLevelPicker, state.levels.map((level) => level.id), [state.selectedLevelId], (id) => levelById(id)?.name || id);
  els.branchList.innerHTML = "";
  const level = selectedLevel();
  if (!level) return;

  const settings = document.createElement("article");
  settings.className = "entity-card branch-card";
  const settingsHeading = document.createElement("div");
  settingsHeading.className = "mini-heading";
  settingsHeading.textContent = `${level.name} - class formation settings`;
  settings.append(settingsHeading);
  const settingsHint = document.createElement("p");
  settingsHint.className = "hint";
  settingsHint.textContent = "Branches declare students, not classes. The program packs students into this many classes, keeping every class (and every choice-subject student group) between the minimum and maximum. Breaches are flagged on generated schedules; a group below the minimum is only accepted when the subject's total takers are below it.";
  settings.append(settingsHint);
  const settingsGrid = document.createElement("div");
  settingsGrid.className = "form-grid three";
  const bindLevelNumber = (label, field, min, max) => {
    const input = numberInput(level[field] || 0, min, max, (value) => {
      level[field] = value;
      syncBranchClasses();
      normalizeAvailability();
      renderAll();
    });
    return fieldWrap(label, input);
  };
  settingsGrid.append(
    bindLevelNumber("Classes In Level (0 = auto)", "classCount", 0, 60),
    bindLevelNumber("Min Students Per Class (0 = off)", "minClassSize", 0, 200),
    bindLevelNumber("Max Students Per Class (0 = off)", "maxClassSize", 0, 200),
  );
  settings.append(settingsGrid);
  els.branchList.append(settings);

  const branches = (state.branches || []).filter((branch) => branch.levelId === level.id);
  if (!branches.length) {
    els.branchList.insertAdjacentHTML("beforeend", `<div class="empty-state"><h4>No branches for ${escapeHtml(level.name)}</h4><p>Branches split a level into streams (e.g. Science, Art, Math), each with its own students and subjects. Add one, set its student count and subjects, and the classes are formed automatically.</p></div>`);
    return;
  }

  branches.forEach((branch) => {
    const card = document.createElement("article");
    card.className = "entity-card branch-card";
    const header = document.createElement("div");
    header.className = "entity-card-header";
    const nameField = fieldWrap("Branch Name", textInput(branch.name, (value) => {
      branch.name = value || branch.name;
      syncBranchClasses();
      renderAll();
    }));
    nameField.classList.add("title-field");
    const studentsField = fieldWrap("Students", numberInput(branch.studentCount, 0, 2000, (value) => {
      branch.studentCount = value;
      syncBranchClasses();
      normalizeAvailability();
      renderAll();
    }));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost remove-entity";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      state.branches = state.branches.filter((item) => item.id !== branch.id);
      syncBranchClasses();
      renderAll();
    });
    header.append(nameField, studentsField, remove);
    card.append(header);

    const others = branches.filter((item) => item.id !== branch.id);
    if (others.length) {
      const shareSelect = document.createElement("select");
      shareSelect.multiple = true;
      populateOptions(shareSelect, others.map((item) => item.id), branch.shareWithBranchIds || [], (id) => branchById(id)?.name || id);
      shareSelect.addEventListener("change", () => {
        branch.shareWithBranchIds = [...shareSelect.selectedOptions].map((option) => option.value);
        syncBranchClasses();
        normalizeAvailability();
        renderAll();
      });
      const shareField = fieldWrap("May Share Classes With", shareSelect);
      const shareHint = document.createElement("p");
      shareHint.className = "hint";
      shareHint.textContent = "Shared branches can sit in the same class for their common subjects; their partial-taker subjects split into pooled student groups.";
      card.append(shareField, shareHint);
    }

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Weekly subjects below. \"Students\" on a row = how many of this branch take that subject (empty = all). Partial subjects become co-timed choice groups shared across classes.";
    card.append(hint);
    const reqWrap = document.createElement("div");
    reqWrap.className = "requirements";
    renderRequirements(reqWrap, { key: branch.id, levelId: branch.levelId, requirements: branch.requirements, branch });
    card.append(reqWrap);
    els.branchList.append(card);
  });

  els.branchList.append(renderFormationSummary(level));
}

// Read-only summary of what the packer and sectioning plan produced: formed
// classes with their branch composition, and every choice subject's student
// groups with size flags.
function renderFormationSummary(level) {
  const card = document.createElement("article");
  card.className = "entity-card branch-card formation-summary";
  const heading = document.createElement("div");
  heading.className = "mini-heading";
  heading.textContent = "Resulting classes and student groups";
  card.append(heading);
  const classes = state.classes.filter((klass) => klass.levelId === level.id && klass.branchId);
  if (!classes.length) {
    card.insertAdjacentHTML("beforeend", `<p class="hint">No classes formed yet - give branches students first.</p>`);
    return card;
  }
  const list = document.createElement("ul");
  list.className = "formation-list";
  classes.forEach((klass) => {
    const size = (klass.composition || []).reduce((sum, part) => sum + part.students, 0);
    const parts = (klass.composition || []).map((part) => `${branchById(part.branchId)?.name || "?"} ${part.students}`).join(" + ");
    const line = document.createElement("li");
    line.textContent = `${klass.name}: ${size} students (${parts})`;
    list.append(line);
  });
  card.append(list);
  const plan = levelSectioningPlan(level);
  if (plan?.choiceSubjects.length) {
    const groupsHeading = document.createElement("div");
    groupsHeading.className = "mini-heading";
    groupsHeading.textContent = `Choice-subject groups (co-timed, ${plan.weekly}x per week)`;
    card.append(groupsHeading);
    const groupList = document.createElement("ul");
    groupList.className = "formation-list";
    plan.choiceSubjects.forEach((subject) => {
      subject.groups.forEach((group, index) => {
        const parts = group.chunks.map((chunk) => `${classById(chunk.classId)?.name || "?"}: ${chunk.students}`).join(", ");
        const flags = [group.belowMin ? "below minimum" : "", group.aboveMax ? "above maximum" : ""].filter(Boolean).join(", ");
        const line = document.createElement("li");
        line.textContent = `${subject.subject} group ${index + 1}: ${group.students} students (${parts})${flags ? ` - ⚠ ${flags}` : ""}`;
        if (flags) line.className = "formation-warning";
        groupList.append(line);
      });
    });
    card.append(groupList);
  }
  (plan?.warnings || []).forEach((warning) => {
    card.insertAdjacentHTML("beforeend", `<p class="hint formation-warning">⚠ ${escapeHtml(warning)}</p>`);
  });
  return card;
}

function ensureSelectedClass() {
  if (!state.classes.length) {
    state.selectedClassId = "";
    return;
  }
  if (!state.selectedClassId || !state.classes.some((klass) => klass.id === state.selectedClassId)) {
    state.selectedClassId = state.classes[0].id;
  }
}

function selectedClass() {
  ensureSelectedClass();
  return state.classes.find((klass) => klass.id === state.selectedClassId) || null;
}

function renderClassPickers() {
  const values = state.classes.map((klass) => klass.id);
  const labeler = (value) => state.classes.find((klass) => klass.id === value)?.name || value;
  populateOptions(els.classPicker, values, [state.selectedClassId], labeler);
  populateOptions(els.scheduleClassPicker, values, [state.selectedClassId], labeler);
}

// Weekly-requirements editor, shared by classes and branches. `owner` is
// { key, levelId, requirements }. Subjects with a zero count are "not taken"
// (greyed) and collapse into an expandable list so they can be restored at
// any time with one click.
function renderRequirements(container, owner) {
  container.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "mini-heading";
  heading.textContent = "Weekly subject periods";
  container.append(heading);
  const assigned = [];
  const unassigned = [];
  state.subjects.forEach((subject) => {
    let requirement = owner.requirements.find((item) => item.subject === subject.name);
    if (!requirement) {
      requirement = req(subject.name, 0);
      owner.requirements.push(requirement);
    }
    (requirement.count > 0 ? assigned : unassigned).push({ subject, requirement });
  });
  assigned.forEach((entry) => container.append(requirementRow(entry, owner)));
  if (unassigned.length) {
    const details = document.createElement("details");
    details.className = "unused-subjects";
    details.open = Boolean(state.uiOpenUnused?.[owner.key]);
    details.addEventListener("toggle", () => {
      (state.uiOpenUnused ||= {})[owner.key] = details.open;
    });
    const summary = document.createElement("summary");
    summary.textContent = `${unassigned.length} subject${unassigned.length === 1 ? "" : "s"} not taken - expand to add or restore`;
    details.append(summary);
    unassigned.forEach((entry) => details.append(requirementRow(entry, owner)));
    container.append(details);
  }
}

function requirementRow({ subject, requirement }, owner) {
  const row = document.createElement("div");
  row.className = `requirement-row ${owner.branch ? "with-students" : ""} ${requirement.count > 0 ? "" : "zero-row"}`;
  row.innerHTML = `
    <label class="field"><span>Subject</span><input value="${escapeAttr(subject.name)}" disabled /></label>
    <label class="field"><span>Per Week</span><input type="number" min="0" max="20" value="${requirement.count}" /></label>
    ${owner.branch ? `<label class="field"><span>Students</span><input data-role="students" type="number" min="0" max="2000" placeholder="all" value="${requirement.students || ""}" /></label>` : ""}
    <label class="field"><span>Specific Teacher</span><select></select></label>
    <label class="field"><span>Grouping</span><select data-role="grouping"></select></label>
    <label class="field late-field"><span>Late Cover</span><input type="checkbox" ${requirement.possiblyLate ? "checked" : ""} /></label>
  `;
  if (owner.branch) {
    const studentsInput = row.querySelector('[data-role="students"]');
    studentsInput.title = "How many of this branch's students take the subject. Empty = all of them. Partial takers are pooled into co-timed choice groups.";
    studentsInput.addEventListener("change", () => {
      const value = clampNumber(studentsInput.value, 0, 2000, 0);
      if (value > 0 && value < Number(owner.branch.studentCount || 0)) {
        requirement.students = value;
      } else {
        delete requirement.students;
      }
      syncBranchClasses();
      renderAll();
    });
  }
  const countInput = row.querySelector('input[type="number"]');
  const teacherSelect = row.querySelectorAll("select")[0];
  const groupingSelect = row.querySelector('[data-role="grouping"]');
  const lateInput = row.querySelector('input[type="checkbox"]');
  populateOptions(teacherSelect, ["", ...teachersForSubject(subject.name, owner.levelId).map((teacher) => teacher.id)], [requirement.teacherId || ""], (value) => {
    if (!value) return "Any qualified teacher";
    return state.teachers.find((teacher) => teacher.id === value)?.name || value;
  });
  const availableRules = (state.groupingRules || []).filter((rule) => rule.subject === subject.name && (!rule.levelId || rule.levelId === owner.levelId));
  populateOptions(groupingSelect, ["", ...availableRules.map((rule) => rule.id)], [requirement.groupRuleId || ""], (value) => {
    if (!value) return "No grouping";
    const rule = groupingRuleById(value);
    return rule?.groupName || rule?.id || value;
  });
  countInput.addEventListener("change", () => {
    const wasZero = !(requirement.count > 0);
    requirement.count = clampNumber(countInput.value, 0, 20, 0);
    saveToStorage();
    if (wasZero !== !(requirement.count > 0)) renderAll();
  });
  teacherSelect.addEventListener("change", () => {
    requirement.teacherId = teacherSelect.value;
    saveToStorage();
  });
  groupingSelect.addEventListener("change", () => {
    if (groupingSelect.value) {
      requirement.groupRuleId = groupingSelect.value;
    } else {
      delete requirement.groupRuleId;
    }
    saveToStorage();
  });
  lateInput.addEventListener("change", () => {
    requirement.possiblyLate = lateInput.checked;
    saveToStorage();
  });
  return row;
}

function toggleBlockedGrid(card, klass) {
  let grid = card.querySelector(".blocked-grid");
  if (grid) {
    grid.remove();
    return;
  }
  const level = levelById(klass.levelId);
  if (!level) return;
  grid = document.createElement("div");
  grid.className = "blocked-grid";
  renderSlotGrid(grid, klass.blocked, level.days, maxPeriodsForLevel(level), false, (day, slot, checked) => {
    klass.blocked[day][slot] = checked;
    saveToStorage();
  }, "Blocked", "Open", (day) => periodsForDay(level, day));
  card.append(grid);
}

function renderBlockRules() {
  els.blockRules.innerHTML = "";
  state.levels.forEach((level) => {
    const card = document.createElement("article");
    card.className = "entity-card block-rule-card";
    const heading = document.createElement("div");
    heading.className = "mini-heading";
    heading.textContent = `${level.name} session patterns`;
    card.append(heading);
    const grid = document.createElement("div");
    grid.className = "session-rule-grid";
    state.subjects.forEach((subject) => {
      const row = document.createElement("label");
      row.className = "field";
      row.innerHTML = `<span>${escapeHtml(subject.name)}</span>`;
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Auto or 2+3+1";
      input.value = formatSessionPattern(level.sessionPatterns?.[subject.name]);
      input.addEventListener("change", () => {
        setSessionPattern(level, subject.name, parseSessionPattern(input.value));
        saveToStorage();
      });
      row.append(input);
      grid.append(row);
    });
    card.append(grid);
    els.blockRules.append(card);
  });

  const groupCard = document.createElement("article");
  groupCard.className = "entity-card block-rule-card";
  const header = document.createElement("div");
  header.className = "entity-card-header";
  const heading = document.createElement("div");
  heading.className = "mini-heading";
  heading.textContent = "Class grouping rules";
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "secondary";
  addButton.textContent = "Add Grouping Rule";
  addButton.addEventListener("click", () => {
    const level = selectedLevel();
    state.groupingRules.push(createGroupingRule({
      subject: state.subjects[0]?.name || "",
      levelId: level?.id || state.levels[0]?.id || "",
      groupName: "New grouping rule",
    }));
    renderAll();
  });
  header.append(heading, addButton);
  groupCard.append(header);

  const groupHint = document.createElement("p");
  groupHint.className = "hint";
  groupHint.textContent = "A grouping rule teaches one subject to several classes together as one combined group. Attach classes from the Classes tab using the Grouping column on that subject's row. The weekly count on the class row IS the grouped teaching - the scheduler never adds separate per-class periods on top, so do not count the subject twice.";
  groupCard.append(groupHint);

  if (!state.groupingRules.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No grouped-class rules imported or added.";
    groupCard.append(empty);
  }
  state.groupingRules.forEach((rule) => {
    groupCard.append(renderGroupingRuleEditor(rule));
  });
  els.blockRules.append(groupCard);
  els.blockRules.append(renderElectiveRulesCard());
}

// Editor for elective splits: part of each selected class takes one subject
// while the rest take another, at the same time. Students from all selected
// classes combine into one teaching group per subject.
function renderElectiveRulesCard() {
  const card = document.createElement("article");
  card.className = "entity-card block-rule-card";
  const header = document.createElement("div");
  header.className = "entity-card-header";
  const heading = document.createElement("div");
  heading.className = "mini-heading";
  heading.textContent = "Elective splits (parallel subjects, e.g. German/French)";
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "secondary";
  addButton.textContent = "Add Elective Split";
  addButton.addEventListener("click", () => {
    state.electiveRules.push(createElectiveRule({ levelId: selectedLevel()?.id || state.levels[0]?.id || "" }));
    renderAll();
  });
  header.append(heading, addButton);
  card.append(header);
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Each class in the split divides its students between the listed subjects during the same periods. Matching students from all selected classes are taught together as one group per subject, and the class schedule shows a combined cell like \"German / French\". Do not also give these classes separate weekly requirements for the listed subjects.";
  card.append(hint);
  if (!(state.electiveRules || []).length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No elective splits defined.";
    card.append(empty);
  }
  (state.electiveRules || []).forEach((rule) => card.append(renderElectiveRuleEditor(rule)));
  return card;
}

function renderElectiveRuleEditor(rule) {
  const row = document.createElement("div");
  row.className = "group-rule-editor elective-rule-editor";

  const nameInput = textInput(rule.name, (value) => (rule.name = value));

  const levelSelect = document.createElement("select");
  populateOptions(levelSelect, state.levels.map((level) => level.id), [rule.levelId || state.levels[0]?.id || ""], (id) => levelById(id)?.name || id);
  levelSelect.addEventListener("change", () => {
    rule.levelId = levelSelect.value;
    rule.classIds = [];
    renderAll();
  });

  const classSelect = document.createElement("select");
  classSelect.multiple = true;
  const levelClasses = state.classes.filter((klass) => klass.levelId === (rule.levelId || state.levels[0]?.id));
  populateOptions(classSelect, levelClasses.map((klass) => klass.id), rule.classIds || [], (id) => classById(id)?.name || id);
  classSelect.addEventListener("change", () => {
    rule.classIds = [...classSelect.selectedOptions].map((option) => option.value);
    saveToStorage();
  });

  const countInput = numberInput(rule.count, 0, 20, (value) => (rule.count = value));

  row.append(
    fieldWrap("Rule Name", nameInput),
    fieldWrap("Level", levelSelect),
    fieldWrap("Classes That Split", classSelect),
    fieldWrap("Periods / Week", countInput),
  );

  const optionsWrap = document.createElement("div");
  optionsWrap.className = "elective-options";
  (rule.options || []).forEach((option, index) => {
    const optionRow = document.createElement("div");
    optionRow.className = "elective-option-row";

    const subjectSelect = document.createElement("select");
    populateOptions(subjectSelect, ["", ...state.subjects.map((subject) => subject.name)], [option.subject || ""], (value) => value || "Pick a subject");
    subjectSelect.addEventListener("change", () => {
      option.subject = subjectSelect.value;
      option.teacherId = "";
      renderAll();
    });

    const teacherSelect = document.createElement("select");
    const pool = option.subject ? teachersForSubject(option.subject, rule.levelId) : [];
    populateOptions(teacherSelect, ["", ...pool.map((teacher) => teacher.id)], [option.teacherId || ""], (value) => {
      if (!value) return "Any qualified teacher";
      return state.teachers.find((teacher) => teacher.id === value)?.name || value;
    });
    teacherSelect.addEventListener("change", () => {
      option.teacherId = teacherSelect.value;
      saveToStorage();
    });

    const removeOption = document.createElement("button");
    removeOption.type = "button";
    removeOption.className = "ghost";
    removeOption.textContent = "Remove";
    removeOption.disabled = rule.options.length <= 2;
    removeOption.addEventListener("click", () => {
      rule.options.splice(index, 1);
      renderAll();
    });

    optionRow.append(
      fieldWrap(`Subject ${index + 1}`, subjectSelect),
      fieldWrap("Teacher", teacherSelect),
      removeOption,
    );
    optionsWrap.append(optionRow);
  });
  const addOption = document.createElement("button");
  addOption.type = "button";
  addOption.className = "secondary";
  addOption.textContent = "Add Parallel Subject";
  addOption.addEventListener("click", () => {
    rule.options.push({ subject: "", teacherId: "" });
    renderAll();
  });
  optionsWrap.append(addOption);
  row.append(optionsWrap);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ghost remove-entity";
  remove.textContent = "Remove Split";
  remove.addEventListener("click", () => {
    state.electiveRules = state.electiveRules.filter((item) => item.id !== rule.id);
    renderAll();
  });
  row.append(remove);
  return row;
}

function renderGroupingRuleEditor(rule) {
  const row = document.createElement("div");
  row.className = "group-rule-editor";

  const subjectSelect = document.createElement("select");
  populateOptions(subjectSelect, state.subjects.map((subject) => subject.name), [rule.subject || state.subjects[0]?.name || ""]);
  subjectSelect.addEventListener("change", () => {
    rule.subject = subjectSelect.value;
    saveToStorage();
  });

  const levelSelect = document.createElement("select");
  populateOptions(levelSelect, state.levels.map((level) => level.id), [rule.levelId || state.levels[0]?.id || ""], (id) => levelById(id)?.name || id);
  levelSelect.addEventListener("change", () => {
    rule.levelId = levelSelect.value;
    saveToStorage();
  });

  const modeSelect = document.createElement("select");
  [["mandatory", "Mandatory"], ["allowed", "Allowed"], ["none", "None"]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = (rule.mode || "mandatory") === value;
    modeSelect.append(option);
  });
  modeSelect.addEventListener("change", () => {
    rule.mode = modeSelect.value;
    saveToStorage();
  });

  const teacherSelect = document.createElement("select");
  populateOptions(teacherSelect, ["", ...state.teachers.map((teacher) => teacher.id)], [rule.teacherId || ""], (value) => {
    if (!value) return "Any / assigned teacher";
    return state.teachers.find((teacher) => teacher.id === value)?.name || value;
  });
  teacherSelect.addEventListener("change", () => {
    rule.teacherId = teacherSelect.value;
    saveToStorage();
  });

  const nameInput = textInput(rule.groupName, (value) => (rule.groupName = value));
  const classCountInput = numberInput(rule.classCount, 0, 80, (value) => (rule.classCount = value));
  const groupCountInput = numberInput(rule.groupCount, 0, 40, (value) => (rule.groupCount = value));
  const notesInput = textInput(rule.notes || "", (value) => (rule.notes = value));

  row.append(
    fieldWrap("Subject", subjectSelect),
    fieldWrap("Level", levelSelect),
    fieldWrap("Mode", modeSelect),
    fieldWrap("Rule Name", nameInput),
    fieldWrap("Classes", classCountInput),
    fieldWrap("Groups", groupCountInput),
    fieldWrap("Teacher", teacherSelect),
    fieldWrap("Notes", notesInput),
  );

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ghost remove-entity";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    state.groupingRules = state.groupingRules.filter((item) => item.id !== rule.id);
    state.classes.forEach((klass) => {
      klass.requirements.forEach((requirement) => {
        if (requirement.groupRuleId === rule.id) delete requirement.groupRuleId;
      });
    });
    renderAll();
  });
  row.append(remove);
  return row;
}

function fieldWrap(label, control) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  wrapper.append(span, control);
  return wrapper;
}

function textInput(value, onChange) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value ?? "";
  input.addEventListener("change", () => {
    onChange(input.value);
    saveToStorage();
  });
  return input;
}

function numberInput(value, min, max, onChange) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.value = value || 0;
  input.addEventListener("change", () => {
    onChange(clampNumber(input.value, min, max, 0));
    saveToStorage();
  });
  return input;
}

// ---------------------------------------------------------------------------
// Login and roles. Admin signs in as admin/admin. Teachers sign in as
// firstname_secondname with the second name as password (shown on each card
// in the Teachers tab). This is a local single-file app, so the login is a
// convenience gate per browser, not real security.
// ---------------------------------------------------------------------------

const HONORIFICS = ["mr", "mrs", "ms", "miss", "dr", "prof", "eng"];

function teacherCredentials(teacher) {
  const tokens = String(teacher.name || "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !HONORIFICS.includes(token));
  if (!tokens.length) return null;
  const second = tokens[1] || tokens[0];
  return { username: `${tokens[0]}_${second}`, password: second };
}

function currentRole() {
  const session = state.session;
  if (!session) return { type: "none", teacher: null, department: null };
  if (session.role === "admin") return { type: "admin", teacher: null, department: null };
  const teacher = state.teachers.find((item) => item.id === session.teacherId) || null;
  if (!teacher) return { type: "none", teacher: null, department: null };
  const department = state.departments.find((item) => item.hodTeacherId === teacher.id) || null;
  return department ? { type: "hod", teacher, department } : { type: "teacher", teacher, department: null };
}

function attemptLogin() {
  const username = els.loginUsername.value.trim().toLowerCase();
  const password = els.loginPassword.value.trim().toLowerCase();
  if (!username) return;
  if (username === "admin" && password === "admin") {
    state.session = { role: "admin" };
  } else {
    const teacher = state.teachers.find((item) => {
      const credentials = teacherCredentials(item);
      return credentials && credentials.username === username && credentials.password === password;
    });
    if (!teacher) {
      els.loginError.textContent = "Wrong username or password. Teachers sign in as firstname_secondname with the second name as password.";
      return;
    }
    state.session = { role: "teacher", teacherId: teacher.id };
  }
  els.loginError.textContent = "";
  els.loginUsername.value = "";
  els.loginPassword.value = "";
  renderAll();
}

function renderSession() {
  const role = currentRole();
  const locked = role.type === "none";
  els.loginOverlay.classList.toggle("hidden", !locked);
  document.body.classList.toggle("locked", locked);
  document.body.classList.toggle("role-teacher", role.type === "teacher");
  document.body.classList.toggle("role-hod", role.type === "hod");
  if (locked) {
    state.session = null;
    els.sessionStatus.textContent = "";
    return;
  }
  if (role.type === "admin") {
    els.sessionStatus.textContent = "Administrator - full access.";
  } else if (role.type === "hod") {
    els.sessionStatus.textContent = `${role.teacher.name} - Head of ${role.department.name}.`;
  } else {
    els.sessionStatus.textContent = `${role.teacher.name} - personal schedule.`;
  }
}

// ---------------------------------------------------------------------------
// Shared widgets
// ---------------------------------------------------------------------------

function bindInput(card, field, value, onChange) {
  const input = card.querySelector(`[data-field="${field}"]`);
  input.value = value ?? "";
  input.addEventListener("change", () => {
    onChange(input.value);
    saveToStorage();
  });
}

function populateOptions(select, values, selected = [], labeler = (value) => value) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labeler(value);
    option.selected = selected.includes(value);
    select.append(option);
  });
}

function renderSlotGrid(container, matrix, days, slotCount, positiveDefault, onChange, onText = "On", offText = "Off", slotCountFor = null) {
  container.innerHTML = "";
  container.style.setProperty("--slot-count", slotCount);
  container.append(labelCell("Day"));
  for (let slot = 0; slot < slotCount; slot++) {
    container.append(labelCell(`P${slot + 1}`));
  }
  days.forEach((day) => {
    const dayCell = labelCell(day.slice(0, 3));
    dayCell.classList.add("day-toggle");
    dayCell.title = `Click to toggle all of ${day} on/off`;
    dayCell.addEventListener("click", () => {
      const count = slotCountFor ? slotCountFor(day) : slotCount;
      const anyOn = Array.from({ length: count }, (_, index) => matrix[day]?.[index] ?? positiveDefault).some(Boolean);
      for (let index = 0; index < count; index++) {
        if (matrix[day]) matrix[day][index] = !anyOn;
        onChange(day, index, !anyOn);
      }
      renderSlotGrid(container, matrix, days, slotCount, positiveDefault, onChange, onText, offText, slotCountFor);
    });
    container.append(dayCell);
    const dayCount = slotCountFor ? slotCountFor(day) : slotCount;
    for (let slot = 0; slot < slotCount; slot++) {
      if (slot >= dayCount) {
        const voidCell = labelCell("-");
        voidCell.classList.add("void-slot");
        container.append(voidCell);
        continue;
      }
      const value = matrix[day]?.[slot] ?? positiveDefault;
      const toggle = document.createElement("label");
      toggle.className = `slot-toggle ${value ? "on" : ""}`;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = value;
      toggle.append(input, document.createTextNode(value ? onText : offText));
      input.addEventListener("change", () => {
        toggle.classList.toggle("on", input.checked);
        toggle.lastChild.textContent = input.checked ? onText : offText;
        onChange(day, slot, input.checked);
      });
      container.append(toggle);
    }
  });
}

function labelCell(text) {
  const cell = document.createElement("div");
  cell.className = "cell-label";
  cell.textContent = text;
  return cell;
}

function parseSessionPattern(value) {
  const text = String(value || "").trim();
  if (!text || /^auto$/i.test(text)) return [];
  const normalized = text
    .replace(/\bsingles?\b/gi, "1")
    .replace(/\bdoubles?\b/gi, "2")
    .replace(/\btriples?\b/gi, "3");
  return parseNumberList(normalized).filter((item) => item > 0);
}

function parseNumberList(value) {
  return String(value || "")
    .match(/\d+/g)
    ?.map((item) => clampNumber(item, 1, 12, 1)) || [];
}

function formatSessionPattern(pattern) {
  return Array.isArray(pattern) && pattern.length ? pattern.join("+") : "Auto";
}

function setSessionPattern(level, subjectName, pattern) {
  level.sessionPatterns ||= {};
  level.subjectBlocks ||= {};
  if (Array.isArray(pattern) && pattern.length) {
    level.sessionPatterns[subjectName] = pattern;
    level.subjectBlocks[subjectName] = Math.max(...pattern);
  } else {
    delete level.sessionPatterns[subjectName];
    delete level.subjectBlocks[subjectName];
  }
}

function sessionPatternFor(level, subjectName, total) {
  const exact = (level.sessionPatterns?.[subjectName] || []).filter((item) => item > 0);
  if (exact.length) return exact;
  const blockSize = Math.max(1, Math.min(12, level.subjectBlocks?.[subjectName] || 1));
  const pattern = [];
  let remaining = Number(total || 0);
  while (remaining > 0) {
    const length = Math.min(blockSize, remaining);
    pattern.push(length);
    remaining -= length;
  }
  return pattern;
}

function groupingRuleById(id) {
  return (state.groupingRules || []).find((rule) => rule.id === id) || null;
}

function electiveRuleById(id) {
  return (state.electiveRules || []).find((rule) => rule.id === id) || null;
}

function groupedRequirementClassIds(rule) {
  if (!rule) return [];
  const explicit = (rule.classIds || []).filter((id) => state.classes.some((klass) => klass.id === id));
  if (explicit.length) return explicit;
  return state.classes
    .filter((klass) => klass.levelId === rule.levelId && classRequirements(klass).some((requirement) => requirement.groupRuleId === rule.id))
    .map((klass) => klass.id);
}

function splitCountIntoGroups(total, groupCount) {
  const count = Math.max(1, Number(groupCount || 1));
  const sizes = [];
  let remaining = Math.max(0, Number(total || 0));
  for (let index = 0; index < count; index++) {
    const size = Math.ceil(remaining / (count - index));
    sizes.push(size);
    remaining -= size;
  }
  return sizes.filter((size) => size > 0);
}

function chooseClassGroups(rule, classIds, seed) {
  const ids = [...new Set(classIds || [])];
  if (!ids.length) return [];
  const groupCount = clampNumber(rule?.groupCount || ids.length, 1, ids.length, ids.length);
  if (groupCount >= ids.length) return ids.map((id) => [id]);
  const variants = classGroupPartitions(ids, groupCount);
  if (!variants.length) return splitClassIdsByCount(ids, groupCount);
  const ranked = variants
    .map((chunks) => ({ chunks, score: classGroupScore(chunks) }))
    .sort((a, b) => a.score - b.score);
  const poolSize = Math.min(ranked.length, Math.max(8, state.settings.candidateLimit * 4));
  const pool = ranked.slice(0, poolSize);
  return pool[seededInt(seed + String(rule?.id || "").length * 17, pool.length)].chunks;
}

function classGroupPartitions(classIds, groupCount) {
  const maxPartitions = classIds.length <= 10 ? 20000 : 1200;
  const partitions = [];
  const groups = [];
  function visit(index) {
    if (partitions.length >= maxPartitions) return;
    if (index === classIds.length) {
      if (groups.length === groupCount) partitions.push(groups.map((group) => [...group]));
      return;
    }
    const remaining = classIds.length - index;
    if (groups.length + remaining < groupCount) return;
    const id = classIds[index];
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      groups[groupIndex].push(id);
      visit(index + 1);
      groups[groupIndex].pop();
    }
    if (groups.length < groupCount) {
      groups.push([id]);
      visit(index + 1);
      groups.pop();
    }
  }
  visit(0);
  return partitions;
}

function splitClassIdsByCount(classIds, groupCount) {
  const sizes = splitCountIntoGroups(classIds.length, groupCount);
  const chunks = [];
  let cursor = 0;
  sizes.forEach((size) => {
    const chunk = classIds.slice(cursor, cursor + size);
    if (chunk.length) chunks.push(chunk);
    cursor += size;
  });
  return chunks;
}

function classGroupScore(chunks) {
  const sizes = chunks.map((chunk) => chunk.length);
  const sizeAverage = average(sizes);
  const sizeVariance = sizes.reduce((sum, size) => sum + Math.pow(size - sizeAverage, 2), 0);
  const loads = chunks.map((chunk) => chunk.reduce((sum, classId) => sum + classWeeklyLoad(classId), 0));
  const loadAverage = average(loads);
  const loadVariance = loads.reduce((sum, load) => sum + Math.pow(load - loadAverage, 2), 0);
  return sizeVariance * 12 + loadVariance;
}

function classWeeklyLoad(classId) {
  const klass = classById(classId);
  return klass ? classRequirements(klass).reduce((sum, item) => sum + Number(item.count || 0), 0) : 0;
}

function normalizeAvailability() {
  const days = unionDays();
  const slots = maxSlots();
  state.teachers.forEach((teacher) => {
    const next = {};
    days.forEach((day) => {
      const existing = teacher.availability[day] || [];
      next[day] = Array.from({ length: slots }, (_, index) => existing[index] ?? true);
    });
    teacher.availability = next;
  });
  state.classes.forEach((klass) => {
    const level = levelById(klass.levelId) || state.levels[0];
    if (!level) return;
    klass.levelId = level.id;
    const next = {};
    level.days.forEach((day) => {
      const existing = klass.blocked[day] || [];
      next[day] = Array.from({ length: periodsForDay(level, day) }, (_, index) => existing[index] ?? false);
    });
    klass.blocked = next;
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function allowedSubjectPerDay(level, subjectName) {
  const patternMax = Math.max(1, ...(level.sessionPatterns?.[subjectName] || [1]));
  return Math.max(patternMax, level.subjectBlocks?.[subjectName] || 1, state.settings.maxSubjectPerDay);
}

function validateSetup() {
  const messages = [];
  if (!state.levels.length) messages.push("Add at least one level.");
  state.levels.forEach((level) => {
    if (!level.name.trim()) messages.push("Every level needs a name.");
    if (!level.days.length) messages.push(`${level.name} has no school days selected.`);
    if (timeToMinutes(level.endTime) <= timeToMinutes(level.startTime)) messages.push(`${level.name}: end time must be after start time.`);
    const baseChecked = { done: false };
    level.days.forEach((day) => {
      const hasOverride = Boolean(dayOverride(level, day));
      if (!hasOverride && baseChecked.done) return;
      if (!hasOverride) baseChecked.done = true;
      const config = dayConfig(level, day);
      const where = hasOverride ? `${level.name}, ${day}` : level.name;
      if (timeToMinutes(config.endTime) <= timeToMinutes(config.startTime)) {
        messages.push(`${where}: end time must be after start time.`);
        return;
      }
      const times = levelTimes(level, day);
      if (!times.fits) {
        messages.push(`${where}: ${config.periodsPerDay} periods do not fit between ${config.startTime} and ${config.endTime} even after shortening to ${levelMinPeriod(level)} minutes. Reduce periods or the break.`);
      }
    });
  });
  if (!state.subjects.length) messages.push("Add at least one subject.");
  if (!state.teachers.length) messages.push("Add at least one teacher.");
  if (!state.classes.length) messages.push("Add at least one class.");
  state.subjects.forEach((subject) => {
    if (!subject.name.trim()) messages.push("Every subject needs a name.");
    if (!teachersForSubject(subject.name).length) messages.push(`${subject.name || "A subject"} has no qualified teacher.`);
  });
  state.teachers.forEach((teacher) => {
    if (!teacher.name.trim()) messages.push("Every teacher needs a name.");
    if (!teacher.subjects.length) messages.push(`${teacher.name || "A teacher"} has no teachable subjects selected.`);
  });
  const electiveLoadByClass = {};
  (state.electiveRules || []).forEach((rule) => {
    (rule.classIds || []).forEach((classId) => {
      electiveLoadByClass[classId] = (electiveLoadByClass[classId] || 0) + Number(rule.count || 0);
    });
  });
  state.levels.forEach((level) => {
    if (Number(level.minClassSize) > 0 && Number(level.maxClassSize) > 0 && Number(level.minClassSize) > Number(level.maxClassSize)) {
      messages.push(`${level.name}: minimum students per class is larger than the maximum.`);
    }
    const plan = levelSectioningPlan(level);
    if (!plan) return;
    messages.push(...plan.warnings);
    if (plan.weekly > 0) {
      plan.clusterClassIds.forEach((classId) => {
        electiveLoadByClass[classId] = (electiveLoadByClass[classId] || 0) + plan.weekly;
      });
    }
  });
  (state.branches || []).forEach((branch) => {
    if (!(Number(branch.studentCount) > 0)) messages.push(`Branch ${branch.name}: set the number of students.`);
  });
  state.classes.forEach((klass) => {
    if (!klass.name.trim()) messages.push("Every class needs a name.");
    const level = levelById(klass.levelId);
    if (!level) {
      messages.push(`${klass.name} is not assigned to a level.`);
      return;
    }
    const total = classRequirements(klass).reduce((sum, item) => sum + Number(item.count || 0), 0) + (electiveLoadByClass[klass.id] || 0);
    const capacity = level.days.reduce((sum, day) => sum + periodsForDay(level, day), 0);
    if (total > capacity) messages.push(`${klass.name} needs ${total} periods, but ${level.name} has capacity for ${capacity}.`);
    classRequirements(klass).filter((item) => item.count > 0).forEach((item) => {
      const subject = subjectByName(item.subject);
      if (!subject) messages.push(`${klass.name} references a missing subject: ${item.subject}.`);
      if (item.teacherId && !state.teachers.some((teacher) => teacher.id === item.teacherId)) messages.push(`${klass.name} has a missing assigned teacher for ${item.subject}.`);
      if (!item.teacherId && !teachersForSubject(item.subject, level.id).length) messages.push(`${klass.name} cannot schedule ${item.subject}; no teacher teaches it in ${level.name}.`);
      const exactPattern = level.sessionPatterns?.[item.subject] || [];
      if (exactPattern.length) {
        const patternTotal = exactPattern.reduce((sum, value) => sum + Number(value || 0), 0);
        if (patternTotal !== Number(item.count || 0)) {
          messages.push(`${klass.name} needs ${item.count} ${item.subject} periods, but ${level.name}'s session pattern is ${exactPattern.join("+")} (${patternTotal}).`);
        }
      }
      if (item.groupRuleId && !state.groupingRules.some((rule) => rule.id === item.groupRuleId)) {
        messages.push(`${klass.name} references a missing grouping rule for ${item.subject}.`);
      }
      const maxSpread = level.days.length * allowedSubjectPerDay(level, item.subject);
      if (item.count > maxSpread) messages.push(`${klass.name} needs ${item.count} ${item.subject} periods, but the repeat/block limits allow only ${maxSpread} per week.`);
    });
  });
  (state.groupingRules || []).forEach((rule) => {
    if (rule.mode === "none") return;
    if (!subjectByName(rule.subject)) messages.push(`Grouping rule ${rule.groupName || rule.id} references a missing subject.`);
    if (!levelById(rule.levelId)) messages.push(`Grouping rule ${rule.groupName || rule.id} references a missing level.`);
    const assignedCount = groupedRequirementClassIds(rule).length;
    const classCount = Number(rule.classCount || assignedCount || 0);
    const groupCount = Number(rule.groupCount || 0);
    if (!groupCount) messages.push(`Grouping rule ${rule.groupName || rule.id} needs a number of teaching groups.`);
    if (groupCount && classCount && groupCount > classCount) messages.push(`Grouping rule ${rule.groupName || rule.id} has more groups than assigned classes.`);
    if (rule.classCount && assignedCount && Number(rule.classCount) !== assignedCount) {
      messages.push(`Grouping rule ${rule.groupName || rule.id} says ${rule.classCount} classes, but ${assignedCount} class requirements are attached.`);
    }
  });
  (state.electiveRules || []).forEach((rule) => {
    const label = rule.name || "Elective split";
    const level = levelById(rule.levelId);
    if (!level) {
      messages.push(`${label}: pick a level.`);
      return;
    }
    const options = (rule.options || []).filter((option) => option.subject);
    if (options.length < 2) messages.push(`${label}: needs at least two parallel subjects (e.g. German and French).`);
    if (!(rule.classIds || []).length) messages.push(`${label}: select the classes whose students split.`);
    if (!(rule.count > 0)) messages.push(`${label}: set periods per week.`);
    const optionSubjects = new Set();
    options.forEach((option) => {
      if (optionSubjects.has(option.subject)) messages.push(`${label}: ${option.subject} is listed twice.`);
      optionSubjects.add(option.subject);
      if (!subjectByName(option.subject)) messages.push(`${label} references a missing subject: ${option.subject}.`);
      const pool = option.teacherId ? state.teachers.filter((teacher) => teacher.id === option.teacherId) : teachersForSubject(option.subject, rule.levelId);
      if (!pool.length) messages.push(`${label}: no teacher teaches ${option.subject} in ${level.name}.`);
    });
    (rule.classIds || []).forEach((classId) => {
      const klass = classById(classId);
      if (!klass) return;
      if (klass.levelId !== rule.levelId) messages.push(`${label}: ${klass.name} is not in ${level.name}.`);
      classRequirements(klass).forEach((requirement) => {
        if (Number(requirement.count || 0) > 0 && optionSubjects.has(requirement.subject)) {
          messages.push(`${klass.name}: remove the separate ${requirement.subject} requirement (${requirement.count}/week) - it is already covered by the elective split "${label}".`);
        }
      });
    });
    if (rule.count > level.days.length * Math.max(1, state.settings.maxSubjectPerDay)) {
      messages.push(`${label}: ${rule.count} periods per week do not fit within the daily repeat limit.`);
    }
  });
  return { ok: messages.length === 0, messages };
}

function showValidation(messages) {
  showAlerts(messages.length ? messages.map((text) => ({ type: "error", text })) : [{ type: "success", text: "Setup is valid. Generate schedules when ready." }]);
}

// ---------------------------------------------------------------------------
// Schedule generation
// ---------------------------------------------------------------------------

function generateSchedules() {
  syncBranchClasses();
  normalizeAvailability();
  const validation = validateSetup();
  if (!validation.ok) {
    showValidation(validation.messages);
    return;
  }
  // Solving is synchronous and can take a few seconds on hard setups; show a
  // busy state and yield one frame so the label actually paints first.
  els.generateBtn.disabled = true;
  els.generateBtn.textContent = "Generating...";
  showAlerts([{ type: "", text: "Searching for schedules. Hard setups can take a few seconds..." }]);
  setTimeout(() => {
    try {
      runGeneration();
    } finally {
      els.generateBtn.disabled = false;
      els.generateBtn.textContent = "Generate Schedules";
    }
  }, 30);
}

function runGeneration() {
  const schedules = buildCandidateSchedules();
  state.schedules = schedules;
  state.selectedSchedule = 0;
  renderSchedules();
  saveToStorage();
  if (!schedules.length) {
    showAlerts([{ type: "error", text: "No schedules could be generated. Add classes with weekly subject requirements first." }]);
    return;
  }
  const best = schedules[0];
  if (!best.violations?.length) {
    showAlerts([{ type: "success", text: `Generated ${schedules.length} schedule${schedules.length === 1 ? "" : "s"} meeting every hard constraint. Lower score is better. Use the section buttons on the left to keep editing the setup.` }]);
  } else {
    showAlerts([
      { type: "error", text: `No timetable can satisfy every hard constraint with the current setup. Showing the ${schedules.length} closest schedule${schedules.length === 1 ? "" : "s"} instead - the best option breaks ${best.violations.length} constraint${best.violations.length === 1 ? "" : "s"}.` },
      { type: "", text: "Each option lists exactly which constraints it breaks (above the timetable, and highlighted red on the affected lessons). Fix them by editing lessons manually, or loosen availability, loads, or requirements and regenerate." },
    ]);
  }
}

const EXACT_TIME_BUDGET_MS = 4500;
const RELAXED_TIME_BUDGET_MS = 3500;
const EXACT_NODE_BUDGET_DEEP = 30000;

// Two-phase generation. Phase 1 (exact): first fast greedy-with-slack probes
// across many seeds, then deep backtracking search on a few seeds if the
// probes found little; only schedules meeting every hard constraint are
// accepted. Phase 2 (fallback, only when phase 1 finds nothing): every lesson
// is placed at the spot breaking the fewest constraints, a repair pass
// relocates offending lessons, and results are ranked by number of broken
// constraints. Every schedule carries a `violations` list naming each break.
function buildCandidateSchedules() {
  const limit = state.settings.candidateLimit;
  const seedCount = Math.min(24, Math.max(8, limit * 2));
  const perfect = [];
  const exactDeadline = Date.now() + EXACT_TIME_BUDGET_MS;
  const solveSeed = (seed, nodes) => {
    const tasks = orderTasks(expandTasks(seed), seed);
    const schedule = emptySchedule();
    const budget = { nodes: nodes ?? tasks.length + 60, used: 0, deadline: exactDeadline, exhausted: false };
    if (placeTasksExact(schedule, tasks, seed, budget)) {
      schedule.seed = seed;
      refreshScheduleMeta(schedule);
      perfect.push(schedule);
    }
  };
  for (let seed = 0; seed < seedCount && Date.now() < exactDeadline; seed++) {
    solveSeed(seed, null);
  }
  if (perfect.length < Math.min(3, limit)) {
    for (let seed = 0; seed < Math.min(6, seedCount) && Date.now() < exactDeadline; seed++) {
      solveSeed(seed, EXACT_NODE_BUDGET_DEEP);
    }
  }
  if (perfect.length) {
    return dedupeSchedules(perfect)
      .sort((a, b) => (a.violations.length - b.violations.length) || (a.score - b.score))
      .slice(0, limit);
  }
  const relaxed = [];
  const relaxedDeadline = Date.now() + RELAXED_TIME_BUDGET_MS;
  for (let seed = 0; seed < seedCount; seed++) {
    const tasks = orderTasks(expandTasks(seed), seed);
    const schedule = emptySchedule();
    placeTasksRelaxed(schedule, tasks, seed);
    repairSchedule(schedule, seed);
    schedule.seed = seed;
    refreshScheduleMeta(schedule);
    relaxed.push(schedule);
    if (Date.now() > relaxedDeadline && relaxed.length >= Math.min(4, limit)) break;
  }
  return dedupeSchedules(relaxed)
    .sort((a, b) => (a.violations.length - b.violations.length) || (a.violationWeight - b.violationWeight) || (a.score - b.score))
    .slice(0, limit);
}

// Most-constrained-first ordering: subjects whose weekly demand nearly
// exhausts their teachers' capacity are placed before loosely-supplied ones,
// then longer blocks and harder subjects. This is what lets tight instances
// (e.g. a subject using 85 of 90 teacher slots) solve without deep search.
function orderTasks(tasks, seed) {
  const tightness = subjectTightnessMap();
  // Elective splits need several teachers plus every listed class free at the
  // same time, so they are the most constrained tasks and go first.
  const weightOf = (task) => taskWeight(task)
    + (tightness[`${task.subject}|${task.levelId}`] ?? tightness[task.subject] ?? 0)
    + (task.electiveOptions ? 700 : 0);
  return shuffleWithSeed(tasks, seed).sort((a, b) => weightOf(b) - weightOf(a));
}

// Demand/supply ratio per subject AND per level (teachers can be scoped to
// levels, so Science supply in one level can differ from another's).
function subjectTightnessMap() {
  const demand = {};
  const addDemand = (subject, levelId, count) => {
    const key = `${subject}|${levelId}`;
    demand[key] = (demand[key] || 0) + count;
  };
  state.classes.forEach((klass) => classRequirements(klass).forEach((requirement) => {
    const expected = expectedWeeklyCount(requirement);
    if (expected > 0) addDemand(requirement.subject, klass.levelId, expected);
  }));
  (state.electiveRules || []).forEach((rule) => {
    (rule.options || []).forEach((option) => {
      if (option.subject && rule.count > 0) addDemand(option.subject, rule.levelId, Number(rule.count));
    });
  });
  const days = unionDays().length;
  const map = {};
  Object.keys(demand).forEach((key) => {
    const [subject, levelId] = key.split("|");
    const supply = teachersForSubject(subject, levelId).reduce((sum, teacher) => {
      const share = Math.max(1, teacher.subjects.length);
      return sum + (days * (teacher.maxPerDay || state.settings.maxTeacherPerDay)) / share;
    }, 0);
    const ratio = supply > 0 ? demand[key] / supply : 2;
    map[key] = ratio * 400;
  });
  return map;
}

function expandTasks(seed = 0) {
  const tasks = [];
  const grouped = new Map();
  state.classes.forEach((klass) => {
    const level = levelById(klass.levelId);
    if (!level) return;
    // With "honor fixed teacher assignments" off, teacher-class pairing
    // becomes a pure solver decision (any qualified teacher, chosen for fit).
    const honorFixed = state.constraints.honorFixedTeachers !== false;
    classRequirements(klass).forEach((requirement) => {
      if (Number(requirement.count || 0) <= 0) return;
      const rule = requirement.groupRuleId ? groupingRuleById(requirement.groupRuleId) : null;
      if (rule && rule.mode !== "none") {
        const teacherId = honorFixed ? (rule.teacherId || requirement.teacherId || "") : "";
        const key = `${rule.id}::${teacherId}::${requirement.subject}::${level.id}`;
        if (!grouped.has(key)) {
          grouped.set(key, { rule, level, requirement, teacherId, classIds: [] });
        }
        grouped.get(key).classIds.push(klass.id);
      } else {
        appendRequirementTasks(tasks, level, requirement, [klass.id], honorFixed ? (requirement.teacherId || "") : "", null, 0);
      }
    });
  });
  grouped.forEach((entry) => {
    const orderedClassIds = state.classes
      .filter((klass) => entry.classIds.includes(klass.id))
      .map((klass) => klass.id);
    const classIds = (entry.rule.classIds || []).filter((id) => orderedClassIds.includes(id));
    const groupedClassIds = classIds.length ? classIds : orderedClassIds;
    const chunks = chooseClassGroups(entry.rule, groupedClassIds, seed);
    chunks.forEach((chunk, index) => {
      appendRequirementTasks(tasks, entry.level, entry.requirement, chunk, entry.teacherId, entry.rule, index + 1);
    });
  });
  (state.electiveRules || []).forEach((rule) => {
    const level = levelById(rule.levelId);
    const classIds = (rule.classIds || []).filter((id) => classById(id));
    const options = (rule.options || []).filter((option) => option.subject);
    if (!level || !classIds.length || !options.length || !(rule.count > 0)) return;
    const classNames = classNamesForIds(classIds);
    for (let occurrence = 1; occurrence <= rule.count; occurrence++) {
      tasks.push({
        classId: classIds[0],
        classIds,
        className: classNames.join(" + "),
        classNames,
        levelId: level.id,
        subject: options.map((option) => option.subject).join(" / "),
        electiveOptions: options.map((option) => ({ subject: option.subject, teacherId: option.teacherId || "" })),
        electiveRuleId: rule.id,
        teacherId: "",
        possiblyLate: false,
        length: 1,
        occurrence,
        weeklyTotal: rule.count,
        groupRuleId: "",
        teachingGroupIndex: 0,
      });
    }
  });
  // Choice subjects from the branch sectioning plan: every occurrence places
  // ALL teaching groups of ALL choice subjects simultaneously (one teacher
  // per group), while every cluster class shows one combined choice block.
  state.levels.forEach((level) => {
    const plan = levelSectioningPlan(level);
    if (!plan || !plan.choiceSubjects.length || !plan.clusterClassIds.length || !(plan.weekly > 0)) return;
    const classNames = classNamesForIds(plan.clusterClassIds);
    const subjectNames = [...new Set(plan.choiceSubjects.map((subject) => subject.subject))];
    const options = plan.choiceSubjects.flatMap((subject) => subject.groups.map((group, groupIndex) => ({
      subject: subject.subject,
      teacherId: "",
      groupIndex,
      students: group.students,
    })));
    if (!options.length) return;
    for (let occurrence = 1; occurrence <= plan.weekly; occurrence++) {
      tasks.push({
        classId: plan.clusterClassIds[0],
        classIds: plan.clusterClassIds,
        className: classNames.join(" + "),
        classNames,
        levelId: level.id,
        subject: subjectNames.join(" / "),
        electiveOptions: options,
        electiveRuleId: `sec_${level.id}`,
        sectioning: true,
        teacherId: "",
        possiblyLate: false,
        length: 1,
        occurrence,
        weeklyTotal: plan.weekly,
        groupRuleId: "",
        teachingGroupIndex: 0,
      });
    }
  });
  return tasks;
}

function appendRequirementTasks(tasks, level, requirement, classIds, teacherId, rule, groupIndex) {
  const total = Number(rule?.periodsPerGroup || requirement.count || 0);
  const pattern = sessionPatternFor(level, requirement.subject, total);
  pattern.forEach((length, index) => {
    tasks.push({
      weeklyTotal: total,
      classId: classIds[0],
      classIds,
      className: classNamesForIds(classIds).join(" + "),
      classNames: classNamesForIds(classIds),
      levelId: level.id,
      subject: requirement.subject,
      teacherId,
      possiblyLate: Boolean(requirement.possiblyLate),
      length,
      occurrence: index + 1,
      groupRuleId: rule?.id || "",
      teachingGroupIndex: groupIndex,
    });
  });
}

function taskWeight(task) {
  const subject = subjectByName(task.subject);
  const qualified = task.teacherId ? 1 : teachersForSubject(task.subject, task.levelId).length;
  return task.length * 25 + (subject?.difficulty || 3) * 10 + (subject?.priority === "core" ? 8 : 0) - qualified;
}

function emptySchedule() {
  const byClass = {};
  const teacherSlots = {};
  state.classes.forEach((klass) => {
    const level = levelById(klass.levelId);
    byClass[klass.id] = {};
    (level?.days || []).forEach((day) => {
      byClass[klass.id][day] = Array.from({ length: periodsForDay(level, day) }, () => null);
    });
  });
  state.teachers.forEach((teacher) => {
    teacherSlots[teacher.id] = {};
    unionDays().forEach((day) => {
      teacherSlots[teacher.id][day] = Array.from({ length: maxSlots() }, () => null);
    });
  });
  return { byClass, teacherSlots, teacherBindings: {} };
}

// Consistent-teacher binding: once the solver picks a teacher for a class's
// subject, every later occurrence of that subject in the same class(es) is
// taught by the same teacher. Bindings are reference-counted so backtracking
// can release them.
function bindingKey(task) {
  const classIds = task.classIds?.length ? task.classIds : [task.classId];
  return `${[...classIds].sort().join("+")}|${task.subject}`;
}

function recordBinding(schedule, records, key, teacherId) {
  const bindings = (schedule.teacherBindings ||= {});
  const bound = bindings[key];
  if (bound) {
    if (bound.teacherId !== teacherId) return;
    bound.count += 1;
  } else {
    bindings[key] = { teacherId, count: 1 };
  }
  if (records.length) (records[0].bindingKeys ||= []).push(key);
}

function boundTeacherId(schedule, key) {
  if (!state.constraints.consistentTeacher) return "";
  return schedule.teacherBindings?.[key]?.teacherId || "";
}

// Depth-first search with backtracking. Placements are tried best-score
// first and unwound on dead ends, so within its node/time budget the search
// is exact: if any complete schedule exists for this task order, it is found.
// Multiple seeds retry with different task orders and score noise.
function placeTasksExact(schedule, tasks, seed, budget) {
  function place(index) {
    if (index >= tasks.length) return true;
    if (budget.used > budget.nodes || Date.now() > budget.deadline) {
      budget.exhausted = true;
      return false;
    }
    const task = tasks[index];
    const placements = enumeratePlacements(schedule, task, false)
      .map((placement) => ({ ...placement, score: placementScore(schedule, task, placement, seed) }))
      .sort((a, b) => a.score - b.score);
    for (const placement of placements) {
      budget.used += 1;
      const applied = applyTask(schedule, task, placement);
      if (place(index + 1)) return true;
      undoTask(schedule, applied);
      if (budget.exhausted) return false;
    }
    return false;
  }
  return place(0);
}

// Fallback placement: every task lands on the spot that breaks the fewest
// (lowest-weight) constraints. Structural rules (one lesson per class slot,
// block shapes, break straddling, day length) are never broken. Tasks with no
// physically possible spot stay unplaced and are reported by the audit.
function placeTasksRelaxed(schedule, tasks, seed) {
  const unplaced = [];
  tasks.forEach((task) => {
    const placements = enumeratePlacements(schedule, task, true)
      .map((placement) => ({ ...placement, score: placementScore(schedule, task, placement, seed) }))
      .sort((a, b) => (a.penalty - b.penalty) || (a.score - b.score));
    if (!placements.length) {
      unplaced.push(task);
      return;
    }
    const bestPenalty = placements[0].penalty;
    const pool = placements.filter((placement) => placement.penalty === bestPenalty).slice(0, 3);
    applyTask(schedule, task, pool[seededInt(seed + task.occurrence, pool.length)]);
  });
  return unplaced;
}

// All placements for a task. In exact mode only conflict-free placements are
// returned. In relaxed mode, placements that break relaxable constraints are
// returned too, each carrying the violations it would cause and a penalty.
function enumeratePlacements(schedule, task, relaxed = false) {
  if (task.electiveOptions?.length) return enumerateElectivePlacements(schedule, task, relaxed);
  const placements = [];
  const classes = (task.classIds?.length ? task.classIds : [task.classId]).map(classById).filter(Boolean);
  const level = levelById(task.levelId);
  if (!classes.length || !level) return placements;
  let teachers;
  if (task.teacherId) {
    teachers = state.teachers.filter((teacher) => teacher.id === task.teacherId);
  } else {
    teachers = teachersForSubject(task.subject, task.levelId);
    if (!teachers.length && relaxed) teachers = teachersForSubject(task.subject);
    if (!teachers.length && relaxed) teachers = state.teachers;
    const bound = boundTeacherId(schedule, bindingKey(task));
    if (bound) {
      teachers = teachers.filter((teacher) => teacher.id === bound);
    } else if (state.constraints.consistentTeacher && !relaxed) {
      // Establishing a week-long binding: the teacher must have enough free
      // weekly capacity for this class's WHOLE weekly count of the subject,
      // or later occurrences are doomed. Prunes infeasible bin-packings early.
      teachers = teachers.filter((teacher) => teacherWeeklyCapacityOk(schedule, teacher, task.weeklyTotal || task.length));
    }
  }
  const patternLocked = Boolean(level.sessionPatterns?.[task.subject]?.length);
  level.days.forEach((day) => {
    const config = dayConfig(level, day);
    const breakAt = effectiveBreakLength(config) ? config.breakAfter : 0;
    const classDays = classes.map((klass) => ({ klass, grid: schedule.byClass[klass.id]?.[day] }));
    if (classDays.some((item) => !item.grid)) return;
    const repeatCount = Math.max(...classDays.map(({ grid }) => grid.filter((lesson) => lesson?.subject === task.subject).length));
    const repeatBroken = repeatCount + task.length > allowedSubjectPerDay(level, task.subject);
    if (repeatBroken && !relaxed) return;
    for (let slot = 0; slot + task.length <= config.periodsPerDay; slot++) {
      if (breakAt > 0 && slot < breakAt && slot + task.length > breakAt) continue;
      let occupied = false;
      const blockedSlots = [];
      for (let index = 0; index < task.length && !occupied; index++) {
        const at = slot + index;
        for (const { klass, grid } of classDays) {
          if (grid[at]) {
            occupied = true;
            break;
          }
          if (klass.blocked[day]?.[at]) blockedSlots.push({ klass, at });
        }
      }
      if (occupied) continue;
      if (blockedSlots.length && !relaxed) continue;
      if (patternLocked && classDays.some(({ grid }) => grid[slot - 1]?.subject === task.subject || grid[slot + task.length]?.subject === task.subject)) continue;
      for (const teacher of teachers) {
        const placement = evaluateTeacherPlacement(schedule, task, teacher, day, slot, relaxed, repeatBroken, blockedSlots);
        if (placement) placements.push(placement);
      }
    }
  });
  return placements;
}

function teacherWeeklyLoad(schedule, teacherId) {
  const days = schedule.teacherSlots[teacherId] || {};
  let load = 0;
  Object.keys(days).forEach((day) => {
    load += days[day].filter(Boolean).length;
  });
  return load;
}

function teacherWeeklyCapacityOk(schedule, teacher, needed) {
  const days = Object.keys(schedule.teacherSlots[teacher.id] || {});
  const maxTeacher = teacher.maxPerDay || state.settings.maxTeacherPerDay;
  return teacherWeeklyLoad(schedule, teacher.id) + needed <= days.length * maxTeacher;
}

function evaluateTeacherPlacement(schedule, task, teacher, day, slot, relaxed, repeatBroken, blockedSlots) {
  const violations = [];
  if (state.constraints.requireQualifiedTeacher && !teacherTeachesSubjectAtLevel(teacher, task.subject, task.levelId)) {
    if (!relaxed) return null;
    const levelName = task.levelId ? levelById(task.levelId)?.name : "";
    violations.push(violation("unqualified", `${teacher.name} is not qualified to teach ${task.subject}${levelName ? ` in ${levelName}` : ""}.`));
  }
  const teacherDay = schedule.teacherSlots[teacher.id]?.[day];
  if (!teacherDay) return null;
  const replacements = task.possiblyLate ? replacementTeachersFor(teacher.id) : [];
  if (task.possiblyLate && !replacements.length) {
    if (!relaxed) return null;
    violations.push(violation("lateCover", `${teacher.name} has no replacement teacher for a possibly-late lesson.`));
  }
  if (repeatBroken) violations.push(violation("repeat", `${task.subject} repeated beyond the daily limit for ${task.className} on ${day}.`));
  blockedSlots.forEach(({ klass, at }) => violations.push(violation("blocked", `${klass.name} is blocked on ${day} P${at + 1}.`)));
  for (let index = 0; index < task.length; index++) {
    const at = slot + index;
    if (state.constraints.honorAvailability && teacher.availability[day]?.[at] === false) {
      if (!relaxed) return null;
      violations.push(violation("availability", `${teacher.name} is unavailable on ${day} P${at + 1}.`));
    }
    if (state.constraints.preventTeacherClashes && teacherDay[at]) {
      if (!relaxed) return null;
      violations.push(violation("clash", `${teacher.name} is double-booked on ${day} P${at + 1}.`));
    }
    for (const replacement of replacements) {
      if (state.constraints.honorAvailability && replacement.availability[day]?.[at] === false) {
        if (!relaxed) return null;
        violations.push(violation("lateCover", `${replacement.name} is unavailable to cover ${teacher.name} on ${day} P${at + 1}.`));
      }
      if (state.constraints.preventTeacherClashes && schedule.teacherSlots[replacement.id]?.[day]?.[at]) {
        if (!relaxed) return null;
        violations.push(violation("lateCover", `${replacement.name} is occupied and cannot cover ${teacher.name} on ${day} P${at + 1}.`));
      }
    }
  }
  const maxTeacher = teacher.maxPerDay || state.settings.maxTeacherPerDay;
  if (teacherDay.filter(Boolean).length + task.length > maxTeacher) {
    if (!relaxed) return null;
    violations.push(violation("overload", `${teacher.name} exceeds ${maxTeacher} periods on ${day}.`));
  }
  if (!relaxed) {
    for (const replacement of replacements) {
      const replacementDay = schedule.teacherSlots[replacement.id]?.[day] || [];
      if (replacementDay.filter(Boolean).length + task.length > (replacement.maxPerDay || state.settings.maxTeacherPerDay)) return null;
    }
  }
  return {
    day,
    slot,
    teacherId: teacher.id,
    violations,
    penalty: violations.reduce((sum, item) => sum + item.weight, 0),
  };
}

// Placements for an elective split: all listed classes must be free at the
// slot, and every option (e.g. German AND French) needs its own free teacher
// at the same time. For each option the least-loaded viable teacher is
// chosen; distinct teachers are enforced across options.
function enumerateElectivePlacements(schedule, task, relaxed = false) {
  const placements = [];
  const classes = (task.classIds || []).map(classById).filter(Boolean);
  const level = levelById(task.levelId);
  if (!classes.length || !level) return placements;
  const dailyLimit = Math.max(1, state.settings.maxSubjectPerDay);
  level.days.forEach((day) => {
    const config = dayConfig(level, day);
    const classDays = classes.map((klass) => ({ klass, grid: schedule.byClass[klass.id]?.[day] }));
    if (classDays.some((item) => !item.grid)) return;
    const repeatCount = Math.max(...classDays.map(({ grid }) => grid.filter((lesson) => lesson?.electiveRuleId === task.electiveRuleId).length));
    const repeatBroken = repeatCount + 1 > dailyLimit;
    if (repeatBroken && !relaxed) return;
    for (let slot = 0; slot < config.periodsPerDay; slot++) {
      let occupied = false;
      const blockedSlots = [];
      for (const { klass, grid } of classDays) {
        if (grid[slot]) {
          occupied = true;
          break;
        }
        if (klass.blocked[day]?.[slot]) blockedSlots.push({ klass, at: slot });
      }
      if (occupied) continue;
      if (blockedSlots.length && !relaxed) continue;
      const violations = [];
      if (repeatBroken) violations.push(violation("repeat", `${task.subject} repeated beyond the daily limit for ${task.className} on ${day}.`));
      blockedSlots.forEach(({ klass, at }) => violations.push(violation("blocked", `${klass.name} is blocked on ${day} P${at + 1}.`)));
      const optionTeachers = [];
      const used = new Set();
      let feasible = true;
      for (const option of task.electiveOptions) {
        let pool = (option.teacherId
          ? state.teachers.filter((teacher) => teacher.id === option.teacherId)
          : teachersForSubject(option.subject, task.levelId)).filter((teacher) => !used.has(teacher.id));
        if (!pool.length && relaxed) pool = teachersForSubject(option.subject).filter((teacher) => !used.has(teacher.id));
        if (!pool.length && relaxed) pool = state.teachers.filter((teacher) => !used.has(teacher.id));
        if (!option.teacherId) {
          const bound = boundTeacherId(schedule, `elx:${task.electiveRuleId}|${option.subject}#${option.groupIndex || 0}`);
          if (bound) pool = pool.filter((teacher) => teacher.id === bound);
        }
        const optionTask = { subject: option.subject, className: task.className, levelId: task.levelId, length: 1, possiblyLate: false, teacherId: option.teacherId || "" };
        let best = null;
        for (const teacher of pool) {
          const evaluated = evaluateTeacherPlacement(schedule, optionTask, teacher, day, slot, relaxed, false, []);
          if (!evaluated) continue;
          const load = (schedule.teacherSlots[teacher.id]?.[day] || []).filter(Boolean).length;
          const rank = evaluated.penalty * 1000 + load;
          if (!best || rank < best.rank) best = { teacher, evaluated, rank };
        }
        if (!best) {
          feasible = false;
          break;
        }
        used.add(best.teacher.id);
        optionTeachers.push({ subject: option.subject, teacherId: best.teacher.id, groupIndex: option.groupIndex || 0, students: option.students || 0 });
        violations.push(...best.evaluated.violations);
      }
      if (!feasible) continue;
      placements.push({
        day,
        slot,
        teacherId: optionTeachers[0].teacherId,
        optionTeachers,
        violations,
        penalty: violations.reduce((sum, item) => sum + item.weight, 0),
      });
    }
  });
  return placements;
}

function placementScore(schedule, task, placement, seed) {
  const subject = subjectByName(task.subject);
  const classIds = task.classIds?.length ? task.classIds : [task.classId];
  const classDays = classIds.map((id) => schedule.byClass[id]?.[placement.day] || []);
  const classDay = classDays.flat();
  const teacherDay = schedule.teacherSlots[placement.teacherId][placement.day];
  let score = seededInt(seed + placement.slot + placement.day.length, 7);
  if (state.constraints.morningCore && subject?.priority === "core") score += placement.slot * 4;
  if (state.constraints.avoidSameSubjectDay && task.length === 1) {
    score += classDay.filter((lesson) => lesson?.subject === task.subject).length * 35;
  }
  const dayDifficulty = classDay.filter(Boolean).reduce((sum, lesson) => sum + (subjectByName(lesson.subject)?.difficulty || 3), 0);
  score += dayDifficulty * (subject?.difficulty || 3) * 2;
  if (state.constraints.balanceTeacherLoad) {
    score += teacherDay.filter(Boolean).length * 9;
    // Weekly balance spreads classes across the qualified teachers, which is
    // what keeps tight subjects packable under week-long teacher bindings.
    score += teacherWeeklyLoad(schedule, placement.teacherId) * 1.2;
  }
  if (state.constraints.avoidClassGaps) {
    classDays.forEach((dayGrid) => {
      const occupied = dayGrid.map((lesson, index) => (lesson ? index : null)).filter((item) => item !== null);
      if (occupied.length) {
        const min = Math.min(...occupied, placement.slot);
        const max = Math.max(...occupied, placement.slot + task.length - 1);
        const compactSize = max - min + 1;
        score += Math.max(0, compactSize - occupied.length - task.length) * 8;
      }
    });
  }
  score += Math.abs(placement.slot - (task.occurrence % 7)) * 0.2;
  return score;
}

function applyTask(schedule, task, placement) {
  if (task.electiveOptions?.length) return applyElectiveTask(schedule, task, placement);
  const teacher = state.teachers.find((item) => item.id === placement.teacherId);
  const subject = subjectByName(task.subject);
  const replacements = task.possiblyLate ? replacementTeachersFor(placement.teacherId) : [];
  const groupId = task.groupRuleId ? `${task.groupRuleId}_${task.teachingGroupIndex || 1}_${task.occurrence}` : task.length > 1 ? uid("blk") : "";
  const records = [];
  for (let index = 0; index < task.length; index++) {
    const lesson = {
      id: uid("les"),
      groupId,
      classId: task.classId,
      classIds: task.classIds?.length ? task.classIds : [task.classId],
      className: task.className,
      classNames: task.classNames || classNamesForIds(task.classIds?.length ? task.classIds : [task.classId]),
      subject: task.subject,
      teacherId: placement.teacherId,
      teacherName: teacher?.name || "",
      requiredTeacherId: task.teacherId || "",
      replacementIds: replacements.map((item) => item.id),
      replacementNames: replacements.map((item) => item.name),
      possiblyLate: Boolean(task.possiblyLate),
      color: subject?.color || "#4a5568",
      note: "",
      groupRuleId: task.groupRuleId || "",
      teachingGroupIndex: task.teachingGroupIndex || 0,
    };
    commitLesson(schedule, lesson, placement.day, placement.slot + index);
    records.push({ day: placement.day, slot: placement.slot + index, lesson });
  }
  if (state.constraints.consistentTeacher && !task.teacherId) {
    recordBinding(schedule, records, bindingKey(task), placement.teacherId);
  }
  return records;
}

// One combined lesson per occurrence of an elective split. The class grids
// hold the combined "German / French" lesson; each option's teacher gets a
// per-subject copy in their own grid (written by commitLesson via `parts`).
function applyElectiveTask(schedule, task, placement) {
  const parts = placement.optionTeachers.map(({ subject, teacherId, groupIndex, students }) => {
    const teacher = state.teachers.find((item) => item.id === teacherId);
    const subjectDef = subjectByName(subject);
    return { subject, teacherId, teacherName: teacher?.name || "", color: subjectDef?.color || "#4a5568", groupIndex: groupIndex || 0, students: students || 0 };
  });
  const lesson = {
    id: uid("les"),
    groupId: `${task.electiveRuleId}_${task.occurrence}`,
    classId: task.classId,
    classIds: task.classIds,
    className: task.className,
    classNames: task.classNames,
    subject: [...new Set(parts.map((part) => part.subject))].join(" / "),
    parts,
    teacherId: parts[0].teacherId,
    teacherName: parts.map((part) => `${part.teacherName} (${part.subject}${part.students ? `, ${part.students} st.` : ""})`).join(", "),
    requiredTeacherId: "",
    replacementIds: [],
    replacementNames: [],
    possiblyLate: false,
    color: parts[0].color,
    note: "",
    groupRuleId: "",
    teachingGroupIndex: 0,
    electiveRuleId: task.electiveRuleId,
  };
  commitLesson(schedule, lesson, placement.day, placement.slot);
  const records = [{ day: placement.day, slot: placement.slot, lesson }];
  if (state.constraints.consistentTeacher) {
    placement.optionTeachers.forEach(({ subject, teacherId, groupIndex }, index) => {
      if (task.electiveOptions[index]?.teacherId) return;
      recordBinding(schedule, records, `elx:${task.electiveRuleId}|${subject}#${groupIndex || 0}`, teacherId);
    });
  }
  return records;
}

function lessonTeacherIds(lesson) {
  return lesson.parts?.length ? lesson.parts.map((part) => part.teacherId) : [lesson.teacherId];
}

function undoTask(schedule, records) {
  (records[0]?.bindingKeys || []).forEach((key) => {
    const bound = schedule.teacherBindings?.[key];
    if (!bound) return;
    bound.count -= 1;
    if (bound.count <= 0) delete schedule.teacherBindings[key];
  });
  records.forEach(({ day, slot, lesson }) => {
    (lesson.classIds?.length ? lesson.classIds : [lesson.classId]).forEach((classId) => {
      const grid = schedule.byClass[classId]?.[day];
      if (grid && grid[slot]?.id === lesson.id) grid[slot] = null;
    });
    lessonTeacherIds(lesson).forEach((teacherId) => {
      const teacherDay = schedule.teacherSlots[teacherId]?.[day];
      if (teacherDay && teacherDay[slot]?.id === lesson.id) teacherDay[slot] = null;
    });
    (lesson.replacementIds || []).forEach((replacementId) => {
      const replacementDay = schedule.teacherSlots[replacementId]?.[day];
      if (replacementDay && replacementDay[slot]?.id === lesson.id) replacementDay[slot] = null;
    });
  });
}

function commitLesson(schedule, lesson, day, slot) {
  const classIds = lesson.classIds?.length ? lesson.classIds : [lesson.classId];
  const classNames = classNamesForIds(classIds);
  const teacherLesson = {
    ...lesson,
    classId: classIds[0],
    classIds,
    className: classNames.join(" + "),
    classNames,
  };
  classIds.forEach((classId) => {
    if (!schedule.byClass[classId]?.[day]) return;
    schedule.byClass[classId][day][slot] = {
      ...teacherLesson,
      classId,
      className: classById(classId)?.name || teacherLesson.className,
    };
  });
  // Keep-first: in relaxed schedules a teacher can be double-booked; the
  // class grids hold both lessons while the teacher grid shows the first.
  if (lesson.parts?.length) {
    lesson.parts.forEach((part) => {
      const partDay = schedule.teacherSlots[part.teacherId]?.[day];
      if (partDay && !partDay[slot]) {
        partDay[slot] = { ...teacherLesson, subject: part.subject, teacherId: part.teacherId, teacherName: part.teacherName, color: part.color };
      }
    });
    return;
  }
  const teacherDay = schedule.teacherSlots[lesson.teacherId]?.[day];
  if (teacherDay && !teacherDay[slot]) teacherDay[slot] = teacherLesson;
  (lesson.replacementIds || []).forEach((replacementId) => {
    const replacementDay = schedule.teacherSlots[replacementId]?.[day];
    if (!replacementDay || replacementDay[slot]) return;
    const replacement = state.teachers.find((teacher) => teacher.id === replacementId);
    replacementDay[slot] = {
      ...teacherLesson,
      teacherId: replacementId,
      teacherName: replacement?.name || lesson.teacherName,
      replacementForId: lesson.teacherId,
      replacementForName: lesson.teacherName,
    };
  });
}

function scoreSchedule(schedule) {
  let score = 0;
  state.classes.forEach((klass) => {
    const level = levelById(klass.levelId);
    if (!level) return;
    const dailyDifficulties = level.days.map((day) => {
      const lessons = (schedule.byClass[klass.id][day] || []).filter(Boolean);
      const difficulty = lessons.reduce((sum, lesson) => sum + (subjectByName(lesson.subject)?.difficulty || 3), 0);
      const subjects = new Map();
      lessons.forEach((lesson) => subjects.set(lesson.subject, (subjects.get(lesson.subject) || 0) + 1));
      subjects.forEach((count, subjectName) => {
        const allowedBlock = allowedSubjectPerDay(level, subjectName);
        if (count > allowedBlock) score += (count - allowedBlock) * 24;
      });
      if (state.constraints.avoidClassGaps && lessons.length) {
        const indexes = (schedule.byClass[klass.id][day] || []).map((lesson, index) => (lesson ? index : null)).filter((item) => item !== null);
        score += (Math.max(...indexes) - Math.min(...indexes) + 1 - indexes.length) * 10;
      }
      return difficulty;
    });
    const averageDifficulty = average(dailyDifficulties);
    dailyDifficulties.forEach((difficulty) => {
      score += Math.pow(difficulty - averageDifficulty, 2) * 3;
    });
  });
  state.teachers.forEach((teacher) => {
    const loads = Object.keys(schedule.teacherSlots[teacher.id] || {}).map((day) => schedule.teacherSlots[teacher.id][day].filter(Boolean).length);
    const averageLoad = average(loads);
    loads.forEach((load) => {
      score += Math.pow(load - averageLoad, 2) * 2;
    });
  });
  return Math.round(score);
}

function dedupeSchedules(schedules) {
  const seen = new Set();
  return schedules.filter((schedule) => {
    const key = JSON.stringify(schedule.byClass, (name, value) => (name === "id" || name === "groupId" ? undefined : value));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Constraint audit. computeScheduleViolations is the single source of truth
// for what a finished schedule breaks; the solver's per-placement penalties
// only guide the search. Weights rank fallback schedules (count first, then
// total weight), and each violation names the exact broken constraint.
// ---------------------------------------------------------------------------

const VIOLATION_WEIGHTS = {
  missing: 60,
  clash: 50,
  unqualified: 40,
  extra: 30,
  classSize: 22,
  groupSize: 18,
  availability: 14,
  blocked: 12,
  overload: 10,
  repeat: 8,
  lateCover: 6,
};

const VIOLATION_LABELS = {
  missing: "Unplaced lessons",
  clash: "Teacher double-booked",
  unqualified: "Unqualified teacher",
  extra: "Extra lessons",
  classSize: "Class size out of bounds",
  groupSize: "Student group size out of bounds",
  availability: "Teacher availability broken",
  blocked: "Blocked class slot used",
  overload: "Daily teacher load exceeded",
  repeat: "Subject repeat limit exceeded",
  lateCover: "Late cover not guaranteed",
};

// User-configurable importance per constraint type. Priorities scale the
// base weights, steering the fallback toward breaking low-priority
// constraints first. Ranking always prefers fewer broken constraints overall,
// regardless of score.
const VIOLATION_PRIORITY_FACTORS = { high: 3, normal: 1, low: 0.4 };

function violationWeightFor(type) {
  const base = VIOLATION_WEIGHTS[type] || 5;
  const priority = state.settings.constraintPriorities?.[type] || "normal";
  return Math.max(1, Math.round(base * (VIOLATION_PRIORITY_FACTORS[priority] ?? 1)));
}

function violation(type, text, lessonIds = []) {
  return { type, text, weight: violationWeightFor(type), lessonIds };
}

function expectedWeeklyCount(requirement) {
  if (Number(requirement.count || 0) <= 0) return 0;
  const rule = requirement.groupRuleId ? groupingRuleById(requirement.groupRuleId) : null;
  if (rule && rule.mode !== "none") return Number(rule.periodsPerGroup || requirement.count || 0);
  return Number(requirement.count || 0);
}

function computeScheduleViolations(schedule) {
  const items = [];
  const teacherLoad = new Map();
  const distinctLessons = [];
  const seenLessons = new Set();

  state.classes.forEach((klass) => {
    const level = levelById(klass.levelId);
    if (!level) return;
    const grid = schedule.byClass[klass.id] || {};
    const weeklyCounts = {};
    level.days.forEach((day) => {
      const dailyBySubject = {};
      (grid[day] || []).forEach((lesson, slot) => {
        if (!lesson) return;
        weeklyCounts[lesson.subject] = (weeklyCounts[lesson.subject] || 0) + 1;
        (dailyBySubject[lesson.subject] ||= []).push(lesson.id);
        if (klass.blocked[day]?.[slot]) {
          items.push(violation("blocked", `${klass.name}: ${lesson.subject} is placed in a blocked slot (${day} P${slot + 1}).`, [lesson.id]));
        }
        if (!seenLessons.has(lesson.id)) {
          seenLessons.add(lesson.id);
          distinctLessons.push({ lesson, day, slot });
          // An elective split is one lesson for the class but a separate
          // teaching duty (own subject) for each option's teacher.
          const duties = (lesson.parts?.length
            ? lesson.parts.map((part) => ({ ...lesson, subject: part.subject, teacherId: part.teacherId, teacherName: part.teacherName }))
            : [lesson]).map((duty) => ({ ...duty, levelId: level.id }));
          duties.forEach((duty) => {
            if (!duty.teacherId) return;
            if (!teacherLoad.has(duty.teacherId)) teacherLoad.set(duty.teacherId, new Map());
            const byDay = teacherLoad.get(duty.teacherId);
            if (!byDay.has(day)) byDay.set(day, new Map());
            const bySlot = byDay.get(day);
            if (!bySlot.has(slot)) bySlot.set(slot, []);
            bySlot.get(slot).push(duty);
          });
        }
      });
      Object.entries(dailyBySubject).forEach(([subjectName, ids]) => {
        const allowed = allowedSubjectPerDay(level, subjectName);
        if (ids.length > allowed) {
          items.push(violation("repeat", `${klass.name}: ${subjectName} appears ${ids.length} times on ${day} (limit ${allowed}).`, ids));
        }
      });
    });
    classRequirements(klass).forEach((requirement) => {
      const expected = expectedWeeklyCount(requirement);
      if (!expected) return;
      const actual = weeklyCounts[requirement.subject] || 0;
      if (actual < expected) {
        items.push(violation("missing", `${klass.name}: only ${actual} of ${expected} weekly ${requirement.subject} period${expected === 1 ? "" : "s"} could be placed.`));
      }
      if (actual > expected) {
        items.push(violation("extra", `${klass.name}: ${requirement.subject} is scheduled ${actual} times but only ${expected} are required.`));
      }
    });
  });

  (state.electiveRules || []).forEach((rule) => {
    const level = levelById(rule.levelId);
    if (!level || !(rule.count > 0)) return;
    const label = rule.name || (rule.options || []).map((option) => option.subject).filter(Boolean).join(" / ") || "elective split";
    (rule.classIds || []).forEach((classId) => {
      const klass = classById(classId);
      if (!klass) return;
      const grid = schedule.byClass[classId] || {};
      let actual = 0;
      level.days.forEach((day) => (grid[day] || []).forEach((lesson) => {
        if (lesson?.electiveRuleId === rule.id) actual += 1;
      }));
      if (actual < rule.count) {
        items.push(violation("missing", `${klass.name}: only ${actual} of ${rule.count} weekly "${label}" period${rule.count === 1 ? "" : "s"} could be placed.`));
      }
      if (actual > rule.count) {
        items.push(violation("extra", `${klass.name}: "${label}" is scheduled ${actual} times but only ${rule.count} are required.`));
      }
    });
  });

  // Branch sectioning: class sizes, student-group sizes (min is exempt only
  // when the subject's total takers are below it), and choice-block counts.
  state.levels.forEach((level) => {
    const plan = levelSectioningPlan(level);
    if (!plan) return;
    plan.classSizeIssues.forEach((issue) => {
      const klass = classById(issue.classId);
      if (!klass) return;
      items.push(violation("classSize", issue.kind === "max"
        ? `${klass.name} has ${issue.size} students (maximum ${issue.limit}).`
        : `${klass.name} has ${issue.size} students (minimum ${issue.limit}).`));
    });
    plan.choiceSubjects.forEach((subject) => {
      subject.groups.forEach((group, groupIndex) => {
        if (group.aboveMax) {
          items.push(violation("groupSize", `${level.name} ${subject.subject} group ${groupIndex + 1} has ${group.students} students (maximum ${level.maxClassSize}).`));
        }
        if (group.belowMin) {
          items.push(violation("groupSize", `${level.name} ${subject.subject} group ${groupIndex + 1} has ${group.students} students (minimum ${level.minClassSize}; ${subject.totalTakers} take the subject in total).`));
        }
      });
    });
    if (plan.weekly > 0 && plan.clusterClassIds.length) {
      plan.clusterClassIds.forEach((classId) => {
        const klass = classById(classId);
        if (!klass) return;
        const grid = schedule.byClass[classId] || {};
        let actual = 0;
        level.days.forEach((day) => (grid[day] || []).forEach((lesson) => {
          if (lesson?.electiveRuleId === `sec_${level.id}`) actual += 1;
        }));
        if (actual < plan.weekly) {
          items.push(violation("missing", `${klass.name}: only ${actual} of ${plan.weekly} weekly choice-subject period${plan.weekly === 1 ? "" : "s"} could be placed.`));
        }
        if (actual > plan.weekly) {
          items.push(violation("extra", `${klass.name}: choice-subject block scheduled ${actual} times but only ${plan.weekly} are required.`));
        }
      });
    }
  });

  teacherLoad.forEach((byDay, teacherId) => {
    const teacher = state.teachers.find((item) => item.id === teacherId);
    if (!teacher) return;
    const maxTeacher = teacher.maxPerDay || state.settings.maxTeacherPerDay;
    byDay.forEach((bySlot, day) => {
      let dayCount = 0;
      bySlot.forEach((lessons, slot) => {
        dayCount += 1;
        if (state.constraints.preventTeacherClashes && lessons.length > 1) {
          const names = lessons.map((lesson) => lesson.className).join(" and ");
          items.push(violation("clash", `${teacher.name} is double-booked on ${day} P${slot + 1} (${names}).`, lessons.map((lesson) => lesson.id)));
        }
        if (state.constraints.honorAvailability && teacher.availability[day]?.[slot] === false) {
          items.push(violation("availability", `${teacher.name} teaches ${day} P${slot + 1} while marked unavailable.`, lessons.map((lesson) => lesson.id)));
        }
        if (state.constraints.requireQualifiedTeacher) {
          lessons.forEach((lesson) => {
            if (!teacherTeachesSubjectAtLevel(teacher, lesson.subject, lesson.levelId || "")) {
              const levelName = lesson.levelId ? levelById(lesson.levelId)?.name : "";
              items.push(violation("unqualified", `${teacher.name} is not qualified to teach ${lesson.subject}${levelName ? ` in ${levelName}` : ""} (${lesson.className}, ${day} P${slot + 1}).`, [lesson.id]));
            }
          });
        }
      });
      if (dayCount > maxTeacher) {
        const dayLessonIds = [...bySlot.values()].flat().map((lesson) => lesson.id);
        items.push(violation("overload", `${teacher.name} teaches ${dayCount} periods on ${day} (daily limit ${maxTeacher}).`, dayLessonIds));
      }
    });
  });

  distinctLessons.forEach(({ lesson, day, slot }) => {
    if (!lesson.possiblyLate) return;
    const replacements = replacementTeachersFor(lesson.teacherId);
    if (!replacements.length) {
      items.push(violation("lateCover", `${lesson.teacherName} (${lesson.subject}, ${lesson.className}, ${day} P${slot + 1}) is marked possibly late but has no replacement teachers.`, [lesson.id]));
      return;
    }
    const free = replacements.filter((replacement) => {
      if (state.constraints.honorAvailability && replacement.availability[day]?.[slot] === false) return false;
      const busy = teacherLoad.get(replacement.id)?.get(day)?.get(slot);
      return !(state.constraints.preventTeacherClashes && busy?.length);
    });
    if (!free.length) {
      items.push(violation("lateCover", `No replacement is free to cover ${lesson.teacherName} (${lesson.subject}, ${lesson.className}, ${day} P${slot + 1}).`, [lesson.id]));
    }
  });

  return items.sort((a, b) => (b.weight - a.weight) || a.text.localeCompare(b.text));
}

// Rebuilds the teacher-axis grids from the class grids (the source of truth).
// Real lessons are placed first, then late-cover reservations, so a
// reservation can never hide a teacher's actual lesson.
function rebuildTeacherSlots(schedule) {
  const slots = {};
  state.teachers.forEach((teacher) => {
    slots[teacher.id] = {};
    unionDays().forEach((day) => {
      slots[teacher.id][day] = Array.from({ length: maxSlots() }, () => null);
    });
  });
  const seen = new Set();
  const lessons = [];
  state.classes.forEach((klass) => {
    const grid = schedule.byClass[klass.id] || {};
    Object.keys(grid).forEach((day) => {
      grid[day].forEach((lesson, slot) => {
        if (!lesson || seen.has(lesson.id)) return;
        seen.add(lesson.id);
        lessons.push({ lesson, day, slot });
      });
    });
  });
  lessons.forEach(({ lesson, day, slot }) => {
    const classIds = lesson.classIds?.length ? lesson.classIds : [lesson.classId];
    const classNames = classNamesForIds(classIds);
    const teacherLesson = { ...lesson, classId: classIds[0], classIds, className: classNames.join(" + "), classNames };
    if (lesson.parts?.length) {
      lesson.parts.forEach((part) => {
        const partDay = slots[part.teacherId]?.[day];
        if (partDay && !partDay[slot]) {
          partDay[slot] = { ...teacherLesson, subject: part.subject, teacherId: part.teacherId, teacherName: part.teacherName, color: part.color };
        }
      });
      return;
    }
    const teacherDay = slots[lesson.teacherId]?.[day];
    if (teacherDay && !teacherDay[slot]) teacherDay[slot] = teacherLesson;
  });
  lessons.forEach(({ lesson, day, slot }) => {
    if (!lesson.possiblyLate) return;
    const classIds = lesson.classIds?.length ? lesson.classIds : [lesson.classId];
    const classNames = classNamesForIds(classIds);
    (lesson.replacementIds || []).forEach((replacementId) => {
      const replacementDay = slots[replacementId]?.[day];
      if (!replacementDay || replacementDay[slot]) return;
      const replacement = state.teachers.find((teacher) => teacher.id === replacementId);
      replacementDay[slot] = {
        ...lesson,
        classId: classIds[0],
        classIds,
        className: classNames.join(" + "),
        classNames,
        teacherId: replacementId,
        teacherName: replacement?.name || lesson.teacherName,
        replacementForId: lesson.teacherId,
        replacementForName: lesson.teacherName,
      };
    });
  });
  schedule.teacherSlots = slots;
}

function annotateLessonViolations(schedule) {
  const byLesson = new Map();
  (schedule.violations || []).forEach((item) => {
    (item.lessonIds || []).forEach((id) => {
      if (!byLesson.has(id)) byLesson.set(id, []);
      byLesson.get(id).push(item.text);
    });
  });
  const annotate = (lesson) => {
    if (!lesson) return;
    const texts = byLesson.get(lesson.id);
    if (texts?.length) {
      lesson.violations = texts;
    } else {
      delete lesson.violations;
    }
  };
  Object.values(schedule.byClass || {}).forEach((dayGrid) => {
    Object.keys(dayGrid).forEach((day) => dayGrid[day].forEach(annotate));
  });
  Object.values(schedule.teacherSlots || {}).forEach((dayGrid) => {
    Object.keys(dayGrid).forEach((day) => dayGrid[day].forEach(annotate));
  });
}

// Recomputes everything derived from the class grids: teacher grids, score,
// broken-constraint list, and per-lesson highlights. Called after solving and
// after every manual edit.
function refreshScheduleMeta(schedule) {
  rebuildTeacherSlots(schedule);
  schedule.score = scoreSchedule(schedule);
  schedule.violations = computeScheduleViolations(schedule);
  schedule.violationWeight = schedule.violations.reduce((sum, item) => sum + item.weight, 0);
  annotateLessonViolations(schedule);
  return schedule;
}

// Local repair for fallback schedules: single-period lessons involved in
// broken constraints are moved to conflict-free spots, keeping a move only if
// it reduces the schedule's total violation weight. Monotone, so it can only
// improve the schedule.
let relocationCounter = 0;

function violationTotal(items) {
  return items.reduce((sum, item) => sum + item.weight, 0);
}

function repairSchedule(schedule, seed) {
  let weight = violationTotal(computeScheduleViolations(schedule));
  for (let round = 0; round < 4 && weight > 0; round++) {
    const audit = computeScheduleViolations(schedule);
    const lessonIds = [...new Set(audit.flatMap((item) => item.lessonIds || []))];
    let moved = 0;
    for (const lessonId of lessonIds) {
      const result = tryRelocateLesson(schedule, lessonId, seed, weight);
      if (result) {
        moved += 1;
        weight = result.weight;
      }
    }
    if (!moved) return;
  }
}

function countLessonsInBlock(schedule, lesson) {
  if (!lesson.groupId) return 1;
  const grid = schedule.byClass[lesson.classId] || {};
  let count = 0;
  Object.keys(grid).forEach((day) => {
    grid[day].forEach((item) => {
      if (item?.groupId === lesson.groupId) count += 1;
    });
  });
  return count;
}

function tryRelocateLesson(schedule, lessonId, seed, baselineWeight) {
  const found = findLessonById(schedule, lessonId);
  if (!found) return null;
  const { lesson, day, slot } = found;
  if (lesson.groupId && countLessonsInBlock(schedule, lesson) > 1) return null;
  const klass = classById(lesson.classId);
  const level = klass ? levelById(klass.levelId) : null;
  if (!klass || !level) return null;
  const task = {
    classId: lesson.classId,
    classIds: lesson.classIds?.length ? lesson.classIds : [lesson.classId],
    className: lesson.className,
    classNames: lesson.classNames,
    levelId: level.id,
    subject: lesson.subject,
    teacherId: lesson.requiredTeacherId || "",
    possiblyLate: Boolean(lesson.possiblyLate),
    length: 1,
    occurrence: 1000 + (relocationCounter += 1),
    groupRuleId: lesson.groupRuleId || "",
    teachingGroupIndex: lesson.teachingGroupIndex || 0,
  };
  if (lesson.parts?.length) {
    const rule = electiveRuleById(lesson.electiveRuleId);
    task.electiveOptions = (rule?.options || lesson.parts).filter((option) => option.subject).map((option) => ({ subject: option.subject, teacherId: option.teacherId || "" }));
    task.electiveRuleId = lesson.electiveRuleId || "";
    if (!task.electiveOptions.length) return null;
  }
  removeLessonById(schedule, lesson.id);
  const placements = enumeratePlacements(schedule, task, false);
  if (!placements.length) {
    commitLesson(schedule, lesson, day, slot);
    return null;
  }
  const ranked = placements
    .map((placement) => ({ ...placement, score: placementScore(schedule, task, placement, seed) }))
    .sort((a, b) => a.score - b.score);
  const records = applyTask(schedule, task, ranked[0]);
  const weight = violationTotal(computeScheduleViolations(schedule));
  if (weight < baselineWeight) return { weight };
  undoTask(schedule, records);
  commitLesson(schedule, lesson, day, slot);
  return null;
}

// ---------------------------------------------------------------------------
// Output rendering
// ---------------------------------------------------------------------------

function scheduleForRole(role) {
  if (role.type === "admin") return state.schedules[state.selectedSchedule] || null;
  return state.published || null;
}

function publishSchedule() {
  const schedule = state.schedules[state.selectedSchedule];
  if (!schedule) {
    showAlerts([{ type: "error", text: "Generate schedules first, pick an option, then set it as official." }]);
    return;
  }
  state.published = JSON.parse(JSON.stringify({
    byClass: schedule.byClass,
    teacherSlots: schedule.teacherSlots,
    score: schedule.score,
    violations: schedule.violations || [],
    violationWeight: schedule.violationWeight || 0,
  }));
  state.published.publishedAt = new Date().toISOString();
  saveToStorage();
  renderSchedules();
  showAlerts([{ type: "success", text: `Option ${state.selectedSchedule + 1} is now the official schedule. Teachers and HODs see this version when they sign in. Edits here are not official until you click Set Official again.` }]);
}

function renderSchedules() {
  const role = currentRole();
  if (role.type === "none") return;
  if (role.type === "teacher") {
    state.view = "teacher";
    state.selectedTeacherId = role.teacher.id;
  } else if (role.type === "hod") {
    if (state.view === "class") state.view = "department";
    state.selectedDepartmentId = role.department.id;
  }

  ensureSelectedClass();
  renderClassPickers();
  renderOutputPickers(role);

  els.classViewBtn.classList.toggle("active", state.view === "class");
  els.teacherViewBtn.classList.toggle("active", state.view === "teacher");
  els.departmentViewBtn.classList.toggle("active", state.view === "department");
  els.classViewBtn.classList.toggle("hidden", role.type !== "admin");
  els.departmentViewBtn.classList.toggle("hidden", role.type === "teacher");
  els.teacherViewBtn.classList.toggle("hidden", role.type === "teacher");

  const schedule = scheduleForRole(role);
  els.printBtn.disabled = !schedule;
  els.zipBtn.disabled = !schedule;
  els.zipBtn.classList.toggle("hidden", role.type === "teacher");
  els.publishBtn.classList.toggle("hidden", role.type !== "admin");
  els.publishBtn.disabled = !state.schedules.length;

  els.scheduleTabs.innerHTML = "";
  if (!schedule) {
    els.outputTitle.textContent = role.type === "admin" ? "No schedule generated yet" : "No official schedule yet";
    renderViolationPanel(null);
    els.scheduleCanvas.className = "schedule-canvas empty";
    els.scheduleCanvas.innerHTML = role.type === "admin"
      ? `<div class="empty-state"><h4>Build your first timetable</h4><p>Add teachers, subjects, classes, and weekly requirements, then generate schedules. You can edit any lesson before exporting.</p></div>`
      : `<div class="empty-state"><h4>No official schedule yet</h4><p>The administrator has not set an official schedule. Please check back later.</p></div>`;
    return;
  }
  els.scheduleCanvas.className = `schedule-canvas${state.moveSource ? " move-mode" : ""}`;
  if (role.type === "admin") {
    state.schedules.forEach((item, index) => {
      const tab = document.createElement("button");
      const broken = item.violations?.length || 0;
      tab.textContent = broken ? `Option ${index + 1} · ⚠ ${broken}` : `Option ${index + 1} · ✓ ${item.score}`;
      tab.className = `${index === state.selectedSchedule ? "active" : ""}${broken ? " has-violations" : ""}`;
      tab.title = broken ? `${broken} constraint${broken === 1 ? "" : "s"} broken - select to see the list` : `All hard constraints met - score ${item.score} (lower is better)`;
      tab.addEventListener("click", () => {
        state.selectedSchedule = index;
        state.moveSource = null;
        renderSchedules();
      });
      els.scheduleTabs.append(tab);
    });
    const brokenCount = schedule.violations?.length || 0;
    const constraintNote = brokenCount ? ` - ${brokenCount} constraint${brokenCount === 1 ? "" : "s"} broken` : " - all hard constraints met";
    const publishedNote = state.published?.publishedAt ? ` | Official set ${new Date(state.published.publishedAt).toLocaleDateString()}` : " | No official schedule set yet";
    els.outputTitle.textContent = `Option ${state.selectedSchedule + 1} - Score ${schedule.score}${constraintNote}${publishedNote}`;
  } else {
    els.outputTitle.textContent = `Official schedule${state.published?.publishedAt ? ` - set ${new Date(state.published.publishedAt).toLocaleDateString()}` : ""}`;
  }
  renderViolationPanel(schedule);
  els.scheduleCanvas.innerHTML = "";
  const stack = document.createElement("div");
  stack.className = "schedule-stack";

  if (state.view === "department") {
    const department = currentDepartment(role);
    if (!department) {
      stack.append(emptyMessage("Add a department (Departments tab) to use this view."));
    } else {
      stack.append(renderDepartmentBlock(schedule, department, state.selectedDeptSubject));
    }
  } else if (state.view === "teacher") {
    const teacher = state.teachers.find((item) => item.id === state.selectedTeacherId) || state.teachers[0];
    if (!teacher) {
      stack.append(emptyMessage("Add teachers to see their schedules."));
    } else {
      stack.append(renderScheduleBlock(schedule, teacherCollection(schedule, teacher)));
    }
  } else {
    const klass = selectedClass();
    if (!klass) {
      stack.append(emptyMessage("Add classes to see their schedules."));
    } else {
      stack.append(renderScheduleBlock(schedule, classCollection(schedule, klass)));
    }
  }
  els.scheduleCanvas.append(stack);
}

function emptyMessage(text) {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.innerHTML = `<h4>${escapeHtml(text)}</h4>`;
  return div;
}

// Lists every constraint the selected schedule breaks, grouped by type.
// Hidden when the schedule satisfies all hard constraints.
function renderViolationPanel(schedule) {
  const panel = els.violationPanel;
  if (!panel) return;
  const violations = schedule?.violations || [];
  panel.classList.toggle("hidden", !violations.length);
  panel.innerHTML = "";
  if (!violations.length) return;
  const heading = document.createElement("h5");
  heading.textContent = `⚠ This option breaks ${violations.length} constraint${violations.length === 1 ? "" : "s"}`;
  panel.append(heading);
  const groups = new Map();
  violations.forEach((item) => {
    if (!groups.has(item.type)) groups.set(item.type, []);
    groups.get(item.type).push(item);
  });
  groups.forEach((items, type) => {
    const group = document.createElement("div");
    group.className = "violation-group";
    const label = document.createElement("p");
    label.className = "violation-group-label";
    label.textContent = `${VIOLATION_LABELS[type] || type} (${items.length})`;
    group.append(label);
    const list = document.createElement("ul");
    const MAX_SHOWN = 12;
    items.slice(0, MAX_SHOWN).forEach((item) => {
      const line = document.createElement("li");
      line.textContent = item.text;
      list.append(line);
    });
    if (items.length > MAX_SHOWN) {
      const line = document.createElement("li");
      line.textContent = `...and ${items.length - MAX_SHOWN} more.`;
      list.append(line);
    }
    group.append(list);
    panel.append(group);
  });
  const hint = document.createElement("p");
  hint.className = "violation-hint";
  hint.textContent = "Affected lessons are outlined in red. Click a lesson to reassign, move, or clear it, or loosen the setup and regenerate.";
  panel.append(hint);
}

function currentDepartment(role) {
  if (role.type === "hod") return role.department;
  if (!state.departments.length) return null;
  if (!state.selectedDepartmentId || !state.departments.some((item) => item.id === state.selectedDepartmentId)) {
    state.selectedDepartmentId = state.departments[0].id;
  }
  return state.departments.find((item) => item.id === state.selectedDepartmentId) || null;
}

function renderOutputPickers(role) {
  els.classPickerWrap.classList.toggle("hidden", state.view !== "class" || role.type !== "admin" || !state.classes.length);

  let teacherChoices = role.type === "hod" ? departmentTeachers(role.department) : state.teachers;
  if (role.type === "hod" && role.teacher && !teacherChoices.some((item) => item.id === role.teacher.id)) {
    teacherChoices = [role.teacher, ...teacherChoices];
  }
  if (teacherChoices.length && !teacherChoices.some((item) => item.id === state.selectedTeacherId)) {
    state.selectedTeacherId = teacherChoices[0].id;
  }
  populateOptions(els.scheduleTeacherPicker, teacherChoices.map((item) => item.id), [state.selectedTeacherId], (value) => state.teachers.find((item) => item.id === value)?.name || value);
  els.teacherPickerWrap.classList.toggle("hidden", state.view !== "teacher" || role.type === "teacher" || !teacherChoices.length);

  const department = currentDepartment(role);
  populateOptions(els.scheduleDepartmentPicker, state.departments.map((item) => item.id), [department?.id || ""], (value) => state.departments.find((item) => item.id === value)?.name || value);
  els.scheduleDepartmentPicker.disabled = role.type === "hod";
  els.departmentPickerWrap.classList.toggle("hidden", state.view !== "department" || !state.departments.length);

  const subjectChoices = department ? department.subjectNames : [];
  if (state.selectedDeptSubject && !subjectChoices.includes(state.selectedDeptSubject)) state.selectedDeptSubject = "";
  populateOptions(els.scheduleSubjectPicker, ["", ...subjectChoices], [state.selectedDeptSubject], (value) => value || "All subjects");
  els.subjectPickerWrap.classList.toggle("hidden", state.view !== "department" || !department);
}

function departmentTeachers(department) {
  return state.teachers.filter((teacher) => teacher.subjects.some((subject) => department.subjectNames.includes(subject)));
}

function classCollection(schedule, klass) {
  return { id: klass.id, title: klass.name, type: "class", grid: schedule.byClass[klass.id] || {}, level: levelById(klass.levelId) || referenceLevel() };
}

function teacherCollection(schedule, teacher) {
  return { id: teacher.id, title: teacher.name, type: "teacher", grid: schedule.teacherSlots[teacher.id] || {}, level: referenceLevel() };
}

function renderScheduleBlock(schedule, collection) {
  const block = document.createElement("section");
  block.className = "schedule-block";
  const meta = document.createElement("p");
  meta.className = "print-meta";
  meta.textContent = `Generated by Schedule Studio - ${collection.type === "class" ? "Class" : "Teacher"} schedule - ${new Date().toLocaleDateString()}`;
  const heading = document.createElement("h4");
  heading.textContent = collection.title;
  block.append(meta, heading, renderAxisTable(collection));
  return block;
}

function renderAxisTable(collection) {
  const level = collection.level;
  const times = levelTimes(level);
  const isClass = collection.type === "class";
  const days = isClass ? level.days : unionDays();
  const slotCount = isClass ? maxPeriodsForLevel(level) : maxSlots();
  const table = document.createElement("table");
  table.className = "timetable class-axis";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(th("Day"));
  for (let slot = 0; slot < slotCount; slot++) {
    const time = times.periods[slot];
    headRow.append(th(time ? `P${slot + 1}\n${time.start}-${time.end}` : `P${slot + 1}`));
    if (times.breakInfo && times.breakInfo.afterIndex === slot && slot + 1 < slotCount + 1) {
      headRow.append(th(`Break\n${times.breakInfo.start}-${times.breakInfo.end}`));
    }
  }
  thead.append(headRow);
  table.append(thead);
  const tbody = document.createElement("tbody");
  days.forEach((day) => {
    const row = document.createElement("tr");
    const override = isClass ? dayOverride(level, day) : null;
    const config = isClass ? dayConfig(level, day) : null;
    row.append(timeCell(day, override ? `${config.startTime}-${config.endTime}` : ""));
    const dayCount = isClass ? periodsForDay(level, day) : slotCount;
    for (let slot = 0; slot < slotCount; slot++) {
      if (slot >= dayCount) {
        const voidCell = document.createElement("td");
        voidCell.className = "lesson-cell void-cell";
        voidCell.textContent = "";
        row.append(voidCell);
      } else {
        row.append(scheduleCell(collection, day, slot));
      }
      if (times.breakInfo && times.breakInfo.afterIndex === slot) {
        const breakCell = document.createElement("td");
        breakCell.className = "break-column";
        breakCell.textContent = `${times.breakInfo.length} min`;
        row.append(breakCell);
      }
    }
    tbody.append(row);
  });
  table.append(tbody);
  return table;
}

function renderDepartmentBlock(schedule, department, subjectFilter) {
  const block = document.createElement("section");
  block.className = "schedule-block";
  const meta = document.createElement("p");
  meta.className = "print-meta";
  meta.textContent = `Generated by Schedule Studio - Department schedule - ${new Date().toLocaleDateString()}`;
  const heading = document.createElement("h4");
  heading.textContent = subjectFilter ? `${department.name} - ${subjectFilter}` : `${department.name} Department`;
  const table = document.createElement("table");
  table.className = "timetable dept-table";
  const days = unionDays();
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(th("Teacher"));
  days.forEach((day) => headRow.append(th(day)));
  thead.append(headRow);
  table.append(thead);
  const tbody = document.createElement("tbody");
  const teachers = departmentTeachers(department).filter((teacher) => !subjectFilter || teacher.subjects.includes(subjectFilter));
  if (!teachers.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = days.length + 1;
    cell.textContent = "No teachers teach the selected subjects.";
    row.append(cell);
    tbody.append(row);
  }
  teachers.forEach((teacher) => {
    const row = document.createElement("tr");
    row.append(timeCell(teacher.name, ""));
    days.forEach((day) => {
      const cell = document.createElement("td");
      cell.className = "dept-cell";
      const lessons = (schedule.teacherSlots[teacher.id]?.[day] || [])
        .map((lesson, slot) => ({ lesson, slot }))
        .filter(({ lesson }) => lesson && (!subjectFilter || lesson.subject === subjectFilter));
      lessons.forEach(({ lesson, slot }) => {
        const line = document.createElement("div");
        line.className = "dept-lesson";
        line.style.setProperty("--lesson-color", lesson.color || "#4a5568");
        const subjectShort = subjectByName(lesson.subject)?.shortName || lesson.subject;
        line.textContent = `P${slot + 1} ${lesson.className}${subjectFilter ? "" : ` - ${subjectShort}`}${lesson.replacementForId ? " (cover)" : ""}`;
        cell.append(line);
      });
      if (!lessons.length) {
        cell.textContent = "-";
      }
      row.append(cell);
    });
    tbody.append(row);
  });
  table.append(tbody);
  block.append(meta, heading, table);
  return block;
}

function scheduleCell(collection, day, slot) {
  const td = document.createElement("td");
  td.className = "lesson-cell";
  wireDropTarget(td, collection, day, slot);
  const lesson = collection.grid[day]?.[slot];
  td.append(lesson ? lessonButton(lesson, day, slot, collection) : emptyButton(day, slot, collection));
  return td;
}

function th(text) {
  const cell = document.createElement("th");
  cell.textContent = text;
  return cell;
}

function timeCell(period, time) {
  const cell = document.createElement("th");
  cell.className = "time-cell";
  cell.innerHTML = `<strong>${escapeHtml(period)}</strong>${time ? `<br>${escapeHtml(time)}` : ""}`;
  return cell;
}

function lessonButton(lesson, day, slot, collection) {
  const button = document.createElement("button");
  button.className = `lesson-card ${lesson.replacementForId ? "reserve-card" : ""}${lesson.violations?.length ? " violation-card" : ""}`;
  button.style.setProperty("--lesson-color", lesson.color || "#4a5568");
  if (lesson.violations?.length) button.title = lesson.violations.join("\n");
  const groupedLine = collection.type === "class" && (lesson.classNames || []).length > 1
    ? `<span>Group: ${escapeHtml(lesson.classNames.join(", "))}</span>`
    : "";
  button.innerHTML = `
    <strong>${escapeHtml(lesson.subject)}</strong>
    <span>${collection.type === "class" ? escapeHtml(lesson.teacherName) : escapeHtml(lesson.className)}</span>
    ${groupedLine}
    ${lesson.possiblyLate && !lesson.replacementForId ? `<span>Late cover: ${escapeHtml((lesson.replacementNames || []).join(", ") || "none")}</span>` : ""}
    ${lesson.replacementForId ? `<span>Reserved for ${escapeHtml(lesson.replacementForName)}</span>` : ""}
    ${lesson.note ? `<span>${escapeHtml(lesson.note)}</span>` : ""}
    ${lesson.violations?.length ? `<span class="violation-note">⚠ breaks ${lesson.violations.length} constraint${lesson.violations.length === 1 ? "" : "s"}</span>` : ""}
  `;
  const role = currentRole();
  if (!lesson.replacementForId && role.type === "admin") {
    if (state.moveSource?.lessonId === lesson.id) button.classList.add("move-source");
    button.draggable = true;
    button.addEventListener("dragstart", (event) => startLessonDrag(event, lesson, collection));
    button.addEventListener("dragend", () => {
      state.dragLesson = null;
    });
    button.addEventListener("click", () => {
      if (handleSlotClick(collection, day, slot, lesson)) return;
      openLessonEditor(day, slot, collection, lesson);
    });
  } else {
    button.disabled = true;
  }
  return button;
}

function emptyButton(day, slot, collection) {
  const button = document.createElement("button");
  button.className = "empty-slot";
  const role = currentRole();
  if (role.type === "admin") {
    button.textContent = collection.type === "class" ? "Add" : "Free";
    button.addEventListener("click", () => {
      if (handleSlotClick(collection, day, slot, null)) return;
      if (collection.type === "class") openLessonEditor(day, slot, collection, null);
    });
  } else {
    button.textContent = "Free";
    button.disabled = true;
  }
  return button;
}

// ---------------------------------------------------------------------------
// Manual edits: drag, swap, lesson dialog
// ---------------------------------------------------------------------------

function startLessonDrag(event, lesson, collection) {
  state.dragLesson = {
    lessonId: lesson.id,
    classId: lesson.classId,
    classIds: lesson.classIds?.length ? lesson.classIds : [lesson.classId],
    teacherId: lesson.teacherId,
    collectionType: collection.type,
    collectionId: collection.id,
  };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", lesson.id);
}

function wireDropTarget(cell, collection, day, slot) {
  cell.addEventListener("dragover", (event) => {
    if (!canDropOn(collection)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    cell.classList.add("drop-ready");
  });
  cell.addEventListener("dragleave", () => {
    cell.classList.remove("drop-ready");
  });
  cell.addEventListener("drop", (event) => {
    event.preventDefault();
    cell.classList.remove("drop-ready");
    moveDraggedLesson(collection, day, slot);
  });
}

function canDropOn(collection) {
  const drag = state.dragLesson;
  if (!drag) return false;
  if (collection.type === "class") return (drag.classIds || [drag.classId]).includes(collection.id);
  if (collection.type === "teacher") return drag.teacherId === collection.id;
  return false;
}

// Core mover used by both drag-and-drop and click-to-move. Moves the lesson
// to the target slot; if the slot already has a lesson, the two swap places.
// Returns "" on success or a conflict message (the schedule is restored).
function attemptMoveOrSwap(schedule, sourceId, day, slot, collection) {
  const source = findLessonById(schedule, sourceId);
  if (!source) return "The lesson to move no longer exists.";
  if (source.day === day && source.slot === slot) return "";
  const targetLesson = collection.grid[day]?.[slot] || null;
  if (targetLesson && targetLesson.replacementForId) return "That slot is reserved for late cover and cannot be swapped.";
  const target = targetLesson ? findLessonById(schedule, targetLesson.id) : null;
  removeLessonById(schedule, source.lesson.id);
  if (target) removeLessonById(schedule, target.lesson.id);
  const conflictSource = manualConflict(schedule, source.lesson, day, slot);
  const conflictTarget = target ? manualConflict(schedule, target.lesson, source.day, source.slot) : "";
  if (conflictSource || conflictTarget) {
    commitLesson(schedule, source.lesson, source.day, source.slot);
    if (target) commitLesson(schedule, target.lesson, target.day, target.slot);
    return conflictSource || conflictTarget;
  }
  commitLesson(schedule, source.lesson, day, slot);
  if (target) commitLesson(schedule, target.lesson, source.day, source.slot);
  return "";
}

function moveDraggedLesson(collection, day, slot) {
  const drag = state.dragLesson;
  state.dragLesson = null;
  if (!drag || !canDropOn(collection)) return;
  const schedule = state.schedules[state.selectedSchedule];
  if (!schedule) return;
  const before = schedule.violations?.length || 0;
  const error = attemptMoveOrSwap(schedule, drag.lessonId, day, slot, collection);
  if (error) {
    showAlerts([{ type: "error", text: error }]);
    return;
  }
  refreshScheduleMeta(schedule);
  renderSchedules();
  saveToStorage();
  reportManualEdit(schedule, before, "Lesson moved.");
}

// Click-to-move: started from the lesson dialog's Move / Swap button. The
// chosen lesson is highlighted; clicking any slot moves it there (or swaps
// with the lesson already in it). Esc or clicking the lesson cancels.
function beginMoveLesson() {
  const target = state.editTarget;
  if (!target?.existing) {
    els.lessonDialog.close();
    return;
  }
  state.moveSource = { lessonId: target.existing.id };
  els.lessonDialog.close();
  renderSchedules();
  showAlerts([{ type: "", text: `Move mode: click any slot to move ${target.existing.subject} (${target.existing.className}), or click a lesson to swap with it. Press Esc or click the highlighted lesson to cancel.` }]);
}

function cancelMoveLesson() {
  if (!state.moveSource) return;
  state.moveSource = null;
  renderSchedules();
  showAlerts([]);
}

function handleSlotClick(collection, day, slot, lesson) {
  if (!state.moveSource) return false;
  const schedule = state.schedules[state.selectedSchedule];
  if (!schedule) {
    state.moveSource = null;
    return true;
  }
  if (lesson && lesson.id === state.moveSource.lessonId) {
    cancelMoveLesson();
    return true;
  }
  const before = schedule.violations?.length || 0;
  const error = attemptMoveOrSwap(schedule, state.moveSource.lessonId, day, slot, collection);
  if (error) {
    showAlerts([{ type: "error", text: `${error} Pick another slot, or press Esc to cancel.` }]);
    return true;
  }
  state.moveSource = null;
  refreshScheduleMeta(schedule);
  renderSchedules();
  saveToStorage();
  reportManualEdit(schedule, before, lesson ? "Lessons swapped." : "Lesson moved.");
  return true;
}

function openLessonEditor(day, slot, collection, lesson) {
  const editClassId = collection.type === "class" ? collection.id : lesson?.classId || "";
  const editLevelId = classById(editClassId)?.levelId || "";
  state.editTarget = { scheduleIndex: state.selectedSchedule, day, slot, collection, existing: lesson, levelId: editLevelId };
  els.moveLessonBtn.classList.toggle("hidden", !lesson);
  // Elective split lessons keep their subjects/teachers as a unit; only the
  // note can be edited. Move/Swap and Clear still work on the whole cell.
  const isElective = Boolean(lesson?.parts?.length);
  if (isElective) {
    populateOptions(els.editSubject, [lesson.subject], [lesson.subject]);
    populateOptions(els.editTeacher, [lesson.teacherName], [lesson.teacherName]);
  } else {
    populateOptions(els.editSubject, state.subjects.map((subject) => subject.name), [lesson?.subject || state.subjects[0]?.name || ""]);
    refreshTeacherEditOptions(lesson?.teacherId || "");
  }
  els.editSubject.disabled = isElective;
  els.editTeacher.disabled = isElective;
  els.editLate.disabled = isElective;
  els.editSubject.onchange = isElective ? null : () => refreshTeacherEditOptions("");
  els.editNote.value = lesson?.note || "";
  els.editLate.checked = Boolean(lesson?.possiblyLate);
  els.lessonDialog.showModal();
}

function refreshTeacherEditOptions(selectedTeacherId) {
  const subject = els.editSubject.value;
  const teachers = teachersForSubject(subject, state.editTarget?.levelId || "");
  populateOptions(els.editTeacher, teachers.map((teacher) => teacher.id), [selectedTeacherId || teachers[0]?.id || ""], (value) => state.teachers.find((teacher) => teacher.id === value)?.name || value);
}

function saveEditedLesson() {
  const target = state.editTarget;
  if (!target) return;
  const schedule = state.schedules[target.scheduleIndex];
  if (target.existing?.parts?.length) {
    const lesson = { ...target.existing, note: els.editNote.value };
    removeLessonById(schedule, lesson.id);
    commitLesson(schedule, lesson, target.day, target.slot);
    refreshScheduleMeta(schedule);
    els.lessonDialog.close();
    renderSchedules();
    saveToStorage();
    return;
  }
  const subject = els.editSubject.value;
  const teacher = state.teachers.find((item) => item.id === els.editTeacher.value);
  if (!teacher) {
    showAlerts([{ type: "error", text: "Choose a teacher for this lesson." }]);
    return;
  }
  const classId = target.collection.type === "class" ? target.collection.id : target.existing?.classId || "";
  if (!classId) {
    showAlerts([{ type: "error", text: "Add new lessons from Class View so the class is clear." }]);
    return;
  }
  const className = state.classes.find((item) => item.id === classId)?.name || "";
  const classIds = target.existing?.classIds?.length ? target.existing.classIds : [classId];
  const classNames = classNamesForIds(classIds);
  const replacements = els.editLate.checked ? replacementTeachersFor(teacher.id) : [];
  const lesson = {
    id: target.existing?.id || uid("manual"),
    groupId: target.existing?.groupId || "",
    classId,
    classIds,
    className: classNames.length > 1 ? classNames.join(" + ") : className,
    classNames,
    subject,
    teacherId: teacher.id,
    teacherName: teacher.name,
    replacementIds: replacements.map((item) => item.id),
    replacementNames: replacements.map((item) => item.name),
    possiblyLate: els.editLate.checked,
    color: subjectByName(subject)?.color || "#4a5568",
    note: els.editNote.value,
    groupRuleId: target.existing?.groupRuleId || "",
    teachingGroupIndex: target.existing?.teachingGroupIndex || 0,
  };
  const conflict = manualConflict(schedule, lesson, target.day, target.slot, target.existing?.id);
  if (conflict) {
    showAlerts([{ type: "error", text: conflict }]);
    return;
  }
  const before = schedule.violations?.length || 0;
  removeLessonById(schedule, lesson.id);
  commitLesson(schedule, lesson, target.day, target.slot);
  refreshScheduleMeta(schedule);
  els.lessonDialog.close();
  renderSchedules();
  saveToStorage();
  reportManualEdit(schedule, before, "Lesson saved.");
}

function clearEditedLesson() {
  const target = state.editTarget;
  if (!target?.existing) {
    els.lessonDialog.close();
    return;
  }
  const schedule = state.schedules[target.scheduleIndex];
  removeLessonById(schedule, target.existing.id);
  refreshScheduleMeta(schedule);
  els.lessonDialog.close();
  renderSchedules();
  saveToStorage();
}

// Manual edits only refuse what is structurally impossible (missing class,
// nonexistent period, two lessons in one class cell, reserved cover slots).
// Anything else - clashes, availability, loads, blocked slots - is allowed
// and immediately flagged as a broken constraint after the edit, so the
// admin can make deliberate exceptions.
function manualConflict(schedule, lesson, day, slot, existingId = "") {
  const classIds = lesson.classIds?.length ? lesson.classIds : [lesson.classId];
  const classes = classIds.map(classById).filter(Boolean);
  const klass = classes[0];
  const level = klass ? levelById(klass.levelId) : null;
  if (!klass || !level) return "The class for this lesson no longer exists.";
  if (!level.days.includes(day) || slot >= periodsForDay(level, day)) return `${klass.name} has no period ${slot + 1} on ${day}.`;
  for (const item of classes) {
    const classSlot = schedule.byClass[item.id][day]?.[slot];
    if (classSlot && classSlot.id !== existingId) return `${item.name} already has a lesson in this slot.`;
  }
  return "";
}

// After a manual edit, tell the user exactly how the broken-constraint count
// changed instead of blocking the edit.
function reportManualEdit(schedule, beforeCount, successText) {
  const after = schedule.violations?.length || 0;
  if (after > beforeCount) {
    const added = after - beforeCount;
    showAlerts([{ type: "error", text: `${successText} It breaks ${added} constraint${added === 1 ? "" : "s"} - see the list above the timetable (the affected lessons are outlined red).` }]);
  } else if (after < beforeCount) {
    const fixed = beforeCount - after;
    showAlerts([{ type: "success", text: `${successText} ${fixed} broken constraint${fixed === 1 ? "" : "s"} fixed${after ? `; ${after} remaining` : " - all constraints now met"}.` }]);
  } else if (after > 0) {
    showAlerts([{ type: "", text: `${successText} ${after} broken constraint${after === 1 ? "" : "s"} remain unchanged.` }]);
  } else {
    showAlerts([{ type: "success", text: successText }]);
  }
}

function findLessonById(schedule, id) {
  for (const klass of state.classes) {
    const grid = schedule.byClass[klass.id] || {};
    for (const day of Object.keys(grid)) {
      for (let slot = 0; slot < grid[day].length; slot++) {
        const lesson = grid[day][slot];
        if (lesson?.id === id) return { lesson, day, slot };
      }
    }
  }
  return null;
}

function removeLessonById(schedule, id) {
  Object.values(schedule.byClass).forEach((dayGrid) => {
    Object.keys(dayGrid).forEach((day) => {
      dayGrid[day] = dayGrid[day].map((lesson) => (lesson?.id === id ? null : lesson));
    });
  });
  Object.values(schedule.teacherSlots).forEach((dayGrid) => {
    Object.keys(dayGrid).forEach((day) => {
      dayGrid[day] = dayGrid[day].map((lesson) => (lesson?.id === id ? null : lesson));
    });
  });
}

// ---------------------------------------------------------------------------
// PDF and ZIP export (no libraries; simple single-page PDFs zipped together)
// ---------------------------------------------------------------------------

function downloadAllPdfs() {
  const role = currentRole();
  const schedule = scheduleForRole(role);
  if (!schedule) {
    showAlerts([{ type: "error", text: role.type === "admin" ? "Generate a schedule first." : "No official schedule has been set yet." }]);
    return;
  }
  const files = [];
  if (role.type === "admin") {
    state.classes.forEach((klass) => {
      files.push({ name: `Classes/${safeFileName(klass.name)}.pdf`, data: classPdf(schedule, klass) });
    });
    state.teachers.forEach((teacher) => {
      files.push({ name: `Teachers/${safeFileName(teacher.name)}.pdf`, data: teacherPdf(schedule, teacher) });
    });
  } else if (role.type === "hod") {
    departmentTeachers(role.department).forEach((teacher) => {
      files.push({ name: `${safeFileName(role.department.name)}/${safeFileName(teacher.name)}.pdf`, data: teacherPdf(schedule, teacher) });
    });
  }
  if (!files.length) {
    showAlerts([{ type: "error", text: "Nothing to export." }]);
    return;
  }
  const blob = zipStore(files);
  downloadBlob(blob, role.type === "hod" ? `${safeFileName(role.department.name)}-schedules.zip` : "all-schedules.zip");
  showAlerts([{ type: "success", text: `Exported ${files.length} PDF schedule${files.length === 1 ? "" : "s"} as a ZIP.` }]);
}

function safeFileName(name) {
  return String(name || "untitled").replace(/[\\/:*?"<>|]+/g, "-").trim() || "untitled";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function classPdf(schedule, klass) {
  const level = levelById(klass.levelId) || referenceLevel();
  const times = levelTimes(level);
  const columns = buildPdfColumns(times, maxPeriodsForLevel(level));
  const rows = level.days.map((day) => ({
    head: day,
    cells: columns.map((column) => {
      if (column.isBreak) return { line1: "Break", line2: `${times.breakInfo.length} min`, isBreak: true };
      const lesson = schedule.byClass[klass.id]?.[day]?.[column.slot];
      if (!lesson) return { line1: "", line2: "" };
      return { line1: lesson.subject, line2: lesson.teacherName };
    }),
  }));
  return schedulePdfBytes(klass.name, `${level.name} - class schedule`, columns, rows);
}

function teacherPdf(schedule, teacher) {
  const level = referenceLevel();
  const times = levelTimes(level);
  const columns = buildPdfColumns(times, maxSlots());
  const rows = unionDays().map((day) => ({
    head: day,
    cells: columns.map((column) => {
      if (column.isBreak) return { line1: "Break", line2: `${times.breakInfo.length} min`, isBreak: true };
      const lesson = schedule.teacherSlots[teacher.id]?.[day]?.[column.slot];
      if (!lesson) return { line1: "", line2: "" };
      const subjectShort = subjectByName(lesson.subject)?.shortName || lesson.subject;
      return { line1: lesson.className, line2: lesson.replacementForId ? `${subjectShort} (cover)` : subjectShort };
    }),
  }));
  return schedulePdfBytes(teacher.name, "Teacher schedule", columns, rows);
}

function buildPdfColumns(times, slotCount) {
  const columns = [];
  for (let slot = 0; slot < slotCount; slot++) {
    const time = times.periods[slot];
    columns.push({ slot, head1: `P${slot + 1}`, head2: time ? `${time.start}-${time.end}` : "" });
    if (times.breakInfo && times.breakInfo.afterIndex === slot) {
      columns.push({ isBreak: true, head1: "Break", head2: `${times.breakInfo.start}-${times.breakInfo.end}` });
    }
  }
  return columns;
}

function schedulePdfBytes(title, subtitle, columns, rows) {
  const W = 842;
  const H = 595;
  const M = 28;
  const ops = ["0.6 w", "0 0 0 RG", "0 0 0 rg"];
  const text = (x, y, size, font, value) => {
    ops.push(`BT /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfEscape(value)}) Tj ET`);
  };
  const line = (x1, y1, x2, y2) => {
    ops.push(`${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
  };
  text(M, H - M - 6, 14, "F2", fitText(title, W - 2 * M, 14));
  text(M, H - M - 20, 8, "F1", fitText(`${subtitle} - generated ${new Date().toLocaleDateString()}`, W - 2 * M, 8));

  const top = H - M - 32;
  const bottom = M;
  const headH = 22;
  const dayW = 74;
  const colW = (W - 2 * M - dayW) / Math.max(1, columns.length);
  const rowH = (top - headH - bottom) / Math.max(1, rows.length);

  line(M, top, W - M, top);
  line(M, top - headH, W - M, top - headH);
  rows.forEach((row, index) => {
    const y = top - headH - (index + 1) * rowH;
    line(M, y, W - M, y);
  });
  line(M, top, M, bottom);
  line(M + dayW, top, M + dayW, bottom);
  columns.forEach((column, index) => {
    const x = M + dayW + (index + 1) * colW;
    line(x, top, x, bottom);
  });

  columns.forEach((column, index) => {
    const x = M + dayW + index * colW + 2;
    text(x, top - 9, 7, "F2", fitText(column.head1, colW - 4, 7));
    text(x, top - 18, 6, "F1", fitText(column.head2, colW - 4, 6));
  });
  rows.forEach((row, rowIndex) => {
    const yTop = top - headH - rowIndex * rowH;
    text(M + 3, yTop - rowH / 2 - 3, 8, "F2", fitText(row.head, dayW - 6, 8));
    row.cells.forEach((cell, columnIndex) => {
      const x = M + dayW + columnIndex * colW + 2;
      if (cell.line1) text(x, yTop - rowH / 2 + 2, 7, "F2", fitText(cell.line1, colW - 4, 7));
      if (cell.line2) text(x, yTop - rowH / 2 - 7, 6, "F1", fitText(cell.line2, colW - 4, 6));
    });
  });
  return buildPdf(ops, W, H);
}

function fitText(value, widthPts, fontSize) {
  const maxChars = Math.max(1, Math.floor(widthPts / (fontSize * 0.52)));
  const clean = String(value ?? "");
  return clean.length > maxChars ? `${clean.slice(0, Math.max(1, maxChars - 2))}..` : clean;
}

function pdfEscape(value) {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildPdf(ops, width, height) {
  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Uint8Array.from(pdf, (char) => char.charCodeAt(0) & 0xff);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let crc = -1;
  for (let index = 0; index < bytes.length; index++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[index]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  files.forEach((file) => {
    const nameBytes = Uint8Array.from(file.name, (char) => char.charCodeAt(0) & 0xff);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, file.data.length, true);
    view.setUint32(22, file.data.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, file.data);
    central.push({ nameBytes, crc, size: file.data.length, offset });
    offset += local.length + file.data.length;
  });
  let centralSize = 0;
  central.forEach((entry) => {
    const record = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(record.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(12, dosTime, true);
    view.setUint16(14, dosDate, true);
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.size, true);
    view.setUint32(24, entry.size, true);
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint32(42, entry.offset, true);
    record.set(entry.nameBytes, 46);
    chunks.push(record);
    centralSize += record.length;
  });
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, offset, true);
  chunks.push(eocd);
  return new Blob(chunks, { type: "application/zip" });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Whether a teacher may teach a subject in a specific level. Subjects with
// the same name across levels are distinct teaching assignments: a teacher
// qualified for First Secondary Science is not automatically qualified for
// Second Secondary Science if their scoping says otherwise.
function teacherTeachesSubjectAtLevel(teacher, subjectName, levelId = "") {
  if (!teacher.subjects.includes(subjectName)) return false;
  if (!levelId) return true;
  const allowed = teacher.subjectLevels?.[subjectName];
  if (!Array.isArray(allowed)) return true;
  return allowed.includes(levelId);
}

function teachersForSubject(subjectName, levelId = "") {
  return state.teachers.filter((teacher) => teacherTeachesSubjectAtLevel(teacher, subjectName, levelId));
}

function classById(id) {
  return state.classes.find((klass) => klass.id === id) || null;
}

function classNamesForIds(ids) {
  return (ids || []).map((id) => classById(id)?.name || id).filter(Boolean);
}

function replacementTeachersFor(teacherId) {
  const teacher = state.teachers.find((item) => item.id === teacherId);
  return (teacher?.replacementIds || [])
    .filter((id) => id !== teacherId)
    .map((id) => state.teachers.find((item) => item.id === id))
    .filter(Boolean);
}

function subjectByName(name) {
  return state.subjects.find((subject) => subject.name === name);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function showAlerts(items) {
  els.alerts.innerHTML = "";
  items.forEach((item) => {
    const alert = document.createElement("div");
    alert.className = `alert ${item.type || ""}`;
    alert.textContent = item.text;
    els.alerts.append(alert);
  });
}

// Persists the full setup plus generated schedules. If localStorage runs out
// of space, generated schedules are progressively trimmed (the setup itself
// is always kept) so the user's inputs are never lost to a quota error.
function saveToStorage() {
  const payload = {
    settings: state.settings,
    constraints: state.constraints,
    levels: state.levels,
    subjects: state.subjects,
    teachers: state.teachers,
    classes: state.classes,
    departments: state.departments,
    branches: state.branches,
    groupingRules: state.groupingRules,
    electiveRules: state.electiveRules,
    schedules: state.schedules,
    selectedSchedule: state.selectedSchedule,
    selectedLevelId: state.selectedLevelId,
    selectedClassId: state.selectedClassId,
    selectedTeacherId: state.selectedTeacherId,
    selectedDepartmentId: state.selectedDepartmentId,
    selectedDeptSubject: state.selectedDeptSubject,
    view: state.view,
    session: state.session,
    published: state.published,
    savedAt: new Date().toISOString(),
  };
  const current = state.schedules[state.selectedSchedule];
  const fallbacks = [
    state.schedules,
    state.schedules.slice(0, 3),
    current ? [current] : [],
    [],
  ];
  for (const schedules of fallbacks) {
    try {
      payload.schedules = schedules;
      payload.selectedSchedule = Math.max(0, schedules.indexOf(current));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      state.lastSavedAt = payload.savedAt;
      updateSaveStatus();
      return true;
    } catch {
      // Quota exceeded or storage unavailable; retry with fewer schedules.
    }
  }
  updateSaveStatus(true);
  return false;
}

function updateSaveStatus(failed = false) {
  if (!els.saveStatus) return;
  if (failed) {
    els.saveStatus.textContent = "Could not save (storage unavailable)";
    els.saveStatus.classList.add("save-failed");
    return;
  }
  els.saveStatus.classList.remove("save-failed");
  if (!state.lastSavedAt) {
    els.saveStatus.textContent = "";
    return;
  }
  const time = new Date(state.lastSavedAt);
  els.saveStatus.textContent = `Saved ${time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function loadFromStorage() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.levels) || !data.levels.length) return false;
    const knownConstraints = Object.keys(state.constraints);
    state.settings = Object.assign({ candidateLimit: 12, maxTeacherPerDay: 6, maxSubjectPerDay: 1, constraintPriorities: {} }, data.settings || {});
    state.constraints = Object.fromEntries(knownConstraints.map((key) => [key, data.constraints?.[key] ?? true]));
    state.levels = data.levels.map((level) => {
      const hydrated = Object.assign(createLevel(level.name || "Level"), level);
      hydrated.subjectBlocks ||= {};
      hydrated.sessionPatterns ||= {};
      hydrated.dayOverrides ||= {};
      hydrated.minPeriodLength ||= MIN_PERIOD_LENGTH;
      return hydrated;
    });
    state.subjects = data.subjects || [];
    state.teachers = data.teachers || [];
    state.classes = data.classes || [];
    state.departments = data.departments || [];
    state.branches = (data.branches || []).map((branch) => createBranch(branch.name || "Branch", branch.levelId || "", branch));
    state.groupingRules = (data.groupingRules || []).map((rule) => createGroupingRule(rule));
    state.electiveRules = (data.electiveRules || []).map((rule) => createElectiveRule(rule));
    state.schedules = (data.schedules || []).map((schedule) => {
      schedule.violations ||= [];
      schedule.violationWeight ||= 0;
      return schedule;
    });
    state.selectedSchedule = Math.min(Math.max(0, Number(data.selectedSchedule) || 0), Math.max(0, state.schedules.length - 1));
    state.lastSavedAt = data.savedAt || null;
    state.selectedLevelId = data.selectedLevelId || "";
    state.selectedClassId = data.selectedClassId || "";
    state.selectedTeacherId = data.selectedTeacherId || "";
    state.selectedDepartmentId = data.selectedDepartmentId || "";
    state.selectedDeptSubject = data.selectedDeptSubject || "";
    state.view = data.view || "class";
    state.session = data.session && typeof data.session === "object" && data.session.role ? data.session : null;
    state.published = data.published && typeof data.published === "object" && data.published.byClass ? data.published : null;
    state.subjects.forEach((subject) => {
      subject.difficulty ||= subject.priority === "core" ? 5 : 3;
    });
    state.teachers.forEach((teacher) => {
      teacher.replacementIds ||= [];
      teacher.subjectLevels ||= {};
    });
    state.classes.forEach((klass) => {
      klass.requirements ||= [];
      klass.requirements.forEach((requirement) => {
        requirement.possiblyLate = Boolean(requirement.possiblyLate);
      });
    });
    syncBranchClasses();
    normalizeAvailability();
    ensureSelectedLevel();
    ensureSelectedClass();
    return true;
  } catch {
    return false;
  }
}

function shuffleWithSeed(items, seed) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = seededInt(seed + index * 997, index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function seededInt(seed, max) {
  const value = Math.sin(seed * 9301 + 49297) * 233280;
  return Math.floor((value - Math.floor(value)) * max);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

// ---------------------------------------------------------------------------
// Excel import
//
// Reads a department workload sheet where each row is a teacher:
//   A: department (written once per group), B: teacher name,
//   C/D: 1st Sec classes covered + periods per class,
//   E/F: 2nd Sec, G/H: 3rd Sec, I: weekly total.
// Cells may carry subject hints ("2 Ar.", "3 (Philo)") or stacked lines
// ("2 Ar.\n3 Rel" with "6\n2"). Rows without numbers are treated as notes.
// First Secondary always studies integrated Science: chemistry/physics/biology
// hints apply only to Second and Third Secondary.
// ---------------------------------------------------------------------------

const IMPORT_LEVELS = [
  { name: "First Secondary", classCol: 2, periodCol: 3 },
  { name: "Second Secondary", classCol: 4, periodCol: 5 },
  { name: "Third Secondary", classCol: 6, periodCol: 7 },
];
const IMPORT_TOTAL_COL = 8;
const SCIENCE_FAMILY = ["Chemistry", "Physics", "Biology"];

const SUBJECT_META = {
  English: ["Eng", "core", 4],
  Arabic: ["Ar", "core", 4],
  Math: ["Math", "core", 5],
  Science: ["Sci", "core", 5],
  Chemistry: ["Chem", "core", 5],
  Physics: ["Phys", "core", 5],
  Biology: ["Bio", "core", 5],
  History: ["Hist", "standard", 3],
  Geography: ["Geo", "standard", 3],
  Philosophy: ["Phil", "standard", 3],
  Psychology: ["Psych", "standard", 3],
  Statistics: ["Stat", "standard", 4],
  Religion: ["Rel", "light", 1],
  French: ["Fr", "standard", 3],
  German: ["Ger", "standard", 3],
};

// Order matters: more specific patterns first (e.g. "Psyc" before "Ch").
const SUBJECT_HINTS = [
  [/philo/i, "Philosophy"],
  [/psy/i, "Psychology"],
  [/geo/i, "Geography"],
  [/his/i, "History"],
  [/stat/i, "Statistics"],
  [/rel/i, "Religion"],
  [/french|\bfr\b/i, "French"],
  [/ger/i, "German"],
  [/eng/i, "English"],
  [/arabic|\bar\b/i, "Arabic"],
  [/bio/i, "Biology"],
  [/phy/i, "Physics"],
  [/che|\bch\b/i, "Chemistry"],
  [/math/i, "Math"],
  [/sci/i, "Science"],
];

async function importExcelFile(file) {
  try {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This browser cannot unzip .xlsx files. Use a recent Chrome, Edge, Firefox, or Safari.");
    }
    const buffer = await file.arrayBuffer();
    const workbook = await readWorkbook(buffer);
    const parsed = parseWorkbookImport(workbook);
    if (!parsed.teachers.length) {
      throw new Error("No teacher rows with class counts were found. Expected columns: department, teacher, then classes and periods per level.");
    }
    const summary = applyImport(parsed);
    renderAll();
    showAlerts(summary);
  } catch (error) {
    showAlerts([{ type: "error", text: `Import failed: ${error.message}` }]);
  }
}

async function readWorkbookRows(buffer) {
  const workbook = await readWorkbook(buffer);
  return workbook.sheets[0]?.rows || [];
}

async function readWorkbook(buffer) {
  const entries = readZipEntries(buffer);
  const sharedStrings = entries["xl/sharedStrings.xml"]
    ? parseSharedStrings(await readZipEntry(buffer, entries["xl/sharedStrings.xml"]))
    : [];
  const sheetDefs = entries["xl/workbook.xml"]
    ? parseWorkbookSheetDefs(
      await readZipEntry(buffer, entries["xl/workbook.xml"]),
      entries["xl/_rels/workbook.xml.rels"] ? await readZipEntry(buffer, entries["xl/_rels/workbook.xml.rels"]) : "",
      entries,
    )
    : fallbackSheetDefs(entries);
  if (!sheetDefs.length) throw new Error("No worksheet found. Save the file as .xlsx and try again.");
  const sheets = [];
  for (const sheet of sheetDefs) {
    if (!entries[sheet.path]) continue;
    sheets.push({
      name: sheet.name,
      path: sheet.path,
      rows: parseSheetRows(await readZipEntry(buffer, entries[sheet.path]), sharedStrings),
    });
  }
  return { sheets };
}

function parseWorkbookImport(workbook) {
  const sheets = Object.fromEntries((workbook.sheets || []).map((sheet) => [sheet.name, sheet.rows]));
  if (sheets.Teacher_Assignments) return parseNormalizedWorkbook(sheets);
  return parseTeacherWorkbook(workbook.sheets[0]?.rows || []);
}

function parseWorkbookSheetDefs(workbookXml, relsXml, entries) {
  const rels = parseRelationships(relsXml);
  const sheets = [];
  const sheetPattern = /<sheet\b([^>]*)\/?>/g;
  let match;
  while ((match = sheetPattern.exec(workbookXml))) {
    const attrs = match[1] || "";
    const name = decodeXml((attrs.match(/\bname="([^"]*)"/) || [])[1] || `Sheet${sheets.length + 1}`);
    const relId = (attrs.match(/\br:id="([^"]*)"/) || [])[1] || "";
    const target = rels[relId] || `worksheets/sheet${sheets.length + 1}.xml`;
    const path = normalizeWorkbookPath(target);
    if (entries[path]) sheets.push({ name, path });
  }
  return sheets.length ? sheets : fallbackSheetDefs(entries);
}

function parseRelationships(xml) {
  const rels = {};
  const relPattern = /<Relationship\b([^>]*)\/?>/g;
  let match;
  while ((match = relPattern.exec(xml || ""))) {
    const attrs = match[1] || "";
    const id = (attrs.match(/\bId="([^"]*)"/) || [])[1] || "";
    const target = (attrs.match(/\bTarget="([^"]*)"/) || [])[1] || "";
    if (id && target) rels[id] = decodeXml(target);
  }
  return rels;
}

function normalizeWorkbookPath(target) {
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const parts = [];
  path.split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  });
  return parts.join("/");
}

function fallbackSheetDefs(entries) {
  return Object.keys(entries)
    .filter((name) => /^xl\/worksheets\/.*\.xml$/.test(name))
    .sort()
    .map((path, index) => ({ name: index === 0 ? "Sheet1" : `Sheet${index + 1}`, path }));
}

function readZipEntries(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let index = buffer.byteLength - 22; index >= Math.max(0, buffer.byteLength - 22 - 65535); index--) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error("This is not a valid .xlsx file.");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = {};
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries[name] = { method, compressedSize, localOffset };
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipEntry(buffer, entry) {
  const view = new DataView(buffer);
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const data = buffer.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

function parseSharedStrings(xml) {
  return (xml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || []).map(extractXmlText);
}

function extractXmlText(fragment) {
  return (fragment.match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || [])
    .map((text) => decodeXml(text.replace(/^<t\b[^>]*>/, "").replace(/<\/t>$/, "")))
    .join("");
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  (xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || []).forEach((chunk) => {
    const rowNumber = Number((chunk.match(/^<row\b[^>]*\br="(\d+)"/) || [])[1] || rows.length + 1);
    const cells = [];
    const cellPattern = /<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let match;
    while ((match = cellPattern.exec(chunk))) {
      const attrs = match[1] ?? match[2] ?? "";
      const body = match[3] || "";
      const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1];
      if (!ref) continue;
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
      let value = "";
      if (type === "s") {
        value = sharedStrings[Number((body.match(/<v[^>]*>([\s\S]*?)<\/v>/) || [])[1])] ?? "";
      } else if (type === "inlineStr") {
        value = extractXmlText(body);
      } else {
        value = decodeXml((body.match(/<v[^>]*>([\s\S]*?)<\/v>/) || [])[1] || "");
      }
      cells[columnIndexFromRef(ref)] = value;
    }
    rows[rowNumber - 1] = cells;
  });
  return rows.map((row) => row || []);
}

function columnIndexFromRef(letters) {
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function decodeXml(text) {
  return String(text)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (m, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseTeacherWorkbook(rows) {
  const teachers = [];
  const notes = [];
  const warnings = [];
  let department = "";
  const headerIndex = rows.findIndex((row) => /sec/i.test(row.join(" ")) && /period/i.test(row.join(" ")));
  rows.slice(headerIndex + 1).forEach((row, offsetIndex) => {
    const rowNumber = headerIndex + offsetIndex + 2;
    const rawDepartment = String(row[0] || "").trim();
    const rawName = String(row[1] || "").trim();
    if (rawDepartment) department = rawDepartment;
    if (!rawName && !rawDepartment) return;
    const nameHints = subjectHintsIn(rawName);
    const fallbackSubject = nameHints.length === 1 ? nameHints[0] : subjectFromDepartment(department);
    const assignments = [];
    IMPORT_LEVELS.forEach((level) => {
      assignments.push(...parseAssignmentCell(row[level.classCol], row[level.periodCol], fallbackSubject, level.name));
    });
    // First Secondary studies integrated Science; specialist hints like (Ch.)
    // only apply to Second and Third Secondary.
    assignments.forEach((assignment) => {
      if (assignment.level === "First Secondary" && SCIENCE_FAMILY.includes(assignment.subject)) {
        assignment.subject = "Science";
      }
    });
    if (!assignments.length) {
      const noteText = [rawDepartment, rawName].filter(Boolean).join(" - ").replace(/\s+/g, " ").trim();
      if (noteText) notes.push(noteText);
      return;
    }
    const name = cleanTeacherName(rawName) || `Teacher ${teachers.length + 1}`;
    const subjects = [...new Set([...assignments.map((item) => item.subject), ...nameHints])];
    const computedTotal = assignments.reduce((sum, item) => sum + (item.teachingUnits || item.count) * item.periods, 0);
    const sheetTotal = leadingNumber(row[IMPORT_TOTAL_COL]);
    if (sheetTotal && computedTotal !== sheetTotal) {
      warnings.push(`Row ${rowNumber} (${name}): classes x periods adds up to ${computedTotal}, but the Total column says ${sheetTotal}. Double-check this row.`);
    }
    teachers.push({ name, subjects, assignments, department: canonicalDepartment(department) });
  });
  return { teachers, notes, warnings };
}

function parseNormalizedWorkbook(sheets) {
  const warnings = [];
  const notes = [];
  const teacherRows = tableObjects(sheets.Teacher_Assignments, "Teacher_Name");
  const levelCounts = parseLevelCounts(sheets.Level_Class_Counts || []);
  const groupingRules = parseNormalizedGroupingRules(sheets.Subject_Grouping || []);
  const sessionPatterns = parseNormalizedSessionPatterns(sheets.Session_Patterns || [], warnings);
  const availabilityRows = parseNormalizedAvailabilityRows(sheets.Teacher_Availability || []);
  const teachersByName = new Map();

  teacherRows.forEach((row) => {
    const teacherName = cleanTeacherName(row.teachername || "");
    const level = String(row.level || "").trim();
    const rawSubject = String(row.subjectorsubjectdetail || "").trim();
    const count = leadingNumber(row.classcount);
    const periods = leadingNumber(row.periodsperclassperweek);
    if (!teacherName && !rawSubject && !level) return;
    if (!teacherName || !rawSubject || !level || !count || !periods) {
      notes.push(`Skipped incomplete assignment row ${row.rowNumber}.`);
      return;
    }
    const subject = normalizeImportedSubject(rawSubject);
    const department = canonicalDepartment(row.department || subject);
    const sessionPattern = parseSessionPattern(row.sessionpattern);
    if (sessionPattern.length) {
      mergeSessionPattern(sessionPatterns, subject, level, sessionPattern, warnings, `Teacher_Assignments row ${row.rowNumber}`);
    }
    const groupRuleId = String(row.groupingruleid || "").trim();
    const rule = groupingRules.find((item) => item.id === groupRuleId);
    const assignment = {
      level,
      count,
      periods,
      subject,
      sessionPattern,
      groupRuleId,
      teachingUnits: rule?.groupCount || count,
    };
    if (!teachersByName.has(teacherName)) {
      teachersByName.set(teacherName, { name: teacherName, subjects: [], assignments: [], department });
    }
    const teacher = teachersByName.get(teacherName);
    if (!teacher.subjects.includes(subject)) teacher.subjects.push(subject);
    teacher.assignments.push(assignment);
  });

  availabilityRows.forEach((row) => {
    if (row.notes) notes.push(`${row.teacherName || "Availability"}: ${row.notes}`);
  });

  return {
    source: "normalized",
    teachers: [...teachersByName.values()],
    notes,
    warnings,
    levelCounts,
    groupingRules,
    sessionPatterns,
    availabilityRows,
  };
}

function tableObjects(rows, requiredHeader) {
  const required = normalizeHeader(requiredHeader);
  const headerIndex = (rows || []).findIndex((row) => row.some((cell) => normalizeHeader(cell) === required));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map(normalizeHeader);
  const objects = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const item = { rowNumber: headerIndex + offset + 2 };
    headers.forEach((header, index) => {
      if (header) item[header] = row[index] ?? "";
    });
    if (Object.keys(item).some((key) => key !== "rowNumber" && String(item[key] ?? "").trim())) objects.push(item);
  });
  return objects;
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseLevelCounts(rows) {
  const counts = {};
  tableObjects(rows, "Level").forEach((row) => {
    const level = String(row.level || "").trim();
    const count = leadingNumber(row.numberofclasses);
    if (level && count) counts[level] = {
      count,
      namingRule: String(row.classnamesornamingrule || "").trim(),
      notes: String(row.notes || "").trim(),
    };
  });
  return counts;
}

function parseNormalizedGroupingRules(rows) {
  return tableObjects(rows, "Rule_ID").map((row, index) => {
    const classCount = leadingNumber(row.numberofclassesingroup);
    const groupCount = leadingNumber(row.numberofresultinggroups);
    return {
      id: String(row.ruleid || "").trim() || `grp_import_${index + 1}`,
      subject: normalizeImportedSubject(row.subject || ""),
      levelName: String(row.level || "").trim(),
      mode: String(row.groupingmode || "Mandatory").trim().toLowerCase() || "mandatory",
      groupName: String(row.groupname || "").trim(),
      classNamesRaw: String(row.classesincluded || "").trim(),
      classCount,
      groupCount,
      groupSizes: [],
      periodsPerGroup: leadingNumber(row.periodspergroupperweek),
      teacherName: cleanTeacherName(row.teachernameoptional || ""),
      notes: String(row.notes || "").trim(),
    };
  }).filter((rule) => rule.subject && rule.levelName);
}

function parseNormalizedSessionPatterns(rows, warnings) {
  const patterns = {};
  tableObjects(rows, "Subject").forEach((row) => {
    const subject = normalizeImportedSubject(row.subject || "");
    const level = String(row.level || "").trim();
    const pattern = parseSessionPattern(row.pattern || row.blockstructure || "");
    if (subject && level && pattern.length) {
      mergeSessionPattern(patterns, subject, level, pattern, warnings, `Session_Patterns row ${row.rowNumber}`);
    }
  });
  return patterns;
}

function parseNormalizedAvailabilityRows(rows) {
  return tableObjects(rows, "Teacher_Name").map((row) => ({
    teacherName: cleanTeacherName(row.teachername || ""),
    status: String(row.availabilitystatus || "").trim(),
    day: String(row.day || "").trim(),
    startPeriod: leadingNumber(row.startperiod),
    endPeriod: leadingNumber(row.endperiod),
    notes: String(row.notes || "").trim(),
  })).filter((row) => row.teacherName || row.notes);
}

function mergeSessionPattern(patterns, subject, level, pattern, warnings, source) {
  const key = `${level}|||${subject}`;
  const existing = patterns[key];
  if (existing && existing.join("+") !== pattern.join("+")) {
    warnings.push(`${source}: ${subject} in ${level} has pattern ${pattern.join("+")}, but ${existing.join("+")} was already imported. Keeping ${existing.join("+")}.`);
    return;
  }
  patterns[key] = pattern;
}

function normalizeImportedSubject(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const exact = Object.keys(SUBJECT_META).find((name) => name.toLowerCase() === text.toLowerCase());
  if (exact) return exact;
  return matchSubjectHint(text) || titleCase(text);
}

function parseAssignmentCell(classCell, periodCell, fallbackSubject, levelName) {
  const classLines = splitCellLines(classCell);
  const periodLines = splitCellLines(periodCell);
  const assignments = [];
  classLines.forEach((line, index) => {
    const periods = leadingNumber(periodLines[Math.min(index, periodLines.length - 1)] || "");
    let count = leadingNumber(line);
    let subject = "";
    const parenthetical = (line.match(/\(([^)]*)\)/) || [])[1] || "";
    const grouping = parseGroupingSpec(parenthetical, count);
    if (parenthetical && !grouping) {
      subject = matchSubjectHint(parenthetical);
    }
    if (!subject) {
      subject = matchSubjectHint(line.replace(/\([^)]*\)/g, " ").replace(/\d+/g, " "));
    }
    if (count > 0 && periods > 0) {
      assignments.push({
        level: levelName,
        count,
        periods,
        subject: subject || fallbackSubject || "General",
        grouping,
        teachingUnits: grouping?.groupCount || count,
      });
    }
  });
  return assignments;
}

function parseGroupingSpec(parenthetical, classCount) {
  const text = String(parenthetical || "").trim();
  const count = Number(classCount || 0);
  if (!text || !count) return null;
  const groupPlusSingle = text.match(/(\d+)\s*group\w*\s*\+\s*(\d+)/i);
  if (groupPlusSingle) {
    const groupedCount = Number(groupPlusSingle[1]);
    const singleCount = Number(groupPlusSingle[2]);
    const groupedClassCount = Math.max(0, count - singleCount);
    return {
      raw: text,
      classCount: count,
      groupCount: groupedCount + singleCount,
    };
  }
  const plainGroups = text.match(/^\s*(\d+)\s*(?:groups?)?\s*$/i);
  if (plainGroups && Number(plainGroups[1]) < count) {
    const groupCount = Number(plainGroups[1]);
    return {
      raw: text,
      classCount: count,
      groupCount,
    };
  }
  return null;
}

function splitCellLines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function leadingNumber(value) {
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function matchSubjectHint(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return "";
  for (const [pattern, subject] of SUBJECT_HINTS) {
    if (pattern.test(cleaned)) return subject;
  }
  return "";
}

function subjectHintsIn(rawName) {
  const parentheticals = [...String(rawName || "").matchAll(/\(([^)\n]*)\)?/g)].map((match) => match[1]);
  const hints = [];
  parentheticals
    .join(" + ")
    .split(/[+&,/]/)
    .forEach((part) => {
      const subject = matchSubjectHint(part);
      if (subject && !hints.includes(subject)) hints.push(subject);
    });
  return hints;
}

function subjectFromDepartment(departmentText) {
  const text = String(departmentText || "").toLowerCase();
  if (!text.trim()) return "";
  if (text.includes("english")) return "English";
  if (text.includes("arabic")) return "Arabic";
  if (text.includes("math")) return "Math";
  if (text.includes("french")) return "French";
  if (text.includes("ger")) return "German";
  if (text.includes("social")) return "History";
  if (text.includes("science")) {
    const rest = text.replace(/science/g, "");
    if (/bio/.test(rest)) return "Biology";
    if (/phy/.test(rest)) return "Physics";
    if (/ch/.test(rest)) return "Chemistry";
    return "Science";
  }
  return matchSubjectHint(text) || titleCase(text);
}

function canonicalDepartment(departmentText) {
  const text = String(departmentText || "").toLowerCase();
  if (!text.trim()) return "General";
  if (text.includes("english")) return "English";
  if (text.includes("arabic")) return "Arabic";
  if (text.includes("math")) return "Math";
  if (text.includes("french")) return "French";
  if (text.includes("ger")) return "German";
  if (text.includes("social")) return "Social Studies";
  if (text.includes("science")) return "Science";
  return titleCase(text.replace(/\([^)]*\)/g, " ")) || "General";
}

function cleanTeacherName(raw) {
  return String(raw || "")
    .split(/\r?\n/)[0]
    .split("(")[0]
    .replace(/\)/g, " ")
    .replace(/\b(history|geography|philosophy|psychology|chemistry|biology|physics|arabic|english|math|statistics|french|german|religion)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(text) {
  return String(text)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function classLabel(index) {
  let label = "";
  let value = index;
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

function importedLevelNames(parsed) {
  const names = [];
  Object.keys(parsed.levelCounts || {}).forEach((name) => {
    if (name && !names.includes(name)) names.push(name);
  });
  parsed.teachers.forEach((teacher) => {
    teacher.assignments.forEach((assignment) => {
      if (assignment.level && !names.includes(assignment.level)) names.push(assignment.level);
    });
  });
  return names.length ? names : IMPORT_LEVELS.map((level) => level.name);
}

function levelIdByName(name) {
  return state.levels.find((level) => level.name === name)?.id || "";
}

function ensureAssignmentGroupingRule(assignment, teacher, level) {
  if (!assignment.grouping) return "";
  const existing = state.groupingRules.find((rule) => (
    rule.subject === assignment.subject
    && rule.levelId === level.id
    && rule.teacherId === teacher.id
    && rule.classCount === assignment.grouping.classCount
    && rule.groupCount === assignment.grouping.groupCount
  ));
  if (existing) return existing.id;
  const rule = createGroupingRule({
    id: uid("grp"),
    subject: assignment.subject,
    levelId: level.id,
    mode: "mandatory",
    groupName: `${level.name} ${assignment.subject} - ${teacher.name}`,
    classCount: assignment.grouping.classCount,
    groupCount: assignment.grouping.groupCount,
    teacherId: teacher.id,
    periodsPerGroup: assignment.periods,
    notes: `Imported from old workbook value (${assignment.count} classes as ${assignment.grouping.raw}). The scheduler auto-splits assigned classes into the best teaching groups.`,
  });
  state.groupingRules.push(rule);
  return rule.id;
}

function applyImportedAvailability(rows) {
  rows.forEach((row) => {
    if (!/^unavailable$/i.test(row.status || "")) return;
    const teacher = state.teachers.find((item) => item.name.toLowerCase() === String(row.teacherName || "").toLowerCase());
    if (!teacher || !row.day) return;
    const start = Math.max(1, row.startPeriod || 1);
    const end = Math.max(start, row.endPeriod || start);
    for (let slot = start - 1; slot <= end - 1; slot++) {
      if (teacher.availability[row.day]?.[slot] !== undefined) teacher.availability[row.day][slot] = false;
    }
  });
}

function applyImport(parsed) {
  const importLevels = importedLevelNames(parsed);
  state.levels = importLevels.map((name) => createLevel(name));
  state.selectedLevelId = state.levels[0].id;

  const subjectNames = [];
  parsed.teachers.forEach((teacher) => teacher.subjects.forEach((subject) => {
    if (!subjectNames.includes(subject)) subjectNames.push(subject);
  }));
  (parsed.groupingRules || []).forEach((rule) => {
    if (rule.subject && !subjectNames.includes(rule.subject)) subjectNames.push(rule.subject);
  });
  Object.keys(parsed.sessionPatterns || {}).forEach((key) => {
    const subject = key.split("|||")[1];
    if (subject && !subjectNames.includes(subject)) subjectNames.push(subject);
  });
  state.subjects = subjectNames.map((name, index) => {
    const [shortName, priority, difficulty] = SUBJECT_META[name] || [name.slice(0, 5), "standard", 3];
    return { id: uid("sub"), name, shortName, priority, color: COLORS[index % COLORS.length], difficulty };
  });

  state.teachers = parsed.teachers.map((item) => {
    const teacher = createTeacher(item.name, item.subjects);
    item.id = teacher.id;
    return teacher;
  });
  // The workbook lists assignments per level, so scope each teacher's
  // subjects to the levels they actually teach them in (same-named subjects
  // in other levels stay off unless the sheet says otherwise).
  parsed.teachers.forEach((item) => {
    const teacher = state.teachers.find((entry) => entry.id === item.id);
    if (!teacher) return;
    const levelsBySubject = {};
    item.assignments.forEach((assignment) => {
      const levelId = levelIdByName(assignment.level);
      if (!levelId || !assignment.subject) return;
      (levelsBySubject[assignment.subject] ||= new Set()).add(levelId);
    });
    Object.entries(levelsBySubject).forEach(([subjectName, levels]) => {
      if (levels.size && levels.size < state.levels.length) {
        teacher.subjectLevels[subjectName] = [...levels];
      }
    });
  });
  const teacherIdByName = new Map(state.teachers.map((teacher) => [teacher.name.toLowerCase(), teacher.id]));
  state.teachers.forEach((teacher) => {
    const colleagues = state.teachers.filter((item) => item.id !== teacher.id && item.subjects.some((subject) => teacher.subjects.includes(subject)));
    teacher.replacementIds = colleagues.slice(0, 2).map((item) => item.id);
  });

  const departmentSubjects = {};
  parsed.teachers.forEach((teacher) => {
    const name = teacher.department || "General";
    departmentSubjects[name] ||= new Set();
    teacher.subjects.forEach((subject) => departmentSubjects[name].add(subject));
  });
  state.departments = Object.entries(departmentSubjects).map(([name, subjects]) => createDepartment(name, [...subjects]));
  const covered = new Set(state.departments.flatMap((department) => department.subjectNames));
  const uncovered = subjectNames.filter((name) => !covered.has(name));
  if (uncovered.length) state.departments.push(createDepartment("Other", uncovered));

  state.electiveRules = [];
  state.groupingRules = (parsed.groupingRules || []).map((rule) => createGroupingRule({
    id: rule.id,
    subject: rule.subject,
    levelId: levelIdByName(rule.levelName),
    mode: rule.mode || "mandatory",
    groupName: rule.groupName || `${rule.levelName} ${rule.subject}`,
    classCount: rule.classCount || 0,
    groupCount: rule.groupCount || 0,
    groupSizes: [],
    classIds: [],
    teacherId: teacherIdByName.get((rule.teacherName || "").toLowerCase()) || "",
    periodsPerGroup: rule.periodsPerGroup || 0,
    notes: rule.notes || "",
  }));
  Object.entries(parsed.sessionPatterns || {}).forEach(([key, pattern]) => {
    const [levelName, subject] = key.split("|||");
    const level = state.levels.find((item) => item.name === levelName);
    if (level && subject) setSessionPattern(level, subject, pattern);
  });

  state.classes = [];
  const levelSummaries = [];
  const groupAssignedClassIds = {};
  importLevels.forEach((levelName, levelIndex) => {
    const level = state.levels[levelIndex];
    const subjectTotals = {};
    const subjectPeriods = {};
    parsed.teachers.forEach((teacher) => {
      teacher.assignments.filter((item) => item.level === levelName).forEach((item) => {
        subjectTotals[item.subject] = (subjectTotals[item.subject] || 0) + item.count;
        subjectPeriods[item.subject] ||= item.periods;
      });
    });
    const sortedTotals = Object.values(subjectTotals).sort((a, b) => b - a);
    let classCount = parsed.levelCounts?.[levelName]?.count || sortedTotals[0] || 0;
    if (!classCount) return;
    // If a single subject covers more classes than a count agreed on by two
    // or more other subjects, the outlier is likely a sheet error: trim it.
    if (!parsed.levelCounts?.[levelName] && sortedTotals.length > 1 && sortedTotals[1] < classCount && sortedTotals.filter((total) => total === sortedTotals[1]).length >= 2) {
      const outlier = Object.keys(subjectTotals).find((subject) => subjectTotals[subject] === classCount);
      parsed.warnings.push(`${level.name}: ${outlier} covers ${classCount} classes, but several subjects cover ${sortedTotals[1]}. Created ${sortedTotals[1]} classes and trimmed the extra ${outlier} assignment.`);
      classCount = sortedTotals[1];
    }
    const classes = Array.from({ length: classCount }, (_, index) => createClass(`${level.name} ${classLabel(index)}`, level.id));

    // Subjects covering only part of the level (electives, language groups,
    // specialist science) go to the classes with the lightest weekly load, so
    // complementary subjects spread across different classes instead of all
    // stacking on class A.
    const loads = new Array(classCount).fill(0);
    const subjectSlots = {};
    Object.keys(subjectTotals)
      .sort((a, b) => subjectTotals[b] - subjectTotals[a])
      .forEach((subject) => {
        const need = Math.min(subjectTotals[subject], classCount);
        const picked = loads
          .map((load, index) => ({ load, index }))
          .sort((a, b) => a.load - b.load || a.index - b.index)
          .slice(0, need)
          .map((item) => item.index)
          .sort((a, b) => a - b);
        picked.forEach((index) => {
          loads[index] += subjectPeriods[subject] || 0;
        });
        subjectSlots[subject] = picked;
      });

    const cursors = {};
    parsed.teachers.forEach((teacher) => {
      teacher.assignments.filter((item) => item.level === levelName).forEach((item) => {
        const ruleId = item.groupRuleId || ensureAssignmentGroupingRule(item, teacher, level);
        const slots = subjectSlots[item.subject] || [];
        const start = cursors[item.subject] || 0;
        for (let index = 0; index < item.count && start + index < slots.length; index++) {
          const klass = classes[slots[start + index]];
          const extras = ruleId ? { groupRuleId: ruleId } : {};
          klass.requirements.push(req(item.subject, item.periods, teacher.id, false, extras));
          if (ruleId) {
            groupAssignedClassIds[ruleId] ||= [];
            groupAssignedClassIds[ruleId].push(klass.id);
          }
        }
        cursors[item.subject] = start + item.count;
      });
    });

    const heaviest = Math.max(...classes.map((klass) => klass.requirements.reduce((sum, item) => sum + item.count, 0)));
    level.periodsPerDay = clampNumber(Math.ceil(heaviest / Math.max(1, level.days.length)), 4, 12, 8);
    // A completely full week leaves the solver no room to avoid teacher
    // clashes; keep at least a couple of free slots per week.
    if (level.days.length * level.periodsPerDay - heaviest < 2) {
      level.periodsPerDay = Math.min(12, level.periodsPerDay + 1);
    }
    state.classes.push(...classes);
    levelSummaries.push(`${level.name}: ${classCount} classes, ${level.periodsPerDay} periods/day`);
  });
  state.groupingRules.forEach((rule) => {
    const assigned = [...new Set(groupAssignedClassIds[rule.id] || rule.classIds || [])];
    rule.classIds = assigned;
    if (!rule.classCount) rule.classCount = assigned.length;
  });

  let maxWeekly = 0;
  state.classes.forEach((klass) => klass.requirements.forEach((item) => {
    maxWeekly = Math.max(maxWeekly, item.count);
  }));
  const neededRepeat = Math.ceil(maxWeekly / 5);
  const repeatRaised = neededRepeat > state.settings.maxSubjectPerDay;
  if (repeatRaised) state.settings.maxSubjectPerDay = neededRepeat;

  state.schedules = [];
  state.selectedSchedule = 0;
  state.selectedClassId = state.classes[0]?.id || "";
  state.selectedTeacherId = state.teachers[0]?.id || "";
  state.selectedDepartmentId = state.departments[0]?.id || "";
  state.selectedDeptSubject = "";
  state.view = "class";
  state.published = null;
  state.moveSource = null;
  normalizeAvailability();
  applyImportedAvailability(parsed.availabilityRows || []);

  const alerts = [{
    type: "success",
    text: `Imported ${state.teachers.length} teachers, ${state.subjects.length} subjects, ${state.departments.length} departments, and ${state.classes.length} classes (${levelSummaries.join("; ")}). Teachers were assigned to classes in sheet order, so review elective subjects per class.`,
  }];
  if (state.groupingRules.length) {
    alerts.push({ type: "", text: `Imported ${state.groupingRules.length} grouped-class rule${state.groupingRules.length === 1 ? "" : "s"}. The scheduler auto-splits assigned classes into teaching groups and keeps the best candidates.` });
  }
  const patternCount = state.levels.reduce((sum, level) => sum + Object.keys(level.sessionPatterns || {}).length, 0);
  if (patternCount) {
    alerts.push({ type: "", text: `Imported ${patternCount} exact session pattern${patternCount === 1 ? "" : "s"} from the workbook.` });
  }
  if (repeatRaised) {
    alerts.push({ type: "", text: `Max repeated subject per class per day was raised to ${neededRepeat} so weekly loads fit the week. Periods after the break are shortened automatically to respect each level's end time.` });
  }
  parsed.warnings.forEach((text) => alerts.push({ type: "error", text }));
  parsed.notes.forEach((text) => alerts.push({ type: "", text: `Note from sheet (set availability manually): ${text}` }));
  return alerts;
}
