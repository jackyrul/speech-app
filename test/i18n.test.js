'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load-browser.js');

const { exports: X } = load();
const { UI, LANGS, LANG_LABELS, PHASE_TITLES, WEEK_META, PHASE_CONTENT,
  WARMUP_I18N, TWISTERS_I18N, CAMERA_I18N, READING_I18N } = X;

const PHASE_IDS = ['breathing', 'articulation', 'diction', 'voice', 'speech'];

test('LANGS and labels', () => {
  assert.deepEqual(Array.from(LANGS), ['ru', 'uk', 'en']);
  for (const l of LANGS) assert.ok(LANG_LABELS[l], `label ${l}`);
});

test('UI key parity across ru/uk/en', () => {
  const ru = Object.keys(UI.ru).sort();
  for (const lang of ['uk', 'en']) {
    const keys = Object.keys(UI[lang]).sort();
    assert.deepEqual(keys, ru, `UI keys for ${lang} differ from ru`);
  }
});

test('no empty UI string values', () => {
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(UI[lang])) {
      if (typeof v === 'string') assert.ok(v.length > 0, `empty ${lang}.${k}`);
      if (Array.isArray(v)) v.forEach((x, i) => assert.ok(String(x).length > 0, `empty ${lang}.${k}[${i}]`));
    }
  }
});

test('array-shaped UI strings have expected lengths', () => {
  for (const lang of LANGS) {
    assert.equal(UI[lang].dayWords.length, 3, `${lang} dayWords`);
    assert.equal(UI[lang].doneMsgs.length, 5, `${lang} doneMsgs`);
    assert.equal(UI[lang].goals.length, 5, `${lang} goals`);
  }
});

test('PHASE_TITLES cover all phases in all languages', () => {
  for (const lang of LANGS) {
    for (const id of PHASE_IDS) assert.ok(PHASE_TITLES[lang][id], `${lang}/${id}`);
  }
});

test('WEEK_META complete for uk/en (weeks 1-8, title/goal/tip)', () => {
  for (const lang of ['uk', 'en']) {
    for (let w = 1; w <= 8; w++) {
      const m = WEEK_META[lang][w];
      assert.ok(m && m.title && m.goal && m.tip, `${lang} week ${w}`);
    }
  }
});

test('PHASE_CONTENT complete for uk/en (all weeks, all phases, non-empty)', () => {
  for (const lang of ['uk', 'en']) {
    for (let w = 1; w <= 8; w++) {
      const wc = PHASE_CONTENT[lang][w];
      assert.ok(wc, `${lang} week ${w} missing`);
      for (const id of PHASE_IDS) {
        assert.ok(wc[id] && wc[id].length > 10, `${lang} week ${w}/${id} content`);
      }
    }
  }
});

test('localized aux arrays present with expected shapes', () => {
  for (const lang of ['uk', 'en']) {
    assert.equal(WARMUP_I18N[lang].length, 7, `${lang} warmup`);
    assert.ok(TWISTERS_I18N[lang].main.length >= 3, `${lang} twisters main`);
    assert.ok(TWISTERS_I18N[lang].extra.length >= 3, `${lang} twisters extra`);
    assert.equal(CAMERA_I18N[lang].length, 7, `${lang} camera`);
    assert.ok(READING_I18N[lang].length >= 4, `${lang} reading`);
    for (const item of READING_I18N[lang]) {
      for (const f of ['id', 'title', 'author', 'source', 'level', 'text']) {
        assert.ok(item[f], `${lang} reading ${item.id || '?'} missing ${f}`);
      }
    }
  }
});
