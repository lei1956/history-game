/* ===== 配置与数据 ===== */
let GAME_CFG = {};
let ALL_ACHIEVEMENTS = [];
let QUESTIONS = {};
let AUDIO = { bgm: null, sfx: {} };

/* ===== 本地存储 ===== */
function loadState() {
  try { return JSON.parse(localStorage.getItem("historyGame") || "{}"); }
  catch { return {}; }
}
function saveState(s) { localStorage.setItem("historyGame", JSON.stringify(s)); }

function loadSettings() {
  try { return JSON.parse(localStorage.getItem("historyGameSettings") || "{}"); }
  catch { return {}; }
}
function saveSettings(s) { localStorage.setItem("historyGameSettings", JSON.stringify(s)); }

let state = {
  totalScore: 0, totalAnswered: 0, totalGames: 0, unlockedAch: [], playedModes: [],
  ...loadState()
};

let settings = {
  bgmOn: false,
  bgmVolume: 0.3,
  sfxOn: true,
  sfxVolume: 0.5,
  bgmTrack: 0,
  ...loadSettings()
};

/* ===== 音频控制 ===== */
function initAudio() {
  // BGM
  const bgmCfg = (GAME_CFG.bgmList || [])[settings.bgmTrack];
  if (bgmCfg) {
    AUDIO.bgm = new Audio(bgmCfg.file);
    AUDIO.bgm.loop = !!GAME_CFG.audio?.bgmLoop;
    AUDIO.bgm.volume = settings.bgmVolume;
  }
  // SFX
  const sfxCfg = GAME_CFG.sfx || {};
  if (sfxCfg.correct) AUDIO.sfx.correct = new Audio(sfxCfg.correct);
  if (sfxCfg.wrong) AUDIO.sfx.wrong = new Audio(sfxCfg.wrong);
  if (sfxCfg.achievement) AUDIO.sfx.achievement = new Audio(sfxCfg.achievement);
  Object.values(AUDIO.sfx).forEach(a => { if (a) a.volume = settings.sfxVolume; });
}

function playBGM() {
  if (!settings.bgmOn || !AUDIO.bgm) return;
  AUDIO.bgm.play().catch(() => {});
}
function stopBGM() {
  if (AUDIO.bgm) { AUDIO.bgm.pause(); AUDIO.bgm.currentTime = 0; }
}
function playSFX(name) {
  if (!settings.sfxOn || !AUDIO.sfx[name]) return;
  const a = AUDIO.sfx[name];
  a.currentTime = 0;
  a.play().catch(() => {});
}

function switchBGMTrack(idx) {
  stopBGM();
  const bgmCfg = (GAME_CFG.bgmList || [])[idx];
  if (!bgmCfg) return;
  AUDIO.bgm = new Audio(bgmCfg.file);
  AUDIO.bgm.loop = !!GAME_CFG.audio?.bgmLoop;
  AUDIO.bgm.volume = settings.bgmVolume;
  settings.bgmTrack = idx;
  saveSettings(settings);
  if (settings.bgmOn) playBGM();
}

function setBGMVolume(v) {
  settings.bgmVolume = v;
  if (AUDIO.bgm) AUDIO.bgm.volume = v;
  saveSettings(settings);
}
function setSFXVolume(v) {
  settings.sfxVolume = v;
  Object.values(AUDIO.sfx).forEach(a => { if (a) a.volume = v; });
  saveSettings(settings);
}

/* ===== 设置面板 ===== */
function openSettings() {
  document.getElementById("settings-overlay").classList.add("active");
}
function closeSettings() {
  document.getElementById("settings-overlay").classList.remove("active");
}

