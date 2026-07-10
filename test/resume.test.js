'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load-browser.js');

const PHASES = ['breathing', 'articulation', 'diction', 'voice', 'speech'];

test('markPhaseDone persists dayProgress for resume', () => {
  const { exports: X } = load();
  X.state.completedSessions = {};
  X.startTraining(1, 1);
  X.markPhaseDone('breathing');
  assert.ok(X.state.dayProgress, 'dayProgress saved');
  assert.equal(X.state.dayProgress.week, 1);
  assert.equal(X.state.dayProgress.day, 1);
  assert.deepEqual(Array.from(X.state.dayProgress.completedPhases), ['breathing']);
});

test('startTraining restores completedPhases from dayProgress', () => {
  const { exports: X, el } = load();
  X.state.completedSessions = {};
  X.state.dayProgress = { week: 2, day: 3, completedPhases: ['breathing', 'articulation'] };
  X.startTraining(2, 3);
  // renderTraining показывает 2 выполненных этапа
  assert.match(el.innerHTML, /phase-done/, 'training view marks resumed phases');
});

test('startTraining ignores dayProgress from another day', () => {
  const { exports: X } = load();
  X.state.completedSessions = {};
  X.state.dayProgress = { week: 1, day: 2, completedPhases: ['breathing'] };
  X.startTraining(1, 3);
  X.markPhaseDone('diction');
  assert.deepEqual(Array.from(X.state.dayProgress.completedPhases), ['diction'], 'fresh start, not resumed');
});

test('renderHome shows resume button with phase count', () => {
  const { exports: X, el } = load();
  X.state.completedSessions = {};
  X.state.currentWeek = 1;
  X.state.currentDay = 1;
  X.state.dayProgress = { week: 1, day: 1, completedPhases: ['breathing', 'articulation', 'diction'] };
  X.renderHome();
  assert.match(el.innerHTML, /Продолжить \(3\/5\)/);
});

test('completeSession clears dayProgress', () => {
  const { exports: X } = load();
  X.state.completedSessions = {};
  X.state.dayProgress = { week: 1, day: 1, completedPhases: ['breathing'] };
  X.completeSession(1, 1);
  assert.equal(X.state.dayProgress, null);
});

test('finishing day 7 renders the week summary screen', () => {
  const { exports: X, el } = load();
  X.state.completedSessions = {};
  X.state.currentWeek = 1;
  X.state.currentDay = 7;
  X.startTraining(1, 7);
  for (const p of PHASES) X.markPhaseDone(p);
  assert.equal(X.isSessionDone(1, 7), true);
  assert.match(el.innerHTML, /Неделя 1 завершена/, 'week summary title');
  assert.match(el.innerHTML, /Дальше — неделя 2/, 'next week preview');
  assert.equal(X.state.dayProgress, null, 'dayProgress cleared after completion');
});

test('finishing week 8 day 7 shows the final message instead of next week', () => {
  const { exports: X, el } = load();
  X.state.completedSessions = {};
  X.state.currentWeek = 8;
  X.state.currentDay = 7;
  X.startTraining(8, 7);
  for (const p of PHASES) X.markPhaseDone(p);
  assert.match(el.innerHTML, /Неделя 8 завершена/);
  assert.match(el.innerHTML, /Вся программа пройдена/);
  assert.doesNotMatch(el.innerHTML, /Дальше — неделя/);
});
