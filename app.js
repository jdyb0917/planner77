import { firebaseConfig } from './firebase-config.js';

/* ============================================================
   기본 유틸
   ============================================================ */
const LS_KEY = 'yarubeki:v1';
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const $ = (id) => document.getElementById(id);

function dateFor(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function titleFor(offset) {
  return ({ '-2': '一昨日は', '-1': '昨日は', '0': '今日は', '1': '明日は', '2': '明後日は' })[offset] || 'この日は';
}

/* "530" → "05:30", "17" → "17:00", "9:5" → "09:05" */
function normalizeTime(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  let h, m;
  if (s.includes(':')) {
    [h, m] = s.split(':');
  } else {
    const digits = s.replace(/\D/g, '');
    if (digits.length <= 2) { h = digits; m = '0'; }
    else if (digits.length === 3) { h = digits.slice(0, 1); m = digits.slice(1); }
    else { h = digits.slice(0, 2); m = digits.slice(2, 4); }
  }
  h = Math.min(24, Math.max(0, parseInt(h, 10) || 0));
  m = Math.min(59, Math.max(0, parseInt(m, 10) || 0));
  if (h === 24) m = 0;
  return `${pad(h)}:${pad(m)}`;
}
const toMin = (t) => (t ? parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3, 5), 10) : 9999);

/* ============================================================
   데이터 (localStorage + 메모리)
   store.days["YYYY-MM-DD"] = { timed:[{id,time,text}], todos:[{id,text,done}], updatedAt }
   ============================================================ */
let store = loadLocal();
const drafts = {}; // 아직 아무것도 적지 않은 날의 빈 틀 (저장되지 않음)
let offset = 0;    // 오늘 기준 며칠 뒤를 보고 있는지

function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && s.days) return s;
  } catch (e) { /* ignore */ }
  return { days: {} };
}
function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
}

function template() {
  return {
    timed: [{ id: newId(), time: '05:00', text: '' }],
    todos: [{ id: newId(), text: '', done: false }],
    updatedAt: 0,
  };
}
function viewDay(key) {
  return store.days[key] || (drafts[key] ||= template());
}
function ensureDay(key) {
  if (!store.days[key]) {
    store.days[key] = drafts[key] || template();
    delete drafts[key];
  }
  return store.days[key];
}
function commit(key) {
  const day = ensureDay(key);
  day.updatedAt = Date.now();
  saveLocal();
  sync.push(key);
}

/* ============================================================
   화면 그리기
   ============================================================ */
const els = {
  date: $('date'), title: $('title'), timed: $('timed'), todos: $('todos'),
  prev: $('prev'), next: $('next'), addTimed: $('addTimed'), addTodo: $('addTodo'),
  syncBtn: $('syncBtn'), cover: $('cover'),
};

let pendingRender = false;
const isEditing = () => {
  const a = document.activeElement;
  return a && a.tagName === 'INPUT' && els.timed.parentNode.parentNode.contains(a);
};
function safeRender() {
  if (isEditing()) pendingRender = true;
  else render();
}

function currentKey() { return keyOf(dateFor(offset)); }

function render() {
  pendingRender = false;
  const d = dateFor(offset);
  const key = keyOf(d);
  els.date.textContent = `${d.getMonth() + 1}/${d.getDate()}/${WD[d.getDay()]}`;
  els.title.textContent = titleFor(offset);
  els.title.classList.toggle('can-reset', offset !== 0);
  els.title.title = offset !== 0 ? '今日に戻る' : '';

  const day = viewDay(key);
  els.timed.replaceChildren(...day.timed.map((it) => timedRow(key, it)));
  els.todos.replaceChildren(...day.todos.map((it) => todoRow(key, it)));
}

function rowShell(id) {
  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.id = id;
  const del = document.createElement('div');
  del.className = 'row-bg bg-del';
  del.textContent = '削除';
  const post = document.createElement('div');
  post.className = 'row-bg bg-post';
  post.textContent = '明日へ →';
  const content = document.createElement('div');
  content.className = 'row-content';
  row.append(del, post, content);
  return { row, content };
}

