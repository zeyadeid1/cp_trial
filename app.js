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
  },
  constraints: {
    honorAvailability: true,
    preventTeacherClashes: true,
    requireQualifiedTeacher: true,
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
  groupingRules: [],
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
    "levelPeriods",
    "levelBreakAfter",
    "levelBreakLength",
    "levelDayPicker",
    "levelTimesPreview",
    "customLengthsToggle",
    "customLengthsWrap",
    "teacherSearch",
    "teacherSearchInfo",
    "teacherList",
    "addTeacherBtn",
    "subjectList",
    "addSubjectBtn",
    "departmentList",
    "addDepartmentBtn",
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
    "scheduleTabs",
    "scheduleCanvas",
    "outputTitle",
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
    ["levelPeriodLength", (level, value) => (level.periodLength = clampNumber(value, MIN_PERIOD_LENGTH, 120, level.periodLength))],
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
    saveToStorage();
    showAlerts([{ type: "success", text: "Draft saved in this browser." }]);
  });
  els.resetBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    loadDemo();
    state.subjects = [];
    state.teachers = [];
    state.classes = [];
    state.departments = [];
    renderAll();
    showAlerts([{ type: "success", text: "Draft reset." }]);
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
    periodsPerDay: 7,
    breakAfter: 3,
    breakLength: 25,
    customLengths: null,
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
  return Math.max(1, ...state.levels.map((level) => level.periodsPerDay));
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

function effectiveBreakLength(level) {
  return level.breakAfter > 0 && level.breakAfter < level.periodsPerDay && level.breakLength > 0 ? level.breakLength : 0;
}

// Period lengths for a level. If full-length periods do not fit between the
// start and end times, periods after the break are shortened evenly. For days
// that end before 14:30, only the first 3 periods keep full length. The end
// time is a hard limit; validation flags levels that cannot fit at all.
function effectivePeriodLengths(level) {
  const count = Math.max(1, level.periodsPerDay);
  if (Array.isArray(level.customLengths) && level.customLengths.length === count) {
    return level.customLengths.map((length) => clampNumber(length, MIN_PERIOD_LENGTH, 120, level.periodLength));
  }
  const window = timeToMinutes(level.endTime) - timeToMinutes(level.startTime) - effectiveBreakLength(level);
  const lengths = Array.from({ length: count }, () => level.periodLength);
  if (count * level.periodLength <= window) return lengths;
  const endsEarly = timeToMinutes(level.endTime) < timeToMinutes(EARLY_END);
  const fixedCount = Math.max(0, Math.min(endsEarly ? 3 : level.breakAfter, count - 1));
  const rest = count - fixedCount;
  const restLength = Math.max(MIN_PERIOD_LENGTH, Math.min(level.periodLength, Math.floor((window - fixedCount * level.periodLength) / rest)));
  for (let index = fixedCount; index < count; index++) lengths[index] = restLength;
  return lengths;
}

function levelTimes(level) {
  const lengths = effectivePeriodLengths(level);
  const periods = [];
  let current = timeToMinutes(level.startTime);
  let breakInfo = null;
  lengths.forEach((length, index) => {
    periods.push({ start: minutesToTime(current), end: minutesToTime(current + length), length });
    current += length;
    if (level.breakAfter === index + 1 && effectiveBreakLength(level)) {
      breakInfo = { afterIndex: index, start: minutesToTime(current), end: minutesToTime(current + level.breakLength), length: level.breakLength };
      current += level.breakLength;
    }
  });
  return { periods, breakInfo, endsAt: minutesToTime(current), fits: current <= timeToMinutes(level.endTime) };
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
    item.blocked[day] = Array.from({ length: level.periodsPerDay }, () => false);
  });
  return item;
}

