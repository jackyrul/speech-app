'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load-browser.js');

const { exports: X } = load();
const { PROGRAM, READING_TEXTS } = X;

const PHASE_ORDER = ['breathing', 'articulation', 'diction', 'voice', 'speech'];
const HEX = /^#[0-9A-Fa-f]{6}$/;

test('PROGRAM has 8 sequential weeks', () => {
  assert.equal(PROGRAM.weeks.length, 8);
  PROGRAM.weeks.forEach((w, i) => assert.equal(w.id, i + 1));
});

test('every week has icon, title, goal, tip and 5 phases', () => {
  for (const w of PROGRAM.weeks) {
    assert.ok(w.icon && w.title && w.goal && w.tip, `week ${w.id} meta`);
    assert.equal(w.phases.length, 5, `week ${w.id} phase count`);
  }
});

test('phases are in the canonical order with the expected ids', () => {
  for (const w of PROGRAM.weeks) {
    assert.deepEqual(Array.from(w.phases.map((p) => p.id)), PHASE_ORDER, `week ${w.id}`);
  }
});

test('every phase has valid title, emoji, hex color and positive seconds', () => {
  for (const w of PROGRAM.weeks) {
    for (const p of w.phases) {
      assert.ok(p.title, `${w.id}/${p.id} title`);
      assert.ok(p.emoji, `${w.id}/${p.id} emoji`);
      assert.match(p.color, HEX, `${w.id}/${p.id} color`);
      assert.ok(Number.isFinite(p.seconds) && p.seconds > 0, `${w.id}/${p.id} seconds`);
    }
  }
});

test('breathing patterns are well-formed where present', () => {
  for (const w of PROGRAM.weeks) {
    const bp = w.phases[0].breathingPattern;
    if (bp) {
      assert.ok(bp.inhale > 0 && bp.exhale > 0, `week ${w.id} inhale/exhale`);
      assert.ok(bp.hold >= 0, `week ${w.id} hold`);
      assert.ok((bp.cycles || 0) > 0, `week ${w.id} cycles`);
    }
  }
});

test('daily total is roughly 20 minutes (900-1500s)', () => {
  for (const w of PROGRAM.weeks) {
    const total = w.phases.reduce((s, p) => s + p.seconds, 0);
    assert.ok(total >= 900 && total <= 1500, `week ${w.id} total ${total}s`);
  }
});

test('READING_TEXTS are complete with unique ids', () => {
  assert.ok(READING_TEXTS.length >= 5);
  const ids = new Set();
  for (const item of READING_TEXTS) {
    for (const f of ['id', 'title', 'author', 'source', 'level', 'text']) {
      assert.ok(item[f], `reading ${item.id || '?'} missing ${f}`);
    }
    assert.ok(!ids.has(item.id), `duplicate reading id ${item.id}`);
    ids.add(item.id);
  }
});
