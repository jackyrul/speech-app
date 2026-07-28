'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load-browser.js');

test('exercise library groups every phase of all 8 weeks', () => {
  const { exports: X } = load();
  const lib = X.getExerciseLibrary();
  assert.equal(lib.length, 5, 'five phase groups');
  const ids = lib.map((g) => g.id);
  assert.deepEqual(Array.from(ids), ['breathing', 'articulation', 'diction', 'voice', 'speech']);
  for (const g of lib) {
    assert.equal(g.items.length, 8, `${g.id}: one entry per week`);
  }
});

test('exercises view lists items, random card and twisters', () => {
  const { exports: X, el } = load();
  X.state.currentWeek = 3;
  X.renderExercises();
  const html = el.innerHTML;
  assert.equal((html.match(/ex-item /g) || []).length + (html.match(/ex-item"/g) || []).length, 40, '40 exercises');
  assert.match(html, /ex-random-card/);
  assert.match(html, /tw-group/, 'tongue twisters by sound');
  assert.match(html, /Р — Л/, 'sound groups rendered');
});

test('free phase does not touch day progress and returns to the list', () => {
  const { exports: X, el } = load();
  X.state.completedSessions = {};
  X.state.dayProgress = null;
  X.startFreePhase(4, 2);
  assert.equal(X.state.dayProgress, null, 'free practice leaves progress untouched');
  // «Готово» в свободном режиме возвращает в список, а не отмечает этап
  assert.match(el.innerHTML, /navigate\('exercises'\)/);
  assert.doesNotMatch(el.innerHTML, /markPhaseDone/, 'no progress marking in free mode');
});

test('twisters are full-length and grouped by sound', () => {
  const { exports: X } = load();
  assert.ok(X.TWISTERS_BY_SOUND.length >= 5, 'five sound groups');
  const all = X.TWISTERS_BY_SOUND.flatMap((g) => g.items);
  assert.ok(all.length >= 18, `at least 18 twisters, got ${all.length}`);
  // «На дворе трава» теперь полная — с продолжением
  assert.match(X.TWISTERS_MAIN[0], /не руби дрова/);
  assert.match(X.TWISTERS_MAIN[1], /кларнет/);
});

test('voice phrases render in phases flagged voicePhrases', () => {
  const { exports: X } = load();
  const w2voice = X.PROGRAM.weeks[1].phases.find((p) => p.id === 'voice');
  assert.equal(w2voice.voicePhrases, true, 'week 2 voice phase asks for sentences');
  const html = X.renderVoicePhrases(2, 1);
  assert.match(html, /phrase-line/);
  assert.equal((html.match(/phrase-line/g) || []).length, 3, 'three sentences');
});
