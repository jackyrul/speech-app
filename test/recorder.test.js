'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load-browser.js');

test('recPickMime returns the first supported candidate', () => {
  const { exports: X } = load();
  assert.equal(X.recPickMime((m) => m === 'audio/webm'), 'audio/webm');
  assert.equal(X.recPickMime((m) => m === 'audio/mp4'), 'audio/mp4');
  assert.equal(X.recPickMime(() => false), '');
  assert.equal(X.recPickMime(() => { throw new Error('boom'); }), '', 'tolerates throwing checker');
});

test('recSelectPrunable keeps everything under the limit', () => {
  const { exports: X } = load();
  const recs = [
    { key: 'a', week: 2, at: '2026-01-01' },
    { key: 'b', week: 3, at: '2026-01-02' },
  ];
  assert.deepEqual(Array.from(X.recSelectPrunable(recs, 20)), []);
});

test('recSelectPrunable removes oldest non-week-1 first', () => {
  const { exports: X } = load();
  const recs = [
    { key: 'old2', week: 2, at: '2026-01-01' },
    { key: 'w1', week: 1, at: '2026-01-02' },
    { key: 'new3', week: 3, at: '2026-01-05' },
    { key: 'mid2', week: 2, at: '2026-01-03' },
  ];
  assert.deepEqual(Array.from(X.recSelectPrunable(recs, 3)), ['old2']);
  assert.deepEqual(Array.from(X.recSelectPrunable(recs, 2)), ['old2', 'mid2']);
});

test('recSelectPrunable never deletes week-1 recordings', () => {
  const { exports: X } = load();
  const recs = [
    { key: 'w1a', week: 1, at: '2026-01-01' },
    { key: 'w1b', week: 1, at: '2026-01-02' },
    { key: 'w2', week: 2, at: '2026-01-03' },
  ];
  // Лимит 1: превышение = 2, но удалить можно только не-первую неделю
  const pruned = Array.from(X.recSelectPrunable(recs, 1));
  assert.deepEqual(pruned, ['w2']);
});

test('recSupported false without mic APIs → section renders empty', () => {
  const { exports: X } = load();
  assert.equal(X.recSupported(), false);
  assert.equal(X.renderRecorderSection(1, 1, false), '');
});

test('recorder section renders with mic APIs available', () => {
  const { exports: X } = load({ mic: true });
  assert.equal(X.recSupported(), true);
  const html = X.renderRecorderSection(2, 3, false);
  assert.match(html, /rec-btn/);
  assert.match(html, /toggleRecording\(2, 3\)/);
  assert.doesNotMatch(html, /rec-before/, 'no before/after block outside final week');
  const finalHtml = X.renderRecorderSection(8, 7, true);
  assert.match(finalHtml, /rec-before/, 'final week gets before/after block');
});
