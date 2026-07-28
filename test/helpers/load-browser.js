'use strict';

// Загружает data.js + i18n.js + app.js в один общий scope (как в браузере,
// где это отдельные <script> с общим глобальным объектом), с минимальными
// DOM-заглушками. Без внешних зависимостей — через встроенный vm.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function elStub() {
  const el = {
    innerHTML: '', textContent: '', className: '', value: '', disabled: false,
    style: {}, dataset: {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    insertAdjacentHTML() {},
    getContext() { return null; },
    classList: { add() {}, remove() {}, toggle() {} },
    offsetWidth: 0,
  };
  return el;
}

// options: { push: bool, standalone: bool, userAgent, permission, subscribe, fetch, gistConfig }
function load(options = {}) {
  const opts = Object.assign({
    push: true,
    standalone: false,
    userAgent: 'node-test',
    permission: 'granted',
  }, options);

  const store = {};
  if (opts.gistConfig) store['speech_gist_v1'] = JSON.stringify(opts.gistConfig);

  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };

  const sharedEl = elStub();
  const document = {
    body: elStub(),
    getElementById: () => sharedEl,
    querySelector: () => sharedEl,
    querySelectorAll: () => [],
    createElement: () => elStub(),
    addEventListener() {}, removeEventListener() {},
    _el: sharedEl,
  };

  const navigator = {
    userAgent: opts.userAgent,
    standalone: opts.standalone,
    vibrate() {},
  };
  if (opts.mic) {
    navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [] }) };
  }
  if (opts.push) {
    navigator.serviceWorker = {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => null,
          subscribe: async () => (opts.subscribe || { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc' }) }),
        },
      }),
    };
  }

  const audioNode = {
    connect() {}, frequency: {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    start() {}, stop() {},
  };

  const sandbox = {
    console,
    localStorage,
    document,
    navigator,
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    fetch: opts.fetch || (async () => ({ ok: true, status: 200, json: async () => ({}) })),
    confirm: () => true,
    alert: () => {},
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
  };
  if (opts.mic) {
    const MR = function () { this.state = 'inactive'; };
    MR.isTypeSupported = (m) => m === 'audio/mp4';
    sandbox.MediaRecorder = MR;
    sandbox.indexedDB = { open: () => ({}) };
  }

  const windowObj = {
    navigator,
    matchMedia: () => ({ matches: !!opts.standalone }),
    scrollTo() {},
    AudioContext: function () { return { createOscillator: () => audioNode, createGain: () => audioNode, currentTime: 0, state: 'running', resume() {} }; },
  };
  if (opts.push) {
    windowObj.PushManager = function () {};
    sandbox.Notification = { permission: opts.permission, requestPermission: async () => opts.permission };
    windowObj.Notification = sandbox.Notification;
  }
  sandbox.window = windowObj;

  const EXPORT_NAMES = [
    // data
    'PROGRAM', 'READING_TEXTS', 'WARMUP_FULL', 'TWISTERS_MAIN', 'TWISTERS_EXTRA', 'CAMERA_TOPICS',
    // i18n
    'UI', 'LANGS', 'LANG_LABELS', 'PHASE_TITLES', 'WEEK_META', 'PHASE_CONTENT',
    'WARMUP_I18N', 'TWISTERS_I18N', 'CAMERA_I18N', 'READING_I18N',
    // app: constants
    'VAPID_PUBLIC_KEY', 'PUSH_FILENAME', 'state',
    // app: functions
    'sessionKey', 'isSessionDone', 'completeSession', 'updateStreak', 'advanceProgress',
    'totalCompleted', 'plural', 't', 'tf', 'curLang', 'getUI', 'getWeek', 'getReadingTexts',
    'setLang', 'urlBase64ToUint8Array', 'pushSupported', 'enablePush', 'savePushSubscription',
    'renderPushSection', 'renderReminderBanner', 'saveState', 'loadState', 'todayStr',
    'startTraining', 'markPhaseDone', 'renderHome', 'renderProgress',
    'renderOnboarding', 'dismissOnboarding', 'renderHeatmap',
    'renderHumGuide', 'showWeekDetail', 'showSettings', 'hideSettings',
    'renderStructureTrainer', 'renderInfo', 'getStructures',
    'startPhase', 'attachPhaseSwipe', 'shareRecording', 'NAV_ICONS',
    'getExerciseLibrary', 'renderExercises', 'startFreePhase', 'renderVoicePhrases',
    'TWISTERS_BY_SOUND', 'TWISTERS_MAIN', 'VOICE_PHRASES', 'trainingState',
    'STRUCTURES_I18N', 'STRUCT_TOPICS_I18N', 'INFO_TRAINING_I18N',
    // recorder
    'recPickMime', 'recSelectPrunable', 'recSupported', 'renderRecorderSection',
  ];

  const src = [
    fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'js', 'recorder.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8'),
    '\n;globalThis.__exports = {};',
    ...EXPORT_NAMES.map((n) => `try { globalThis.__exports.${n} = ${n}; } catch (e) {}`),
  ].join('\n');

  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'combined.js' });

  return { exports: sandbox.__exports, sandbox, el: sharedEl, store };
}

module.exports = { load };
