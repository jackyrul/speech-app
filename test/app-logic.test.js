'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load-browser.js');

test('sessionKey formats week-day', () => {
  const { exports: X } = load();
  assert.equal(X.sessionKey(1, 1), '1-1');
  assert.equal(X.sessionKey(8, 7), '8-7');
});

test('plural picks Slavic forms correctly', () => {
  const { exports: X } = load();
  const f = (n) => X.plural(n, 'день', 'дня', 'дней');
  assert.equal(f(1), 'день');
  assert.equal(f(2), 'дня');
  assert.equal(f(4), 'дня');
  assert.equal(f(5), 'дней');
  assert.equal(f(11), 'дней');
  assert.equal(f(21), 'день');
  assert.equal(f(22), 'дня');
  assert.equal(f(25), 'дней');
});

test('advanceProgress moves day, week, and stops at the end', () => {
  const { exports: X } = load();
  X.state.currentWeek = 1; X.state.currentDay = 1;
  X.advanceProgress(1, 1);
  assert.deepEqual([X.state.currentWeek, X.state.currentDay], [1, 2]);

  X.state.currentWeek = 1; X.state.currentDay = 7;
  X.advanceProgress(1, 7);
  assert.deepEqual([X.state.currentWeek, X.state.currentDay], [2, 1]);

  X.state.currentWeek = 8; X.state.currentDay = 7;
  X.advanceProgress(8, 7);
  assert.deepEqual([X.state.currentWeek, X.state.currentDay], [8, 7], 'stays at final');
});

test('completeSession marks done, counts, and is idempotent', () => {
  const { exports: X } = load();
  X.state.completedSessions = {};
  X.state.currentWeek = 1; X.state.currentDay = 1;
  assert.equal(X.isSessionDone(1, 1), false);
  X.completeSession(1, 1);
  assert.equal(X.isSessionDone(1, 1), true);
  assert.equal(X.totalCompleted(), 1);
  X.completeSession(1, 1); // repeat
  assert.equal(X.totalCompleted(), 1, 'no double count');
});

test('updateStreak increments from yesterday, resets after a gap', () => {
  const { exports: X } = load();
  const iso = (d) => d.toISOString().split('T')[0];
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const longAgo = new Date(); longAgo.setDate(longAgo.getDate() - 5);

  X.state.streak = 3; X.state.lastActiveDate = iso(yesterday);
  X.updateStreak();
  assert.equal(X.state.streak, 4, 'continues streak');

  X.state.streak = 9; X.state.lastActiveDate = iso(longAgo);
  X.updateStreak();
  assert.equal(X.state.streak, 1, 'resets after gap');
});

test('getWeek returns RU base and localized UK content', () => {
  const { exports: X } = load();
  X.state.lang = 'ru';
  const ru = X.getWeek(1);
  assert.equal(ru.title, X.PROGRAM.weeks[0].title);

  X.state.lang = 'uk';
  const uk = X.getWeek(1);
  assert.equal(uk.title, X.WEEK_META.uk[1].title);
  assert.equal(uk.phases[0].title, X.PHASE_TITLES.uk.breathing);
  assert.equal(uk.phases[0].content, X.PHASE_CONTENT.uk[1].breathing);
});

test('getWeek swaps to extra twisters on week 5', () => {
  const { exports: X } = load();
  X.state.lang = 'uk';
  const wk5 = X.getWeek(5);
  const diction = wk5.phases.find((p) => p.id === 'diction');
  assert.deepEqual(diction.twisters, X.TWISTERS_I18N.uk.extra);
});

test('getReadingTexts follows the active language', () => {
  const { exports: X } = load();
  X.state.lang = 'ru';
  assert.equal(X.getReadingTexts(), X.READING_TEXTS);
  X.state.lang = 'en';
  assert.equal(X.getReadingTexts(), X.READING_I18N.en);
});

test('t falls back to ru for unknown lang; tf interpolates', () => {
  const { exports: X } = load();
  X.state.lang = 'ru';
  assert.equal(X.t('navHome'), 'Главная');
  assert.equal(X.tf('minShort', { n: 5 }), '5 мин');
  X.state.lang = 'en';
  assert.equal(X.tf('minShort', { n: 3 }), '3 min');
});
