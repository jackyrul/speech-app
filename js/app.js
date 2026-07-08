'use strict';

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
const STORAGE_KEY = 'speech_trainer_v2';

let state = {
  currentWeek: 1,
  currentDay: 1,
  completedSessions: {},
  assessments: {},
  parasiteLog: [],
  streak: 0,
  lastActiveDate: null,
  startDate: null,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
    if (!state.startDate) state.startDate = todayStr();
  } catch (e) {}
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function sessionKey(week, day) {
  return `${week}-${day}`;
}

function isSessionDone(week, day) {
  return !!state.completedSessions[sessionKey(week, day)];
}

function completeSession(week, day) {
  const key = sessionKey(week, day);
  if (!state.completedSessions[key]) {
    state.completedSessions[key] = { at: new Date().toISOString() };
    updateStreak();
    advanceProgress(week, day);
  }
  saveState();
  autoSaveToGist();
}

function updateStreak() {
  const today = todayStr();
  const yesterday = (() => {
    const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0];
  })();
  if (state.lastActiveDate === yesterday) {
    state.streak = (state.streak || 0) + 1;
  } else if (state.lastActiveDate !== today) {
    state.streak = 1;
  }
  state.lastActiveDate = today;
}

function advanceProgress(week, day) {
  if (week === state.currentWeek && day >= state.currentDay) {
    if (day >= 7) {
      if (week < 8) { state.currentWeek = week + 1; state.currentDay = 1; }
    } else {
      state.currentDay = day + 1;
    }
  }
}

function saveAssessment(week, scores) {
  state.assessments[week] = { ...scores, at: new Date().toISOString() };
  saveState();
}

function totalCompleted() {
  return Object.keys(state.completedSessions).length;
}

