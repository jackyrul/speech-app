'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load-browser.js');

test('voice phases carry a humPattern (hum 10 / inhale 5)', () => {
  const { exports: X } = load();
  const withHum = X.PROGRAM.weeks.filter((w) => {
    const v = w.phases.find((p) => p.id === 'voice');
    return v && v.humPattern;
  });
  assert.ok(withHum.length >= 6, `expected most weeks to have humPattern, got ${withHum.length}`);
  const w1 = X.PROGRAM.weeks[0].phases.find((p) => p.id === 'voice');
  assert.equal(w1.humPattern.hum, 10);
  assert.equal(w1.humPattern.inhale, 5);
  assert.equal(w1.humPattern.cycles, 5);
});

test('renderHumGuide renders circle with pattern label', () => {
  const { exports: X } = load();
  const html = X.renderHumGuide({ hum: 10, inhale: 5, cycles: 3 });
  assert.match(html, /hum-guide/);
  assert.match(html, /breath-circle/);
  assert.match(html, /Мммм/);
  assert.match(html, /Цикл 0 \/ 3/);
});

test('locked week detail shows preview banner without training buttons', () => {
  const { exports: X, el } = load();
  X.state.currentWeek = 1;
  X.showWeekDetail(5);
  assert.match(el.innerHTML, /locked-banner/);
  assert.match(el.innerHTML, /Предпросмотр/);
  assert.doesNotMatch(el.innerHTML, /btn-start/, 'no train button on locked week');
});

test('unlocked week detail keeps training buttons and no banner', () => {
  const { exports: X, el } = load();
  X.state.currentWeek = 3;
  X.showWeekDetail(2);
  assert.doesNotMatch(el.innerHTML, /locked-banner/);
  assert.match(el.innerHTML, /btn-start/);
});

test('reading libraries expanded with full-length poems', () => {
  const { exports: X } = load();
  assert.ok(X.READING_TEXTS.length >= 14, `ru: ${X.READING_TEXTS.length}`);
  assert.ok(X.READING_I18N.uk.length >= 10, `uk: ${X.READING_I18N.uk.length}`);
  assert.ok(X.READING_I18N.en.length >= 10, `en: ${X.READING_I18N.en.length}`);
  // «У лукоморья» теперь полный — с котом учёным в финале
  const luk = X.READING_TEXTS.find((r) => r.id === 'pushkin-lukomorye');
  assert.match(luk.text, /Свои мне сказки говорил/);
});
