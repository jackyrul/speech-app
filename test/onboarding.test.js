'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load-browser.js');

test('onboarding overlay shows for a fresh user', () => {
  const { exports: X, el } = load();
  X.state.completedSessions = {};
  X.state.onboarded = false;
  X.renderHome();
  assert.match(el.innerHTML, /Добро пожаловать/);
  assert.match(el.innerHTML, /ob-step/);
});

test('onboarding hidden after dismiss and after any workout', () => {
  const { exports: X, el } = load();
  X.state.completedSessions = {};
  X.state.onboarded = false;
  X.dismissOnboarding();
  assert.equal(X.state.onboarded, true);
  X.renderHome();
  assert.doesNotMatch(el.innerHTML, /Добро пожаловать/);

  // Пользователь с прогрессом не видит онбординг даже без флага
  X.state.onboarded = false;
  X.state.completedSessions = { '1-1': { at: 'x' } };
  assert.equal(X.renderOnboarding(), '');
});

test('onboarding marks completed steps', () => {
  const { exports: X } = load({ standalone: true, gistConfig: { token: 'ghp_x' } });
  X.state.completedSessions = {};
  X.state.onboarded = false;
  X.state.pushEnabled = true;
  const html = X.renderOnboarding();
  const checks = (html.match(/✅/g) || []).length;
  assert.equal(checks, 3, 'all three steps checked');
});

test('heatmap renders 8×7 cells and marks done sessions', () => {
  const { exports: X } = load();
  X.state.completedSessions = { '1-1': { at: 'x' }, '1-2': { at: 'x' }, '3-7': { at: 'x' } };
  const html = X.renderHeatmap();
  assert.equal((html.match(/hm-cell/g) || []).length, 56);
  assert.equal((html.match(/hm-cell done/g) || []).length, 3);
});

test('progress view has settings modal with lang/sync/reset moved in', () => {
  const { exports: X, el } = load();
  X.state.completedSessions = {};
  X.renderProgress();
  const html = el.innerHTML;
  assert.match(html, /settings-modal/);
  assert.match(html, /settings-gear/);
  // Язык, синхронизация и сброс — внутри модала
  const modalPart = html.slice(html.indexOf('settings-modal'));
  assert.match(modalPart, /lang-switch/);
  assert.match(modalPart, /gist-sync-card/);
  assert.match(modalPart, /btn-reset/);
  // Heatmap — в основном экране
  assert.match(html, /heatmap-card/);
});