function resetState() {
  if (!confirm('Сбросить весь прогресс? Это нельзя отменить.')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = { currentWeek: 1, currentDay: 1, completedSessions: {}, assessments: {}, parasiteLog: [], streak: 0, lastActiveDate: null, startDate: todayStr() };
  navigate('home');
}

// ═══════════════════════════════════════════════
// TIMER — wall-clock based (iOS background-safe)
// ═══════════════════════════════════════════════
let timerInterval = null;
let timerEndTime = 0;      // Date.now() + duration ms
let timerTotal = 0;
let timerPaused = false;
let timerRemAtPause = 0;   // ms remaining when paused
let _onTick = null;
let _onDone = null;

function startTimer(seconds, onTick, onDone) {
  stopTimer();
  timerTotal = seconds;
  timerEndTime = Date.now() + seconds * 1000;
  timerPaused = false;
  _onTick = onTick;
  _onDone = onDone;

  function tick() {
    if (timerPaused) return;
    const remaining = Math.max(0, Math.ceil((timerEndTime - Date.now()) / 1000));
    onTick(remaining, timerTotal);
    if (remaining <= 0) { stopTimer(); playDone(); onDone(); }
  }

  tick();
  // 500ms interval — точнее и восстанавливается быстрее после фона
  timerInterval = setInterval(tick, 500);
  document.addEventListener('visibilitychange', _onVisibility);
}

function _onVisibility() {
  // Приложение вернулось из фона — пересчитываем сразу
  if (!document.hidden && timerEndTime > 0 && !timerPaused && _onTick) {
    const remaining = Math.max(0, Math.ceil((timerEndTime - Date.now()) / 1000));
    _onTick(remaining, timerTotal);
    if (remaining <= 0) { stopTimer(); playDone(); if (_onDone) _onDone(); }
  }
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  document.removeEventListener('visibilitychange', _onVisibility);
  timerEndTime = 0;
  _onTick = null;
  _onDone = null;
}

function togglePause() {
  if (timerPaused) {
    // Возобновляем: сдвигаем endTime вперёд на время паузы
    timerEndTime = Date.now() + timerRemAtPause;
    timerPaused = false;
  } else {
    // Пауза: запоминаем сколько осталось
    timerRemAtPause = Math.max(0, timerEndTime - Date.now());
    timerPaused = true;
  }
  const btn = document.getElementById('pause-btn');
  if (btn) btn.textContent = timerPaused ? '▶ Продолжить' : '⏸ Пауза';
}

function playDone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.15, 0.3].forEach(t => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 600;
      g.gain.setValueAtTime(0.3, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch (e) {}
}

function updateTimerUI(remaining, total) {
  const circle = document.getElementById('timer-circle');
  const label = document.getElementById('timer-label');
  if (!circle || !label) return;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = remaining / total;
  circle.style.strokeDashoffset = circumference * (1 - progress);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  label.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════
// BREATHING ANIMATION
// ═══════════════════════════════════════════════
let breathingRAF = null;

// Плавная анимация дыхания на requestAnimationFrame + обратный отсчёт секунд
function startBreathing(pattern, container) {
  stopBreathing();
  const inhale = pattern.inhale;
  const hold = pattern.hold || 0;
  const exhale = pattern.exhale;
  const cycleLen = inhale + hold + exhale;      // секунд в одном цикле
  const maxCycles = pattern.cycles || 5;
  const totalSec = cycleLen * maxCycles;

  const circle = container.querySelector('.breath-circle');
  const label = container.querySelector('.breath-label');
  const count = container.querySelector('.breath-count');
  const counter = container.querySelector('.breath-counter');
  if (!circle) return;

  const LABELS = { inhale: 'Вдох', hold: 'Задержка', exhale: 'Выдох' };
  const start = Date.now();
  let lastPhase = null;

  function frame() {
    const elapsed = (Date.now() - start) / 1000;

    if (elapsed >= totalSec) {
      circle.style.transform = 'scale(0.6)';
      circle.style.opacity = '0.6';
      circle.dataset.phase = 'done';
      if (label) label.textContent = 'Готово';
      if (count) count.textContent = '✓';
      if (counter) counter.textContent = `Цикл ${maxCycles} / ${maxCycles}`;
      stopBreathing();
      return;
    }

    const cycleIdx = Math.floor(elapsed / cycleLen);
    const t = elapsed - cycleIdx * cycleLen;    // секунда внутри цикла
    let phase, scale, remain;

    if (t < inhale) {
      phase = 'inhale';
      scale = 0.6 + 0.4 * (t / inhale);
      remain = Math.ceil(inhale - t);
    } else if (t < inhale + hold) {
      phase = 'hold';
      scale = 1;
      remain = Math.ceil(inhale + hold - t);
    } else {
      phase = 'exhale';
      scale = 1 - 0.4 * ((t - inhale - hold) / exhale);
      remain = Math.ceil(cycleLen - t);
    }

    circle.style.transform = `scale(${scale.toFixed(3)})`;
    circle.style.opacity = (0.55 + 0.45 * ((scale - 0.6) / 0.4)).toFixed(3);
    if (count) count.textContent = Math.max(1, remain);

    if (phase !== lastPhase) {
      circle.dataset.phase = phase;
      if (label) label.textContent = LABELS[phase];
      if (navigator.vibrate) { try { navigator.vibrate(20); } catch (e) {} }
      lastPhase = phase;
    }
    if (counter) counter.textContent = `Цикл ${cycleIdx + 1} / ${maxCycles}`;

    breathingRAF = requestAnimationFrame(frame);
  }

  frame();
}

function stopBreathing() {
  if (breathingRAF) { cancelAnimationFrame(breathingRAF); breathingRAF = null; }
}

// ═══════════════════════════════════════════════
// ROUTING & NAVIGATION
// ═══════════════════════════════════════════════
let currentView = 'home';
let trainingState = null;

const appEl = document.getElementById('app');

function navigate(view, params) {
  stopTimer();
  stopBreathing();
  stopMetronome();
  currentView = view;
  if (params) trainingState = params;
  render();
}

function render() {
  window.scrollTo(0, 0);
  switch (currentView) {
    case 'home':     renderHome(); break;
    case 'training': renderTraining(); break;
    case 'phase':    renderPhase(); break;
    case 'done':     renderDone(); break;
    case 'program':  renderProgram(); break;
    case 'reading':  renderReading(); break;
    case 'progress': renderProgress(); break;
  }
}

// ═══════════════════════════════════════════════
// HOME VIEW
// ═══════════════════════════════════════════════
function isStandalone() {
  return window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
}

// Напоминание: не тренировался сегодня
function renderReminderBanner() {
  const trainedToday = state.lastActiveDate === todayStr();
  const doneToday = isSessionDone(state.currentWeek, state.currentDay);
  if (trainedToday || doneToday) return '';

  const streak = state.streak || 0;
  const msg = streak >= 2
    ? `🔥 Серия <b>${streak} ${plural(streak, 'день', 'дня', 'дней')}</b> под угрозой — не пропусти сегодня!`
    : `📅 Сегодня ты ещё не тренировался. 20 минут — и готово.`;

  return `
    <div class="reminder-banner">
      <span class="reminder-text">${msg}</span>
      <button class="reminder-go" onclick="startTraining(${state.currentWeek}, ${state.currentDay})">Начать →</button>
    </div>
  `;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function renderHome() {
  const week = PROGRAM.weeks[state.currentWeek - 1];
  const done = isSessionDone(state.currentWeek, state.currentDay);
  const totalDays = totalCompleted();

  appEl.innerHTML = `
    <div class="view home-view">
      ${!isStandalone() ? `
        <div class="pwa-banner" id="pwa-banner">
          <div class="pwa-banner-content">
            <span class="pwa-icon">📲</span>
            <div class="pwa-text">
              <div class="pwa-title">Установи как приложение</div>
              <div class="pwa-sub">Safari → <b>Поделиться</b> → <b>«На экран "Домой"»</b></div>
            </div>
          </div>
          <button class="pwa-close" onclick="document.getElementById('pwa-banner').style.display='none'">✕</button>
        </div>
      ` : ''}
      <header class="hero">
        <div class="hero-inner">
          <div class="hero-logo">
            <svg class="hero-mark" viewBox="0 0 512 512" aria-hidden="true">
              <g fill="#fff">
                <rect x="112" y="181" width="40" height="150" rx="20"/>
                <rect x="174" y="132" width="40" height="248" rx="20"/>
                <rect x="236" y="96"  width="40" height="320" rx="20"/>
                <rect x="298" y="156" width="40" height="200" rx="20"/>
                <rect x="360" y="121" width="40" height="270" rx="20"/>
              </g>
            </svg>
            <div class="hero-wordmark">
              <div class="hero-title">Речевой</div>
              <div class="hero-sub">Тренажёр речи · 20 минут в день</div>
            </div>
          </div>
        </div>
      </header>

      ${renderReminderBanner()}

      <div class="home-stats">
        <div class="stat-card">
          <div class="stat-num">${state.streak}</div>
          <div class="stat-label">🔥 дней подряд</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${totalDays}</div>
          <div class="stat-label">✅ тренировок</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${state.currentWeek}</div>
          <div class="stat-label">📅 неделя</div>
        </div>
      </div>

      <div class="section-title">Сегодня</div>
      <div class="today-card ${done ? 'done' : ''}">
        <div class="today-header">
          <span class="week-badge">${week.icon} Неделя ${week.id}</span>
          <span class="day-badge">День ${state.currentDay}</span>
        </div>
        <div class="today-week-title">${week.title}</div>
        <div class="today-goal">${week.goal}</div>
        <div class="today-phases">
          ${week.phases.map(p => `<span class="phase-dot" style="background:${p.color}" title="${p.title}">${p.emoji}</span>`).join('')}
          <span class="today-time">20 мин</span>
        </div>
        ${done
          ? `<div class="done-banner">✅ Тренировка выполнена!</div>`
          : `<button class="btn-start" onclick="startTraining(${week.id}, ${state.currentDay})">
               Начать тренировку →
             </button>`
        }
      </div>

      <div class="tip-card">
        <div class="tip-label">💡 Фокус недели</div>
        <div class="tip-text">${week.tip}</div>
      </div>

      ${state.currentDay > 1 || state.currentWeek > 1 ? `
        <div class="section-title">Дни недели ${week.id}</div>
        <div class="days-row">
          ${Array.from({ length: 7 }, (_, i) => {
            const d = i + 1;
            const isDone = isSessionDone(week.id, d);
            const isCurrent = d === state.currentDay && week.id === state.currentWeek;
            return `<button class="day-btn ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}"
              onclick="startTraining(${week.id}, ${d})">
              ${isDone ? '✓' : d}
            </button>`;
          }).join('')}
        </div>
      ` : ''}
    </div>
    ${renderNav('home')}
  `;
}

// ═══════════════════════════════════════════════
// TRAINING VIEW — Phase selection
// ═══════════════════════════════════════════════
function startTraining(weekNum, dayNum) {
  navigate('training', { weekNum, dayNum, completedPhases: [] });
}

function renderTraining() {
  const { weekNum, dayNum } = trainingState;
  const week = PROGRAM.weeks[weekNum - 1];
  const done = isSessionDone(weekNum, dayNum);

  appEl.innerHTML = `
    <div class="view training-view">
      <div class="training-header">
        <button class="back-btn" onclick="navigate('home')">← Назад</button>
        <div class="training-title">${week.icon} Неделя ${weekNum} · День ${dayNum}</div>
        <div></div>
      </div>

      <div class="training-week-title">${week.title}</div>

      <div class="phases-list">
        ${week.phases.map((phase, i) => {
          const isDone = trainingState.completedPhases.includes(phase.id);
          return `
            <button class="phase-item ${isDone ? 'phase-done' : ''}"
              style="--phase-color: ${phase.color}"
              onclick="startPhase(${i})">
              <span class="phase-emoji">${phase.emoji}</span>
              <div class="phase-info">
                <div class="phase-name">${phase.title}</div>
                <div class="phase-meta">${Math.round(phase.seconds / 60)} мин</div>
              </div>
              <span class="phase-check">${isDone ? '✅' : '›'}</span>
            </button>
          `;
        }).join('')}
      </div>

      ${done
        ? `<div class="session-done-banner">🎉 Тренировка выполнена!</div>`
        : trainingState.completedPhases.length === week.phases.length
          ? `<button class="btn-complete" onclick="finishSession()">Завершить тренировку 🎉</button>`
          : `<div class="training-hint">Выполни все 5 этапов последовательно</div>`
      }
    </div>
    ${renderNav('')}
  `;
}

function startPhase(phaseIndex) {
  navigate('phase', { ...trainingState, phaseIndex });
}

// ═══════════════════════════════════════════════
// PHASE VIEW — Exercise + Timer
// ═══════════════════════════════════════════════
function renderPhase() {
  const { weekNum, dayNum, phaseIndex } = trainingState;
  const week = PROGRAM.weeks[weekNum - 1];
  const phase = week.phases[phaseIndex];
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  appEl.innerHTML = `
    <div class="view phase-view" style="--phase-color: ${phase.color}">
      <div class="phase-header">
        <button class="back-btn" onclick="stopTimer(); stopBreathing(); navigate('training')">← Назад</button>
        <div class="phase-title-bar">
          ${phase.emoji} ${phase.title}
        </div>
        <div></div>
      </div>

      <div class="timer-section">
        <svg class="timer-svg" viewBox="0 0 128 128">
          <circle class="timer-track" cx="64" cy="64" r="${radius}" />
          <circle id="timer-circle" class="timer-fill" cx="64" cy="64" r="${radius}"
            stroke="${phase.color}"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${circumference}"
            transform="rotate(-90 64 64)" />
        </svg>
        <div class="timer-center">
          <div id="timer-label" class="timer-label">--:--</div>
          <div class="timer-phase-name">${phase.title}</div>
        </div>
      </div>

      <div class="timer-controls">
        <button class="btn-timer-start" onclick="runPhaseTimer()">▶ Старт</button>
        <button id="pause-btn" class="btn-timer-pause" onclick="togglePause()">⏸ Пауза</button>
      </div>

      ${phase.breathingPattern ? renderBreathingGuide(phase.breathingPattern) : ''}

      <div class="phase-content-card">
        <div class="phase-content-text">${formatContent(phase.content)}</div>

        ${phase.twisters ? renderTwisters(phase.twisters) : ''}
        ${phase.warmupList ? renderWarmupList(phase.warmupList) : ''}
        ${phase.cameraTopics ? renderCameraTopics(phase.cameraTopics, dayNum) : ''}
        ${phase.parasiteCounter ? renderParasiteCounter() : ''}
        ${phase.hasAssessment ? renderAssessmentForm(weekNum, phase.isFinal) : ''}
      </div>

      <div class="phase-footer">
        <button class="btn-phase-done" onclick="markPhaseDone('${phase.id}')">
          Этап выполнен ✓
        </button>
      </div>
    </div>
  `;

  updateTimerUI(phase.seconds, phase.seconds);
}

function runPhaseTimer() {
  const { weekNum, phaseIndex } = trainingState;
  const phase = PROGRAM.weeks[weekNum - 1].phases[phaseIndex];

  document.querySelector('.btn-timer-start').disabled = true;
  document.querySelector('.btn-timer-start').textContent = '⏱ Идёт...';

  if (phase.breathingPattern) {
    const container = document.querySelector('.breathing-guide');
    if (container) startBreathing(phase.breathingPattern, container);
  }

  startTimer(phase.seconds, updateTimerUI, () => {
    const label = document.getElementById('timer-label');
    if (label) label.textContent = 'Готово!';
    const startBtn = document.querySelector('.btn-timer-start');
    if (startBtn) { startBtn.disabled = false; startBtn.textContent = '▶ Повторить'; }
    stopBreathing();
  });
}

function markPhaseDone(phaseId) {
  if (!trainingState.completedPhases.includes(phaseId)) {
    trainingState.completedPhases = [...trainingState.completedPhases, phaseId];
  }
  stopTimer();
  stopBreathing();

  const week = PROGRAM.weeks[trainingState.weekNum - 1];
  const allDone = week.phases.every(p => trainingState.completedPhases.includes(p.id));

  if (allDone) {
    navigate('done');
  } else {
    const nextIdx = week.phases.findIndex(p => !trainingState.completedPhases.includes(p.id));
    navigate('training');
    if (nextIdx >= 0) {
      setTimeout(() => startPhase(nextIdx), 100);
    }
  }
}

function renderBreathingGuide(pattern) {
  const { inhale, hold, exhale } = pattern;
  const holdLabel = hold > 0 ? ` · задержка ${hold}` : '';
  return `
    <div class="breathing-guide">
      <div class="breath-circle-wrap">
        <div class="breath-circle" data-phase="inhale">
          <span class="breath-count">${inhale}</span>
        </div>
        <div class="breath-label">Вдох</div>
      </div>
      <div class="breath-info">
        <div class="breath-pattern">Вдох ${inhale}${holdLabel} · выдох ${exhale}</div>
        <div class="breath-counter">Цикл 0 / ${pattern.cycles || 5}</div>
      </div>
    </div>
  `;
}

function renderTwisters(twisters) {
  return `
    <div class="twisters-section">
      <div class="twisters-title">Скороговорки</div>
      <div class="twisters-cards" id="twisters-wrap">
        ${twisters.map((t, i) => `
          <div class="twister-card" data-idx="${i}">
            <div class="twister-num">${i + 1}</div>
            <div class="twister-text">${t.replace(/\n/g, '<br>')}</div>
            <div class="twister-speeds">
              <button type="button" class="speed-tag" onclick="toggleTwisterPace(this, 60)">🐢 Медленно</button>
              <button type="button" class="speed-tag" onclick="toggleTwisterPace(this, 104)">🚶 Средне</button>
              <button type="button" class="speed-tag" onclick="toggleTwisterPace(this, 152)">🏃 Быстро</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── Метроном для скороговорок ───
let metroInterval = null;
let metroCtx = null;
let metroActiveTag = null;

function toggleTwisterPace(el, bpm) {
  const wasActive = metroActiveTag === el;
  stopMetronome();
  if (wasActive) return;          // повторный клик по той же — выключаем

  metroActiveTag = el;
  el.classList.add('pacing');
  metroBeat();
  metroInterval = setInterval(metroBeat, 60000 / bpm);
}

function metroBeat() {
  try {
    if (!metroCtx) metroCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (metroCtx.state === 'suspended') metroCtx.resume();
    const o = metroCtx.createOscillator();
    const g = metroCtx.createGain();
    o.connect(g); g.connect(metroCtx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.18, metroCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, metroCtx.currentTime + 0.07);
    o.start();
    o.stop(metroCtx.currentTime + 0.07);
  } catch (e) {}
  if (metroActiveTag) {
    const card = metroActiveTag.closest('.twister-card');
    if (card) { card.classList.remove('beat'); void card.offsetWidth; card.classList.add('beat'); }
  }
}

function stopMetronome() {
  if (metroInterval) { clearInterval(metroInterval); metroInterval = null; }
  document.querySelectorAll('.speed-tag.pacing').forEach(e => e.classList.remove('pacing'));
  document.querySelectorAll('.twister-card.beat').forEach(e => e.classList.remove('beat'));
  metroActiveTag = null;
}

function renderWarmupList(items) {
  return `
    <div class="warmup-list">
      ${items.map((item, i) => `
        <label class="warmup-item">
          <input type="checkbox" onchange="this.closest('.warmup-item').classList.toggle('checked', this.checked)">
          <span>${i + 1}. ${item}</span>
        </label>
      `).join('')}
    </div>
  `;
}

function renderCameraTopics(topics, day) {
  const todayTopic = topics[(day - 1) % topics.length];
  return `
    <div class="camera-topic-section">
      <div class="camera-topic-label">📹 Тема дня:</div>
      <div class="camera-topic-text">${todayTopic}</div>
      <div class="camera-all-label">Все темы:</div>
      ${topics.map((t, i) => `
        <div class="camera-topic-item ${t === todayTopic ? 'active' : ''}">
          <span class="topic-num">${i + 1}</span> ${t}
        </div>
      `).join('')}
    </div>
  `;
}

function renderParasiteCounter() {
  return `
    <div class="parasite-counter">
      <div class="parasite-title">🔢 Счётчик паразитов</div>
      <div class="parasite-rows">
        ${[
          { label: '«Эээ...»', key: 'eee' },
          { label: '«Ну...»', key: 'nu' },
          { label: '«Типа/как бы»', key: 'typa' },
          { label: '«Короче»', key: 'koroche' },
        ].map(p => `
          <div class="parasite-row">
            <span class="parasite-label">${p.label}</span>
            <div class="counter-controls">
              <button class="counter-btn" onclick="changeCount('${p.key}', -1)">−</button>
              <span class="counter-val" id="cnt-${p.key}">0</span>
              <button class="counter-btn" onclick="changeCount('${p.key}', 1)">+</button>
            </div>
          </div>
        `).join('')}
      </div>
      <button class="btn-save-parasite" onclick="saveParasiteCount()">💾 Записать результат</button>
      <div id="parasite-saved" class="parasite-saved"></div>
    </div>
  `;
}

function saveParasiteCount() {
  const rows = [
    { key: 'eee', label: '«Эээ...»' },
    { key: 'nu', label: '«Ну...»' },
    { key: 'typa', label: '«Типа/как бы»' },
    { key: 'koroche', label: '«Короче»' },
  ];
  const breakdown = {};
  let total = 0;
  rows.forEach(r => { const v = parasiteCounts[r.key] || 0; breakdown[r.key] = v; total += v; });

  if (!Array.isArray(state.parasiteLog)) state.parasiteLog = [];
  state.parasiteLog.push({
    at: new Date().toISOString(),
    week: trainingState?.weekNum || state.currentWeek,
    day: trainingState?.dayNum || state.currentDay,
    total,
    breakdown,
  });
  saveState();
  autoSaveToGist();

  const el = document.getElementById('parasite-saved');
  if (el) el.textContent = `✅ Записано: ${total} слов-паразитов. Смотри динамику во вкладке «Прогресс».`;
}

const parasiteCounts = {};

function changeCount(key, delta) {
  parasiteCounts[key] = Math.max(0, (parasiteCounts[key] || 0) + delta);
  const el = document.getElementById(`cnt-${key}`);
  if (el) el.textContent = parasiteCounts[key];
}

function renderAssessmentForm(weekNum, isFinal) {
  const saved = state.assessments[weekNum] || {};
  const criteria = [
    { key: 'diction', label: 'Чёткость дикции' },
    { key: 'tempo', label: 'Темп речи' },
    { key: 'voice', label: 'Уверенность голоса' },
    { key: 'intonation', label: 'Интонация' },
    { key: 'structure', label: 'Структура мысли' },
    { key: 'parasites', label: 'Мало слов-паразитов' },
  ];
  return `
    <div class="assessment-form" id="assessment-form">
      <div class="assessment-title">${isFinal ? '🏆 Финальная оценка' : '📊 Самооценка — Неделя ' + weekNum}</div>
      ${criteria.map(c => `
        <div class="assess-row">
          <div class="assess-label">${c.label}</div>
          <div class="assess-stars">
            ${[1,2,3,4,5,6,7,8,9,10].map(n => `
              <button class="star-btn ${(saved[c.key] || 0) >= n ? 'active' : ''}"
                onclick="setScore('${c.key}', ${n})" data-key="${c.key}" data-val="${n}">
                ${n}
              </button>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <button class="btn-save-assess" onclick="saveAssessmentFromForm(${weekNum})">Сохранить оценку</button>
      ${saved.at ? `<div class="assess-saved">✅ Сохранено</div>` : ''}
    </div>
  `;
}

function setScore(key, val) {
  const buttons = document.querySelectorAll(`[data-key="${key}"]`);
  buttons.forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.val) <= val);
  });
  document.querySelector('.btn-save-assess').dataset[key] = val;
}

function saveAssessmentFromForm(weekNum) {
  const criteria = ['diction', 'tempo', 'voice', 'intonation', 'structure', 'parasites'];
  const scores = {};
  criteria.forEach(key => {
    const active = document.querySelectorAll(`[data-key="${key}"].active`);
    scores[key] = active.length;
  });
  saveAssessment(weekNum, scores);
  const saved = document.querySelector('.assess-saved');
  if (saved) { saved.style.display = 'block'; }
  else {
    const form = document.getElementById('assessment-form');
    if (form) form.insertAdjacentHTML('beforeend', '<div class="assess-saved">✅ Сохранено</div>');
  }
}

function formatContent(text) {
  return text
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

// ═══════════════════════════════════════════════
// DONE VIEW
// ═══════════════════════════════════════════════
function renderDone() {
  const { weekNum, dayNum } = trainingState;
  completeSession(weekNum, dayNum);

  appEl.innerHTML = `
    <div class="view done-view">
      <div class="done-confetti">🎉</div>
      <div class="done-title">Тренировка завершена!</div>
      <div class="done-sub">Неделя ${weekNum} · День ${dayNum}</div>
      <div class="done-stats">
        <div class="done-stat">
          <div class="done-stat-num">${state.streak}</div>
          <div class="done-stat-label">🔥 дней подряд</div>
        </div>
        <div class="done-stat">
          <div class="done-stat-num">${totalCompleted()}</div>
          <div class="done-stat-label">✅ всего тренировок</div>
        </div>
      </div>
      <div class="done-message">${getDoneMessage()}</div>
      <button class="btn-home" onclick="navigate('home')">← На главную</button>
      ${state.currentWeek <= 8 && !isSessionDone(state.currentWeek, state.currentDay)
        ? `<button class="btn-next-day" onclick="startTraining(${state.currentWeek}, ${state.currentDay})">
             Следующий день →
           </button>`
        : ''
      }
    </div>
  `;
}

function getDoneMessage() {
  const msgs = [
    'Речь тренируется каждый день. Ты на правильном пути.',
    'Каждая тренировка — шаг к уверенной речи.',
    'Главное: не скорость, а чистота и систематичность.',
    'Пауза = уверенность. Ты это уже знаешь.',
    'Продолжай. Результат накапливается незаметно.',
  ];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

function finishSession() {
  navigate('done');
}

// ═══════════════════════════════════════════════
// PROGRAM VIEW
// ═══════════════════════════════════════════════
function renderProgram() {
  appEl.innerHTML = `
    <div class="view program-view">
      <div class="page-header">
        <div class="page-title">📋 Программа 8 недель</div>
        <div class="page-sub">20 минут в день</div>
      </div>
      <div class="weeks-list">
        ${PROGRAM.weeks.map(week => {
          const weekDone = Array.from({ length: 7 }, (_, i) => isSessionDone(week.id, i + 1)).filter(Boolean).length;
          const isCurrent = week.id === state.currentWeek;
          const isLocked = week.id > state.currentWeek;
          return `
            <div class="week-card ${isCurrent ? 'current' : ''} ${isLocked ? 'locked' : ''}"
              onclick="${isLocked ? '' : `showWeekDetail(${week.id})`}">
              <div class="week-card-header">
                <div class="week-icon">${week.icon}</div>
                <div class="week-info">
                  <div class="week-num">Неделя ${week.id}</div>
                  <div class="week-card-title">${week.title}</div>
                </div>
                <div class="week-progress-wrap">
                  <div class="week-days-done">${weekDone}/7</div>
                  ${isLocked ? '<div class="lock">🔒</div>' : ''}
                </div>
              </div>
              <div class="week-goal">${week.goal}</div>
              <div class="week-progress-bar">
                <div class="week-progress-fill" style="width: ${(weekDone / 7) * 100}%"></div>
              </div>
              <div class="week-phases-preview">
                ${week.phases.map(p => `<span style="color:${p.color}">${p.emoji}</span>`).join(' ')}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="daily-template-card">
        <div class="template-title">⏱ Ежедневный шаблон — 20 минут</div>
        ${[
          { emoji: '💨', title: 'Дыхание', min: 3, color: '#6366F1' },
          { emoji: '👄', title: 'Артикуляция', min: 5, color: '#EC4899' },
          { emoji: '🗣️', title: 'Дикция', min: 4, color: '#F59E0B' },
          { emoji: '🎵', title: 'Голос', min: 3, color: '#10B981' },
          { emoji: '🎙️', title: 'Речь', min: 5, color: '#8B5CF6' },
        ].map(p => `
          <div class="template-row" style="--c: ${p.color}">
            <span class="template-emoji">${p.emoji}</span>
            <span class="template-name">${p.title}</span>
            <span class="template-mins">${p.min} мин</span>
          </div>
        `).join('')}
      </div>
    </div>
    ${renderNav('program')}
  `;
}

function showWeekDetail(weekNum) {
  const week = PROGRAM.weeks[weekNum - 1];
  appEl.innerHTML = `
    <div class="view week-detail-view">
      <div class="training-header">
        <button class="back-btn" onclick="navigate('program')">← Назад</button>
        <div class="training-title">${week.icon} Неделя ${weekNum}</div>
        <div></div>
      </div>
      <div class="week-detail-title">${week.title}</div>
      <div class="week-detail-goal">${week.goal}</div>
      <div class="tip-card"><div class="tip-label">💡</div><div class="tip-text">${week.tip}</div></div>

      <div class="section-title">Этапы тренировки</div>
      ${week.phases.map(p => `
        <div class="phase-detail-card" style="border-left: 4px solid ${p.color}">
          <div class="phase-detail-header">
            <span>${p.emoji}</span>
            <span class="phase-detail-title">${p.title}</span>
            <span class="phase-detail-time">${Math.round(p.seconds / 60)} мин</span>
          </div>
          <div class="phase-detail-content">${formatContent(p.content)}</div>
        </div>
      `).join('')}

      <div class="section-title">Дни</div>
      <div class="days-row">
        ${Array.from({ length: 7 }, (_, i) => {
          const d = i + 1;
          const isDone = isSessionDone(weekNum, d);
          const isCurrent = d === state.currentDay && weekNum === state.currentWeek;
          return `<button class="day-btn ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}"
            onclick="startTraining(${weekNum}, ${d})">
            ${isDone ? '✓' : d}
          </button>`;
        }).join('')}
      </div>
      <button class="btn-start" style="margin:16px 0 32px" onclick="startTraining(${weekNum}, ${
        state.currentWeek === weekNum ? state.currentDay : 1
      })">Тренироваться →</button>
    </div>
    ${renderNav('program')}
  `;
}

// ═══════════════════════════════════════════════
// READING VIEW — тексты для чтения вслух
// ═══════════════════════════════════════════════
function renderReading() {
  const texts = (typeof READING_TEXTS !== 'undefined') ? READING_TEXTS : [];
  appEl.innerHTML = `
    <div class="view reading-view">
      <div class="page-header">
        <div class="page-title">📖 Тексты для чтения</div>
        <div class="page-sub">Читай вслух — медленно и чисто</div>
      </div>

      <div class="reading-tip">
        💡 Проговаривай каждое окончание. После запятой — короткая пауза,
        после точки — длинная. Не торопись заполнять тишину.
      </div>

      <div class="reading-list">
        ${texts.map(t => `
          <div class="reading-card">
            <div class="reading-card-top">
              <span class="reading-level">${t.level}</span>
            </div>
            <div class="reading-title">${t.title}</div>
            <div class="reading-body">${t.text.replace(/\n/g, '<br>')}</div>
            <div class="reading-source">${t.author} · ${t.source}</div>
          </div>
        `).join('')}
      </div>

      <div class="reading-footer">
        Все тексты — классика в общественном достоянии (public domain).
      </div>
    </div>
    ${renderNav('reading')}
  `;
}

// ═══════════════════════════════════════════════
// PROGRESS VIEW
// ═══════════════════════════════════════════════
function renderProgress() {
  const totalDays = totalCompleted();
  const weeksCompleted = Math.floor(totalDays / 7);

  appEl.innerHTML = `
    <div class="view progress-view">
      <div class="page-header">
        <div class="page-title">📈 Прогресс</div>
        <div class="page-sub">Твои результаты</div>
      </div>

      <div class="progress-hero-stats">
        <div class="p-stat">
          <div class="p-stat-num">${state.streak}</div>
          <div class="p-stat-label">🔥 Серия дней</div>
        </div>
        <div class="p-stat">
          <div class="p-stat-num">${totalDays}</div>
          <div class="p-stat-label">✅ Тренировок</div>
        </div>
        <div class="p-stat">
          <div class="p-stat-num">${totalDays * 20}</div>
          <div class="p-stat-label">⏱ Минут практики</div>
        </div>
      </div>

      <div class="section-title">По неделям</div>
      ${PROGRAM.weeks.map(week => {
        const weekDone = Array.from({ length: 7 }, (_, i) => isSessionDone(week.id, i + 1)).filter(Boolean).length;
        const pct = Math.round((weekDone / 7) * 100);
        return `
          <div class="week-progress-row">
            <div class="wpr-header">
              <span>${week.icon} Неделя ${week.id}</span>
              <span class="wpr-count">${weekDone}/7 дней</span>
            </div>
            <div class="wpr-bar"><div class="wpr-fill" style="width:${pct}%; background:${pct === 100 ? '#10B981' : '#6366F1'}"></div></div>
          </div>
        `;
      }).join('')}

      ${Object.keys(state.assessments).length > 0 ? `
        <div class="section-title">Самооценка</div>
        ${renderAssessmentHistory()}
      ` : ''}

      ${(state.parasiteLog && state.parasiteLog.length > 0) ? `
        <div class="section-title">🚫 Слова-паразиты</div>
        ${renderParasiteChart()}
      ` : ''}

      <div class="section-title">Цели программы</div>
      <div class="goals-list">
        ${[
          '✅ Меньше «каши» и проглатывания окончаний',
          '✅ Ниже зажим, ровнее голос',
          '✅ Меньше «эээ», «ну», «короче»',
          '✅ Убедительнее для продаж и переговоров',
          '✅ Лучше темп, паузы, интонация',
        ].map(g => `<div class="goal-item">${g}</div>`).join('')}
      </div>

      <div class="section-title">☁️ Синхронизация</div>
      <div class="gist-sync-card">
        ${getGistConfig()?.token
          ? `<div class="gist-connected">✅ Подключён к GitHub Gist</div>`
          : `<div class="gist-hint">Сохраняй прогресс в облако — работает на любом устройстве и браузере</div>`
        }
        <div class="gist-btns">
          <button id="gist-save-btn" class="btn-gist-save" onclick="saveToGist()">☁️ Сохранить</button>
          <button id="gist-load-btn" class="btn-gist-load" onclick="loadFromGist()">📥 Загрузить</button>
        </div>
        <div id="gist-status" class="gist-status"></div>
        ${!getGistConfig()?.token
          ? `<button class="btn-gist-setup" onclick="showGistSetup()">🔑 Подключить GitHub →</button>`
          : `<button class="btn-gist-reset" onclick="resetGistConfig()">Изменить токен</button>`
        }
      </div>

      <div class="reset-section">
        <button class="btn-reset" onclick="resetState()">Сбросить прогресс</button>
      </div>
    </div>
    ${renderNav('progress')}

    <div id="gist-modal" class="gist-modal" style="display:none" onclick="if(event.target===this)hideGistModal()">
      <div class="gist-modal-inner">
        <div class="gist-modal-title">🔑 Подключение GitHub</div>
        <div class="gist-steps">
          <div class="gist-step"><span class="step-num">1</span>Нажми кнопку ниже — откроется GitHub</div>
          <div class="gist-step"><span class="step-num">2</span>Нажми зелёную кнопку <b>"Generate token"</b></div>
          <div class="gist-step"><span class="step-num">3</span>Скопируй токен и вставь сюда</div>
        </div>
        <a href="https://github.com/settings/tokens/new?scopes=gist&description=SpeechTrainer"
           target="_blank" class="btn-open-github">Открыть GitHub →</a>
        <input id="gist-token-input" class="gist-token-input"
               type="password" placeholder="ghp_xxxxxxxxxxxxxxxx"
               autocomplete="off" autocorrect="off" spellcheck="false" />
        <button class="btn-save-token" onclick="saveGistToken()">Сохранить и подключить</button>
        <button class="btn-cancel-modal" onclick="hideGistModal()">Отмена</button>
      </div>
    </div>
  `;
}

function renderParasiteChart() {
  const log = (state.parasiteLog || []).slice(-12);
  const max = Math.max(1, ...log.map(e => e.total));
  const first = log[0]?.total;
  const last = log[log.length - 1]?.total;
  let trend = '';
  if (log.length >= 2 && first != null) {
    if (last < first) trend = `<div class="parasite-trend good">↓ Стало меньше: с ${first} до ${last}. Так держать!</div>`;
    else if (last > first) trend = `<div class="parasite-trend bad">↑ Пока больше: с ${first} до ${last}. Помни: хочешь «эээ» — молчи 1 секунду.</div>`;
    else trend = `<div class="parasite-trend">→ Держится на уровне ${last}.</div>`;
  }
  return `
    <div class="parasite-chart-card">
      <div class="parasite-chart">
        ${log.map(e => {
          const h = Math.round((e.total / max) * 100);
          const d = new Date(e.at);
          const lbl = `${d.getDate()}.${d.getMonth() + 1}`;
          return `
            <div class="pc-col" title="Неделя ${e.week}, день ${e.day}: ${e.total}">
              <div class="pc-val">${e.total}</div>
              <div class="pc-bar" style="height:${Math.max(4, h)}%"></div>
              <div class="pc-lbl">${lbl}</div>
            </div>
          `;
        }).join('')}
      </div>
      ${trend}
    </div>
  `;
}

function renderAssessmentHistory() {
  const criteria = [
    { key: 'diction', label: 'Дикция' },
    { key: 'tempo', label: 'Темп' },
    { key: 'voice', label: 'Голос' },
    { key: 'intonation', label: 'Интонация' },
    { key: 'structure', label: 'Структура' },
    { key: 'parasites', label: 'Без паразитов' },
  ];
  const weeks = Object.keys(state.assessments).sort();
  return `
    <div class="assessment-history">
      ${weeks.map(w => {
        const scores = state.assessments[w];
        return `
          <div class="assess-history-card">
            <div class="assess-history-week">Неделя ${w}</div>
            ${criteria.map(c => `
              <div class="assess-history-row">
                <span class="ahr-label">${c.label}</span>
                <div class="ahr-bar">
                  <div class="ahr-fill" style="width:${((scores[c.key] || 0) / 10) * 100}%"></div>
                </div>
                <span class="ahr-val">${scores[c.key] || 0}/10</span>
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ═══════════════════════════════════════════════
// BOTTOM NAV
// ═══════════════════════════════════════════════
function renderNav(active) {
  const tabs = [
    { id: 'home', label: 'Главная', icon: '🏠' },
    { id: 'program', label: 'Программа', icon: '📋' },
    { id: 'reading', label: 'Тексты', icon: '📖' },
    { id: 'progress', label: 'Прогресс', icon: '📈' },
  ];
  return `
    <nav class="bottom-nav">
      ${tabs.map(t => `
        <button class="nav-btn ${active === t.id ? 'active' : ''}" onclick="navigate('${t.id}')">
          <span class="nav-icon">${t.icon}</span>
          <span class="nav-label">${t.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

// ═══════════════════════════════════════════════
// GITHUB GIST SYNC
// ═══════════════════════════════════════════════
const GIST_CONFIG_KEY = 'speech_gist_v1';
const GIST_FILENAME = 'speech_trainer_progress.json';

function getGistConfig() {
  try { return JSON.parse(localStorage.getItem(GIST_CONFIG_KEY) || 'null'); } catch { return null; }
}

function saveGistConfig(cfg) {
  localStorage.setItem(GIST_CONFIG_KEY, JSON.stringify(cfg));
}

function resetGistConfig() {
  if (!confirm('Отключить текущий токен?')) return;
  localStorage.removeItem(GIST_CONFIG_KEY);
  navigate('progress');
}

async function saveToGist() {
  const cfg = getGistConfig();
  if (!cfg?.token) { showGistSetup(); return; }

  setGistBtn('save', 'Сохраняем...', true);
  try {
    const body = {
      description: 'Speech Trainer Progress',
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify(state, null, 2) } },
    };
    const url = cfg.gistId
      ? `https://api.github.com/gists/${cfg.gistId}`
      : 'https://api.github.com/gists';
    const res = await fetch(url, {
      method: cfg.gistId ? 'PATCH' : 'POST',
      headers: gistHeaders(cfg.token),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GitHub вернул ${res.status}`);
    const data = await res.json();
    saveGistConfig({ ...cfg, gistId: data.id });
    gistStatus('✅ Сохранено в облако!', 'ok');
  } catch (e) {
    gistStatus('❌ ' + e.message, 'err');
  } finally {
    setGistBtn('save', '☁️ Сохранить', false);
  }
}

async function loadFromGist() {
  const cfg = getGistConfig();
  if (!cfg?.token) { showGistSetup(); return; }
  if (!cfg?.gistId) { gistStatus('Сначала сохрани прогресс', 'err'); return; }

  setGistBtn('load', 'Загружаем...', true);
  try {
    const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, {
      headers: gistHeaders(cfg.token),
    });
    if (!res.ok) throw new Error(`GitHub вернул ${res.status}`);
    const data = await res.json();
    const content = data.files[GIST_FILENAME]?.content;
    if (!content) throw new Error('Файл не найден в Gist');
    Object.assign(state, JSON.parse(content));
    saveState();
    gistStatus('✅ Прогресс загружен!', 'ok');
    setTimeout(() => navigate('home'), 1200);
  } catch (e) {
    gistStatus('❌ ' + e.message, 'err');
  } finally {
    setGistBtn('load', '📥 Загрузить', false);
  }
}

function gistHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

function setGistBtn(which, text, disabled) {
  const btn = document.getElementById(`gist-${which}-btn`);
  if (btn) { btn.textContent = text; btn.disabled = disabled; }
}

function gistStatus(msg, type) {
  const el = document.getElementById('gist-status');
  if (el) { el.textContent = msg; el.className = `gist-status ${type}`; }
}

function showGistSetup() {
  const m = document.getElementById('gist-modal');
  if (m) m.style.display = 'flex';
}

function hideGistModal() {
  const m = document.getElementById('gist-modal');
  if (m) m.style.display = 'none';
}

function saveGistToken() {
  const input = document.getElementById('gist-token-input');
  const token = input?.value?.trim();
  if (!token || !token.startsWith('ghp_')) {
    alert('Токен должен начинаться с ghp_');
    return;
  }
  const cfg = getGistConfig() || {};
  saveGistConfig({ ...cfg, token });
  hideGistModal();
  saveToGist();
}

// ═══════════════════════════════════════════════
// GIST AUTO-SYNC HELPERS
// ═══════════════════════════════════════════════

// Silent save — called after each session, no UI feedback needed
async function autoSaveToGist() {
  const cfg = getGistConfig();
  if (!cfg?.token) return;
  try {
    const body = {
      description: 'Speech Trainer Progress',
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify(state, null, 2) } },
    };
    const url = cfg.gistId
      ? `https://api.github.com/gists/${cfg.gistId}`
      : 'https://api.github.com/gists';
    const res = await fetch(url, {
      method: cfg.gistId ? 'PATCH' : 'POST',
      headers: gistHeaders(cfg.token),
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      saveGistConfig({ ...cfg, gistId: data.id });
    }
  } catch (e) {}
}

// On startup: if cloud has more progress than local, restore from cloud
async function autoLoadFromGist() {
  const cfg = getGistConfig();
  if (!cfg?.token || !cfg?.gistId) return;
  try {
    const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, {
      headers: gistHeaders(cfg.token),
    });
    if (!res.ok) return;
    const data = await res.json();
    const content = data.files[GIST_FILENAME]?.content;
    if (!content) return;
    const remote = JSON.parse(content);
    const localCount = Object.keys(state.completedSessions || {}).length;
    const remoteCount = Object.keys(remote.completedSessions || {}).length;
    if (remoteCount > localCount) {
      Object.assign(state, remote);
      saveState();
      render();
    }
  } catch (e) {}
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
loadState();
render();
autoLoadFromGist();