function timedRow(key, it) {
  const { row, content } = rowShell(it.id);

  const time = document.createElement('input');
  time.className = 'time';
  time.value = it.time;
  time.placeholder = '--:--';
  time.inputMode = 'numeric';
  time.maxLength = 5;
  time.autocomplete = 'off';
  time.setAttribute('aria-label', '時間');
  time.addEventListener('input', () => {
    // 숫자만 쳐도 자동으로 ":"가 들어가게
    const digits = time.value.replace(/\D/g, '').slice(0, 4);
    time.value = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
  });
  time.addEventListener('focus', () => time.select());
  time.addEventListener('change', () => {
    const day = ensureDay(key);
    const item = day.timed.find((x) => x.id === it.id);
    if (!item) return;
    item.time = normalizeTime(time.value);
    time.value = item.time;
    day.timed.sort((a, b) => toMin(a.time) - toMin(b.time));
    commit(key);
    pendingRender = true; // 포커스가 빠지면 정렬된 순서로 다시 그림
  });
  time.addEventListener('keydown', (e) => { if (e.key === 'Enter') text.focus(); });

  const text = textInput(key, 'timed', it);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addTimed(it.id); }
  });

  content.append(time, text);
  attachSwipe(row, () => removeItem(key, 'timed', it.id), () => postponeItem(key, 'timed', it.id));
  return row;
}

function todoRow(key, it) {
  const { row, content } = rowShell(it.id);
  if (it.done) row.classList.add('done');

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'check' + (it.done ? ' on' : '');
  check.setAttribute('aria-label', 'チェック');
  check.addEventListener('click', () => {
    const day = ensureDay(key);
    const item = day.todos.find((x) => x.id === it.id);
    if (!item) return;
    item.done = !item.done;
    check.classList.toggle('on', item.done);
    row.classList.toggle('done', item.done);
    commit(key);
  });

  const text = textInput(key, 'todos', it);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addTodo(it.id); }
  });

  content.append(check, text);
  attachSwipe(row, () => removeItem(key, 'todos', it.id), () => postponeItem(key, 'todos', it.id));
  return row;
}

function textInput(key, listName, it) {
  const text = document.createElement('input');
  text.className = 'text';
  text.value = it.text;
  text.autocomplete = 'off';
  text.enterKeyHint = 'next';
  text.addEventListener('input', () => {
    const day = ensureDay(key);
    const item = day[listName].find((x) => x.id === it.id);
    if (!item) return;
    item.text = text.value;
    commit(key);
  });
  return text;
}

function focusRow(container, id, selector) {
  const row = container.querySelector(`[data-id="${id}"]`);
  row?.querySelector(selector)?.focus();
}

function addTimed(afterId) {
  const key = currentKey();
  const day = ensureDay(key);
  let base = null;
  if (afterId) base = day.timed.find((x) => x.id === afterId);
  if (!base) base = day.timed[day.timed.length - 1];
  let time = '05:00';
  if (base && base.time) {
    const m = Math.min(toMin(base.time) + 60, 24 * 60);
    time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  }
  const item = { id: newId(), time, text: '' };
  const idx = afterId ? day.timed.findIndex((x) => x.id === afterId) + 1 : day.timed.length;
  day.timed.splice(idx || day.timed.length, 0, item);
  day.timed.sort((a, b) => toMin(a.time) - toMin(b.time));
  commit(key);
  render();
  focusRow(els.timed, item.id, '.text');
}

function addTodo(afterId) {
  const key = currentKey();
  const day = ensureDay(key);
  const item = { id: newId(), text: '', done: false };
  const idx = afterId ? day.todos.findIndex((x) => x.id === afterId) + 1 : day.todos.length;
  day.todos.splice(idx || day.todos.length, 0, item);
  commit(key);
  render();
  focusRow(els.todos, item.id, '.text');
}

function removeItem(key, listName, id) {
  const day = ensureDay(key);
  day[listName] = day[listName].filter((x) => x.id !== id);
  commit(key);
}

/* 보고 있는 날의 다음 날로 항목을 옮김 */
function postponeItem(key, listName, id) {
  const day = ensureDay(key);
  const item = day[listName].find((x) => x.id === id);
  if (!item) return;
  day[listName] = day[listName].filter((x) => x.id !== id);
  commit(key);

  const [y, m, d] = key.split('-').map(Number);
  const nextKey = keyOf(new Date(y, m - 1, d + 1));
  const next = ensureDay(nextKey);
  const moved = { ...item, id: newId() };
  if (listName === 'todos') moved.done = false;
  // 다음 날의 빈 칸(템플릿 그대로인 빈 줄)은 정리하고 넣기
  next[listName] = next[listName].filter((x) => (x.text || '').trim() !== '');
  next[listName].push(moved);
  if (listName === 'timed') next.timed.sort((a, b) => toMin(a.time) - toMin(b.time));
  commit(nextKey);
}

