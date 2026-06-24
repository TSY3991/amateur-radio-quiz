const STORAGE_KEY = "amateurRadioQuiz.wrongBook.v1";
const EXAM_DURATION_SECONDS = 40 * 60;

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
  timerId: null,
  wrongRecords: {}
};

const els = {
  examModeButton: document.querySelector("#examModeButton"),
  practiceModeButton: document.querySelector("#practiceModeButton"),
  wrongBookModeButton: document.querySelector("#wrongBookModeButton"),
  wrongCountBadge: document.querySelector("#wrongCountBadge"),
  examLayout: document.querySelector("#examLayout"),
  wrongBookPanel: document.querySelector("#wrongBookPanel"),
  wrongBookStats: document.querySelector("#wrongBookStats"),
  wrongBookList: document.querySelector("#wrongBookList"),
  clearWrongBookButton: document.querySelector("#clearWrongBookButton"),
  quizActions: document.querySelector("#quizActions"),
  progressText: document.querySelector("#progressText"),
  answeredText: document.querySelector("#answeredText"),
  practiceControls: document.querySelector("#practiceControls"),
  practiceCategoryInputs: Array.from(document.querySelectorAll("input[name='practiceCategory']")),
  practiceRangeCount: document.querySelector("#practiceRangeCount"),
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

function saveWrongRecords() {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(state.wrongRecords));
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
  if (state.submitted) return;
  updateWrongRecordsFromExam();
  state.submitted = true;
  stopTimer();
  render();
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
      finishExam();
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
  const selected = [];

  for (const rule of EXAM_RULES.categories) {
    const pool = questionBank.filter((question) => question.categoryKey === rule.key);
    if (pool.length < rule.count) {
      throw new Error(`題庫分類 ${rule.key} 題數不足：需要 ${rule.count} 題，只有 ${pool.length} 題`);
    }
    selected.push(...shuffle(pool).slice(0, rule.count));
  }

  return shuffle(selected);
}

function getSelectedPracticeCategoryKeys() {
  const selected = els.practiceCategoryInputs
    .filter((input) => input.checked)
    .map((input) => input.value);
  return selected.length ? selected : EXAM_RULES.categories.map((category) => category.key);
}

function getPracticePool(questionBank, categoryKeys) {
  return questionBank.filter((question) => categoryKeys.includes(question.categoryKey));
}

function updatePracticeRangeSummary(poolLength) {
  const count = typeof poolLength === "number"
    ? poolLength
    : getPracticePool(state.questionBank, getSelectedPracticeCategoryKeys()).length;
  els.practiceRangeCount.textContent = `目前範圍：${count} 題`;
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

  return shuffle(pool).slice(0, practiceQuestionLimit);
}

function startNewExam(questionBank = state.questionBank) {
  state.questionBank = questionBank;
  state.questions = buildExamQuestions(questionBank);
  state.currentIndex = 0;
  state.answers = {};
  state.submitted = false;
  startTimer();
}