function renderSettings() {
  // BGM toggle
  const bgmToggle = document.getElementById("set-bgm-toggle");
  bgmToggle.classList.toggle("on", settings.bgmOn);
  bgmToggle.onclick = () => {
    settings.bgmOn = !settings.bgmOn;
    saveSettings(settings);
    bgmToggle.classList.toggle("on", settings.bgmOn);
    settings.bgmOn ? playBGM() : stopBGM();
  };

  // BGM volume
  const bgmVol = document.getElementById("set-bgm-vol");
  bgmVol.value = settings.bgmVolume;
  bgmVol.oninput = (e) => { setBGMVolume(+e.target.value); };

  // BGM select
  const bgmSelect = document.getElementById("set-bgm-select");
  bgmSelect.innerHTML = "";
  (GAME_CFG.bgmList || []).forEach((t, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = t.name || t.file;
    bgmSelect.appendChild(o);
  });
  bgmSelect.value = settings.bgmTrack;
  bgmSelect.onchange = (e) => { switchBGMTrack(+e.target.value); };

  // SFX toggle
  const sfxToggle = document.getElementById("set-sfx-toggle");
  sfxToggle.classList.toggle("on", settings.sfxOn);
  sfxToggle.onclick = () => {
    settings.sfxOn = !settings.sfxOn;
    saveSettings(settings);
    sfxToggle.classList.toggle("on", settings.sfxOn);
  };

  // SFX volume
  const sfxVol = document.getElementById("set-sfx-vol");
  sfxVol.value = settings.sfxVolume;
  sfxVol.oninput = (e) => { setSFXVolume(+e.target.value); };
}

/* ===== 游戏状态 ===== */
let currentDiff = "easy";
let questions = [];
let currentIdx = 0;
let score = 0;
let correct = 0;
let answered = 0;
let streak = 0;
let maxStreak = 0;
let answered_this = false;

/* ===== 工具函数 ===== */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  if (id === "home") updateHomeStats();
  if (id === "achievements") renderAchievements();
}

function updateHomeStats() {
  document.getElementById("total-score").textContent = state.totalScore;
  document.getElementById("total-played").textContent = state.totalAnswered;
  document.getElementById("ach-count").textContent = state.unlockedAch.length;
}

/* ===== 游戏流程 ===== */
function startGame(diff) {
  currentDiff = diff;
  const pool = QUESTIONS[diff] || [];
  const qpg = GAME_CFG.questionsPerGame || 10;
  questions = shuffle(pool).slice(0, Math.min(qpg, pool.length));
  currentIdx = 0;
  score = 0; correct = 0; answered = 0; streak = 0; maxStreak = 0;

  const tagEl = document.getElementById("diff-tag");
  const names = { easy: "简单", mid: "中等", hard: "困难", person: "人物" };
  tagEl.textContent = names[diff] || diff;
  tagEl.className = "difficulty-tag tag-" + diff;

  const bar = document.getElementById("progress-bar");
  const colors = { easy: "var(--easy)", mid: "var(--mid)", hard: "var(--hard)", person: "var(--person)" };
  bar.style.background = colors[diff] || colors.easy;

  showScreen("game");
  renderQuestion();
}

function renderQuestion() {
  const q = questions[currentIdx];
  const total = questions.length;
  answered_this = false;

  document.getElementById("q-num").textContent = "第 " + (currentIdx + 1) + " 题";
  document.getElementById("q-text").textContent = q.q;
  document.getElementById("q-count").textContent = (currentIdx + 1) + "/" + total;
  document.getElementById("progress-bar").style.width = (currentIdx / total * 100) + "%";
  document.getElementById("live-score").textContent = score + " 分";
  document.getElementById("feedback-box").classList.remove("show");
  document.getElementById("next-btn").classList.remove("show");

  const clueList = document.getElementById("clue-list");
  const opts = document.getElementById("options");
  const inputWrap = document.getElementById("answer-input-wrap");
  const input = document.getElementById("answer-input");
  const submitBtn = document.getElementById("submit-btn");

  clueList.innerHTML = "";
  opts.innerHTML = "";
  input.value = "";
  input.disabled = false;
  submitBtn.disabled = false;

  if (currentDiff === "person") {
    inputWrap.style.display = "flex";
    opts.style.display = "none";
    if (q.clues) {
      q.clues.forEach((clue, i) => {
        const div = document.createElement("div");
        div.className = "clue-item";
        div.innerHTML = `<span class="clue-label">线索 ${i + 1}：</span>${clue}`;
        clueList.appendChild(div);
      });
    }
  } else {
    inputWrap.style.display = "none";
    opts.style.display = "flex";
    const labels = ["A", "B", "C", "D"];
    q.opts.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "opt-btn";
      btn.innerHTML = `<span class="opt-label">${labels[i]}.</span>${opt}`;
      btn.onclick = () => selectAnswer(i, q.ans, q.tip);
      opts.appendChild(btn);
    });
  }

  const card = document.getElementById("question-card");
  card.classList.remove("animate-in");
  void card.offsetWidth;
  card.classList.add("animate-in");
}

