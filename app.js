const STORAGE_KEY = "amateurRadioQuiz.wrongBook.v1";
const STATS_KEY = "amateurRadioQuiz.stats.v1";
const BANK_VIEW_KEY = "amateurRadioQuiz.bankView.v1";
const EXAM_DURATION_SECONDS = 40 * 60;
const BANK_PAGE_SIZE = 20;

const ANALYSIS_STATUS_LABELS = {
  source_based: "有來源解析",
  concept: "概念說明",
  pending: "解析待補",
  needs_review: "待確認"
};

const EXAM_RULES = {
  totalQuestions: 35,
  passingScore: 25,
  categories: [
    { key: "regulations", count: 13 },
    { key: "communication_methods", count: 13 },
    { key: "radio_system_principles", count: 6 },
    { key: "safety_protection", count: 1 },
    { key: "electromagnetic_compatibility", count: 1 },
    { key: "rf_interference_prevention", count: 1 }
  ]
};

const state = {
  mode: "exam",
  questionBank: [],
  questions: [],
  currentIndex: 0,
  practiceCategoryKeys: [],
  answers: {},
  submitted: false,
  remainingSeconds: EXAM_DURATION_SECONDS,
  sessionStartedAt: 0,
  endedByTimeout: false,
  timerId: null,
  wrongRecords: {},
  statsRecords: { sessions: [], categories: {}, questions: {} },
  bankCategoryKey: "all",
  bankPage: 1
};