function startPractice(questionBank = state.questionBank) {
  state.questionBank = questionBank;
  state.practiceCategoryKeys = getSelectedPracticeCategoryKeys();
  state.questions = buildPracticeQuestions(questionBank, state.practiceCategoryKeys);
  state.currentIndex = 0;
  state.answers = {};
  state.submitted = false;
  startTimer();
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

function getAnswerText(question, key = question.answer) {
  const option = question.options.find((item) => item.key === key);
  return option ? `(${option.key}) ${option.text}` : key;
}

function getExplanationText(question) {
  const explanation = (question.explanation || "").trim();
  return explanation ? `解析：${explanation}` : "解析：尚未提供";
}

function getWrongEntries() {
  return Object.values(state.wrongRecords)
    .map((record) => {
      const question = state.questionBank.find((item) => item.id === record.id);
      return question ? { record, question } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.record.lastWrongAt || "").localeCompare(a.record.lastWrongAt || ""));
}

function updateWrongBookBadge() {
  const count = Object.keys(state.wrongRecords).length;
  els.wrongCountBadge.textContent = `${count} 題`;
  if (state.mode === "wrongBook") {
    els.scoreText.textContent = `錯題 ${count} 題`;
  }
}

function updateWrongRecord(question, selected) {
  if (selected === question.answer) {
    delete state.wrongRecords[question.id];
    return;
  }

  const previous = state.wrongRecords[question.id];
  state.wrongRecords[question.id] = {
    id: question.id,
    category: question.category,
    categoryKey: question.categoryKey,
    number: question.number,
    wrongCount: (previous?.wrongCount || 0) + 1,
    lastAnswer: selected,
    lastWrongAt: new Date().toISOString()
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
  const isPractice = mode === "practice";

  els.examLayout.hidden = isWrongBook;
  els.quizActions.hidden = isWrongBook;
  els.wrongBookPanel.hidden = !isWrongBook;
  els.practiceControls.hidden = !isPractice;
  els.examModeButton.className = mode === "exam" ? "mode-tab active" : "mode-tab";
  els.practiceModeButton.className = isPractice ? "mode-tab active" : "mode-tab";
  els.wrongBookModeButton.className = isWrongBook ? "mode-tab active" : "mode-tab";
  els.examModeButton.setAttribute("aria-current", mode === "exam" ? "page" : "false");
  els.practiceModeButton.setAttribute("aria-current", isPractice ? "page" : "false");
  els.wrongBookModeButton.setAttribute("aria-current", isWrongBook ? "page" : "false");

  if (mode === "exam") {
    startNewExam();
    render();
  } else if (isPractice) {
    startPractice();
    render();
  } else {
    stopTimer();
    renderWrongBook();
  }
}

function updateProgress() {
  const total = state.questions.length;
  const answered = getAnsweredCount();
  els.progressText.textContent = total ? `第 ${state.currentIndex + 1} 題` : "尚無題目";
  els.answeredText.textContent = `${answered} / ${total || EXAM_RULES.totalQuestions}`;
  els.progressFill.style.width = total ? `${Math.round((answered / total) * 100)}%` : "0%";
  els.totalRuleText.textContent = String(total || EXAM_RULES.totalQuestions);
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
  const resultText = result.passed ? "合格" : "未合格";
  els.scoreText.textContent = `答對 ${result.score}｜答錯 ${result.wrong}｜${resultText}`;
  els.resultPanel.hidden = false;
  els.resultPanel.className = `result-panel ${result.passed ? "pass" : "fail"}`;
  els.resultLabel.textContent = "交卷結果";
  els.resultScore.textContent = `答對 ${result.score} 題 / 答錯 ${result.wrong} 題 / ${resultText}`;
  els.resultDetail.textContent = `及格門檻 ${EXAM_RULES.passingScore} 題，已作答 ${answered} 題，未作答 ${result.total - answered} 題。錯題已更新至本機錯題本。`;
}

function renderFeedback(question) {
  const selected = state.answers[question.id];
  els.feedbackText.className = "feedback";

  if (state.mode === "practice") {
    if (!selected) {
      els.feedbackText.textContent = "選擇答案後立即顯示正解與解析";
      return;
    }

    const answerText = getAnswerText(question);
    const explanationText = getExplanationText(question);

    if (selected === question.answer) {
      els.feedbackText.textContent = `答對，正解為 ${answerText}。${explanationText}`;
      els.feedbackText.classList.add("success");
    } else {
      els.feedbackText.textContent = `答錯，你選 ${getAnswerText(question, selected)}，正解為 ${answerText}。${explanationText}`;
      els.feedbackText.classList.add("danger");
    }
    return;
  }

  if (!state.submitted) {
    els.feedbackText.textContent = selected ? "已作答" : "尚未作答";
    return;
  }

  const result = getExamResult();
  const summary = `${result.passed ? "合格" : "未合格"}：答對 ${result.score} 題，答錯 ${result.wrong} 題`;
  const answerText = getAnswerText(question);
  const explanationText = getExplanationText(question);

  if (!selected) {
    els.feedbackText.textContent = `未作答，正解為 ${answerText}。${explanationText}。${summary}`;
    els.feedbackText.classList.add("danger");
    return;
  }

  if (selected === question.answer) {
    els.feedbackText.textContent = `本題答對，正解為 ${answerText}。${explanationText}。${summary}`;
    els.feedbackText.classList.add("success");
  } else {
    els.feedbackText.textContent = `本題答錯，你選 ${getAnswerText(question, selected)}，正解為 ${answerText}。${explanationText}。${summary}`;
    els.feedbackText.classList.add("danger");
  }
}

function renderOptions(question) {
  const selected = state.answers[question.id];
  const shouldShowAnswer = state.submitted || (state.mode === "practice" && selected);
  els.optionsForm.innerHTML = "";

  question.options.forEach((option) => {
    const label = document.createElement("label");
    label.className = "option-row";

    if (shouldShowAnswer) {
      if (option.key === question.answer) label.classList.add("correct");
      if (option.key === selected && selected !== question.answer) label.classList.add("incorrect");
    }

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer";
    input.value = option.key;
    input.checked = selected === option.key;
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
  if (state.mode === "wrongBook") return;
  const question = currentQuestion();

  if (!question) {
    els.questionTitle.textContent = "找不到題庫資料";
    els.categoryText.textContent = "-";
    els.optionsForm.innerHTML = "";
    updateProgress();
    return;
  }

  els.categoryText.textContent = question.category;
  els.questionTitle.textContent = question.question;
  renderOptions(question);
  renderFeedback(question);
  updateProgress();

  els.prevButton.disabled = state.currentIndex === 0;
  els.nextButton.disabled = state.currentIndex === state.questions.length - 1;
  els.submitButton.disabled = state.submitted;
  els.submitButton.hidden = false;
  els.resetButton.textContent = "重新抽題";
}

function renderWrongBookStats(entries) {
  els.wrongBookStats.innerHTML = "";
  const counts = entries.reduce((acc, entry) => {
    acc[entry.question.category] = (acc[entry.question.category] || 0) + 1;
    return acc;
  }, {});

  const summary = [
    ["錯題總數", `${entries.length} 題`],
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
    `錯誤 ${record.wrongCount} 次`,
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

function renderWrongBook() {
  const entries = getWrongEntries();
  els.scoreText.textContent = `錯題 ${entries.length} 題`;
  renderWrongBookStats(entries);
  els.wrongBookList.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "wrongbook-empty";
    empty.textContent = "目前沒有錯題。交卷後答錯或未作答的題目會記在這裡。";
    els.wrongBookList.append(empty);
    return;
  }

  entries.forEach((entry) => {
    els.wrongBookList.append(renderWrongBookItem(entry));
  });
}

async function loadQuestions() {
  try {
    state.wrongRecords = loadWrongRecords();
    const response = await fetch("data/amateurRadioLevel3.generated.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const quiz = await response.json();
    startNewExam(quiz.questions || []);
    updateWrongBookBadge();
    render();
  } catch (error) {
    els.questionTitle.textContent = "題庫讀取失敗";
    els.feedbackText.textContent = "請確認是透過本機伺服器開啟，而不是直接開啟 HTML 檔。";
    console.error(error);
  }
}

els.examModeButton.addEventListener("click", () => setMode("exam"));
els.practiceModeButton.addEventListener("click", () => setMode("practice"));
els.wrongBookModeButton.addEventListener("click", () => setMode("wrongBook"));

els.practiceCategoryInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (state.mode !== "practice") return;
    startPractice();
    render();
  });
});

els.practiceQuestionCountSelect.addEventListener("change", () => {
  if (state.mode !== "practice") return;
  startPractice();
  render();
});

els.clearWrongBookButton.addEventListener("click", () => {
  if (window.confirm && !window.confirm("確定要清空本機錯題本？")) return;
  state.wrongRecords = {};
  saveWrongRecords();
  updateWrongBookBadge();
  renderWrongBook();
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
  finishExam();
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
