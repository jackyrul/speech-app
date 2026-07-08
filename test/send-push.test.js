'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run, MESSAGES, GIST_DESCRIPTION, PUSH_FILENAME, PROGRESS_FILENAME } = require('../scripts/send-push.js');

const FULL_ENV = { VAPID_PUBLIC: 'pub', VAPID_PRIVATE: 'priv', GH_TOKEN: 'ghp_x' };

function makeWebpush() {
  const sent = [];
  return {
    sent,
    setVapidDetails() {},
    sendNotification: async (sub, payload) => { sent.push({ sub, payload }); },
  };
}

// Строит fake fetch поверх «виртуального» gist-стораджа
function makeFetch({ gists, files }) {
  return async (url) => {
    if (url.includes('/gists?')) return { ok: true, status: 200, json: async () => gists };
    const m = url.match(/\/gists\/([^/?]+)$/);
    if (m) return { ok: true, status: 200, json: async () => ({ id: m[1], files }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

const silent = () => {};

test('skips when secrets are missing', async () => {
  const wp = makeWebpush();
  const r = await run({ fetch: async () => { throw new Error('should not fetch'); }, webpush: wp, env: {}, log: silent });
  assert.equal(r.reason, 'missing-secrets');
  assert.equal(wp.sent.length, 0);
});

test('skips when the progress gist is not found', async () => {
  const wp = makeWebpush();
  const fetch = makeFetch({ gists: [{ description: 'something else', id: 'x' }], files: {} });
  const r = await run({ fetch, webpush: wp, env: FULL_ENV, log: silent });
  assert.equal(r.reason, 'no-gist');
  assert.equal(wp.sent.length, 0);
});

test('skips when no push subscription file exists', async () => {
  const wp = makeWebpush();
  const fetch = makeFetch({
    gists: [{ description: GIST_DESCRIPTION, id: 'g1' }],
    files: { [PROGRESS_FILENAME]: { content: JSON.stringify({ lang: 'ru' }) } },
  });
  const r = await run({ fetch, webpush: wp, env: FULL_ENV, log: silent });
  assert.equal(r.reason, 'no-subscription');
});

test('skips when already trained today', async () => {
  const wp = makeWebpush();
  const now = new Date('2026-07-08T12:00:00Z');
  const fetch = makeFetch({
    gists: [{ description: GIST_DESCRIPTION, id: 'g1' }],
    files: {
      [PUSH_FILENAME]: { content: JSON.stringify({ sub: { endpoint: 'e' }, lang: 'ru' }) },
      [PROGRESS_FILENAME]: { content: JSON.stringify({ lang: 'ru', lastActiveDate: '2026-07-08' }) },
    },
  });
  const r = await run({ fetch, webpush: wp, env: FULL_ENV, now, log: silent });
  assert.equal(r.reason, 'already-trained');
  assert.equal(wp.sent.length, 0);
});

test('sends a reminder when due, in the progress language', async () => {
  const wp = makeWebpush();
  const now = new Date('2026-07-08T12:00:00Z');
  const fetch = makeFetch({
    gists: [{ description: GIST_DESCRIPTION, id: 'g1' }],
    files: {
      [PUSH_FILENAME]: { content: JSON.stringify({ sub: { endpoint: 'e' }, lang: 'ru' }) },
      [PROGRESS_FILENAME]: { content: JSON.stringify({ lang: 'uk', lastActiveDate: '2026-07-01' }) },
    },
  });
  const r = await run({ fetch, webpush: wp, env: FULL_ENV, now, log: silent });
  assert.equal(r.sent, true);
  assert.equal(r.lang, 'uk');
  assert.equal(wp.sent.length, 1);
  assert.equal(JSON.parse(wp.sent[0].payload).title, MESSAGES.uk.title);
});

test('falls back to subscription language when no progress file', async () => {
  const wp = makeWebpush();
  const now = new Date('2026-07-08T12:00:00Z');
  const fetch = makeFetch({
    gists: [{ description: GIST_DESCRIPTION, id: 'g1' }],
    files: { [PUSH_FILENAME]: { content: JSON.stringify({ sub: { endpoint: 'e' }, lang: 'en' }) } },
  });
  const r = await run({ fetch, webpush: wp, env: FULL_ENV, now, log: silent });
  assert.equal(r.sent, true);
  assert.equal(r.lang, 'en');
  assert.equal(JSON.parse(wp.sent[0].payload).title, MESSAGES.en.title);
});

test('handles a push send failure gracefully', async () => {
  const wp = makeWebpush();
  wp.sendNotification = async () => { const e = new Error('gone'); e.statusCode = 410; throw e; };
  const now = new Date('2026-07-08T12:00:00Z');
  const fetch = makeFetch({
    gists: [{ description: GIST_DESCRIPTION, id: 'g1' }],
    files: { [PUSH_FILENAME]: { content: JSON.stringify({ sub: { endpoint: 'e' }, lang: 'ru' }) } },
  });
  const r = await run({ fetch, webpush: wp, env: FULL_ENV, now, log: silent });
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'send-failed');
});
