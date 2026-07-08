'use strict';

// Ежедневный отправитель пуш-уведомлений (запускается из GitHub Actions).
// Читает подписку и прогресс из приватного Gist пользователя,
// шлёт напоминание, если сегодня ещё не было тренировки.
//
// ENV:
//   VAPID_PUBLIC   — публичный VAPID-ключ (в открытом виде)
//   VAPID_PRIVATE  — приватный VAPID-ключ (секрет репозитория)
//   VAPID_SUBJECT  — mailto:... (опц., по умолчанию example)
//   GH_TOKEN       — токен с доступом к gist (секрет репозитория)

const webpush = require('web-push');

const {
  VAPID_PUBLIC,
  VAPID_PRIVATE,
  VAPID_SUBJECT = 'mailto:speech-trainer@example.com',
  GH_TOKEN,
} = process.env;

const GIST_DESCRIPTION = 'Speech Trainer Progress';
const PUSH_FILENAME = 'push_subscription.json';
const PROGRESS_FILENAME = 'speech_trainer_progress.json';

const MESSAGES = {
  ru: { title: 'Речевой Тренажёр', body: 'Пора на тренировку — 20 минут 🗣️' },
  uk: { title: 'Мовний тренажер', body: 'Час на тренування — 20 хвилин 🗣️' },
  en: { title: 'Speech Trainer', body: 'Time to train — 20 minutes 🗣️' },
};

async function gh(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'speech-trainer-notify',
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !GH_TOKEN) {
    console.log('Missing secrets (VAPID_PUBLIC / VAPID_PRIVATE / GH_TOKEN) — skipping.');
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  // Найти нужный gist по описанию
  const gists = await gh('https://api.github.com/gists?per_page=100');
  const meta = gists.find(g => g.description === GIST_DESCRIPTION);
  if (!meta) { console.log('Progress gist not found — nothing to do.'); return; }

  const full = await gh(`https://api.github.com/gists/${meta.id}`);
  const pushFile = full.files[PUSH_FILENAME];
  if (!pushFile) { console.log('No push subscription saved — skipping.'); return; }

  const { sub, lang: subLang } = JSON.parse(pushFile.content);

  // Определить язык и был ли сегодня прогресс
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

  const today = new Date().toISOString().split('T')[0];
  if (lastActiveDate === today) {
    console.log('Already trained today — no reminder needed.');
    return;
  }

  const msg = MESSAGES[lang] || MESSAGES.ru;
  try {
    await webpush.sendNotification(sub, JSON.stringify(msg));
    console.log('Reminder sent.');
  } catch (e) {
    // 404/410 — подписка устарела
    console.log('Push failed:', e.statusCode || '', e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