const els = {
  examModeButton: document.querySelector("#examModeButton"),
  practiceModeButton: document.querySelector("#practiceModeButton"),
  bankModeButton: document.querySelector("#bankModeButton"),
  wrongBookModeButton: document.querySelector("#wrongBookModeButton"),
  statsModeButton: document.querySelector("#statsModeButton"),
  wrongCountBadge: document.querySelector("#wrongCountBadge"),
  examLayout: document.querySelector("#examLayout"),
  questionBankPanel: document.querySelector("#questionBankPanel"),
  bankCategoryFilter: document.querySelector("#bankCategoryFilter"),
  bankRuleSummary: document.querySelector("#bankRuleSummary"),
  bankCountText: document.querySelector("#bankCountText"),
  bankPrevPageButton: document.querySelector("#bankPrevPageButton"),
  bankNextPageButton: document.querySelector("#bankNextPageButton"),
  bankPageText: document.querySelector("#bankPageText"),
  questionBankList: document.querySelector("#questionBankList"),
  wrongBookPanel: document.querySelector("#wrongBookPanel"),
  statsPanel: document.querySelector("#statsPanel"),
  statsSummary: document.querySelector("#statsSummary"),
  statsCategoryList: document.querySelector("#statsCategoryList"),
  recentExamList: document.querySelector("#recentExamList"),
  clearStatsButton: document.querySelector("#clearStatsButton"),
  wrongBookStats: document.querySelector("#wrongBookStats"),
  wrongBookList: document.querySelector("#wrongBookList"),
  startWrongPracticeButton: document.querySelector("#startWrongPracticeButton"),
  clearWrongBookButton: document.querySelector("#clearWrongBookButton"),
  quizActions: document.querySelector("#quizActions"),
  progressText: document.querySelector("#progressText"),
  answeredText: document.querySelector("#answeredText"),
  practiceControls: document.querySelector("#practiceControls"),
  practiceCategoryInputs: Array.from(document.querySelectorAll("input[name='practiceCategory']")),
  practiceRangeCount: document.querySelector("#practiceRangeCount"),
  selectAllPracticeButton: document.querySelector("#selectAllPracticeButton"),
  clearPracticeButton: document.querySelector("#clearPracticeButton"),
  practiceQuestionCountSelect: document.querySelector("#practiceQuestionCountSelect"),
  totalRuleText: document.querySelector("#totalRuleText"),
  targetRuleLabel: document.querySelector("#targetRuleLabel"),
  targetRuleText: document.querySelector("#targetRuleText"),
  timerRuleLabel: document.querySelector("#timerRuleLabel"),
  timerText: document.querySelector("#timerText"),
  progressFill: document.querySelector("#progressFill"),
  scoreText: document.querySelector("#scoreText"),
  resultPanel: document.querySelector("#resultPanel"),
  resultLabel: document.querySelector("#resultLabel"),
  resultScore: document.querySelector("#resultScore"),
  resultDetail: document.querySelector("#resultDetail"),
  categoryText: document.querySelector("#categoryText"),
  historyRiskText: document.querySelector("#historyRiskText"),
  questionTitle: document.querySelector("#questionTitle"),
  optionsForm: document.querySelector("#optionsForm"),
  feedbackText: document.querySelector("#feedbackText"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  submitButton: document.querySelector("#submitButton"),
  resetButton: document.querySelector("#resetButton")
};

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadWrongRecords() {
  const storage = getStorage();
  if (!storage) return {};

  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function createDefaultStats() {
  return { sessions: [], categories: {}, questions: {} };
}

function loadStatsRecords() {
  const storage = getStorage();
  if (!storage) return createDefaultStats();

  try {
    const parsed = JSON.parse(storage.getItem(STATS_KEY) || "null");
    return {
      sessions: Array.isArray(parsed?.sessions) ? parsed.sessions : [],
      categories: parsed?.categories && typeof parsed.categories === "object" ? parsed.categories : {},
      questions: parsed?.questions && typeof parsed.questions === "object" ? parsed.questions : {}
    };
  } catch {
    return createDefaultStats();
  }
}

function loadBankView() {
  const storage = getStorage();
  if (!storage) return;

  try {
    const parsed = JSON.parse(storage.getItem(BANK_VIEW_KEY) || "null");
    state.bankCategoryKey = parsed?.categoryKey || "all";
    state.bankPage = Math.max(1, Number.parseInt(parsed?.page, 10) || 1);
  } catch {
    state.bankCategoryKey = "all";
    state.bankPage = 1;
  }
}

function saveWrongRecords() {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(state.wrongRecords));
}

function saveBankView() {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(BANK_VIEW_KEY, JSON.stringify({
    categoryKey: state.bankCategoryKey,
    page: state.bankPage
  }));
}

function saveStatsRecords() {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STATS_KEY, JSON.stringify(state.statsRecords));
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

function updateTimerDisplay() {
  els.timerText.textContent = formatDuration(state.remainingSeconds);
}

function stopTimer() {
  if (!state.timerId) return;
  window.clearInterval(state.timerId);
  state.timerId = null;
}

function finishExam() {
  finishSession();
}

function finishSession({ timedOut = false } = {}) {
  if (state.submitted) return;
  updateWrongRecordsFromExam();
  const session = recordStatsFromSession(timedOut);
  state.submitted = true;
  state.endedByTimeout = timedOut;
  stopTimer();
  render();

  if (session && (state.mode === "practice" || state.mode === "wrongPractice") && els.resultPanel.scrollIntoView) {
    const scrollToResult = () => {
      els.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(scrollToResult);
    else scrollToResult();
  }
}

function startTimer() {
  stopTimer();
  state.remainingSeconds = EXAM_DURATION_SECONDS;
  updateTimerDisplay();
  state.timerId = window.setInterval(() => {
    if (state.submitted) {
      stopTimer();
      return;
    }

    state.remainingSeconds = Math.max(0, state.remainingSeconds - 1);
    updateTimerDisplay();

    if (state.remainingSeconds === 0) {
      finishSession({ timedOut: true });
    }
  }, 1000);
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function buildExamQuestions(questionBank) {
  return buildQuestionsByRules(questionBank, EXAM_RULES.categories);
}

function buildQuestionsByRules(questionBank, rules) {
  const selected = [];

  for (const rule of rules) {
    const pool = questionBank.filter((question) => question.categoryKey === rule.key);
    if (pool.length < rule.count) {
      throw new Error(`題庫分類 ${rule.key} 題數不足：需要 ${rule.count} 題，只有 ${pool.length} 題`);
    }
    selected.push(...shuffle(pool).slice(0, rule.count));
  }

  return shuffle(selected);
}

function getCategoryQuestionCount(questionBank, categoryKey) {
  return questionBank.filter((question) => question.categoryKey === categoryKey).length;
}

function getSelectedPracticeCategoryKeys() {
  return els.practiceCategoryInputs
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function getPracticePool(questionBank, categoryKeys) {
  return questionBank.filter((question) => categoryKeys.includes(question.categoryKey));
}

function updatePracticeRangeSummary(poolLength) {
  const selectedCount = getSelectedPracticeCategoryKeys().length;
  const totalCount = els.practiceCategoryInputs.length;
  const count = typeof poolLength === "number"
    ? poolLength
    : getPracticePool(state.questionBank, getSelectedPracticeCategoryKeys()).length;
  els.practiceRangeCount.textContent = `已選 ${selectedCount} / ${totalCount} 個範圍，共 ${count} 題`;
}

function getPracticeQuestionLimit(poolLength) {
  const selectedLimit = els.practiceQuestionCountSelect.value;
  if (selectedLimit === "all") return poolLength;

  const parsedLimit = Number.parseInt(selectedLimit, 10);
  if (!Number.isFinite(parsedLimit)) {
    return Math.min(EXAM_RULES.totalQuestions, poolLength);
  }

  return Math.min(parsedLimit, poolLength);
}

function getScaledPracticeRules(questionBank, categoryKeys, totalLimit) {
  if (totalLimit >= getPracticePool(questionBank, categoryKeys).length) {
    return categoryKeys.map((key) => ({
      key,
      count: getCategoryQuestionCount(questionBank, key)
    }));
  }

  const selectedRules = EXAM_RULES.categories.filter((category) => categoryKeys.includes(category.key));
  const ruleTotal = selectedRules.reduce((total, rule) => total + rule.count, 0);
  let assignedTotal = 0;

  const scaledRules = selectedRules.map((rule) => {
    const exactCount = (totalLimit * rule.count) / ruleTotal;
    const poolCount = getCategoryQuestionCount(questionBank, rule.key);
    const count = Math.min(Math.floor(exactCount), poolCount);
    assignedTotal += count;
    return {
      key: rule.key,
      count,
      remainder: exactCount - Math.floor(exactCount),
      poolCount
    };
  });

  let remaining = totalLimit - assignedTotal;
  while (remaining > 0) {
    const candidate = [...scaledRules]
      .filter((rule) => rule.count < rule.poolCount)
      .sort((a, b) => b.remainder - a.remainder || b.poolCount - a.poolCount)[0];
    if (!candidate) break;
    candidate.count += 1;
    candidate.remainder = 0;
    remaining -= 1;
  }

  return scaledRules
    .filter((rule) => rule.count > 0)
    .map(({ key, count }) => ({ key, count }));
}

function buildPracticeQuestions(questionBank, categoryKeys) {
  const allKeys = EXAM_RULES.categories.map((category) => category.key);
  const selectedAll = allKeys.every((key) => categoryKeys.includes(key));
  const pool = getPracticePool(questionBank, categoryKeys);
  updatePracticeRangeSummary(pool.length);

  if (!pool.length) {
    throw new Error("請至少勾選一個練習分類");
  }

  const practiceQuestionLimit = getPracticeQuestionLimit(pool.length);

  if (selectedAll && practiceQuestionLimit === EXAM_RULES.totalQuestions) {
    return buildExamQuestions(questionBank);
  }

  return buildQuestionsByRules(questionBank, getScaledPracticeRules(questionBank, categoryKeys, practiceQuestionLimit));
}

function startNewExam(questionBank = state.questionBank) {
  state.questionBank = questionBank;
  state.mode = "exam";
  state.questions = buildExamQuestions(questionBank);
  state.currentIndex = 0;
  state.answers = {};
  state.submitted = false;
  state.endedByTimeout = false;
  state.sessionStartedAt = Date.now();
  startTimer();
}

function startPractice(questionBank = state.questionBank) {
  state.questionBank = questionBank;
  state.practiceCategoryKeys = getSelectedPracticeCategoryKeys();
  state.currentIndex = 0;
  state.answers = {};
  state.submitted = false;
  state.endedByTimeout = false;
  state.sessionStartedAt = Date.now();

  const pool = getPracticePool(questionBank, state.practiceCategoryKeys);
  updatePracticeRangeSummary(pool.length);

  if (!state.practiceCategoryKeys.length || !pool.length) {
    state.questions = [];
    stopTimer();
    state.remainingSeconds = EXAM_DURATION_SECONDS;
    updateTimerDisplay();
    return;
  }

  state.questions = buildPracticeQuestions(questionBank, state.practiceCategoryKeys);
  startTimer();
}

function startWrongPractice(questionIds = null) {
  const entries = Array.isArray(questionIds) ? getWrongEntriesByIds(questionIds) : getWrongEntries();
  state.mode = "wrongPractice";
  state.questions = shuffle(entries.map((entry) => entry.question));
  state.currentIndex = 0;
  state.answers = {};
  state.submitted = false;
  state.endedByTimeout = false;
  state.sessionStartedAt = Date.now();
  startTimer();
}

function showWrongPractice(questionIds = null) {
  const entries = Array.isArray(questionIds) ? getWrongEntriesByIds(questionIds) : getWrongEntries();
  if (!entries.length) return;
  els.examLayout.hidden = false;
  els.quizActions.hidden = false;
  els.wrongBookPanel.hidden = true;
  els.statsPanel.hidden = true;
  els.questionBankPanel.hidden = true;
  els.practiceControls.hidden = true;
  els.examModeButton.className = "mode-tab";
  els.practiceModeButton.className = "mode-tab";
  els.bankModeButton.className = "mode-tab";
  els.wrongBookModeButton.className = "mode-tab active";
  els.statsModeButton.className = "mode-tab";
  startWrongPractice(questionIds);
  render();
}

function currentQuestion() {
  return state.questions[state.currentIndex];
}

function getScore() {
  return state.questions.reduce((total, question) => {
    return total + (state.answers[question.id] === question.answer ? 1 : 0);
  }, 0);
}

function getAnsweredCount() {
  return state.questions.filter((question) => state.answers[question.id]).length;
}

function getExamResult() {
  const score = getScore();
  return {
    score,
    wrong: state.questions.length - score,
    passed: score >= EXAM_RULES.passingScore,
    total: state.questions.length
  };
}

function getSessionLabel(mode = state.mode) {
  if (mode === "practice") return "題庫練習";
  if (mode === "wrongPractice") return "錯題練習";
  return "模擬考";
}

function getAnswerText(question, key = question.answer) {
  const option = question.options.find((item) => item.key === key);
  return option ? `(${option.key}) ${option.text}` : key;
}

function getExplanationText(question) {
  const explanation = (question.explanation || "").trim();
  return explanation ? `解析：${explanation}` : "解析待補";
}

function getAnalysisStatusText(question) {
  const explanation = (question.explanation || "").trim();
  const statusKey = question.analysisStatus || question.analysisType || (explanation ? "concept" : "pending");
  const statusLabel = ANALYSIS_STATUS_LABELS[statusKey] || statusKey;
  const sourceLabel = (question.sourceLabel || question.analysisSource || "").trim();
  return sourceLabel ? `解析狀態：${statusLabel}｜${sourceLabel}` : `解析狀態：${statusLabel}`;
}

function resetFeedback(tone = "") {
  els.feedbackText.className = tone ? `feedback ${tone}` : "feedback";
  els.feedbackText.innerHTML = "";
}

function setFeedbackText(text, tone = "") {
  resetFeedback(tone);
  els.feedbackText.textContent = text;
}

function appendFeedbackContent(content, contentText) {
  if (!Array.isArray(contentText)) {
    content.textContent = contentText;
    return;
  }

  for (const part of contentText) {
    const item = document.createElement("span");
    item.className = part.className ? `feedback-content-part ${part.className}` : "feedback-content-part";
    item.textContent = part.text;
    content.append(item);
  }
}

function createFeedbackRow(labelText, contentText, rowClass) {
  const row = document.createElement("div");
  row.className = `feedback-row ${rowClass}`;

  const label = document.createElement("span");
  label.className = "feedback-label";
  label.textContent = labelText;

  const content = document.createElement("span");
  content.className = "feedback-content";
  appendFeedbackContent(content, contentText);

  row.append(label, content);
  return row;
}

function setFeedbackDetails(mainText, explanationText, tone, summaryText = "", analysisStatusText = "") {
  resetFeedback(tone);

  els.feedbackText.append(createFeedbackRow("答案", mainText, "feedback-answer"));
  if (analysisStatusText) {
    els.feedbackText.append(createFeedbackRow("狀態", analysisStatusText, "feedback-analysis-status"));
  }
  els.feedbackText.append(createFeedbackRow("解析", explanationText, "feedback-explanation"));

  if (summaryText) {
    els.feedbackText.append(createFeedbackRow("結果", summaryText, "feedback-summary"));
  }
}

function buildAnswerFeedbackParts(statusText, correctAnswerText = "") {
  const parts = [{ text: statusText }];

  if (correctAnswerText) {
    parts.push({ text: `正確答案：${correctAnswerText}`, className: "feedback-correct-answer" });
  }
  return parts;
}

function recordStatsFromSession(timedOut) {
  if (!state.questions.length) return;

  const result = getExamResult();
  const answered = getAnsweredCount();
  const durationSeconds = state.sessionStartedAt
    ? Math.max(0, Math.round((Date.now() - state.sessionStartedAt) / 1000))
    : 0;
  const questionIds = state.questions.map((question) => question.id);
  const wrongIds = state.questions
    .filter((question) => state.answers[question.id] !== question.answer)
    .map((question) => question.id);

  const session = {
    id: `${Date.now()}`,
    mode: state.mode,
    label: getSessionLabel(),
    date: new Date().toISOString(),
    score: result.score,
    wrong: result.wrong,
    answered,
    total: result.total,
    passed: result.passed,
    durationSeconds,
    timedOut,
    questionIds,
    wrongIds,
    wrongCount: wrongIds.length
  };

  state.statsRecords.sessions.unshift(session);
  state.statsRecords.sessions = state.statsRecords.sessions.slice(0, 50);
  state.statsRecords.questions = state.statsRecords.questions || {};

  for (const question of state.questions) {
    const selected = state.answers[question.id] || "";
    const category = state.statsRecords.categories[question.categoryKey] || {
      key: question.categoryKey,
      name: question.category,
      answered: 0,
      correct: 0,
      wrong: 0
    };
    category.answered += selected ? 1 : 0;
    category.correct += selected === question.answer ? 1 : 0;
    category.wrong += selected === question.answer ? 0 : 1;
    state.statsRecords.categories[question.categoryKey] = category;

    const questionStats = state.statsRecords.questions[question.id] || {
      id: question.id,
      category: question.category,
      categoryKey: question.categoryKey,
      number: question.number,
      attempts: 0,
      correct: 0,
      wrong: 0
    };
    questionStats.attempts += 1;
    questionStats.correct += selected === question.answer ? 1 : 0;
    questionStats.wrong += selected === question.answer ? 0 : 1;
    questionStats.lastSeenAt = session.date;
    if (selected !== question.answer) questionStats.lastWrongAt = session.date;
    state.statsRecords.questions[question.id] = questionStats;
  }

  saveStatsRecords();
  return session;
}

function getWrongEntries() {
  return Object.values(state.wrongRecords)
    .map((record) => {
      const question = state.questionBank.find((item) => item.id === record.id);
      return question ? { record, question } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aSort = a.record.firstWrongAt || a.record.lastWrongAt || "";
      const bSort = b.record.firstWrongAt || b.record.lastWrongAt || "";
      return bSort.localeCompare(aSort);
    });
}

function getWrongEntriesByIds(questionIds) {
  return [...new Set(questionIds)]
    .map((id) => {
      const question = state.questionBank.find((item) => item.id === id);
      if (!question) return null;
      const record = state.wrongRecords[id] || {
        id,
        category: question.category,
        categoryKey: question.categoryKey,
        number: question.number,
        wrongCount: 0,
        lastAnswer: "",
        lastWrongAt: ""
      };
      return { record, question };
    })
    .filter(Boolean);
}

function getWrongSessions() {
  return (state.statsRecords.sessions || [])
    .filter((session) => Array.isArray(session.wrongIds) && session.wrongIds.length)
    .slice(0, 30);
}

function formatSessionDate(dateText) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return dateText || "-";
  return date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getQuestionHistoryRisk(question) {
  const stats = state.statsRecords.questions?.[question.id];
  if (!stats || !stats.wrong || !stats.attempts) return "";
  const rate = Math.round((stats.wrong / stats.attempts) * 100);
  return `歷史錯題率 ${rate}%（錯 ${stats.wrong}/${stats.attempts}）`;
}

function updateWrongBookBadge() {
  const count = Object.keys(state.wrongRecords).length;
  const sessionCount = getWrongSessions().length;
  els.wrongCountBadge.textContent = count ? `${count} 題` : `${sessionCount} 次`;
  if (state.mode === "wrongBook") {
    els.scoreText.textContent = `錯題 ${count} 題｜紀錄 ${sessionCount} 次`;
  }
}

function updateWrongRecord(question, selected) {
  if (selected === question.answer) {
    delete state.wrongRecords[question.id];
    return;
  }

  const previous = state.wrongRecords[question.id];
  const now = new Date().toISOString();
  state.wrongRecords[question.id] = {
    id: question.id,
    category: question.category,
    categoryKey: question.categoryKey,
    number: question.number,
    wrongCount: (previous?.wrongCount || 0) + 1,
    lastAnswer: selected,
    firstWrongAt: previous?.firstWrongAt || previous?.lastWrongAt || now,
    lastWrongAt: now
  };
}

function updateWrongRecordsFromExam() {
  for (const question of state.questions) {
    const selected = state.answers[question.id] || "";
    updateWrongRecord(question, selected);
  }

  saveWrongRecords();
  updateWrongBookBadge();
}

function setMode(mode) {
  state.mode = mode;
  const isWrongBook = mode === "wrongBook";
  const isStats = mode === "stats";
  const isBank = mode === "bank";
  const isPractice = mode === "practice";

  els.examLayout.hidden = isWrongBook || isStats || isBank;
  els.quizActions.hidden = isWrongBook || isStats || isBank;
  els.wrongBookPanel.hidden = !isWrongBook;
  els.statsPanel.hidden = !isStats;
  els.questionBankPanel.hidden = !isBank;
  els.practiceControls.hidden = !isPractice;
  els.examModeButton.className = mode === "exam" ? "mode-tab active" : "mode-tab";
  els.practiceModeButton.className = isPractice ? "mode-tab active" : "mode-tab";
  els.bankModeButton.className = isBank ? "mode-tab active" : "mode-tab";
  els.wrongBookModeButton.className = isWrongBook ? "mode-tab active" : "mode-tab";
  els.statsModeButton.className = isStats ? "mode-tab active" : "mode-tab";
  els.examModeButton.setAttribute("aria-current", mode === "exam" ? "page" : "false");
  els.practiceModeButton.setAttribute("aria-current", isPractice ? "page" : "false");
  els.bankModeButton.setAttribute("aria-current", isBank ? "page" : "false");
  els.wrongBookModeButton.setAttribute("aria-current", isWrongBook ? "page" : "false");
  els.statsModeButton.setAttribute("aria-current", isStats ? "page" : "false");

  if (mode === "exam") {
    startNewExam();
    render();
  } else if (isPractice) {
    startPractice();
    render();
  } else if (isWrongBook) {
    stopTimer();
    renderWrongBook();
  } else if (isBank) {
    stopTimer();
    renderQuestionBank();
  } else {
    stopTimer();
    renderStats();
  }
}

function updateProgress() {
  const total = state.questions.length;
  const answered = getAnsweredCount();
  const fallbackTotal = state.mode === "practice" ? 0 : EXAM_RULES.totalQuestions;
  els.progressText.textContent = total ? `第 ${state.currentIndex + 1} 題` : "尚無題目";
  els.answeredText.textContent = `${answered} / ${total || fallbackTotal}`;
  els.progressFill.style.width = total ? `${Math.round((answered / total) * 100)}%` : "0%";
  els.totalRuleText.textContent = String(total || fallbackTotal);
  els.targetRuleLabel.textContent = "及格";
  els.targetRuleText.textContent = String(EXAM_RULES.passingScore);
  els.timerRuleLabel.textContent = "倒數";
  els.timerText.textContent = formatDuration(state.remainingSeconds);

  if (!state.submitted) {
    els.scoreText.textContent = "尚未交卷";
    els.resultPanel.hidden = true;
    return;
  }

  const result = getExamResult();
  const isPracticeSession = state.mode === "practice" || state.mode === "wrongPractice";
  const resultText = isPracticeSession ? "完成" : (result.passed ? "合格" : "未合格");
  els.scoreText.textContent = `答對 ${result.score}｜答錯 ${result.wrong}｜${resultText}`;
  els.resultPanel.hidden = false;
  els.resultPanel.className = `result-panel ${isPracticeSession || result.passed ? "pass" : "fail"}`;
  els.resultLabel.textContent = state.endedByTimeout ? "時間到自動交卷" : (isPracticeSession ? "練習結果" : "交卷結果");
  els.resultScore.textContent = `答對 ${result.score} 題 / 答錯 ${result.wrong} 題 / ${resultText}`;
  els.resultDetail.textContent = isPracticeSession
    ? `${state.endedByTimeout ? "時間到，系統已自動交卷。" : ""}已作答 ${answered} 題，未作答 ${result.total - answered} 題。本次錯題已依完成時間加入錯題本，可從錯題本複習同一次範圍。`
    : `${state.endedByTimeout ? "時間到，系統已自動交卷。" : ""}及格門檻 ${EXAM_RULES.passingScore} 題，已作答 ${answered} 題，未作答 ${result.total - answered} 題。錯題已更新至本機錯題本，統計已更新。`;
}

function renderFeedback(question) {
  const selected = state.answers[question.id];
  resetFeedback();

  if (state.mode === "practice" || state.mode === "wrongPractice") {
    if (!selected) {
      setFeedbackText("選擇答案後立即顯示正解與解析");
      return;
    }

    const answerText = getAnswerText(question);
    const explanationText = getExplanationText(question);
    const analysisStatusText = getAnalysisStatusText(question);

    if (selected === question.answer) {
      setFeedbackDetails(buildAnswerFeedbackParts("答對。"), explanationText, "success", "", analysisStatusText);
    } else {
      setFeedbackDetails(buildAnswerFeedbackParts("答錯。", answerText), explanationText, "danger", "", analysisStatusText);
    }
    return;
  }

  if (!state.submitted) {
    setFeedbackText(selected ? "已作答" : "尚未作答");
    return;
  }

  const result = getExamResult();
  const summary = `${result.passed ? "合格" : "未合格"}：答對 ${result.score} 題，答錯 ${result.wrong} 題`;
  const answerText = getAnswerText(question);
  const explanationText = getExplanationText(question);
  const analysisStatusText = getAnalysisStatusText(question);

  if (!selected) {
    setFeedbackDetails(buildAnswerFeedbackParts("未作答。", answerText), explanationText, "danger", summary, analysisStatusText);
    return;
  }

  if (selected === question.answer) {
    setFeedbackDetails(buildAnswerFeedbackParts("答對。"), explanationText, "success", summary, analysisStatusText);
  } else {
    setFeedbackDetails(buildAnswerFeedbackParts("答錯。", answerText), explanationText, "danger", summary, analysisStatusText);
  }
}

function renderOptions(question) {
  const selected = state.answers[question.id];
  const isPracticeReview = (state.mode === "practice" || state.mode === "wrongPractice") && selected;
  const shouldShowAnswer = state.submitted || isPracticeReview;
  const shouldHideSelectedWrong = isPracticeReview && selected !== question.answer;
  els.optionsForm.innerHTML = "";

  question.options.forEach((option) => {
    const label = document.createElement("label");
    label.className = "option-row";

    if (shouldShowAnswer) {
      if (option.key === question.answer) label.classList.add("correct");
      if (!isPracticeReview && option.key === selected && selected !== question.answer) {
        label.classList.add("incorrect");
      }
    }

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer";
    input.value = option.key;
    input.checked = !shouldHideSelectedWrong && selected === option.key;
    input.disabled = state.submitted;
    input.addEventListener("change", () => {
      state.answers[question.id] = option.key;
      render();
    });

    const content = document.createElement("span");
    content.innerHTML = `<span class="option-key">(${option.key})</span> ${option.text}`;

    label.append(input, content);
    els.optionsForm.append(label);
  });
}

function render() {
  if (state.mode === "wrongBook" || state.mode === "stats" || state.mode === "bank") return;
  const question = currentQuestion();

  if (!question) {
    els.questionTitle.textContent = state.mode === "practice" ? "請至少選擇一個練習範圍" : "找不到題庫資料";
    els.categoryText.textContent = "-";
    els.historyRiskText.hidden = true;
    els.optionsForm.innerHTML = "";
    setFeedbackText(state.mode === "practice" ? "可按全選恢復全部範圍，或勾選想練習的分類。" : "");
    updateProgress();
    return;
  }

  els.categoryText.textContent = question.category;
  const historyRiskText = (state.mode === "practice" || state.mode === "wrongPractice")
    ? getQuestionHistoryRisk(question)
    : "";
  els.historyRiskText.textContent = historyRiskText;
  els.historyRiskText.hidden = !historyRiskText;
  els.questionTitle.textContent = question.question;
  renderOptions(question);
  renderFeedback(question);
  updateProgress();

  els.prevButton.disabled = state.currentIndex === 0;
  els.nextButton.disabled = state.currentIndex === state.questions.length - 1;
  els.submitButton.disabled = state.submitted;
  els.submitButton.textContent = state.submitted ? "已交卷" : "交卷";
  els.submitButton.hidden = false;
  els.resetButton.textContent = "重新抽題";
}

function renderWrongBookStats(entries, sessions) {
  els.wrongBookStats.innerHTML = "";
  const counts = entries.reduce((acc, entry) => {
    acc[entry.question.category] = (acc[entry.question.category] || 0) + 1;
    return acc;
  }, {});

  const summary = [
    ["錯題總數", `${entries.length} 題`],
    ["錯題紀錄", `${sessions.length} 次`],
    ...Object.entries(counts)
  ];

  for (const [label, value] of summary) {
    const item = document.createElement("span");
    item.className = "wrongbook-stat";
    item.textContent = `${label}：${value}`;
    els.wrongBookStats.append(item);
  }
}

function renderWrongBookItem(entry) {
  const { record, question } = entry;
  const item = document.createElement("article");
  item.className = "wrongbook-item";

  const head = document.createElement("div");
  head.className = "wrongbook-item-head";

  const title = document.createElement("h3");
  title.className = "wrongbook-item-title";
  title.textContent = question.question;

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "secondary";
  removeButton.textContent = "移除";
  removeButton.addEventListener("click", () => {
    delete state.wrongRecords[record.id];
    saveWrongRecords();
    updateWrongBookBadge();
    renderWrongBook();
  });

  head.append(title, removeButton);

  const meta = document.createElement("div");
  meta.className = "wrongbook-meta";
  for (const text of [
    question.category,
    `題號 ${question.number}`,
    `累計錯誤 ${record.wrongCount} 次`,
    record.lastAnswer ? `上次選 ${record.lastAnswer}` : "上次未作答"
  ]) {
    const badge = document.createElement("span");
    badge.textContent = text;
    meta.append(badge);
  }

  const answer = document.createElement("span");
  answer.className = "wrongbook-answer";
  answer.textContent = `正解 ${getAnswerText(question)}`;

  const options = document.createElement("ul");
  options.className = "wrongbook-options";
  for (const option of question.options) {
    const optionItem = document.createElement("li");
    if (option.key === question.answer) optionItem.className = "correct";
    optionItem.textContent = `(${option.key}) ${option.text}`;
    options.append(optionItem);
  }

  item.append(head, meta, answer, options);
  return item;
}

function renderWrongSessionItem(session) {
  const entries = getWrongEntriesByIds(session.wrongIds || []);
  const item = document.createElement("article");
  item.className = "wrongbook-session";

  const head = document.createElement("div");
  head.className = "wrongbook-item-head";

  const title = document.createElement("h3");
  title.className = "wrongbook-item-title";
  title.textContent = `${formatSessionDate(session.date)}｜${session.label || "測驗紀錄"}`;

  const practiceButton = document.createElement("button");
  practiceButton.type = "button";
  practiceButton.className = "primary";
  practiceButton.textContent = "複習本次錯題";
  practiceButton.disabled = entries.length === 0;
  practiceButton.addEventListener("click", () => {
    showWrongPractice(session.wrongIds || []);
  });

  head.append(title, practiceButton);

  const meta = document.createElement("div");
  meta.className = "wrongbook-meta";
  for (const text of [
    `錯 ${entries.length} 題`,
    `答對 ${session.score || 0} 題`,
    `共 ${session.total || 0} 題`,
    session.timedOut ? "時間到" : "已交卷"
  ]) {
    const badge = document.createElement("span");
    badge.textContent = text;
    meta.append(badge);
  }

  const preview = document.createElement("p");
  preview.className = "wrongbook-session-preview";
  preview.textContent = entries.slice(0, 3).map((entry) => `題號 ${entry.question.number}`).join("、")
    || "找不到本次錯題題目";

  item.append(head, meta, preview);
  return item;
}

function renderWrongBook() {
  const entries = getWrongEntries();
  const sessions = getWrongSessions();
  els.scoreText.textContent = `錯題 ${entries.length} 題｜紀錄 ${sessions.length} 次`;
  els.startWrongPracticeButton.disabled = entries.length === 0;
  renderWrongBookStats(entries, sessions);
  els.wrongBookList.innerHTML = "";

  if (!entries.length && !sessions.length) {
    const empty = document.createElement("p");
    empty.className = "wrongbook-empty";
    empty.textContent = "目前沒有錯題。交卷後答錯或未作答的題目會記在這裡。";
    els.wrongBookList.append(empty);
    return;
  }

  if (sessions.length) {
    sessions.forEach((session) => {
      els.wrongBookList.append(renderWrongSessionItem(session));
    });
    return;
  }

  entries.forEach((entry) => {
    els.wrongBookList.append(renderWrongBookItem(entry));
  });
}

function setupQuestionBankFilter() {
  const currentValue = state.bankCategoryKey || "all";
  els.bankCategoryFilter.innerHTML = '<option value="all">全部分類</option>';

  for (const category of EXAM_RULES.categories) {
    const sampleQuestion = state.questionBank.find((question) => question.categoryKey === category.key);
    if (!sampleQuestion) continue;

    const option = document.createElement("option");
    option.value = category.key;
    const bankCount = getCategoryQuestionCount(state.questionBank, category.key);
    option.textContent = `${sampleQuestion.category}（${bankCount} 題）`;
    els.bankCategoryFilter.append(option);
  }

  els.bankCategoryFilter.value = [...els.bankCategoryFilter.options].some((option) => option.value === currentValue)
    ? currentValue
    : "all";
  state.bankCategoryKey = els.bankCategoryFilter.value;
}

function renderBankRuleSummary() {
  els.bankRuleSummary.innerHTML = "";

  const note = document.createElement("p");
  note.className = "bank-rule-note";
  note.textContent = `本測試題庫共分 ${EXAM_RULES.categories.length} 部分；模擬考固定抽 ${EXAM_RULES.totalQuestions} 題，依官方題組比例抽題。`;
  els.bankRuleSummary.append(note);

  const grid = document.createElement("div");
  grid.className = "bank-rule-grid";

  for (const rule of EXAM_RULES.categories) {
    const sampleQuestion = state.questionBank.find((question) => question.categoryKey === rule.key);
    if (!sampleQuestion) continue;

    const item = document.createElement("article");
    item.className = "bank-rule-item";
    item.innerHTML = `
      <strong>${sampleQuestion.category}</strong>
      <span>題庫 ${getCategoryQuestionCount(state.questionBank, rule.key)}</span>
      <span>抽 ${rule.count}</span>
    `;
    grid.append(item);
  }

  els.bankRuleSummary.append(grid);
}

function renderQuestionBank() {
  setupQuestionBankFilter();
  renderBankRuleSummary();
  const selectedCategory = state.bankCategoryKey;
  const questions = selectedCategory === "all"
    ? state.questionBank
    : state.questionBank.filter((question) => question.categoryKey === selectedCategory);
  const totalPages = Math.max(1, Math.ceil(questions.length / BANK_PAGE_SIZE));
  state.bankPage = Math.min(Math.max(1, state.bankPage), totalPages);
  const startIndex = (state.bankPage - 1) * BANK_PAGE_SIZE;
  const visibleQuestions = questions.slice(startIndex, startIndex + BANK_PAGE_SIZE);

  els.scoreText.textContent = `題庫 ${questions.length} 題`;
  els.bankCountText.textContent = `共 ${questions.length} 題，目前顯示第 ${startIndex + 1} - ${Math.min(startIndex + BANK_PAGE_SIZE, questions.length)} 題`;
  els.bankPageText.textContent = `第 ${state.bankPage} / ${totalPages} 頁`;
  els.bankPrevPageButton.disabled = state.bankPage <= 1;
  els.bankNextPageButton.disabled = state.bankPage >= totalPages;
  els.questionBankList.innerHTML = "";
  saveBankView();

  if (!questions.length) {
    const empty = document.createElement("p");
    empty.className = "stats-empty";
    empty.textContent = "找不到符合分類的題目。";
    els.questionBankList.append(empty);
    return;
  }

  for (const question of visibleQuestions) {
    const item = document.createElement("article");
    item.className = "question-bank-item";

    const meta = document.createElement("div");
    meta.className = "question-bank-meta";
    for (const text of [question.category, `題號 ${question.number}`]) {
      const badge = document.createElement("span");
      badge.textContent = text;
      meta.append(badge);
    }

    const title = document.createElement("h3");
    title.textContent = question.question;

    const options = document.createElement("ul");
    options.className = "question-bank-options";
    for (const option of question.options) {
      const optionItem = document.createElement("li");
      if (option.key === question.answer) optionItem.className = "correct";
      optionItem.textContent = `(${option.key}) ${option.text}`;
      options.append(optionItem);
    }

    item.append(meta, title, options);
    els.questionBankList.append(item);
  }
}

function renderStats() {
  const sessions = state.statsRecords.sessions || [];
  const totalSessions = sessions.length;
  const examSessions = sessions.filter((session) => session.mode === "exam");
  const passedSessions = examSessions.filter((session) => session.passed).length;
  const totalAnswered = sessions.reduce((sum, session) => sum + session.answered, 0);
  const totalCorrect = sessions.reduce((sum, session) => sum + session.score, 0);
  const accuracy = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const passRate = examSessions.length ? Math.round((passedSessions / examSessions.length) * 100) : 0;

  els.scoreText.textContent = `累積 ${totalAnswered} 題｜答對率 ${accuracy}%`;
  els.statsSummary.innerHTML = "";

  for (const [label, value] of [
    ["累積作答", `${totalAnswered} 題`],
    ["答對率", `${accuracy}%`],
    ["模擬考次數", `${examSessions.length} 次`],
    ["合格率", `${passRate}%`]
  ]) {
    const card = document.createElement("div");
    card.className = "stats-card";
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    els.statsSummary.append(card);
  }

  renderStatsCategories();
  renderRecentSessions();

  if (!totalSessions) {
    els.recentExamList.innerHTML = '<p class="stats-empty">尚無作答紀錄。完成一次交卷後，統計會顯示在這裡。</p>';
  }
}

function renderStatsCategories() {
  els.statsCategoryList.innerHTML = "";
  const categories = Object.values(state.statsRecords.categories || {})
    .sort((a, b) => (b.wrong || 0) - (a.wrong || 0));

  if (!categories.length) {
    els.statsCategoryList.innerHTML = '<p class="stats-empty">尚無分類統計。</p>';
    return;
  }

  for (const category of categories) {
    const answered = category.answered || 0;
    const correct = category.correct || 0;
    const wrong = category.wrong || 0;
    const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
    const item = document.createElement("article");
    item.className = "stats-category-item";
    item.innerHTML = `
      <strong>${category.name}</strong>
      <div class="stats-category-meta">
        <span class="stats-pill">作答 ${answered} 題</span>
        <span class="stats-pill">答對率 ${accuracy}%</span>
        <span class="stats-pill">錯題 ${wrong} 題</span>
      </div>
    `;
    els.statsCategoryList.append(item);
  }
}

function renderRecentSessions() {
  els.recentExamList.innerHTML = "";
  const sessions = (state.statsRecords.sessions || []).slice(0, 5);

  for (const session of sessions) {
    const item = document.createElement("article");
    item.className = "recent-exam-item";
    const date = new Date(session.date).toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    const resultText = session.passed ? "合格" : "未合格";
    item.innerHTML = `
      <strong>${date}｜${session.label}</strong>
      <div class="recent-exam-meta">
        <span class="stats-pill">答對 ${session.score} 題</span>
        <span class="stats-pill">答錯 ${session.wrong} 題</span>
        <span class="stats-pill">${resultText}</span>
        ${session.timedOut ? '<span class="stats-pill">時間到</span>' : ""}
      </div>
    `;
    els.recentExamList.append(item);
  }
}

async function loadQuestions() {
  try {
    state.wrongRecords = loadWrongRecords();
    state.statsRecords = loadStatsRecords();
    loadBankView();
    const response = await fetch("data/amateurRadioLevel3.generated.json?v=20260625-1");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const quiz = await response.json();
    startNewExam(quiz.questions || []);
    updateWrongBookBadge();
    render();
  } catch (error) {
    els.questionTitle.textContent = "題庫讀取失敗";
    setFeedbackText("請確認是透過本機伺服器開啟，而不是直接開啟 HTML 檔。");
    console.error(error);
  }
}

els.examModeButton.addEventListener("click", () => setMode("exam"));
els.practiceModeButton.addEventListener("click", () => setMode("practice"));
els.bankModeButton.addEventListener("click", () => setMode("bank"));
els.wrongBookModeButton.addEventListener("click", () => setMode("wrongBook"));
els.statsModeButton.addEventListener("click", () => setMode("stats"));

els.practiceCategoryInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (state.mode !== "practice") return;
    startPractice();
    render();
  });
});

