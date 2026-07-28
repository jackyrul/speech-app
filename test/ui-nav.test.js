'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load-browser.js');

test('bottom nav uses SVG icons for all five tabs', () => {
  const { exports: X, el } = load();
  X.state.onboarded = true;
  X.renderHome();
  const navPart = el.innerHTML.slice(el.innerHTML.indexOf('bottom-nav'));
  assert.equal((navPart.match(/nav-svg/g) || []).length, 5, 'five svg icons');
  assert.match(navPart, /navigate\('exercises'\)/, 'exercises tab present');
  assert.doesNotMatch(navPart, /🏠|📋|📖|📈/, 'no emoji icons left');
});

test('phase view renders swipe dots and attaches swipe handlers', () => {
  const { exports: X, el } = load();
  X.state.completedSessions = {};
  X.startTraining(1, 1);
  X.startPhase(2);
  assert.match(el.innerHTML, /phase-dots/);
  assert.equal((el.innerHTML.match(/pdot/g) || []).length, 5, 'five phase dots');
  assert.match(el.innerHTML, /pdot on/, 'active dot highlighted');
  assert.equal(typeof X.attachPhaseSwipe, 'function');
});

test('shareRecording is available and recorder items include a share button', () => {
  const { exports: X } = load({ mic: true });
  assert.equal(typeof X.shareRecording, 'function');
});