function selectAnswer(chosen, correct_idx, tip) {
  if (answered_this) return;
  answered_this = true;

  const btns = document.querySelectorAll(".opt-btn");
  btns.forEach((b, i) => {
    b.disabled = true;
    if (i === correct_idx) b.classList.add(chosen === correct_idx ? "correct" : "reveal");
  });
  if (chosen !== correct_idx) btns[chosen].classList.add("wrong");

  const isCorrect = chosen === correct_idx;
  processAnswer(isCorrect, tip);
}

function submitPersonAnswer() {
  if (answered_this) return;
  const q = questions[currentIdx];
  const input = document.getElementById("answer-input");
  const submitBtn = document.getElementById("submit-btn");
  const val = input.value.trim();
  if (!val) return;

  answered_this = true;
  input.disabled = true;
  submitBtn.disabled = true;

  const normalized = val.toLowerCase().replace(/\s+/g, "");
  const isCorrect = q.answers.some(a => a.toLowerCase().replace(/\s+/g, "") === normalized);
  processAnswer(isCorrect, q.tip);
}

function processAnswer(isCorrect, tip) {
  answered++;
  if (isCorrect) {
    correct++;
    streak++;
    if (streak > maxStreak) maxStreak = streak;
    const pts = calcPoints();
    score += pts;
    document.getElementById("feedback-title").textContent = "✓ 回答正确！+" + pts + " 分";
    document.getElementById("feedback-title").style.color = "var(--easy)";
    playSFX("correct");
  } else {
    streak = 0;
    document.getElementById("feedback-title").textContent = "✗ 回答错误";
    document.getElementById("feedback-title").style.color = "#A32D2D";
    playSFX("wrong");
  }
  document.getElementById("feedback-body").textContent = tip;

  const fb = document.getElementById("feedback-box");
  fb.classList.add("show");
  document.getElementById("next-btn").classList.add("show");
  document.getElementById("next-btn").textContent =
    currentIdx + 1 >= questions.length ? "查看结果 →" : "下一题 →";

  document.getElementById("live-score").textContent = score + " 分";
  document.getElementById("live-score").classList.add("pop");
  setTimeout(() => document.getElementById("live-score").classList.remove("pop"), 200);
}

function calcPoints() {
  const base = (GAME_CFG.points || {})[currentDiff] || 10;
  const sb = GAME_CFG.streakBonus || { minStreak: 3, bonusRatio: 0.5 };
  const bonus = streak >= sb.minStreak ? Math.floor(base * sb.bonusRatio) : 0;
  return base + bonus;
}

function nextQuestion() {
  currentIdx++;
  if (currentIdx >= questions.length) {
    endGame();
  } else {
    renderQuestion();
  }
}

function endGame() {
  const total = questions.length;
  const acc = Math.round(correct / total * 100);

  state.totalAnswered += answered;
  state.totalScore += score;
  state.totalGames++;
  state.lastCorrect = correct;
  state.lastTotal = total;
  state.lastDiff = currentDiff;
  state.maxStreak = maxStreak;
  if (!state.playedModes) state.playedModes = [];
  if (!state.playedModes.includes(currentDiff)) state.playedModes.push(currentDiff);

  const newAch = checkAchievements();
  saveState(state);

  const th = GAME_CFG.resultThresholds || { excellent: 90, good: 70, pass: 50 };
  document.getElementById("result-icon").textContent =
    acc >= th.excellent ? "🏆" : acc >= th.good ? "🎉" : acc >= th.pass ? "📖" : "💪";
  document.getElementById("result-title").textContent =
    acc >= th.excellent ? "历史大家！" : acc >= th.good ? "挑战完成！" : acc >= th.pass ? "继续加油！" : "再接再厉！";
  document.getElementById("result-sub").textContent =
    `本局答对 ${correct}/${total} 题，正确率 ${acc}%`;

  document.getElementById("res-correct").textContent = correct;
  document.getElementById("res-wrong").textContent = total - correct;
  document.getElementById("res-pts").textContent = score;
  document.getElementById("res-acc").textContent = acc + "%";

  const names = { easy: "简单", mid: "中等", hard: "困难", person: "人物" };
  document.getElementById("replay-btn").textContent =
    "再战一局（" + (names[currentDiff] || currentDiff) + "）";

  const newAchWrap = document.getElementById("new-achievements");
  if (newAch.length > 0) {
    newAchWrap.style.display = "block";
    playSFX("achievement");
    const list = document.getElementById("new-ach-list");
    list.innerHTML = "";
    newAch.forEach(a => {
      list.innerHTML += `
        <div class="ach-item">
          <span class="ach-icon">${a.icon}</span>
          <div>
            <div class="ach-name">${a.name}</div>
            <div class="ach-desc">${a.desc} · +${a.pts}分</div>
          </div>
        </div>`;
    });
  } else {
    newAchWrap.style.display = "none";
  }

  showScreen("result");
}