/* ============================================================
   스와이프: 오른쪽 → 왼쪽 = 삭제 / 왼쪽 → 오른쪽 = 다음 날로 미루기
   ============================================================ */
function attachSwipe(row, onDelete, onPostpone) {
  const content = row.querySelector('.row-content');
  let startX = null, startY = 0, dx = 0, pid = null;
  let decided = false, dragging = false;
  const threshold = () => Math.min(120, row.offsetWidth * 0.35);

  const clear = () => row.classList.remove('swiping-left', 'swiping-right', 'armed');
  const reset = () => {
    startX = null; decided = false; dragging = false; pid = null;
    clear();
    document.body.classList.remove('dragging');
  };

  content.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX; startY = e.clientY; dx = 0; pid = e.pointerId;
    decided = false; dragging = false;
    content.style.transition = 'none';
  });

  content.addEventListener('pointermove', (e) => {
    if (startX === null || e.pointerId !== pid) return;
    const mx = e.clientX - startX, my = e.clientY - startY;
    if (!decided) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      decided = true;
      dragging = Math.abs(mx) > Math.abs(my) && (mx < 0 || !!onPostpone);
      if (!dragging) { startX = null; return; }
      try { content.setPointerCapture(pid); } catch (err) { /* ignore */ }
      if (row.contains(document.activeElement)) document.activeElement.blur();
      document.body.classList.add('dragging');
    }
    if (!dragging) return;
    e.preventDefault();
    dx = onPostpone ? mx : Math.min(0, mx);
    content.style.transform = `translateX(${dx}px)`;
    row.classList.toggle('swiping-left', dx < 0);
    row.classList.toggle('swiping-right', dx > 0);
    row.classList.toggle('armed', Math.abs(dx) > threshold());
  });

  const end = (e) => {
    if (startX === null || (e && e.pointerId !== pid)) return;
    const action = dragging && Math.abs(dx) > threshold() ? (dx < 0 ? onDelete : onPostpone) : null;
    const side = dx < 0 ? 'swiping-left' : 'swiping-right';
    content.style.transition = 'transform .2s ease';
    reset();
    if (action) {
      row.classList.add(side, 'armed');
      content.style.transform = `translateX(${dx < 0 ? -110 : 110}%)`;
      setTimeout(() => {
        row.classList.add('removing');
        setTimeout(() => { action(); row.remove(); }, 200);
      }, 160);
    } else {
      content.style.transform = '';
    }
  };
  content.addEventListener('pointerup', end);
  content.addEventListener('pointercancel', end);
}

/* ============================================================
   이벤트
   ============================================================ */
function go(delta) {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  offset += delta;
  render();
  sync.watch(currentKey());
}
els.prev.addEventListener('click', () => go(-1));
els.next.addEventListener('click', () => go(1));
els.title.addEventListener('click', () => { if (offset !== 0) go(-offset); });
els.addTimed.addEventListener('click', () => addTimed());
els.addTodo.addEventListener('click', () => addTodo());

document.addEventListener('keydown', (e) => {
  if (isEditing()) return;
  if (e.key === 'ArrowLeft') go(-1);
  if (e.key === 'ArrowRight') go(1);
});

document.addEventListener('focusout', () => {
  setTimeout(() => { if (pendingRender && !isEditing()) render(); }, 0);
});

// 다른 탭에서 바꾼 내용 반영
window.addEventListener('storage', (e) => {
  if (e.key === LS_KEY) { store = loadLocal(); safeRender(); }
});

// 자정이 지나면 "今日は"와 날짜가 자동으로 바뀌도록
let lastToday = keyOf(dateFor(0));
function checkDayChange() {
  const t = keyOf(dateFor(0));
  if (t !== lastToday) { lastToday = t; safeRender(); sync.watch(currentKey()); }
}
setInterval(checkDayChange, 30 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayChange(); });

// 표지 (같은 탭에서 새로고침할 때는 다시 안 보이게)
function hideCover() {
  els.cover.classList.add('hide');
  try { sessionStorage.setItem('yarubeki:started', '1'); } catch (e) { /* ignore */ }
}
let started = false;
try { started = sessionStorage.getItem('yarubeki:started') === '1'; } catch (e) { /* ignore */ }
els.cover.addEventListener('click', hideCover);
els.cover.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') hideCover(); });