function createDepartment(name = "", subjectNames = [], hodTeacherId = "") {
  return { id: uid("dep"), name, subjectNames, hodTeacherId };
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

function req(subject, count, teacherId = "", possiblyLate = false, extras = {}) {
  return Object.assign({ subject, count, teacherId, possiblyLate }, extras);
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function loadDemo() {
  state.settings = { candidateLimit: 12, maxTeacherPerDay: 6, maxSubjectPerDay: 2 };
  state.constraints = {
    honorAvailability: true,
    preventTeacherClashes: true,
    requireQualifiedTeacher: true,
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
  state.groupingRules = [];
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
    [state.levels[0], (index) => [
      req("Science", 6),
      req("Arabic", 6),
      req("English", 7),
      req("Math", 6),
      req("History", 5),
      req("Philosophy", 4),
      req("Religion", 2),
      req(index % 2 === 0 ? "French" : "German", 3),
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
      req("Arabic", 5),
      req("English", 4),
      req("Math", 5),
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
  writeGlobalInputs();
  renderLevels();
  renderTeachers();
  renderSubjects();
  renderDepartments();
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

  const times = levelTimes(level);
  els.levelTimesPreview.innerHTML = "";
  times.periods.forEach((period, index) => {
    const chip = document.createElement("span");
    chip.className = "time-chip";
    chip.textContent = `P${index + 1} ${period.start}-${period.end} (${period.length}m)`;
    els.levelTimesPreview.append(chip);
    if (times.breakInfo && times.breakInfo.afterIndex === index) {
      const breakChip = document.createElement("span");
      breakChip.className = "time-chip break-chip";
      breakChip.textContent = `Break ${times.breakInfo.start}-${times.breakInfo.end} (${times.breakInfo.length}m)`;
      els.levelTimesPreview.append(breakChip);
    }
  });
  const status = document.createElement("span");
  status.className = `time-chip ${times.fits ? "ok-chip" : "error-chip"}`;
  status.textContent = times.fits ? `Day ends ${times.endsAt} (limit ${level.endTime})` : `Does not fit: ends ${times.endsAt}, limit ${level.endTime}`;
  els.levelTimesPreview.append(status);

  els.customLengthsToggle.checked = Array.isArray(level.customLengths);
  els.customLengthsWrap.innerHTML = "";
  if (Array.isArray(level.customLengths)) {
    level.customLengths.forEach((length, index) => {
      const field = document.createElement("label");
      field.className = "field";
      field.innerHTML = `<span>P${index + 1} (min)</span><input type="number" min="${MIN_PERIOD_LENGTH}" max="120" value="${length}" />`;
      field.querySelector("input").addEventListener("change", (event) => {
        level.customLengths[index] = clampNumber(event.target.value, MIN_PERIOD_LENGTH, 120, level.periodLength);
        renderAll();
      });
      els.customLengthsWrap.append(field);
    });
  }
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
      saveToStorage();
    });
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
      state.departments.forEach((department) => {
        if (department.hodTeacherId === teacher.id) department.hodTeacherId = "";
      });
      if (state.session?.teacherId === teacher.id) state.session = null;
      renderAll();
    });
    els.teacherList.append(card);
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
      });
      state.classes.forEach((klass) => {
        klass.requirements = klass.requirements.filter((item) => item.subject !== subject.name);
      });
      state.departments.forEach((department) => {
        department.subjectNames = department.subjectNames.filter((item) => item !== subject.name);
      });
      state.levels.forEach((level) => {
        delete level.subjectBlocks[subject.name];
        delete level.sessionPatterns?.[subject.name];
      });
      state.groupingRules = state.groupingRules.filter((rule) => rule.subject !== subject.name);
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
  });
  state.classes.forEach((klass) => {
    klass.requirements.forEach((requirement) => {
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
  card.querySelector(".remove-entity").addEventListener("click", () => {
    state.classes = state.classes.filter((item) => item.id !== klass.id);
    state.selectedClassId = state.classes[0]?.id || "";
    renderAll();
  });
  card.querySelector(".block-slots-btn").addEventListener("click", () => {
    toggleBlockedGrid(card, klass);
  });
  renderRequirements(card.querySelector(".requirements"), klass);
  els.classList.append(card);
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

function renderRequirements(container, klass) {
  container.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "mini-heading";
  heading.textContent = "Weekly subject periods";
  container.append(heading);
  const assigned = [];
  const unassigned = [];
  state.subjects.forEach((subject) => {
    let requirement = klass.requirements.find((item) => item.subject === subject.name);
    if (!requirement) {
      requirement = req(subject.name, 0);
      klass.requirements.push(requirement);
    }
    (requirement.count > 0 ? assigned : unassigned).push({ subject, requirement });
  });
  [...assigned, ...unassigned].forEach(({ subject, requirement }) => {
    const row = document.createElement("div");
    row.className = `requirement-row ${requirement.count > 0 ? "" : "zero-row"}`;
    row.innerHTML = `
      <label class="field"><span>Subject</span><input value="${escapeAttr(subject.name)}" disabled /></label>
      <label class="field"><span>Per Week</span><input type="number" min="0" max="20" value="${requirement.count}" /></label>
      <label class="field"><span>Specific Teacher</span><select></select></label>
      <label class="field"><span>Grouping</span><select data-role="grouping"></select></label>
      <label class="field late-field"><span>Late Cover</span><input type="checkbox" ${requirement.possiblyLate ? "checked" : ""} /></label>
    `;
    const countInput = row.querySelector('input[type="number"]');
    const selects = row.querySelectorAll("select");
    const teacherSelect = selects[0];
    const groupingSelect = row.querySelector('[data-role="grouping"]');
    const lateInput = row.querySelector('input[type="checkbox"]');
    populateOptions(teacherSelect, ["", ...teachersForSubject(subject.name).map((teacher) => teacher.id)], [requirement.teacherId || ""], (value) => {
      if (!value) return "Any qualified teacher";
      return state.teachers.find((teacher) => teacher.id === value)?.name || value;
    });
    const availableRules = (state.groupingRules || []).filter((rule) => rule.subject === subject.name && (!rule.levelId || rule.levelId === klass.levelId));
    populateOptions(groupingSelect, ["", ...availableRules.map((rule) => rule.id)], [requirement.groupRuleId || ""], (value) => {
      if (!value) return "No grouping";
      const rule = groupingRuleById(value);
      return rule?.groupName || rule?.id || value;
    });
    countInput.addEventListener("change", () => {
      requirement.count = clampNumber(countInput.value, 0, 20, 0);
      saveToStorage();
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
    container.append(row);
  });
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
  renderSlotGrid(grid, klass.blocked, level.days, level.periodsPerDay, false, (day, slot, checked) => {
    klass.blocked[day][slot] = checked;
    saveToStorage();
  }, "Blocked", "Open");
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

function renderSlotGrid(container, matrix, days, slotCount, positiveDefault, onChange, onText = "On", offText = "Off") {
  container.innerHTML = "";
  container.style.setProperty("--slot-count", slotCount);
  container.append(labelCell("Day"));
  for (let slot = 0; slot < slotCount; slot++) {
    container.append(labelCell(`P${slot + 1}`));
  }
  days.forEach((day) => {
    container.append(labelCell(day.slice(0, 3)));
    for (let slot = 0; slot < slotCount; slot++) {
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

function groupedRequirementClassIds(rule) {
  if (!rule) return [];
  const explicit = (rule.classIds || []).filter((id) => state.classes.some((klass) => klass.id === id));
  if (explicit.length) return explicit;
  return state.classes
    .filter((klass) => klass.levelId === rule.levelId && klass.requirements.some((requirement) => requirement.groupRuleId === rule.id))
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
  return klass ? klass.requirements.reduce((sum, item) => sum + Number(item.count || 0), 0) : 0;
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
      next[day] = Array.from({ length: level.periodsPerDay }, (_, index) => existing[index] ?? false);
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
    const times = levelTimes(level);
    if (!times.fits) messages.push(`${level.name}: ${level.periodsPerDay} periods do not fit between ${level.startTime} and ${level.endTime} even after shortening to ${MIN_PERIOD_LENGTH} minutes. Reduce periods or the break.`);
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
  state.classes.forEach((klass) => {
    if (!klass.name.trim()) messages.push("Every class needs a name.");
    const level = levelById(klass.levelId);
    if (!level) {
      messages.push(`${klass.name} is not assigned to a level.`);
      return;
    }
    const total = klass.requirements.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const capacity = level.days.length * level.periodsPerDay;
    if (total > capacity) messages.push(`${klass.name} needs ${total} periods, but ${level.name} has capacity for ${capacity}.`);
    klass.requirements.filter((item) => item.count > 0).forEach((item) => {
      const subject = subjectByName(item.subject);
      if (!subject) messages.push(`${klass.name} references a missing subject: ${item.subject}.`);
      if (item.teacherId && !state.teachers.some((teacher) => teacher.id === item.teacherId)) messages.push(`${klass.name} has a missing assigned teacher for ${item.subject}.`);
      if (!item.teacherId && !teachersForSubject(item.subject).length) messages.push(`${klass.name} cannot schedule ${item.subject}; no teacher can teach it.`);
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
  return { ok: messages.length === 0, messages };
}

function showValidation(messages) {
  showAlerts(messages.length ? messages.map((text) => ({ type: "error", text })) : [{ type: "success", text: "Setup is valid. Generate schedules when ready." }]);
}

// ---------------------------------------------------------------------------
// Schedule generation
// ---------------------------------------------------------------------------

function generateSchedules() {
  normalizeAvailability();
  const validation = validateSetup();
  if (!validation.ok) {
    showValidation(validation.messages);
    return;
  }
  const schedules = buildCandidateSchedules();
  state.schedules = schedules;
  state.selectedSchedule = 0;
  renderSchedules();
  saveToStorage();
  if (schedules.length) {
    showAlerts([{ type: "success", text: `Generated ${schedules.length} candidate schedule${schedules.length === 1 ? "" : "s"}. Lower score is better. Use the section buttons on the left to keep editing the setup.` }]);
  } else {
    showAlerts([{ type: "error", text: "No valid schedules found. Try increasing teacher availability, reducing weekly periods, or loosening hard constraints." }]);
  }
}

function buildCandidateSchedules() {
  const seedCount = Math.min(24, Math.max(8, state.settings.candidateLimit * 2));
  const candidates = [];
  for (let seed = 0; seed < seedCount; seed++) {
    const tasks = expandTasks(seed);
    const schedule = emptySchedule();
    const ordered = shuffleWithSeed(tasks, seed).sort((a, b) => taskWeight(b) - taskWeight(a));
    const result = placeTasks(schedule, ordered, seed);
    if (result.ok) {
      const score = scoreSchedule(schedule);
      candidates.push({ ...schedule, score, seed });
    }
  }
  return dedupeSchedules(candidates)
    .sort((a, b) => a.score - b.score)
    .slice(0, state.settings.candidateLimit);
}

function expandTasks(seed = 0) {
  const tasks = [];
  const grouped = new Map();
  state.classes.forEach((klass) => {
    const level = levelById(klass.levelId);
    if (!level) return;
    klass.requirements.forEach((requirement) => {
      if (Number(requirement.count || 0) <= 0) return;
      const rule = requirement.groupRuleId ? groupingRuleById(requirement.groupRuleId) : null;
      if (rule && rule.mode !== "none") {
        const teacherId = rule.teacherId || requirement.teacherId || "";
        const key = `${rule.id}::${teacherId}::${requirement.subject}::${level.id}`;
        if (!grouped.has(key)) {
          grouped.set(key, { rule, level, requirement, teacherId, classIds: [] });
        }
        grouped.get(key).classIds.push(klass.id);
      } else {
        appendRequirementTasks(tasks, level, requirement, [klass.id], requirement.teacherId || "", null, 0);
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
  return tasks;
}

function appendRequirementTasks(tasks, level, requirement, classIds, teacherId, rule, groupIndex) {
  const total = Number(rule?.periodsPerGroup || requirement.count || 0);
  const pattern = sessionPatternFor(level, requirement.subject, total);
  pattern.forEach((length, index) => {
    tasks.push({
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
  const qualified = task.teacherId ? 1 : teachersForSubject(task.subject).length;
  return task.length * 25 + (subject?.difficulty || 3) * 10 + (subject?.priority === "core" ? 8 : 0) - qualified;
}

function emptySchedule() {
  const byClass = {};
  const teacherSlots = {};
  state.classes.forEach((klass) => {
    const level = levelById(klass.levelId);
    byClass[klass.id] = {};
    (level?.days || []).forEach((day) => {
      byClass[klass.id][day] = Array.from({ length: level.periodsPerDay }, () => null);
    });
  });
  state.teachers.forEach((teacher) => {
    teacherSlots[teacher.id] = {};
    unionDays().forEach((day) => {
      teacherSlots[teacher.id][day] = Array.from({ length: maxSlots() }, () => null);
    });
  });
  return { byClass, teacherSlots };
}

function placeTasks(schedule, tasks, seed) {
  for (const task of tasks) {
    const placements = validPlacements(schedule, task)
      .map((placement) => ({ ...placement, score: placementScore(schedule, task, placement, seed) }))
      .sort((a, b) => a.score - b.score);
    if (!placements.length) return { ok: false };
    const chosen = placements[Math.min(placements.length - 1, seededInt(seed + task.occurrence, Math.min(3, placements.length)))];
    applyTask(schedule, task, chosen);
  }
  return { ok: true };
}

function validPlacements(schedule, task) {
  const placements = [];
  const classes = (task.classIds?.length ? task.classIds : [task.classId]).map(classById).filter(Boolean);
  const level = levelById(task.levelId);
  if (!classes.length || !level) return placements;
  const teachers = task.teacherId ? state.teachers.filter((teacher) => teacher.id === task.teacherId) : teachersForSubject(task.subject);
  level.days.forEach((day) => {
    const classDays = classes.map((item) => ({ klass: item, grid: schedule.byClass[item.id]?.[day] }));
    if (classDays.some((item) => !item.grid)) return;
    if (classDays.some((item) => item.grid.filter((lesson) => lesson?.subject === task.subject).length + task.length > allowedSubjectPerDay(level, task.subject))) return;
    for (let slot = 0; slot + task.length <= level.periodsPerDay; slot++) {
      if (level.breakAfter > 0 && slot < level.breakAfter && slot + task.length > level.breakAfter) continue;
      let free = true;
      for (let index = 0; index < task.length; index++) {
        if (classDays.some(({ klass: item, grid }) => grid[slot + index] || item.blocked[day]?.[slot + index])) {
          free = false;
          break;
        }
      }
      if (free && level.sessionPatterns?.[task.subject]?.length) {
        if (classDays.some(({ grid }) => grid[slot - 1]?.subject === task.subject || grid[slot + task.length]?.subject === task.subject)) {
          free = false;
        }
      }
      if (!free) continue;
      teachers.forEach((teacher) => {
        if (state.constraints.requireQualifiedTeacher && !teacher.subjects.includes(task.subject)) return;
        const teacherDay = schedule.teacherSlots[teacher.id][day];
        if (!teacherDay) return;
        const replacements = task.possiblyLate ? replacementTeachersFor(teacher.id) : [];
        if (task.possiblyLate && !replacements.length) return;
        for (let index = 0; index < task.length; index++) {
          const at = slot + index;
          if (state.constraints.honorAvailability && teacher.availability[day]?.[at] === false) return;
          if (state.constraints.preventTeacherClashes && teacherDay[at]) return;
          for (const replacement of replacements) {
            if (state.constraints.honorAvailability && replacement.availability[day]?.[at] === false) return;
            if (state.constraints.preventTeacherClashes && schedule.teacherSlots[replacement.id][day]?.[at]) return;
          }
        }
        const maxTeacher = teacher.maxPerDay || state.settings.maxTeacherPerDay;
        if (teacherDay.filter(Boolean).length + task.length > maxTeacher) return;
        for (const replacement of replacements) {
          const replacementDay = schedule.teacherSlots[replacement.id][day] || [];
          if (replacementDay.filter(Boolean).length + task.length > (replacement.maxPerDay || state.settings.maxTeacherPerDay)) return;
        }
        placements.push({ day, slot, teacherId: teacher.id });
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
  const teacher = state.teachers.find((item) => item.id === placement.teacherId);
  const subject = subjectByName(task.subject);
  const replacements = task.possiblyLate ? replacementTeachersFor(placement.teacherId) : [];
  const groupId = task.groupRuleId ? `${task.groupRuleId}_${task.teachingGroupIndex || 1}_${task.occurrence}` : task.length > 1 ? uid("blk") : "";
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
      replacementIds: replacements.map((item) => item.id),
      replacementNames: replacements.map((item) => item.name),
      possiblyLate: Boolean(task.possiblyLate),
      color: subject?.color || "#4a5568",
      note: "",
      groupRuleId: task.groupRuleId || "",
      teachingGroupIndex: task.teachingGroupIndex || 0,
    };
    commitLesson(schedule, lesson, placement.day, placement.slot + index);
  }
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
  schedule.teacherSlots[lesson.teacherId][day][slot] = teacherLesson;
  (lesson.replacementIds || []).forEach((replacementId) => {
    if (!schedule.teacherSlots[replacementId]) return;
    const replacement = state.teachers.find((teacher) => teacher.id === replacementId);
    schedule.teacherSlots[replacementId][day][slot] = {
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
  state.published = JSON.parse(JSON.stringify({ byClass: schedule.byClass, teacherSlots: schedule.teacherSlots, score: schedule.score }));
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
      tab.textContent = `Option ${index + 1} - ${item.score}`;
      tab.className = index === state.selectedSchedule ? "active" : "";
      tab.addEventListener("click", () => {
        state.selectedSchedule = index;
        state.moveSource = null;
        renderSchedules();
      });
      els.scheduleTabs.append(tab);
    });
    const publishedNote = state.published?.publishedAt ? ` | Official set ${new Date(state.published.publishedAt).toLocaleDateString()}` : " | No official schedule set yet";
    els.outputTitle.textContent = `Option ${state.selectedSchedule + 1} - Score ${schedule.score}${publishedNote}`;
  } else {
    els.outputTitle.textContent = `Official schedule${state.published?.publishedAt ? ` - set ${new Date(state.published.publishedAt).toLocaleDateString()}` : ""}`;
  }
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
  const days = collection.type === "class" ? level.days : unionDays();
  const slotCount = collection.type === "class" ? level.periodsPerDay : maxSlots();
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
    row.append(timeCell(day, ""));
    for (let slot = 0; slot < slotCount; slot++) {
      row.append(scheduleCell(collection, day, slot));
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
  button.className = `lesson-card ${lesson.replacementForId ? "reserve-card" : ""}`;
  button.style.setProperty("--lesson-color", lesson.color || "#4a5568");
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
  const error = attemptMoveOrSwap(schedule, drag.lessonId, day, slot, collection);
  if (error) {
    showAlerts([{ type: "error", text: error }]);
    return;
  }
  schedule.score = scoreSchedule(schedule);
  renderSchedules();
  saveToStorage();
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
  const error = attemptMoveOrSwap(schedule, state.moveSource.lessonId, day, slot, collection);
  if (error) {
    showAlerts([{ type: "error", text: `${error} Pick another slot, or press Esc to cancel.` }]);
    return true;
  }
  state.moveSource = null;
  schedule.score = scoreSchedule(schedule);
  renderSchedules();
  saveToStorage();
  showAlerts([{ type: "success", text: lesson ? "Lessons swapped." : "Lesson moved." }]);
  return true;
}

function openLessonEditor(day, slot, collection, lesson) {
  state.editTarget = { scheduleIndex: state.selectedSchedule, day, slot, collection, existing: lesson };
  els.moveLessonBtn.classList.toggle("hidden", !lesson);
  populateOptions(els.editSubject, state.subjects.map((subject) => subject.name), [lesson?.subject || state.subjects[0]?.name || ""]);
  refreshTeacherEditOptions(lesson?.teacherId || "");
  els.editSubject.onchange = () => refreshTeacherEditOptions("");
  els.editNote.value = lesson?.note || "";
  els.editLate.checked = Boolean(lesson?.possiblyLate);
  els.lessonDialog.showModal();
}

function refreshTeacherEditOptions(selectedTeacherId) {
  const subject = els.editSubject.value;
  const teachers = teachersForSubject(subject);
  populateOptions(els.editTeacher, teachers.map((teacher) => teacher.id), [selectedTeacherId || teachers[0]?.id || ""], (value) => state.teachers.find((teacher) => teacher.id === value)?.name || value);
}

function saveEditedLesson() {
  const target = state.editTarget;
  if (!target) return;
  const schedule = state.schedules[target.scheduleIndex];
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
  removeLessonById(schedule, lesson.id);
  commitLesson(schedule, lesson, target.day, target.slot);
  schedule.score = scoreSchedule(schedule);
  els.lessonDialog.close();
  renderSchedules();
  saveToStorage();
}

function clearEditedLesson() {
  const target = state.editTarget;
  if (!target?.existing) {
    els.lessonDialog.close();
    return;
  }
  const schedule = state.schedules[target.scheduleIndex];
  removeLessonById(schedule, target.existing.id);
  schedule.score = scoreSchedule(schedule);
  els.lessonDialog.close();
  renderSchedules();
  saveToStorage();
}

function manualConflict(schedule, lesson, day, slot, existingId = "") {
  const classIds = lesson.classIds?.length ? lesson.classIds : [lesson.classId];
  const classes = classIds.map(classById).filter(Boolean);
  const klass = classes[0];
  const level = klass ? levelById(klass.levelId) : null;
  if (!klass || !level) return "The class for this lesson no longer exists.";
  if (!level.days.includes(day) || slot >= level.periodsPerDay) return `${klass.name} has no period ${slot + 1} on ${day}.`;
  for (const item of classes) {
    if (item.blocked[day]?.[slot]) return `${item.name} is blocked in this slot.`;
    const classSlot = schedule.byClass[item.id][day]?.[slot];
    if (classSlot && classSlot.id !== existingId) return `${item.name} already has a lesson in this slot.`;
  }
  const teacherSlot = schedule.teacherSlots[lesson.teacherId]?.[day]?.[slot];
  if (state.constraints.preventTeacherClashes && teacherSlot && teacherSlot.id !== existingId) return `${lesson.teacherName} is already teaching ${teacherSlot.className} in this slot.`;
  const teacher = state.teachers.find((item) => item.id === lesson.teacherId);
  if (state.constraints.honorAvailability && teacher?.availability[day]?.[slot] === false) return `${lesson.teacherName} is unavailable in this slot.`;
  const teacherDailyCount = (schedule.teacherSlots[lesson.teacherId]?.[day] || []).filter((item) => item && item.id !== existingId).length;
  if (teacher && teacherDailyCount >= (teacher.maxPerDay || state.settings.maxTeacherPerDay)) return `${lesson.teacherName} has reached the daily teaching limit.`;
  if (lesson.possiblyLate && !(lesson.replacementIds || []).length) return `${lesson.teacherName} has no replacement teacher assigned.`;
  for (const replacementId of lesson.replacementIds || []) {
    const replacement = state.teachers.find((item) => item.id === replacementId);
    if (!replacement) continue;
    const replacementSlot = schedule.teacherSlots[replacement.id]?.[day]?.[slot];
    if (state.constraints.preventTeacherClashes && replacementSlot && replacementSlot.id !== existingId) return `${replacement.name} is already occupied and cannot cover this possibly late lesson.`;
    if (state.constraints.honorAvailability && replacement.availability[day]?.[slot] === false) return `${replacement.name} is unavailable and cannot cover this possibly late lesson.`;
    const replacementDailyCount = (schedule.teacherSlots[replacement.id]?.[day] || []).filter((item) => item && item.id !== existingId).length;
    if (replacementDailyCount >= (replacement.maxPerDay || state.settings.maxTeacherPerDay)) return `${replacement.name} has reached the daily teaching limit and cannot cover this lesson.`;
  }
  return "";
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
  const columns = buildPdfColumns(times, level.periodsPerDay);
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

function teachersForSubject(subjectName) {
  return state.teachers.filter((teacher) => teacher.subjects.includes(subjectName));
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

function saveToStorage() {
  try {
    const current = state.schedules[state.selectedSchedule];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: state.settings,
      constraints: state.constraints,
      levels: state.levels,
      subjects: state.subjects,
      teachers: state.teachers,
      classes: state.classes,
      departments: state.departments,
      groupingRules: state.groupingRules,
      schedules: current ? [current] : [],
      selectedSchedule: 0,
      selectedLevelId: state.selectedLevelId,
      selectedClassId: state.selectedClassId,
      selectedTeacherId: state.selectedTeacherId,
      selectedDepartmentId: state.selectedDepartmentId,
      selectedDeptSubject: state.selectedDeptSubject,
      view: state.view,
      session: state.session,
      published: state.published,
    }));
  } catch {
    // Storage may be full or unavailable; the app keeps working in memory.
  }
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
    state.settings = Object.assign({ candidateLimit: 12, maxTeacherPerDay: 6, maxSubjectPerDay: 1 }, data.settings || {});
    state.constraints = Object.fromEntries(knownConstraints.map((key) => [key, data.constraints?.[key] ?? true]));
    state.levels = data.levels.map((level) => {
      const hydrated = Object.assign(createLevel(level.name || "Level"), level);
      hydrated.subjectBlocks ||= {};
      hydrated.sessionPatterns ||= {};
      return hydrated;
    });
    state.subjects = data.subjects || [];
    state.teachers = data.teachers || [];
    state.classes = data.classes || [];
    state.departments = data.departments || [];
    state.groupingRules = (data.groupingRules || []).map((rule) => createGroupingRule(rule));
    state.schedules = data.schedules || [];
    state.selectedSchedule = 0;
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
    });
    state.classes.forEach((klass) => {
      klass.requirements ||= [];
      klass.requirements.forEach((requirement) => {
        requirement.possiblyLate = Boolean(requirement.possiblyLate);
      });
    });
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
