'use strict';

// ═══════════════════════════════════════════════
// ДИКТОФОН — запись голоса в фазах «Речь»
// Хранение: IndexedDB, только на этом устройстве
// (в Gist не синкается — аудио слишком большое)
// ═══════════════════════════════════════════════

const REC_DB_NAME = 'speech_recorder_v1';
const REC_STORE = 'recordings';
const REC_MAX = 20;
const REC_MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];

// Выбор поддерживаемого mime-типа (isSupported инъектируется в тестах)
function recPickMime(isSupported) {
  for (const m of REC_MIME_CANDIDATES) {
    try { if (isSupported(m)) return m; } catch (e) {}
  }
  return '';
}

// Какие записи удалить, чтобы уложиться в лимит.
// Неделя 1 не удаляется никогда — это запись «до» для финального сравнения.
function recSelectPrunable(records, max) {
  const excess = records.length - max;
  if (excess <= 0) return [];
  return [...records]
    .filter((r) => r.week !== 1)
    .sort((a, b) => (a.at < b.at ? -1 : 1))
    .slice(0, excess)
    .map((r) => r.key);
}

function recSupported() {
  return !!(typeof navigator !== 'undefined' && navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    typeof MediaRecorder !== 'undefined' &&
    typeof indexedDB !== 'undefined');
}

// ─── IndexedDB ───
function recOpenDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(REC_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(REC_STORE)) {
        db.createObjectStore(REC_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function recAll() {
  const db = await recOpenDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(REC_STORE, 'readonly').objectStore(REC_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function recPut(record) {
  const db = await recOpenDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REC_STORE, 'readwrite');
    tx.objectStore(REC_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function recRemove(key) {
  const db = await recOpenDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REC_STORE, 'readwrite');
    tx.objectStore(REC_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function recSave(week, day, blob, mime) {
  const record = {
    key: `${week}-${day}-${Date.now()}`,
    week, day,
    at: new Date().toISOString(),
    mime,
    blob,
  };
  await recPut(record);
  const all = await recAll();
  for (const key of recSelectPrunable(all, REC_MAX)) {
    try { await recRemove(key); } catch (e) {}
  }
  return record;
}

async function recForDay(week, day) {
  const all = await recAll();
  return all
    .filter((r) => r.week === week && r.day === day)
    .sort((a, b) => (a.at > b.at ? -1 : 1));
}

// Самая ранняя запись недели 1 — «до» для сравнения в финале
async function recFirstBefore() {
  const all = await recAll();
  const w1 = all.filter((r) => r.week === 1).sort((a, b) => (a.at < b.at ? -1 : 1));
  return w1[0] || null;
}

// ─── Запись ───
let _mediaRec = null;
let _recChunks = [];
let _recTimer = null;
let _recStart = 0;

function stopRecording() {
  if (_mediaRec && _mediaRec.state === 'recording') {
    try { _mediaRec.stop(); } catch (e) {}
  }
}

async function toggleRecording(week, day) {
  if (_mediaRec && _mediaRec.state === 'recording') { stopRecording(); return; }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    recStatus(t('recDenied'));
    return;
  }

  try {
    const mime = recPickMime((m) => MediaRecorder.isTypeSupported(m));
    _mediaRec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    _recChunks = [];

    _mediaRec.ondataavailable = (e) => { if (e.data && e.data.size > 0) _recChunks.push(e.data); };
    _mediaRec.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      if (_recTimer) { clearInterval(_recTimer); _recTimer = null; }
      const type = (_mediaRec && _mediaRec.mimeType) || mime || 'audio/webm';
      _mediaRec = null;
      const btn = document.getElementById('rec-btn');
      if (btn) { btn.textContent = t('recStart'); btn.classList.remove('recording'); }
      if (_recChunks.length) {
        try { await recSave(week, day, new Blob(_recChunks, { type }), type); } catch (e) {}
      }
      refreshRecList(week, day);
    };

    _mediaRec.start();
    _recStart = Date.now();
    recStatus('');
    const btn = document.getElementById('rec-btn');
    if (btn) { btn.classList.add('recording'); btn.textContent = `${t('recStop')} 0:00`; }
    _recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - _recStart) / 1000);
      const b = document.getElementById('rec-btn');
      if (b) b.textContent = `${t('recStop')} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 500);
  } catch (e) {
    stream.getTracks().forEach((tr) => tr.stop());
    recStatus(t('recUnsupported'));
  }
}

async function recGet(key) {
  const all = await recAll();
  return all.find((r) => r.key === key) || null;
}

// Поделиться записью (Web Share API) или скачать файлом
async function shareRecording(key) {
  const rec = await recGet(key);
  if (!rec) return;
  const mime = rec.mime || 'audio/webm';
  const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
  const name = `speech-w${rec.week}d${rec.day}.${ext}`;

  try {
    const file = new File([rec.blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // пользователь закрыл шер — не скачиваем
  }

  // Фолбэк: скачивание файла
  const url = URL.createObjectURL(rec.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function deleteRecording(key, week, day) {
  if (!confirm(t('recDeleteConfirm'))) return;
  try { await recRemove(key); } catch (e) {}
  refreshRecList(week, day);
}

// ─── UI ───
function recStatus(msg) {
  const el = document.getElementById('rec-status');
  if (el) el.textContent = msg;
}

function recItemHTML(rec, canDelete) {
  const url = URL.createObjectURL(rec.blob);
  const d = new Date(rec.at);
  const label = `${d.getDate()}.${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `
    <div class="rec-item">
      <div class="rec-item-top">
        <span class="rec-item-label">🎙 ${label}</span>
        <span class="rec-item-actions">
          <button type="button" class="rec-share" onclick="shareRecording('${rec.key}')" aria-label="${t('recShare')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </button>
          ${canDelete ? `<button type="button" class="rec-del" onclick="deleteRecording('${rec.key}', ${rec.week}, ${rec.day})">✕</button>` : ''}
        </span>
      </div>
      <audio controls preload="metadata" src="${url}"></audio>
    </div>
  `;
}

async function refreshRecList(week, day) {
  const wrap = document.getElementById('rec-list');
  if (!wrap) return;
  try {
    const recs = await recForDay(week, day);
    wrap.innerHTML = recs.length
      ? recs.map((r) => recItemHTML(r, true)).join('')
      : `<div class="rec-empty">${t('recEmpty')}</div>`;
  } catch (e) {
    wrap.innerHTML = '';
  }
}

function renderRecorderSection(week, day, isFinal) {
  if (!recSupported()) return '';
  return `
    <div class="recorder-section">
      <div class="recorder-head">
        <span class="recorder-title">${t('recTitle')}</span>
        <button type="button" id="rec-btn" class="rec-btn" onclick="toggleRecording(${week}, ${day})">${t('recStart')}</button>
      </div>
      <div id="rec-status" class="rec-status"></div>
      ${isFinal ? '<div id="rec-before" class="rec-before"></div>' : ''}
      <div id="rec-list" class="rec-list"></div>
      <div class="rec-hint">${t('recHint')}</div>
    </div>
  `;
}

async function initRecorderSection(week, day, isFinal) {
  if (!recSupported()) return;
  refreshRecList(week, day);
  if (isFinal) {
    try {
      const before = await recFirstBefore();
      const wrap = document.getElementById('rec-before');
      if (wrap && before) {
        wrap.innerHTML = `<div class="rec-before-label">${t('recBefore')}</div>` + recItemHTML(before, false);
      }
    } catch (e) {}
  }
}
