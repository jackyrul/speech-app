'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load-browser.js');

// ─── VAPID key + base64url decoding ───

test('VAPID_PUBLIC_KEY is a base64url string decoding to a 65-byte P-256 point', () => {
  const { exports: X } = load();
  assert.match(X.VAPID_PUBLIC_KEY, /^[A-Za-z0-9_-]+$/, 'base64url charset');
  const bytes = X.urlBase64ToUint8Array(X.VAPID_PUBLIC_KEY);
  assert.equal(bytes.constructor.name, 'Uint8Array');
  assert.equal(bytes.length, 65, 'uncompressed EC point');
  assert.equal(bytes[0], 0x04, 'uncompressed prefix');
});

test('urlBase64ToUint8Array decodes a known value', () => {
  const { exports: X } = load();
  // base64url of "Man" is "TWFu"
  const bytes = X.urlBase64ToUint8Array('TWFu');
  assert.deepEqual(Array.from(bytes), [77, 97, 110]);
});

// ─── pushSupported ───

test('pushSupported reflects browser capability', () => {
  assert.equal(load({ push: true }).exports.pushSupported(), true);
  assert.equal(load({ push: false }).exports.pushSupported(), false);
});

// ─── enablePush branches ───

test('enablePush: unsupported → shows unsupported message', async () => {
  const { exports: X, el } = load({ push: false });
  await X.enablePush();
  assert.equal(el.textContent, X.UI.ru.notifyUnsupported);
});

test('enablePush: iOS not installed → asks to add to Home Screen', async () => {
  const { exports: X, el } = load({ push: true, standalone: false, userAgent: 'iPhone Safari' });
  await X.enablePush();
  assert.equal(el.textContent, X.UI.ru.notifyNeedInstall);
});

test('enablePush: no gist token → asks to connect GitHub and opens setup', async () => {
  const { exports: X, el } = load({ push: true, userAgent: 'desktop' });
  await X.enablePush();
  assert.equal(el.textContent, X.UI.ru.notifyNeedGist);
  assert.equal(el.style.display, 'flex', 'gist setup modal shown');
});

test('enablePush: permission denied → does not enable', async () => {
  const { exports: X, el } = load({
    push: true, userAgent: 'desktop', permission: 'denied',
    gistConfig: { token: 'ghp_x', gistId: 'g1' },
  });
  await X.enablePush();
  assert.equal(el.textContent, X.UI.ru.notifyDenied);
  assert.equal(X.state.pushEnabled, false);
});

test('enablePush: happy path subscribes and PATCHes the gist', async () => {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, method: opts && opts.method, body: opts && opts.body });
    return { ok: true, status: 200, json: async () => ({ id: 'g1', files: {} }) };
  };
  const { exports: X } = load({
    push: true, userAgent: 'desktop', permission: 'granted',
    gistConfig: { token: 'ghp_x', gistId: 'g1' }, fetch,
  });
  await X.enablePush();
  assert.equal(X.state.pushEnabled, true);
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.ok(patch, 'a PATCH was sent');
  assert.match(patch.url, /\/gists\/g1$/);
  assert.match(patch.body, /push_subscription\.json/);
});

// ─── savePushSubscription ───

test('savePushSubscription PATCHes the correct gist with auth + payload', async () => {
  const calls = [];
  const fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, json: async () => ({}) }; };
  const { exports: X } = load({ push: true, gistConfig: { token: 'ghp_secret', gistId: 'gid9' }, fetch });
  await X.savePushSubscription({ endpoint: 'https://push.example/x' });
  const patch = calls.find((c) => c.opts && c.opts.method === 'PATCH');
  assert.ok(patch);
  assert.match(patch.url, /\/gists\/gid9$/);
  assert.equal(patch.opts.headers.Authorization, 'Bearer ghp_secret');
  const body = JSON.parse(patch.opts.body);
  assert.ok(body.files[X.PUSH_FILENAME].content.includes('push.example'));
});

test('savePushSubscription throws when GitHub rejects', async () => {
  const fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const { exports: X } = load({ push: true, gistConfig: { token: 'ghp_x', gistId: 'g1' }, fetch });
  await assert.rejects(() => X.savePushSubscription({ endpoint: 'e' }), /401/);
});

// ─── renderPushSection ───

test('renderPushSection renders when supported, empty when not', () => {
  const on = load({ push: true }).exports.renderPushSection();
  assert.match(on, /notify|🔔|Напоминани/i);
  const off = load({ push: false }).exports.renderPushSection();
  assert.equal(off, '');
});