els.selectAllPracticeButton.addEventListener("click", () => {
  els.practiceCategoryInputs.forEach((input) => {
    input.checked = true;
  });
  if (state.mode !== "practice") return;
  startPractice();
  render();
});

els.clearPracticeButton.addEventListener("click", () => {
  els.practiceCategoryInputs.forEach((input) => {
    input.checked = false;
  });
  if (state.mode !== "practice") return;
  startPractice();
  render();
});

els.practiceQuestionCountSelect.addEventListener("change", () => {
  if (state.mode !== "practice") return;
  startPractice();
  render();
});

els.clearWrongBookButton.addEventListener("click", () => {
  if (window.confirm && !window.confirm("確定要清空本機錯題本？")) return;
  state.wrongRecords = {};
  state.statsRecords.sessions = (state.statsRecords.sessions || []).map((session) => ({
    ...session,
    wrongIds: [],
    wrongCount: 0
  }));
  saveWrongRecords();
  saveStatsRecords();
  updateWrongBookBadge();
  renderWrongBook();
});

els.startWrongPracticeButton.addEventListener("click", () => {
  showWrongPractice();
});

els.bankCategoryFilter.addEventListener("change", () => {
  if (state.mode !== "bank") return;
  state.bankCategoryKey = els.bankCategoryFilter.value;
  state.bankPage = 1;
  renderQuestionBank();
});

els.bankPrevPageButton.addEventListener("click", () => {
  if (state.mode !== "bank") return;
  state.bankPage = Math.max(1, state.bankPage - 1);
  renderQuestionBank();
});

els.bankNextPageButton.addEventListener("click", () => {
  if (state.mode !== "bank") return;
  state.bankPage += 1;
  renderQuestionBank();
});

els.clearStatsButton.addEventListener("click", () => {
  if (window.confirm && !window.confirm("確定要清空本機統計？錯題本不會被清除。")) return;
  state.statsRecords = createDefaultStats();
  saveStatsRecords();
  renderStats();
});

els.prevButton.addEventListener("click", () => {
  state.currentIndex = Math.max(0, state.currentIndex - 1);
  render();
});

els.nextButton.addEventListener("click", () => {
  state.currentIndex = Math.min(state.questions.length - 1, state.currentIndex + 1);
  render();
});

els.submitButton.addEventListener("click", () => {
  finishSession();
});

els.resetButton.addEventListener("click", () => {
  if (state.mode === "practice") {
    startPractice();
  } else {
    startNewExam();
  }
  render();
});

loadQuestions();