/* ===== 成就系统 ===== */
function checkAchievements() {
  const newly = [];
  ALL_ACHIEVEMENTS.forEach(a => {
    if (!state.unlockedAch.includes(a.id) && checkAchCondition(a.id)) {
      state.unlockedAch.push(a.id);
      state.totalScore += a.pts;
      newly.push(a);
    }
  });
  return newly;
}

function checkAchCondition(id) {
  const s = state;
  switch (id) {
    case "first_blood": return s.totalGames >= 1;
    case "perfect": return s.lastCorrect === s.lastTotal && s.lastTotal > 0;
    case "streak3": return s.maxStreak >= 3;
    case "streak5": return s.maxStreak >= 5;
    case "hard_winner": return s.lastDiff === "hard" && s.lastCorrect / s.lastTotal >= 0.8;
    case "person_winner": return s.lastDiff === "person" && s.lastCorrect / s.lastTotal >= 0.8;
    case "score500": return s.totalScore >= 500;
    case "score2000": return s.totalScore >= 2000;
    case "played10": return s.totalAnswered >= 50;
    case "all_modes":
      const modes = s.playedModes || [];
      return ["easy","mid","hard","person"].every(m => modes.includes(m));
    default: return false;
  }
}

function renderAchievements() {
  const body = document.getElementById("ach-page-body");
  body.innerHTML = `<div style="font-size:13px;color:var(--muted);margin-bottom:4px;">已解锁 ${state.unlockedAch.length} / ${ALL_ACHIEVEMENTS.length} 个成就</div>`;
  ALL_ACHIEVEMENTS.forEach(a => {
    const unlocked = state.unlockedAch.includes(a.id);
    body.innerHTML += `
      <div class="ach-card ${unlocked ? "" : "locked"}">
        <div class="ach-card-icon">${unlocked ? a.icon : "🔒"}</div>
        <div class="ach-card-info">
          <div class="ach-card-name">${a.name}</div>
          <div class="ach-card-desc">${a.desc}</div>
          <div class="ach-card-pts">+${a.pts} 积分奖励</div>
        </div>
      </div>`;
  });
}

function replayGame() {
  startGame(currentDiff);
}

function confirmBack() {
  if (confirm("确定要退出本局游戏吗？当前进度将不会保存。")) {
    showScreen("home");
  }
}

/* ===== 初始化 ===== */
async function init() {
  try {
    const [gameCfg, achCfg, easyQ, midQ, hardQ, personQ] = await Promise.all([
      fetch("config/game.json").then(r => r.json()),
      fetch("config/achievements.json").then(r => r.json()),
      fetch("data/questions/easy.json").then(r => r.json()),
      fetch("data/questions/mid.json").then(r => r.json()),
      fetch("data/questions/hard.json").then(r => r.json()),
      fetch("data/questions/person.json").then(r => r.json())
    ]);

    GAME_CFG = gameCfg;
    ALL_ACHIEVEMENTS = achCfg;
    QUESTIONS = { easy: easyQ, mid: midQ, hard: hardQ, person: personQ };

    initAudio();
    renderSettings();
    updateHomeStats();

    document.getElementById("loading-wrap").classList.add("hidden");
    showScreen("home");
  } catch (e) {
    console.error(e);
    document.getElementById("loading-text").textContent = "加载失败，请刷新页面重试";
  }
}

init();
