'use strict';

// Ежедневный отправитель пуш-уведомлений (запускается из GitHub Actions).
// Читает подписку и прогресс из приватного Gist пользователя,
// шлёт напоминание, если сегодня ещё не было тренировки.
//
// ENV:
//   VAPID_PUBLIC   — публичный VAPID-ключ (в открытом виде)
//   VAPID_PRIVATE  — приватный VAPID-ключ (секрет репозитория)
//   VAPID_SUBJECT  — mailto:... (опц.)
//   GH_TOKEN       — токен с доступом к gist (секрет репозитория)

const GIST_DESCRIPTION = 'Speech Trainer Progress';
const PUSH_FILENAME = 'push_subscription.json';
const PROGRESS_FILENAME = 'speech_trainer_progress.json';

const MESSAGES = {
  ru: { title: 'Речевой Тренажёр', body: 'Пора на тренировку — 20 минут 🗣️' },
  uk: { title: 'Мовний тренажер', body: 'Час на тренування — 20 хвилин 🗣️' },
  en: { title: 'Speech Trainer', body: 'Time to train — 20 minutes 🗣️' },
};

// Основная логика с инъекцией зависимостей (fetch, webpush) — тестируема.
async function run({ fetch, webpush, env, now = new Date(), log = console.log }) {
  const {
    VAPID_PUBLIC,
    VAPID_PRIVATE,
    VAPID_SUBJECT = 'mailto:speech-trainer@example.com',
    GH_TOKEN,
  } = env;

  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !GH_TOKEN) {
    log('Missing secrets (VAPID_PUBLIC / VAPID_PRIVATE / GH_TOKEN) — skipping.');
    return { sent: false, reason: 'missing-secrets' };
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const gh = async (url) => {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'speech-trainer-notify',
      },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);
    return res.json();
  };

  const gists = await gh('https://api.github.com/gists?per_page=100');
  const meta = gists.find((g) => g.description === GIST_DESCRIPTION);
  if (!meta) { log('Progress gist not found — nothing to do.'); return { sent: false, reason: 'no-gist' }; }

  const full = await gh(`https://api.github.com/gists/${meta.id}`);
  const pushFile = full.files[PUSH_FILENAME];
  if (!pushFile) { log('No push subscription saved — skipping.'); return { sent: false, reason: 'no-subscription' }; }

  const { sub, lang: subLang } = JSON.parse(pushFile.content);

  let lang = subLang || 'ru';
  let lastActiveDate = null;
  const progFile = full.files[PROGRESS_FILENAME];
  if (progFile) {
    try {
      const st = JSON.parse(progFile.content);
      if (st.lang) lang = st.lang;
      lastActiveDate = st.lastActiveDate;
    } catch (_) {}
  }

  const today = now.toISOString().split('T')[0];
  if (lastActiveDate === today) { log('Already trained today — no reminder needed.'); return { sent: false, reason: 'already-trained' }; }

  const msg = MESSAGES[lang] || MESSAGES.ru;
  try {
    await webpush.sendNotification(sub, JSON.stringify(msg));
    log('Reminder sent.');
    return { sent: true, lang, msg };
  } catch (e) {
    log('Push failed:', e.statusCode || '', e.message);
    return { sent: false, reason: 'send-failed', error: e.message };
  }
}

module.exports = { run, MESSAGES, GIST_DESCRIPTION, PUSH_FILENAME, PROGRESS_FILENAME };

// Прямой запуск из Actions — здесь (и только здесь) подключаем web-push и сеть.
if (require.main === module) {
  const webpush = require('web-push');
  run({ fetch, webpush, env: process.env })
    .then((r) => { console.log(JSON.stringify(r)); })
    .catch((e) => { console.error(e); process.exit(1); });
}