/* ============================================================
   기기 간 동기화 (Firebase · Google 로그인)
   ============================================================ */
const sync = {
  ready: false, user: null, db: null, fb: null,
  timers: {}, unsub: null, watching: null,

  push(key) {
    if (!this.user) return;
    clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(() => {
      const day = store.days[key];
      if (!day) return;
      const { doc, setDoc } = this.fb;
      setDoc(doc(this.db, 'users', this.user.uid, 'days', key), JSON.parse(JSON.stringify(day)))
        .catch((err) => console.warn('sync push failed', err));
    }, 500);
  },

  watch(key) {
    if (!this.user) return;
    if (this.watching === key) return;
    this.unsub?.();
    this.watching = key;
    const { doc, onSnapshot } = this.fb;
    this.unsub = onSnapshot(doc(this.db, 'users', this.user.uid, 'days', key), (snap) => {
      if (snap.metadata.hasPendingWrites || !snap.exists()) return;
      const remote = snap.data();
      const local = store.days[key];
      if (!local || (remote.updatedAt || 0) > (local.updatedAt || 0)) {
        store.days[key] = remote;
        delete drafts[key];
        saveLocal();
        if (key === currentKey()) safeRender();
      }
    }, (err) => console.warn('sync watch failed', err));
  },

  async mergeAll() {
    const { collection, getDocs } = this.fb;
    const snap = await getDocs(collection(this.db, 'users', this.user.uid, 'days'));
    const remoteKeys = new Set();
    snap.forEach((d) => {
      remoteKeys.add(d.id);
      const r = d.data();
      const l = store.days[d.id];
      if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) { store.days[d.id] = r; delete drafts[d.id]; }
      else if ((l.updatedAt || 0) > (r.updatedAt || 0)) this.push(d.id);
    });
    // 로그인 전에 이 기기에서만 적어둔 날들을 올리기
    Object.keys(store.days).forEach((k) => { if (!remoteKeys.has(k)) this.push(k); });
    saveLocal();
    safeRender();
  },
};

function setSyncLabel(text, disabled) {
  els.syncBtn.textContent = text;
  els.syncBtn.disabled = !!disabled;
}

async function initSync() {
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    setSync('local');
    return;
  }
  setSyncLabel('…', true);
  const V = '10.12.2';
  try {
    const [app, auth, fs] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    ]);
    const fbApp = app.initializeApp(firebaseConfig);
    const authObj = auth.getAuth(fbApp);
    let db;
    try {
      db = fs.initializeFirestore(fbApp, { localCache: fs.persistentLocalCache() });
    } catch (e) {
      db = fs.getFirestore(fbApp);
    }
    sync.db = db;
    sync.fb = fs;
    sync.auth = auth;
    sync.authObj = authObj;
    auth.getRedirectResult(authObj).catch(() => {});

    auth.onAuthStateChanged(authObj, async (user) => {
      sync.user = user;
      sync.unsub?.(); sync.unsub = null; sync.watching = null;
      if (user) {
        setSync('in', user);
        try { await sync.mergeAll(); } catch (e) { console.warn(e); }
        sync.watch(currentKey());
      } else {
        setSync('out');
      }
    });
  } catch (err) {
    console.warn('firebase init failed', err);
    setSyncLabel('同期エラー（この端末にのみ保存中）', true);
  }
}

function setSync(state, user) {
  if (state === 'local') {
    setSyncLabel('この端末にのみ保存中', true);
    els.syncBtn.onclick = null;
  } else if (state === 'out') {
    setSyncLabel('Googleでログインして同期する ›');
    els.syncBtn.onclick = async () => {
      const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = sync.auth;
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(sync.authObj, provider);
      } catch (e) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
          signInWithRedirect(sync.authObj, provider);
        } else if (e.code !== 'auth/popup-closed-by-user') {
          alert('ログインできませんでした: ' + (e.code || e.message));
        }
      }
    };
  } else if (state === 'in') {
    setSyncLabel(`同期中 · ${user.email || ''} · ログアウト`);
    els.syncBtn.onclick = () => {
      if (confirm('ログアウトしますか？（この端末のデータは残ります）')) sync.auth.signOut(sync.authObj);
    };
  }
}

/* ============================================================
   시작
   ============================================================ */
render();
initSync();
