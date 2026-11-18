/* =========================================================
   하루 플래너 - 앱 로직
   - 모든 데이터는 이 기기의 localStorage 에만 저장됩니다.
   - 외부 서버로 전송하지 않습니다.
   ========================================================= */
'use strict';

(() => {
  // ---------------------------------------------------------
  // 상수
  // ---------------------------------------------------------
  const APP_VERSION = '1.0.0';
  const STORE_KEY = 'haru:data';
  const THEME_KEY = 'haru:theme';
  const BACKUP_KEY = 'haru:lastBackup';
  const KEYS = ['schedules', 'todos', 'goals', 'notes', 'diary'];
  // Claude 아티팩트(비공개 웹앱)로 열렸는지 여부
  const IS_ARTIFACT = !!window.HARU_ARTIFACT;
  const THEME_ATTR = IS_ARTIFACT ? 'data-app-theme' : 'data-theme';
  const LOAD_TS = Date.now();
  const ID_OK = /^[A-Za-z0-9_-]{1,120}$/;

  // 하루를 아침 / 점심 / 오후 / 저녁 순으로 나눔
  const SLOTS = [
    { id: 'morning', label: '아침', hint: '~ 11시' },
    { id: 'lunch', label: '점심', hint: '11 ~ 14시' },
    { id: 'afternoon', label: '오후', hint: '14 ~ 18시' },
    { id: 'evening', label: '저녁', hint: '18시 ~' },
  ];
  const ANY_SLOT = { id: 'any', label: '언제든', hint: '시간 미정' };
  const ALL_SLOTS = [...SLOTS, ANY_SLOT];

  const PRIORITY = {
    high: { label: '높음', rank: 0 },
    mid: { label: '보통', rank: 1 },
    low: { label: '낮음', rank: 2 },
  };
  const MOODS = [
    { id: 'great', emoji: '😄', label: '최고' },
    { id: 'good', emoji: '🙂', label: '좋음' },
    { id: 'soso', emoji: '😐', label: '보통' },
    { id: 'sad', emoji: '😢', label: '슬픔' },
    { id: 'angry', emoji: '😠', label: '화남' },
  ];
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m8 12.5 3 3 5-6.5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    book: '<path d="M5 4h9a4 4 0 0 1 4 4v13H9a4 4 0 0 1-4-4z"/><path d="M9 9h5M9 13h5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    pin: '<path d="M9 3h6l-1 7 4 4H6l4-4z"/><path d="M12 14v7"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
  };
  const CHECK_SVG = '<span class="box"><svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9"/></svg></span>';

  // ---------------------------------------------------------
  // 유틸리티
  // ---------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ''}</svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => toKey(new Date());
  const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const isDateKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && !isNaN(parseKey(k));
  const parseKey = (k) => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return toKey(d); };
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const fmtDate = (k, withYear = false) => {
    if (!isDateKey(k)) return '';
    const d = parseKey(k);
    return `${withYear ? d.getFullYear() + '년 ' : ''}${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
  };
  const fmtStamp = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const dday = (k) => {
    const diff = Math.round((parseKey(k) - parseKey(today())) / 86400000);
    return diff === 0 ? 'D-Day' : diff > 0 ? `D-${diff}` : `D+${-diff}`;
  };
  const slotOfTime = (t) => {
    if (!t) return 'any';
    const h = Number(t.slice(0, 2));
    return h < 11 ? 'morning' : h < 14 ? 'lunch' : h < 18 ? 'afternoon' : 'evening';
  };
  const slotMeta = (id) => ALL_SLOTS.find((s) => s.id === id) || ANY_SLOT;
  const moodMeta = (id) => MOODS.find((m) => m.id === id);
  const timeRange = (s) => (s.start ? (s.end ? `${s.start} ~ ${s.end}` : s.start) : '종일');
  const byTime = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.start || '99').localeCompare(b.start || '99');

  // ---------------------------------------------------------
  // 데이터 저장소 (localStorage)
  // ---------------------------------------------------------
  const emptyData = () => ({ version: 1, schedules: [], todos: [], goals: [], notes: [], diary: [] });

  function normalize(raw) {
    const d = emptyData();
    if (!raw || typeof raw !== 'object') return d;
    KEYS.forEach((k) => {
      if (Array.isArray(raw[k])) {
        d[k] = raw[k]
          .filter((x) => x && typeof x === 'object')
          .map((x) => (typeof x.id === 'string' && ID_OK.test(x.id) ? x : { ...x, id: uid() }));
      }
    });
    return d;
  }

  function load() {
    try {
      const s = localStorage.getItem(STORE_KEY);
      return s ? normalize(JSON.parse(s)) : emptyData();
    } catch (e) {
      console.error('데이터를 불러오지 못했습니다.', e);
      return emptyData();
    }
  }

  let db = load();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch (e) {
      if (!cloud.ready) {
        console.error(e);
        toast('저장에 실패했습니다. 기기 저장 공간을 확인해 주세요.', 'error');
        return false;
      }
    }
    pushChanges();
    return true;
  }

  // ---------------------------------------------------------
  // 계정 저장 · 동기화 (아티팩트 모드)
  // 각 항목을 data/users/<내 id>/<항목 id> 문서로 저장합니다.
  // 이 경로는 본인만 읽고 쓸 수 있습니다.
  // ---------------------------------------------------------
  const cloud = { col: null, ready: false, status: 'local', synced: new Map(), queue: Promise.resolve(), pending: 0, lastSnap: null };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function setCloudStatus(st) {
    cloud.status = st;
    if (state.view === 'more' && $('#modal').hidden) render();
  }

  async function initCloud() {
    if (!IS_ARTIFACT || !window.claude || typeof window.claude.use !== 'function') return;
    setCloudStatus('connecting');
    try {
      const [store, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      const uidv = store && user ? await user.id() : null;
      if (!store || !uidv) { setCloudStatus('local'); return; }
      cloud.col = store.collection('data/users/' + uidv);
      const timer = setTimeout(() => { if (!cloud.ready) setCloudStatus('slow'); }, 10000);
      cloud.col.onSnapshot((snap) => {
        cloud.lastSnap = snap;
        if (!cloud.ready) {
          if (snap.metadata.fromCache) return;
          clearTimeout(timer);
          firstSync(snap);
        } else if (!cloud.pending) {
          applySnapshot(snap);
        }
      }, (err) => {
        clearTimeout(timer);
        console.warn('동기화 오류', err);
        cloud.ready = false;
        setCloudStatus('error');
      });
    } catch (e) {
      console.warn(e);
      setCloudStatus('local');
    }
  }

  function snapToData(snap) {
    const next = emptyData();
    const synced = new Map();
    snap.docs.forEach((d) => {
      const body = d.data();
      if (!body || !KEYS.includes(body.k) || !body.v || typeof body.v !== 'object') return;
      const item = JSON.parse(JSON.stringify(body.v));
      item.id = d.id;
      next[body.k].push(item);
      synced.set(d.id, JSON.stringify({ k: body.k, v: item }));
    });
    return { next, synced };
  }

  function firstSync(snap) {
    const { next, synced } = snapToData(snap);
    cloud.ready = true;
    cloud.status = 'cloud';
    if (snap.empty) {
      // 계정에 아직 데이터가 없으면 이 기기의 데이터를 올림
      cloud.synced = new Map();
    } else {
      // 계정 데이터 기준 + 방금 이 화면에서 새로 만든 항목은 유지
      KEYS.forEach((k) => {
        const ids = new Set(next[k].map((x) => x.id));
        db[k].forEach((x) => { if (!ids.has(x.id) && (x.created || 0) >= LOAD_TS) next[k].push(x); });
      });
      cloud.synced = synced;
      mergeInPlace(next);
    }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch {}
    pushChanges();
    if ($('#modal').hidden) render();
  }

  // 수정 중인 항목의 참조가 끊기지 않도록 기존 객체를 그대로 갱신
  function mergeInPlace(next) {
    KEYS.forEach((k) => {
      const cur = new Map(db[k].map((x) => [x.id, x]));
      db[k] = next[k].map((n) => {
        const o = cur.get(n.id);
        if (!o) return n;
        Object.keys(o).forEach((key) => { if (!(key in n)) delete o[key]; });
        return Object.assign(o, n);
      });
    });
  }

  function applySnapshot(snap) {
    const before = JSON.stringify(db);
    const { next, synced } = snapToData(snap);
    cloud.synced = synced;
    mergeInPlace(next);
    const after = JSON.stringify(db);
    if (before === after) return;
    try { localStorage.setItem(STORE_KEY, after); } catch {}
    if ($('#modal').hidden && !document.activeElement?.matches('input, textarea, select')) render();
  }

  function pushChanges() {
    if (!cloud.ready || !cloud.col) return;
    const want = new Map();
    KEYS.forEach((k) => db[k].forEach((it) => want.set(it.id, JSON.stringify({ k, v: it }))));
    const ops = [];
    want.forEach((body, id) => { if (cloud.synced.get(id) !== body) ops.push(['set', id, body]); });
    cloud.synced.forEach((_, id) => { if (!want.has(id)) ops.push(['del', id]); });
    if (!ops.length) return;
    ops.forEach(([op, id, body]) => (op === 'set' ? cloud.synced.set(id, body) : cloud.synced.delete(id)));
    cloud.pending++;
    cloud.queue = cloud.queue.then(async () => {
      for (const [op, id, body] of ops) {
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const ref = cloud.col.doc(id);
            if (op === 'set') await ref.set(JSON.parse(body)); else await ref.delete();
            break;
          } catch (e) {
            const code = e && e.code;
            if ((code === 'unavailable' || code === 'resource_exhausted') && attempt < 3) { await wait(800 * (attempt + 1) + Math.random() * 400); continue; }
            cloud.synced.delete(id);
            console.warn('동기화 저장 실패', code, e);
            toast(code === 'quota_exceeded' ? '계정 저장 공간이 가득 찼어요. 오래된 항목을 지우고 백업해 두세요.' : '계정에 저장하지 못한 항목이 있어요. 이 기기에는 저장되어 있어요.', 'error');
            break;
          }
        }
      }
    }).finally(() => {
      cloud.pending--;
      if (!cloud.pending && cloud.lastSnap) applySnapshot(cloud.lastSnap);
    });
  }

  const find = (col, id) => db[col].find((x) => x.id === id);
  const removeItem = (col, id) => { db[col] = db[col].filter((x) => x.id !== id); save(); };
  const isEmptyDb = () => KEYS.every((k) => db[k].length === 0);

  // 할 일 (매일 반복 체크리스트 지원)
  const todosFor = (date) => db.todos.filter((t) => (t.repeat ? t.date <= date : t.date === date));
  const isTodoDone = (t, date) => (t.repeat ? (t.doneDates || []).includes(date) : !!t.done);
  function toggleTodo(t, date) {
    if (t.repeat) {
      const set = new Set(t.doneDates || []);
      set.has(date) ? set.delete(date) : set.add(date);
      t.doneDates = [...set];
    } else {
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : null;
    }
    save();
    return isTodoDone(t, date);
  }
  const sortTodos = (list, date) =>
    list.slice().sort((a, b) =>
      (isTodoDone(a, date) - isTodoDone(b, date)) ||
      ((PRIORITY[a.priority]?.rank ?? 1) - (PRIORITY[b.priority]?.rank ?? 1)) ||
      ((a.created || 0) - (b.created || 0)));

  // 목표
  function setGoalDone(g, done) {
    g.done = done;
    if (done) { g.progress = 100; g.doneAt = Date.now(); }
    else { g.doneAt = null; if (g.progress >= 100) g.progress = 90; }
    save();
  }
  const goalStatus = (g) => {
    if (g.done) return { label: '완료', cls: 'ok' };
    if (g.deadline && g.deadline < today()) return { label: '기한 지남', cls: 'danger' };
    if (!g.progress) return { label: '시작 전', cls: '' };
    return { label: '진행 중', cls: 'accent' };
  };

  // 중요 사항 정렬: 고정 → 중요도 → 최근 수정
  const sortedNotes = (list = db.notes) =>
    list.slice().sort((a, b) =>
      (!!b.pinned - !!a.pinned) ||
      ((PRIORITY[a.priority]?.rank ?? 1) - (PRIORITY[b.priority]?.rank ?? 1)) ||
      ((b.updated || b.created || 0) - (a.updated || a.created || 0)));

  // ---------------------------------------------------------
  // 테마
  // ---------------------------------------------------------
  function getTheme() {
    try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  }
  function applyTheme(t) {
    document.documentElement.setAttribute(THEME_ATTR, t);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#f4f5f9' : '#0f1117');
  }
  function setTheme(t) {
    try { localStorage.setItem(THEME_KEY, t); } catch {}
    applyTheme(t);
    render();
    toast(t === 'dark' ? '다크 모드로 바꿨습니다.' : '라이트 모드로 바꿨습니다.');
  }

  // ---------------------------------------------------------
  // 화면 상태 & 라우팅 (#home, #todo ...)
  // ---------------------------------------------------------
  const state = {
    view: 'home',
    schedDate: today(),
    schedFilter: 'date',
    todoDate: today(),
    todoFilter: 'all',
    goalTab: 'active',
    goalType: 'all',
    noteQuery: '',
    searchQuery: '',
  };

  const VIEWS = {
    home: { title: '오늘', render: viewHome, fab: () => openAddChooser() },
    schedule: { title: '일정', render: viewSchedule, fab: () => openScheduleForm() },
    todo: { title: '할 일 체크리스트', render: viewTodo, fab: () => openTodoForm() },
    goals: { title: '목표', render: viewGoals, fab: () => openGoalForm() },
    notes: { title: '중요 사항 보관함', render: viewNotes, fab: () => openNoteForm() },
    diary: { title: '일기 · 하루 기록', render: viewDiary, fab: () => openDiaryForDate(today()) },
    search: { title: '전체 검색', render: viewSearch },
    done: { title: '완료 모아보기', render: viewDone },
    more: { title: '설정 · 백업', render: viewSettings },
  };
  const NAV = [
    ['home', '홈', 'home'], ['schedule', '일정', 'calendar'], ['todo', '할 일', 'check'],
    ['goals', '목표', 'target'], ['notes', '중요', 'star'], ['diary', '일기', 'book'],
  ];

  function route() {
    const v = location.hash.replace('#', '');
    state.view = VIEWS[v] ? v : 'home';
    closeModal();
    render();
    window.scrollTo(0, 0);
  }
  function go(view) {
    // 즉시 화면을 바꾸고 주소(#)도 기록해서 뒤로 가기 버튼이 동작하게 함
    if (location.hash.replace('#', '') !== view) {
      if (IS_ARTIFACT) { state.view = view; location.hash = view; }
      else history.pushState(null, '', '#' + view);
    }
    route();
  }

  function render() {
    const v = VIEWS[state.view];
    $('#viewTitle').textContent = v.title;
    document.title = state.view === 'home' ? '하루 플래너' : `${v.title} - 하루 플래너`;
    $('#main').innerHTML = v.render();
    $$('.nav-btn').forEach((b) => {
      const on = b.dataset.view === state.view;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('#searchBtn').classList.toggle('active', state.view === 'search');
    $('#settingsBtn').classList.toggle('active', state.view === 'more');
    $('#themeBtn').innerHTML = icon(getTheme() === 'dark' ? 'sun' : 'moon');
    $('#fab').hidden = !v.fab;
  }

  // ---------------------------------------------------------
  // 공통 조각
  // ---------------------------------------------------------
  const segmented = (action, options, current) =>
    `<div class="seg" role="tablist">${options.map(([v, l]) =>
      `<button type="button" role="tab" class="${v === current ? 'on' : ''}" aria-selected="${v === current}" data-action="${action}" data-value="${v}">${l}</button>`).join('')}</div>`;

  const pills = (action, options, current) =>
    `<div class="filter-row">${options.map(([v, l]) =>
      `<button type="button" class="pill ${v === current ? 'on' : ''}" data-action="${action}" data-value="${v}">${l}</button>`).join('')}</div>`;

  const dateNav = (target, key) => `
    <div class="date-nav">
      <button type="button" class="icon-btn" data-action="date-shift" data-target="${target}" data-n="-1" aria-label="이전 날짜">${icon('left')}</button>
      <label class="date-label">
        <span>${fmtDate(key)}</span>${key === today() ? '<span class="badge accent">오늘</span>' : ''}
        <input type="date" value="${key}" data-change="date-set" data-target="${target}" aria-label="날짜 선택">
      </label>
      <button type="button" class="icon-btn" data-action="date-shift" data-target="${target}" data-n="1" aria-label="다음 날짜">${icon('right')}</button>
      ${key !== today() ? `<button type="button" class="today-btn" data-action="date-today" data-target="${target}">오늘</button>` : ''}
    </div>`;

  const emptyBox = (emo, title, text, btn) => `
    <div class="empty">
      <span class="emo">${emo}</span><b>${title}</b><p>${text}</p>
      ${btn ? `<p><button type="button" class="btn primary" data-action="${btn[0]}">${icon('plus')}${btn[1]}</button></p>` : ''}
    </div>`;

  const progressBar = (pct, ok) => `<div class="progress ${ok ? 'ok' : ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;

  const prBadge = (p) => (PRIORITY[p] ? `<span class="badge p-${p}">${PRIORITY[p].label}</span>` : '');

  // 일정 항목
  function scheduleItem(s, showDate = false) {
    return `
    <article class="item ${s.done ? 'is-done' : ''}">
      <button type="button" class="chk ${s.done ? 'on' : ''}" data-action="toggle-schedule" data-id="${s.id}" aria-pressed="${!!s.done}" aria-label="${esc(s.title)} 완료 표시">${CHECK_SVG}</button>
      <div class="item-body" data-action="edit-schedule" data-id="${s.id}" role="button" tabindex="0">
        <div class="item-meta">${showDate ? `<span>${fmtDate(s.date)}</span>` : ''}<span class="time">${timeRange(s)}</span><span class="badge t-schedule">일정</span></div>
        <div class="item-title">${esc(s.title)}</div>
        ${s.detail ? `<div class="item-sub">${esc(s.detail)}</div>` : ''}
        ${s.memo ? `<div class="item-memo">📝 ${esc(s.memo)}</div>` : ''}
      </div>
    </article>`;
  }

  // 할 일 항목
  function todoItem(t, date, { showSlot = false, tag = false } = {}) {
    const done = isTodoDone(t, date);
    return `
    <article class="item ${done ? 'is-done' : ''}">
      <button type="button" class="chk ${done ? 'on' : ''}" data-action="toggle-todo" data-id="${t.id}" data-date="${date}" aria-pressed="${done}" aria-label="${esc(t.title)} 완료 체크">${CHECK_SVG}</button>
      <div class="item-body" data-action="edit-todo" data-id="${t.id}" data-date="${date}" role="button" tabindex="0">
        <div class="item-title">${esc(t.title)}</div>
        <div class="item-meta">
          ${tag ? '<span class="badge t-todo">할 일</span>' : ''}
          ${prBadge(t.priority)}
          ${t.repeat ? '<span class="badge accent">매일</span>' : ''}
          ${showSlot ? `<span>${slotMeta(t.slot).label}</span>` : ''}
          ${t.memo ? `<span>📝 ${esc(t.memo)}</span>` : ''}
        </div>
      </div>
    </article>`;
  }

  // ---------------------------------------------------------
  // 화면: 홈 대시보드
  // ---------------------------------------------------------
  function viewHome() {
    const t = today();
    const d = new Date();
    const todos = todosFor(t);
    const doneTodos = todos.filter((x) => isTodoDone(x, t)).length;
    const scheds = db.schedules.filter((s) => s.date === t).sort(byTime);
    const activeGoals = db.goals.filter((g) => !g.done);
    const doneGoals = db.goals.length - activeGoals.length;
    const pct = todos.length ? Math.round((doneTodos / todos.length) * 100) : 0;
    const currentSlot = slotOfTime(nowTime());

    // 시간대별 플랜 (아침 → 점심 → 오후 → 저녁 → 언제든)
    const slotBlocks = ALL_SLOTS.map((slot) => {
      const ss = scheds.filter((s) => slotOfTime(s.start) === slot.id);
      const ts = sortTodos(todos.filter((x) => (x.slot || 'any') === slot.id), t);
      if (slot.id === 'any' && !ss.length && !ts.length) return '';
      const total = ss.length + ts.length;
      const done = ss.filter((s) => s.done).length + ts.filter((x) => isTodoDone(x, t)).length;
      return `
      <div class="card slot s-${slot.id} ${slot.id === currentSlot ? 'is-now' : ''}">
        <div class="slot-head">
          <span class="slot-dot"></span><h3>${slot.label}</h3><span class="slot-hint">${slot.hint}</span>
          ${slot.id === currentSlot ? '<span class="slot-now">지금</span>' : ''}
          <span class="slot-count">${total ? `${done}/${total}` : ''}</span>
          <button type="button" class="slot-add" data-action="add-todo" data-slot="${slot.id}" data-date="${t}" aria-label="${slot.label} 할 일 추가">${icon('plus')}</button>
        </div>
        ${total ? ss.map((s) => scheduleItem(s)).join('') + ts.map((x) => todoItem(x, t, { tag: true })).join('')
                : '<div class="slot-empty">비어 있어요. + 를 눌러 추가하세요.</div>'}
      </div>`;
    }).join('');

    // 중요 사항 빠른 확인
    const pinned = sortedNotes().filter((n) => n.pinned || n.priority === 'high');
    const chips = sortedNotes().slice(0, 8);

    // 오늘 일기
    const diary = db.diary.find((x) => x.date === t);

    const welcome = isEmptyDb() ? `
      <section class="card welcome wide" style="margin-bottom:18px">
        <h2>👋 하루 플래너에 오신 것을 환영해요</h2>
        <div class="muted small">하루를 <b>아침 · 점심 · 오후 · 저녁</b>으로 나눠 계획하고 체크해 보세요.</div>
        <ol>
          <li>아래 시간대 카드의 <b>+</b> 버튼으로 할 일을 추가합니다.</li>
          <li>끝낸 일은 왼쪽 네모를 눌러 <b>V 체크</b>합니다.</li>
          <li>잊으면 안 되는 정보는 <b>중요</b> 탭에 보관하고, 위 검색칸에서 바로 찾습니다.</li>
          <li>데이터는 이 기기에만 저장되니 가끔 <b>설정 → 백업</b>을 해 두세요.</li>
        </ol>
        <div class="btn-row">
          <button type="button" class="btn primary" data-action="add-todo" data-slot="${currentSlot}" data-date="${t}">${icon('plus')}첫 할 일 추가</button>
          <button type="button" class="btn ghost" data-action="sample">예시 데이터로 둘러보기</button>
        </div>
      </section>` : '';

    return `
    <div class="home-grid">
      <section class="card hero wide" style="margin-bottom:18px">
        <div class="hero-date">
          <span class="hero-year">${d.getFullYear()}년</span>
          <strong>${d.getMonth() + 1}월 ${d.getDate()}일</strong><span class="hero-week">${WEEK[d.getDay()]}요일</span>
        </div>
        <div class="stats">
          <button type="button" class="stat" data-action="nav" data-view="todo"><b>${doneTodos}/${todos.length}</b><span>할 일 완료</span></button>
          <button type="button" class="stat" data-action="nav" data-view="schedule"><b>${scheds.length}</b><span>오늘 일정</span></button>
          <button type="button" class="stat" data-action="nav" data-view="goals"><b>${activeGoals.length}</b><span>진행 목표</span></button>
          <button type="button" class="stat" data-action="goto-done-goals"><b>${doneGoals}</b><span>완료 목표</span></button>
        </div>
        <div class="hero-progress">
          <div class="row"><span>오늘 체크리스트 달성률</span><b>${pct}%</b></div>
          ${progressBar(pct, pct === 100 && todos.length > 0)}
        </div>
      </section>

      ${welcome}

      <section class="section wide">
        <div class="card">
          <label class="search-box">
            ${icon('search')}
            <input type="search" placeholder="바로 찾기: 일정, 할 일, 메모, 일기…" value="${esc(state.searchQuery)}" data-search="global" aria-label="전체 데이터 바로 찾기" autocomplete="off" enterkeyhint="search">
          </label>
          <div class="results" data-results="global">${searchResultsHTML(state.searchQuery)}</div>
          ${chips.length ? `<div class="chips"><span class="chips-label">⭐ 중요 사항 바로 보기</span>${chips.map((n) =>
            `<button type="button" class="chip ${n.pinned ? 'pinned' : ''}" data-action="edit-note" data-id="${n.id}">${esc(n.title)}</button>`).join('')}</div>` : ''}
          <div class="quick-actions">
            <button type="button" data-action="add-todo" data-slot="${currentSlot}" data-date="${t}">${icon('check')}할 일</button>
            <button type="button" data-action="add-schedule">${icon('calendar')}일정</button>
            <button type="button" data-action="add-note">${icon('star')}중요 메모</button>
            <button type="button" data-action="write-diary">${icon('book')}일기</button>
          </div>
        </div>
      </section>

      <section class="section wide">
        <div class="section-head"><h2>오늘의 플랜</h2><button type="button" class="link-btn" data-action="nav" data-view="todo">체크리스트 전체 ›</button></div>
        ${slotBlocks}
      </section>

      <section class="section">
        <div class="section-head"><h2>진행 중인 목표</h2><button type="button" class="link-btn" data-action="nav" data-view="goals">전체 ›</button></div>
        ${activeGoals.length ? `<div class="card">${activeGoals.slice(0, 4).map((g) => `
          <div style="margin-bottom:12px" data-action="edit-goal" data-id="${g.id}" role="button" tabindex="0">
            <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px">
              <span class="item-title">${esc(g.title)}</span><span class="muted small">${g.progress || 0}%</span>
            </div>${progressBar(g.progress || 0)}
          </div>`).join('')}
          <div class="muted small">완료한 목표 <b style="color:var(--ok)">${doneGoals}개</b> · 진행 중 ${activeGoals.length}개</div></div>`
        : emptyBox('🎯', '진행 중인 목표가 없어요', '단기·장기 목표를 세우고 달성률을 기록해 보세요.', ['add-goal', '목표 추가'])}
      </section>

      <section class="section">
        <div class="section-head"><h2>중요 사항 요약</h2><button type="button" class="link-btn" data-action="nav" data-view="notes">보관함 ›</button></div>
        ${pinned.length ? `<div class="list">${pinned.slice(0, 3).map((n) => `
          <div class="item" data-action="edit-note" data-id="${n.id}" role="button" tabindex="0" style="padding:12px 14px;cursor:pointer">
            <div class="item-body" style="padding:0">
              <div class="item-meta">${n.pinned ? '<span>📌 고정</span>' : ''}${prBadge(n.priority)}</div>
              <div class="item-title">${esc(n.title)}</div>
              <div class="item-sub" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(n.content)}</div>
            </div>
          </div>`).join('')}</div>`
        : emptyBox('⭐', '고정된 중요 사항이 없어요', '비밀번호 힌트, 계좌, 연락처처럼 잊으면 안 되는 정보를 보관하고 📌 고정하세요.', ['add-note', '중요 사항 추가'])}
      </section>

      <section class="section wide">
        <div class="section-head"><h2>오늘의 하루 기록</h2><button type="button" class="link-btn" data-action="nav" data-view="diary">일기장 ›</button></div>
        <div class="card">
          <div class="muted small" style="margin-bottom:8px">오늘 기분은 어때요?</div>
          <div class="moods">${MOODS.map((m) => `
            <button type="button" class="mood-btn ${diary?.mood === m.id ? 'on' : ''}" data-action="set-mood" data-mood="${m.id}" aria-pressed="${diary?.mood === m.id}">
              <span class="emo">${m.emoji}</span>${m.label}</button>`).join('')}
          </div>
          <form class="quick-line" data-form="quick-diary">
            <input type="text" name="line" maxlength="300" placeholder="한 줄 기록 (예: 운동 30분 완료!)" aria-label="오늘의 한 줄 기록" enterkeyhint="done">
            <button type="submit" class="btn primary">기록</button>
          </form>
          ${diary && (diary.title || diary.body) ? `
            <div class="diary-preview">${diary.title ? `<b style="color:var(--text)">${esc(diary.title)}</b>\n` : ''}${esc(diary.body)}</div>
            <div style="margin-top:10px"><button type="button" class="btn ghost block" data-action="write-diary">${icon('pen')}오늘 일기 이어 쓰기</button></div>`
          : `<div style="margin-top:10px"><button type="button" class="btn ghost block" data-action="write-diary">${icon('pen')}오늘 일기 쓰기</button></div>`}
        </div>
      </section>
    </div>`;
  }

  // ---------------------------------------------------------
  // 화면: 일정
  // ---------------------------------------------------------
  function viewSchedule() {
    const f = state.schedFilter;
    const t = today();
    let head = '';
    let list = [];
    let emptyText;
    if (f === 'date') {
      head = dateNav('sched', state.schedDate);
      list = db.schedules.filter((s) => s.date === state.schedDate).sort(byTime);
      emptyText = ['📅', `${fmtDate(state.schedDate)} 일정이 없어요`, '+ 버튼을 눌러 일정을 추가하세요. 날짜를 눌러 다른 날로 이동할 수 있어요.'];
    } else if (f === 'upcoming') {
      list = db.schedules.filter((s) => s.date >= t && !s.done).sort(byTime);
      emptyText = ['🗓️', '다가오는 일정이 없어요', '오늘 이후의 미완료 일정이 여기에 모여요.'];
    } else if (f === 'past') {
      list = db.schedules.filter((s) => s.date < t).sort((a, b) => byTime(b, a));
      emptyText = ['🕰️', '지난 일정이 없어요', '오늘 이전 날짜의 일정이 여기에 표시돼요.'];
    } else {
      list = db.schedules.filter((s) => s.done).sort((a, b) => byTime(b, a));
      emptyText = ['✅', '완료한 일정이 없어요', '일정 왼쪽의 네모를 눌러 완료로 표시하세요.'];
    }
    const counts = {
      upcoming: db.schedules.filter((s) => s.date >= t && !s.done).length,
    };
    return `
      ${segmented('sched-filter', [['date', '날짜별'], ['upcoming', `다가오는 ${counts.upcoming || ''}`], ['past', '지난'], ['done', '완료']], f)}
      ${head}
      ${list.length
        ? `<div class="list">${list.map((s) => scheduleItem(s, f !== 'date')).join('')}</div>`
        : emptyBox(...emptyText, ['add-schedule', '일정 추가'])}`;
  }

  // ---------------------------------------------------------
  // 화면: 할 일 체크리스트
  // ---------------------------------------------------------
  function viewTodo() {
    const d = state.todoDate;
    const all = todosFor(d);
    const done = all.filter((t) => isTodoDone(t, d)).length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    const f = state.todoFilter;
    const filt = (t) => (f === 'all' ? true : f === 'done' ? isTodoDone(t, d) : !isTodoDone(t, d));
    const defSlot = d === today() ? slotOfTime(nowTime()) : 'morning';

    const groups = ALL_SLOTS.map((slot) => {
      const items = sortTodos(all.filter((t) => (t.slot || 'any') === slot.id && filt(t)), d);
      const totalInSlot = all.filter((t) => (t.slot || 'any') === slot.id);
      if (!items.length && (f !== 'all' || slot.id === 'any')) return '';
      const sd = totalInSlot.filter((t) => isTodoDone(t, d)).length;
      return `
        <div class="card slot s-${slot.id}">
          <div class="slot-head">
            <span class="slot-dot"></span><h3>${slot.label}</h3><span class="slot-hint">${slot.hint}</span>
            <span class="slot-count">${totalInSlot.length ? `${sd}/${totalInSlot.length}` : ''}</span>
            <button type="button" class="slot-add" data-action="add-todo" data-slot="${slot.id}" data-date="${d}" aria-label="${slot.label} 할 일 추가">${icon('plus')}</button>
          </div>
          ${items.length ? items.map((t) => todoItem(t, d)).join('') : '<div class="slot-empty">할 일이 없어요.</div>'}
        </div>`;
    }).join('');

    return `
      ${dateNav('todo', d)}
      <form class="card quick-add" data-form="quick-todo">
        <input type="text" name="title" maxlength="100" placeholder="할 일 입력 후 추가" aria-label="할 일 빠른 추가" enterkeyhint="done" autocomplete="off">
        <select name="slot" aria-label="시간대">${ALL_SLOTS.map((s) => `<option value="${s.id}" ${s.id === defSlot ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
        <button type="submit" class="btn primary" aria-label="추가">${icon('plus')}</button>
      </form>
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
          <span class="muted small">완료 <b style="color:var(--ok);font-size:18px">${done}</b> / ${all.length}개 · 남은 일 ${all.length - done}개</span>
          <b>${pct}%</b>
        </div>
        ${progressBar(pct, pct === 100 && all.length > 0)}
      </div>
      ${pills('todo-filter', [['all', '전체'], ['open', '미완료'], ['done', '완료']], f)}
      ${!all.length ? emptyBox('📝', '이 날의 할 일이 없어요', '위 입력칸에 바로 입력하거나 + 버튼을 눌러 시간대·중요도를 정해 추가하세요. "매일 반복"을 켜면 매일 나타나는 체크리스트가 돼요.') : ''}
      ${all.length && f !== 'all' && !all.some(filt) ? `<p class="empty-sm">${f === 'done' ? '아직 완료한 항목이 없어요.' : '모두 완료했어요! 🎉'}</p>` : ''}
      ${all.length || f === 'all' ? groups : ''}`;
  }

  // ---------------------------------------------------------
  // 화면: 목표
  // ---------------------------------------------------------
  function viewGoals() {
    const total = db.goals.length;
    const doneCnt = db.goals.filter((g) => g.done).length;
    const rate = total ? Math.round((doneCnt / total) * 100) : 0;
    const avg = total ? Math.round(db.goals.reduce((a, g) => a + (g.progress || 0), 0) / total) : 0;
    const typeOk = (g) => state.goalType === 'all' || (g.type || 'short') === state.goalType;
    const tab = state.goalTab;
    const list = db.goals
      .filter((g) => (tab === 'done' ? g.done : !g.done) && typeOk(g))
      .sort((a, b) => (tab === 'done'
        ? (b.doneAt || 0) - (a.doneAt || 0)
        : (a.deadline || '9999').localeCompare(b.deadline || '9999')));

    return `
      <div class="card rate-card">
        <div class="ring" style="--p:${rate}" data-label="${rate}%" role="img" aria-label="목표 달성률 ${rate}%"></div>
        <div class="rate-lines">
          <div><b>목표 달성률</b></div>
          <div>완료 <b>${doneCnt}</b> / 전체 ${total}개</div>
          <div>전체 평균 진행도 <b>${avg}%</b></div>
        </div>
      </div>
      ${segmented('goal-tab', [['active', `진행 중 ${total - doneCnt}`], ['done', `완료한 목표 ${doneCnt}`]], tab)}
      ${pills('goal-type', [['all', '전체'], ['short', '단기 목표'], ['long', '장기 목표']], state.goalType)}
      ${list.length ? `<div class="list">${list.map(goalCard).join('')}</div>`
        : tab === 'done'
          ? emptyBox('🏆', '완료한 목표가 아직 없어요', '목표 왼쪽 네모에 V 체크하거나 진행도를 100%로 올리면 여기로 옮겨져요.')
          : emptyBox('🎯', '진행 중인 목표가 없어요', '단기 목표(이번 주·이번 달)와 장기 목표(올해·몇 년)를 나눠 세워 보세요.', ['add-goal', '목표 추가'])}`;
  }

  function goalCard(g) {
    const st = goalStatus(g);
    const p = g.progress || 0;
    return `
    <article class="card goal ${g.done ? 'is-done' : ''}">
      <div class="goal-top">
        <button type="button" class="chk ${g.done ? 'on' : ''}" data-action="toggle-goal" data-id="${g.id}" aria-pressed="${!!g.done}" aria-label="${esc(g.title)} 완료 체크">${CHECK_SVG}</button>
        <div class="item-body" data-action="edit-goal" data-id="${g.id}" role="button" tabindex="0">
          <div class="item-title">${esc(g.title)}</div>
          <div class="item-meta">
            <span class="badge">${g.type === 'long' ? '장기' : '단기'}</span>
            <span class="badge ${st.cls}">${st.label}</span>
            ${g.deadline ? `<span>~ ${fmtDate(g.deadline)} ${g.done ? '' : `<b>${dday(g.deadline)}</b>`}</span>` : ''}
            ${g.done && g.doneAt ? `<span>달성 ${fmtStamp(g.doneAt).slice(0, 10)}</span>` : ''}
          </div>
        </div>
      </div>
      ${g.desc ? `<p class="goal-desc">${esc(g.desc)}</p>` : ''}
      <div class="goal-progress">
        ${progressBar(p, g.done)}
        <div class="goal-foot">
          <b>${p}%</b>
          ${g.done ? '' : `<div class="stepper">
            <button type="button" data-action="goal-step" data-id="${g.id}" data-n="-10" aria-label="진행도 10% 내리기">−10</button>
            <button type="button" data-action="goal-step" data-id="${g.id}" data-n="10" aria-label="진행도 10% 올리기">+10</button>
          </div>`}
        </div>
      </div>
    </article>`;
  }

  // ---------------------------------------------------------
  // 화면: 중요 사항 보관함
  // ---------------------------------------------------------
  function viewNotes() {
    return `
      <div class="search-box" style="margin-bottom:12px">
        ${icon('search')}
        <input type="search" placeholder="중요 사항 검색 (제목·내용)" value="${esc(state.noteQuery)}" data-search="notes" aria-label="중요 사항 검색" autocomplete="off">
      </div>
      <div data-results="notes">${notesListHTML()}</div>`;
  }

  function notesListHTML() {
    if (!db.notes.length) {
      return emptyBox('⭐', '보관된 중요 사항이 없어요', '잊어버리면 안 되는 정보(예: 공과금 납부일, 와이파이 비밀번호, 병원 예약 번호)를 저장해 두세요. 📌 고정하면 맨 위와 홈 화면에 보여요.', ['add-note', '중요 사항 추가']);
    }
    const q = state.noteQuery.trim().toLowerCase();
    const list = sortedNotes(db.notes.filter((n) => !q || `${n.title}\n${n.content}`.toLowerCase().includes(q)));
    if (!list.length) return `<p class="empty-sm">'${esc(state.noteQuery)}'에 해당하는 중요 사항이 없어요.</p>`;
    return `<div class="result-count">${list.length}개</div><div class="list" style="margin-top:6px">${list.map((n) => `
      <article class="card note ${n.pinned ? 'is-pinned' : ''}" style="margin:0">
        <div class="note-head">
          <div class="item-body" data-action="edit-note" data-id="${n.id}" role="button" tabindex="0">
            <div class="item-meta">${prBadge(n.priority)}<span>${fmtStamp(n.updated || n.created).slice(0, 10)}</span></div>
            <div class="item-title">${highlight(n.title, state.noteQuery)}</div>
          </div>
          <button type="button" class="icon-btn pin-btn ${n.pinned ? 'on' : ''}" data-action="toggle-pin" data-id="${n.id}" aria-pressed="${!!n.pinned}" aria-label="${n.pinned ? '고정 해제' : '상단 고정'}" title="${n.pinned ? '고정 해제' : '상단 고정'}">${icon('pin')}</button>
        </div>
        <div class="note-content" data-action="edit-note" data-id="${n.id}">${highlight(n.content, state.noteQuery)}</div>
      </article>`).join('')}</div>`;
  }

  // ---------------------------------------------------------
  // 화면: 일기
  // ---------------------------------------------------------
  function viewDiary() {
    const t = today();
    const todayEntry = db.diary.find((x) => x.date === t);
    const list = db.diary.slice().sort((a, b) => b.date.localeCompare(a.date));
    let lastMonth = '';
    const rows = list.map((e) => {
      const m = e.date.slice(0, 7);
      const d = parseKey(e.date);
      const head = m !== lastMonth ? `<div class="month-head">${d.getFullYear()}년 ${d.getMonth() + 1}월</div>` : '';
      lastMonth = m;
      const mood = moodMeta(e.mood);
      return `${head}
        <button type="button" class="card diary-item" data-action="read-diary" data-id="${e.id}" style="margin:0 0 8px">
          <div class="diary-day"><b>${d.getDate()}</b><span>${WEEK[d.getDay()]}요일</span></div>
          <div class="diary-text">
            <div class="item-title">${esc(e.title || (e.body ? fmtDate(e.date) + '의 기록' : '기분만 기록됨'))}</div>
            ${e.body ? `<div class="item-sub">${esc(e.body)}</div>` : ''}
          </div>
          ${mood ? `<span class="diary-mood" title="${mood.label}">${mood.emoji}</span>` : ''}
        </button>`;
    }).join('');

    return `
      <div class="card" style="margin-bottom:12px">
        <div class="section-head" style="margin-bottom:8px"><h2>${fmtDate(t)}</h2>${todayEntry ? '<span class="badge ok">작성함</span>' : '<span class="badge">아직 안 씀</span>'}</div>
        <button type="button" class="btn primary block" data-action="write-diary">${icon('pen')}${todayEntry ? '오늘 일기 이어 쓰기' : '오늘 일기 쓰기'}</button>
        <div class="setting-row" style="margin-top:12px;border-top:1px solid var(--border);padding-bottom:0">
          <div><div class="label">날짜로 찾기</div><div class="desc">지난 날짜를 골라 보거나 새로 쓸 수 있어요.</div></div>
          <input type="date" data-change="diary-date" max="${t}" aria-label="일기 날짜 선택" style="min-height:44px;border:1px solid var(--border);background:var(--surface-2);border-radius:12px;padding:0 10px">
        </div>
      </div>
      ${list.length ? `<div class="result-count">총 ${list.length}편 · 날짜순 자동 정리</div>${rows}`
        : emptyBox('📔', '아직 작성한 일기가 없어요', '오늘 있었던 일, 감사한 일, 내일 다짐을 짧게라도 적어 보세요. 홈 화면의 "한 줄 기록"도 일기에 자동으로 모여요.', ['write-diary', '일기 쓰기'])}`;
  }

  // ---------------------------------------------------------
  // 전체 검색
  // ---------------------------------------------------------
  function searchAll(qRaw) {
    const q = qRaw.trim().toLowerCase();
    if (!q) return [];
    const has = (...xs) => xs.some((x) => String(x || '').toLowerCase().includes(q));
    const out = [];
    db.notes.forEach((n) => has(n.title, n.content) && out.push({ type: 'note', label: '중요', id: n.id, title: n.title, sub: n.content }));
    db.schedules.slice().sort(byTime).forEach((s) => has(s.title, s.detail, s.memo) &&
      out.push({ type: 'schedule', label: '일정', id: s.id, title: s.title, sub: `${fmtDate(s.date)} ${timeRange(s)} ${s.detail || ''} ${s.memo || ''}` }));
    db.todos.forEach((t) => has(t.title, t.memo) &&
      out.push({ type: 'todo', label: '할 일', id: t.id, title: t.title, sub: `${t.repeat ? '매일' : fmtDate(t.date)} · ${slotMeta(t.slot).label}${t.done && !t.repeat ? ' · 완료' : ''} ${t.memo || ''}` }));
    db.goals.forEach((g) => has(g.title, g.desc) &&
      out.push({ type: 'goal', label: '목표', id: g.id, title: g.title, sub: `${g.progress || 0}% ${g.desc || ''}` }));
    db.diary.slice().sort((a, b) => b.date.localeCompare(a.date)).forEach((d) => has(d.title, d.body) &&
      out.push({ type: 'diary', label: '일기', id: d.id, title: d.title || fmtDate(d.date), sub: `${fmtDate(d.date)} ${d.body || ''}` }));
    return out;
  }

  function snippet(text, q) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    const i = s.toLowerCase().indexOf(q.trim().toLowerCase());
    if (i < 0 || s.length <= 60) return s.slice(0, 80);
    const start = Math.max(0, i - 20);
    return (start > 0 ? '…' : '') + s.slice(start, start + 70);
  }

  function highlight(text, qRaw) {
    const s = String(text || '');
    const q = (qRaw || '').trim();
    if (!q) return esc(s);
    const lower = s.toLowerCase();
    const ql = q.toLowerCase();
    let out = '';
    let pos = 0;
    let i;
    while ((i = lower.indexOf(ql, pos)) !== -1) {
      out += esc(s.slice(pos, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>';
      pos = i + q.length;
    }
    return out + esc(s.slice(pos));
  }

  function searchResultsHTML(q) {
    if (!q || !q.trim()) return '';
    const r = searchAll(q);
    if (!r.length) return `<p class="empty-sm">'${esc(q)}'에 대한 결과가 없어요.</p>`;
    return `<div class="result-count">검색 결과 ${r.length}개</div>` + r.slice(0, 50).map((x) => `
      <button type="button" class="result" data-action="open-item" data-type="${x.type}" data-id="${x.id}">
        <span class="badge t-${x.type}">${x.label}</span>
        <span class="result-text"><strong>${highlight(x.title, q)}</strong><small>${highlight(snippet(x.sub, q), q)}</small></span>
      </button>`).join('');
  }

  function viewSearch() {
    const pinned = sortedNotes().slice(0, 10);
    return `
      <div class="search-box">
        ${icon('search')}
        <input type="search" id="globalSearch" placeholder="일정, 할 일, 목표, 중요 사항, 일기 검색" value="${esc(state.searchQuery)}" data-search="global" aria-label="전체 검색" autocomplete="off" enterkeyhint="search">
      </div>
      <div class="results" data-results="global">${searchResultsHTML(state.searchQuery)}</div>
      ${!state.searchQuery.trim() ? `
        <p class="muted small" style="margin:14px 4px">제목, 내용, 메모에 들어 있는 글자로 모든 기록을 한 번에 찾을 수 있어요.</p>
        ${pinned.length ? `<div class="chips"><span class="chips-label">⭐ 중요 사항 바로 보기</span>${pinned.map((n) =>
          `<button type="button" class="chip ${n.pinned ? 'pinned' : ''}" data-action="edit-note" data-id="${n.id}">${esc(n.title)}</button>`).join('')}</div>` : ''}
        <div class="btn-row" style="margin-top:16px"><button type="button" class="btn ghost" data-action="nav" data-view="done">${icon('archive')}완료 항목 모아보기</button></div>` : ''}`;
  }

  // ---------------------------------------------------------
  // 화면: 완료 모아보기
  // ---------------------------------------------------------
  function viewDone() {
    const goals = db.goals.filter((g) => g.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const todos = db.todos.filter((t) => !t.repeat && t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const routines = db.todos.filter((t) => t.repeat && (t.doneDates || []).length);
    const scheds = db.schedules.filter((s) => s.done).sort((a, b) => byTime(b, a));
    const none = !goals.length && !todos.length && !scheds.length && !routines.length;
    if (none) return emptyBox('✅', '완료한 항목이 아직 없어요', '일정, 할 일, 목표의 왼쪽 네모를 눌러 V 체크하면 여기에 모여요.');
    return `
      ${goals.length ? `<section class="section"><div class="section-head"><h2>🏆 완료한 목표 ${goals.length}</h2></div><div class="list">${goals.map(goalCard).join('')}</div></section>` : ''}
      ${todos.length ? `<section class="section"><div class="section-head"><h2>✔ 완료한 할 일 ${todos.length}</h2></div><div class="list">${todos.map((t) => todoItem(t, t.date, { showSlot: true }).replace('<div class="item-meta">', `<div class="item-meta"><span>${fmtDate(t.date)}</span>`)).join('')}</div></section>` : ''}
      ${routines.length ? `<section class="section"><div class="section-head"><h2>🔁 매일 체크리스트 기록</h2></div><div class="card">${routines.map((t) =>
        `<div class="setting-row"><span class="label">${esc(t.title)}</span><span class="badge ok">${t.doneDates.length}일 완료</span></div>`).join('')}</div></section>` : ''}
      ${scheds.length ? `<section class="section"><div class="section-head"><h2>📅 완료한 일정 ${scheds.length}</h2></div><div class="list">${scheds.map((s) => scheduleItem(s, true)).join('')}</div></section>` : ''}`;
  }

  // ---------------------------------------------------------
  // 화면: 설정 · 백업
  // ---------------------------------------------------------
  let installPrompt = null;

  function viewSettings() {
    const theme = getTheme();
    let last = null;
    try { last = Number(localStorage.getItem(BACKUP_KEY)) || null; } catch {}
    const swReady = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const counts = [['일정', db.schedules.length], ['할 일', db.todos.length], ['목표', db.goals.length], ['중요', db.notes.length], ['일기', db.diary.length]];
    return `
      <section class="section">
        <div class="section-head"><h2>화면</h2></div>
        <div class="card">
          <div class="setting-row">
            <div><div class="label">테마</div><div class="desc">선택한 테마는 다음에 열어도 유지돼요.</div></div>
          </div>
          ${segmented('set-theme', [['dark', '🌙 다크 모드'], ['light', '☀️ 라이트 모드']], theme)}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>데이터 백업 · 복원</h2></div>
        <div class="card">
          <div class="muted small">이 기기에 저장된 데이터</div>
          <div class="count-grid">${counts.map(([l, n]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div>
          <p class="muted small" style="margin:12px 0">
            ${IS_ARTIFACT ? '데이터는 내 계정의 비공개 저장소에 저장돼요. 만일을 위해 가끔 백업 파일(JSON)도 받아 두세요.' : '모든 데이터는 <b>이 기기 안에만</b> 저장되고 외부로 전송되지 않아요. 브라우저 데이터를 지우거나 기기를 바꾸면 사라질 수 있으니 주기적으로 백업 파일(JSON)을 저장해 두세요.'}<br>
            마지막 백업: <b>${last ? fmtStamp(last) : '없음'}</b>
          </p>
          <div class="btn-row">
            <button type="button" class="btn primary" data-action="export">${icon('download')}백업 파일 저장</button>
            <button type="button" class="btn ghost" data-action="import">${icon('upload')}백업에서 복원</button>
          </div>
          <p class="muted small" style="margin:10px 0 0">복원하면 현재 데이터가 백업 파일 내용으로 <b>바뀝니다</b>. 복원 전에 한 번 더 확인해요.</p>
        </div>
      </section>

      ${IS_ARTIFACT ? `
      <section class="section">
        <div class="section-head"><h2>저장 위치</h2></div>
        <div class="card">
          ${{
            cloud: '<div class="status-line"><span class="status-dot ok"></span>내 Claude 계정에 비공개로 저장 중 · 폰과 PC에서 자동 동기화</div>',
            connecting: '<div class="status-line"><span class="status-dot"></span>계정 저장소에 연결하는 중…</div>',
            slow: '<div class="status-line"><span class="status-dot"></span>계정 저장소에 아직 연결하지 못했어요. 이 기기에 먼저 저장하고, 연결되면 올라가요.</div>',
            error: '<div class="status-line"><span class="status-dot"></span>동기화가 끊겼어요. 새로 열면 다시 연결돼요. 이 기기에는 저장되어 있어요.</div>',
            local: '<div class="status-line"><span class="status-dot"></span>이 브라우저에만 저장 중 (로그인하면 계정에 저장돼요)</div>',
          }[cloud.status] || ''}
          <p class="muted small" style="margin:10px 0 0">이 앱과 데이터는 나만 볼 수 있어요. 다른 사람과 공유해도 각자의 기록은 서로 보이지 않아요.</p>
        </div>
      </section>` : ''}
      ${IS_ARTIFACT ? '' : `<section class="section">
        <div class="section-head"><h2>앱 설치 · 오프라인</h2></div>
        <div class="card">
          <div class="status-line"><span class="status-dot ${swReady ? 'ok' : ''}"></span>${swReady ? '오프라인 사용 준비 완료 (인터넷 없이도 열려요)' : '오프라인 준비 중 — HTTPS 주소로 한 번 연 뒤 새로고침하면 준비돼요'}</div>
          <div class="status-line" style="margin-top:6px"><span class="status-dot ${standalone ? 'ok' : ''}"></span>${standalone ? '앱 모드로 실행 중' : '브라우저에서 실행 중'}</div>
          ${installPrompt && !standalone ? `<button type="button" class="btn primary block" style="margin-top:12px" data-action="install">${icon('download')}홈 화면에 앱 설치</button>` : ''}
        </div>
      </section>`}

      <section class="section">
        <div class="section-head"><h2>모아보기</h2></div>
        <div class="card">
          <div class="btn-row">
            <button type="button" class="btn ghost" data-action="nav" data-view="done">${icon('archive')}완료 항목</button>
            <button type="button" class="btn ghost" data-action="nav" data-view="search">${icon('search')}전체 검색</button>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>사용 안내</h2></div>
        <div class="card" style="padding-top:4px;padding-bottom:4px">
          <details class="guide"><summary>아침 · 점심 · 오후 체크리스트 쓰는 법</summary><div class="guide-body">
            <p>할 일은 <b>아침(~11시) · 점심(11~14시) · 오후(14~18시) · 저녁(18시~)</b>으로 나뉘어 표시돼요. 일정은 시작 시간에 맞춰 자동으로 해당 시간대에 들어가요.</p>
            <p>할 일을 추가할 때 <b>매일 반복</b>을 켜면 그날부터 매일 체크리스트에 나타나고, 날짜마다 따로 V 체크돼요. (예: 아침 스트레칭, 영양제 먹기)</p>
          </div></details>
          <details class="guide"><summary>필요한 정보 바로 찾기</summary><div class="guide-body">
            <p>홈 화면 맨 위 <b>바로 찾기</b> 칸이나 오른쪽 위 🔍 버튼에 글자를 입력하면 일정·할 일·목표·중요 사항·일기를 한 번에 검색해요.</p>
            <p>자주 보는 정보는 <b>중요</b> 탭에 저장하고 📌 고정하면 홈 화면에 바로 표시돼요.</p>
          </div></details>
          <details class="guide"><summary>백업과 복원 방법</summary><div class="guide-body">
            <ol>
              <li><b>백업 파일 저장</b>을 누르면 haru-planner-backup-날짜.json 파일이 다운로드돼요.</li>
              <li>이 파일을 클라우드 드라이브나 메일 등 안전한 곳에 보관하세요.</li>
              <li>새 기기나 초기화 후에는 <b>백업에서 복원</b>을 눌러 파일을 고르면 데이터가 돌아와요.</li>
            </ol>
          </div></details>
          <details class="guide"><summary>스마트폰 홈 화면에 설치하기</summary><div class="guide-body">
            <p><b>안드로이드 (Chrome)</b>: 메뉴(⋮) → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b></p>
            <p><b>아이폰 (Safari)</b>: 공유 버튼(□↑) → <b>홈 화면에 추가</b></p>
            <p>설치하면 주소창 없는 전체 화면 앱으로 열리고, 한 번 연 뒤에는 인터넷 없이도 사용할 수 있어요. (HTTPS 주소에서 열어야 해요)</p>
          </div></details>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>데이터 초기화</h2></div>
        <div class="card">
          <p class="muted small" style="margin:0 0 12px">모든 일정, 할 일, 목표, 중요 사항, 일기를 이 기기에서 삭제해요. 되돌릴 수 없으니 먼저 백업하세요.</p>
          <button type="button" class="btn danger-ghost block" data-action="wipe">${icon('trash')}모든 데이터 삭제</button>
        </div>
      </section>
      <div class="version">하루 플래너 v${APP_VERSION} · 데이터는 이 기기에만 저장됩니다</div>`;
  }

  // ---------------------------------------------------------
  // 모달 / 확인 창 / 토스트
  // ---------------------------------------------------------
  let lastFocus = null;

  function openModal(html) {
    const root = $('#modal');
    lastFocus = document.activeElement;
    root.innerHTML = `<div class="overlay" data-close></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    root.hidden = false;
    document.body.classList.add('no-scroll');
    root.onclick = (e) => { if (e.target.closest('[data-close]')) closeModal(); };
    return root;
  }
  function closeModal() {
    const root = $('#modal');
    if (root.hidden) return;
    root.hidden = true;
    root.innerHTML = '';
    document.body.classList.remove('no-scroll');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  function confirmBox({ title = '확인', message = '', ok = '확인', danger = false }) {
    return new Promise((resolve) => {
      const root = $('#confirm');
      root.innerHTML = `<div class="overlay"></div>
        <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="cfTitle">
          <h3 id="cfTitle">${esc(title)}</h3><p>${message}</p>
          <div class="dialog-actions">
            <button type="button" class="btn ghost" data-r="0">취소</button>
            <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button>
          </div>
        </div>`;
      root.hidden = false;
      const finish = (r) => {
        root.hidden = true; root.innerHTML = '';
        document.removeEventListener('keydown', onKey, true);
        resolve(r);
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
      document.addEventListener('keydown', onKey, true);
      root.onclick = (e) => {
        const b = e.target.closest('[data-r]');
        if (b) finish(b.dataset.r === '1');
        else if (e.target.classList.contains('overlay')) finish(false);
      };
      $('[data-r="1"]', root).focus();
    });
  }

  let toastTimer;
  function toast(msg, type = '') {
    const wrap = $('#toast');
    wrap.innerHTML = `<div class="toast ${type}" role="status">${esc(msg)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { wrap.innerHTML = ''; }, type === 'error' ? 3500 : 2200);
  }

  // ---------------------------------------------------------
  // 입력 폼 (추가/수정 공통)
  // ---------------------------------------------------------
  const flatFields = (fields) => fields.flatMap((f) => (f.type === 'row' ? f.fields : [f]));

  function fieldHTML(f) {
    if (f.type === 'row') return `<div class="field-row">${f.fields.map(fieldHTML).join('')}</div>`;
    const id = 'f_' + f.name;
    const v = f.value ?? '';
    const req = f.required ? '<span class="req" aria-hidden="true">*</span>' : '';
    let input;
    switch (f.type) {
      case 'textarea':
        input = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 4}" maxlength="${f.max || 5000}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
        break;
      case 'seg':
        input = `<div class="seg seg-input" role="radiogroup" aria-label="${esc(f.label)}">${f.options.map((o) =>
          `<label class="seg-opt"><input type="radio" name="${f.name}" value="${o.value}" ${o.value === v ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div>`;
        break;
      case 'mood':
        input = `<div class="moods" role="radiogroup" aria-label="${esc(f.label)}">${MOODS.map((m) =>
          `<label class="mood-opt"><input type="radio" name="${f.name}" value="${m.id}" ${m.id === v ? 'checked' : ''}><span class="mood-btn"><span class="emo">${m.emoji}</span>${m.label}</span></label>`).join('')}</div>`;
        break;
      case 'range':
        input = `<div class="range-wrap"><input type="range" id="${id}" name="${f.name}" min="0" max="100" step="5" value="${Number(v) || 0}"><output data-out="${f.name}">${Number(v) || 0}%</output></div>`;
        break;
      case 'check':
        return `<div class="field" data-field="${f.name}"><label class="check-field"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}><span>${esc(f.label)}${f.help ? `<span class="check-help">${esc(f.help)}</span>` : ''}</span></label></div>`;
      default:
        input = `<input type="${f.type || 'text'}" id="${id}" name="${f.name}" value="${esc(v)}" ${f.max ? `maxlength="${f.max}"` : ''} placeholder="${esc(f.placeholder || '')}" autocomplete="off">`;
    }
    return `<div class="field" data-field="${f.name}">
      <label class="field-label" for="${id}">${esc(f.label)}${req}</label>${input}
      ${f.help ? `<p class="field-help">${esc(f.help)}</p>` : ''}<p class="field-error" hidden></p></div>`;
  }

  function collect(form, fields) {
    const vals = {};
    flatFields(fields).forEach((f) => {
      const el = form.elements[f.name];
      if (!el) return;
      if (f.type === 'check') vals[f.name] = el.checked;
      else if (f.type === 'range') vals[f.name] = Number(el.value) || 0;
      else vals[f.name] = (el.value ?? '').toString();
    });
    return vals;
  }

  function openForm(cfg) {
    const root = openModal(`
      <form class="form" novalidate>
        <div class="sheet-head"><h2>${esc(cfg.title)}</h2><button type="button" class="icon-btn" data-close aria-label="닫기">${icon('x')}</button></div>
        <div class="sheet-body">${cfg.fields.map(fieldHTML).join('')}</div>
        <div class="sheet-foot">
          ${cfg.onDelete ? `<button type="button" class="btn danger-ghost" data-del>${icon('trash')}삭제</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn ghost" data-close>취소</button>
          <button type="submit" class="btn primary">${esc(cfg.submitLabel || '저장')}</button>
        </div>
      </form>`);
    const form = $('form', root);

    const setError = (name, msg) => {
      const box = $(`[data-field="${name}"]`, form);
      if (!box) return;
      const p = $('.field-error', box);
      box.classList.toggle('has-error', !!msg);
      if (p) { p.hidden = !msg; p.textContent = msg || ''; }
      const input = $('input,textarea,select', box);
      if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    };

    form.addEventListener('input', (e) => {
      if (e.target.type === 'range') {
        const o = $(`[data-out="${e.target.name}"]`, form);
        if (o) o.textContent = e.target.value + '%';
      }
      if (e.target.name) setError(e.target.name, '');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const vals = collect(form, cfg.fields);
      const errs = {};
      flatFields(cfg.fields).forEach((f) => {
        setError(f.name, '');
        if (f.required && !String(vals[f.name] ?? '').trim()) errs[f.name] = `${f.label}을(를) 입력해 주세요.`;
      });
      if (!Object.keys(errs).length && cfg.validate) Object.assign(errs, cfg.validate(vals) || {});
      const keys = Object.keys(errs);
      if (keys.length) {
        keys.forEach((k) => setError(k, errs[k]));
        const first = $(`[data-field="${keys[0]}"] input, [data-field="${keys[0]}"] textarea`, form);
        if (first) first.focus();
        toast('입력하지 않았거나 잘못된 항목이 있어요.', 'error');
        return;
      }
      cfg.onSubmit(vals);
      closeModal();
      render();
    });

    if (cfg.onDelete) {
      $('[data-del]', form).addEventListener('click', async () => {
        const ok = await confirmBox({ title: '삭제할까요?', message: cfg.deleteMessage || '삭제한 항목은 되돌릴 수 없어요.', ok: '삭제', danger: true });
        if (!ok) return;
        cfg.onDelete();
        closeModal();
        render();
        toast('삭제했습니다.');
      });
    }

    if (window.matchMedia('(pointer: fine)').matches && cfg.isNew) {
      const first = $('input[type="text"], textarea', form);
      if (first) first.focus();
    }
  }

  const PRIORITY_OPTIONS = [{ value: 'high', label: '높음' }, { value: 'mid', label: '보통' }, { value: 'low', label: '낮음' }];

  // 일정 폼
  function openScheduleForm(s, defDate) {
    const isNew = !s;
    const base = s || { date: defDate || (state.view === 'schedule' && state.schedFilter === 'date' ? state.schedDate : today()) };
    openForm({
      title: isNew ? '일정 추가' : '일정 수정',
      isNew,
      fields: [
        { name: 'title', label: '일정 제목', required: true, value: base.title, max: 100, placeholder: '예: 치과 예약, 팀 회의' },
        { name: 'date', label: '날짜', type: 'date', required: true, value: base.date },
        { type: 'row', fields: [
          { name: 'start', label: '시작 시간', type: 'time', value: base.start },
          { name: 'end', label: '종료 시간', type: 'time', value: base.end },
        ] },
        { name: 'detail', label: '상세 내용', type: 'textarea', rows: 3, value: base.detail, placeholder: '장소, 준비물 등' },
        { name: 'memo', label: '메모', type: 'textarea', rows: 2, value: base.memo },
        ...(isNew ? [] : [{ name: 'done', label: '완료한 일정', type: 'check', value: base.done }]),
      ],
      validate: (v) => {
        const e = {};
        if (!isDateKey(v.date)) e.date = '올바른 날짜를 선택해 주세요.';
        if (v.end && !v.start) e.start = '종료 시간을 정하려면 시작 시간도 입력해 주세요.';
        if (v.start && v.end && v.end <= v.start) e.end = '종료 시간은 시작 시간보다 늦어야 해요.';
        return e;
      },
      onSubmit: (v) => {
        const data = { title: v.title.trim(), date: v.date, start: v.start, end: v.end, detail: v.detail.trim(), memo: v.memo.trim(), done: !!v.done };
        if (isNew) { db.schedules.push({ id: uid(), created: Date.now(), ...data }); toast('일정을 추가했습니다.'); }
        else { Object.assign(s, data, { updated: Date.now() }); toast('일정을 수정했습니다.'); }
        save();
      },
      onDelete: isNew ? null : () => removeItem('schedules', s.id),
      deleteMessage: isNew ? '' : `'${esc(base.title)}' 일정을 삭제할까요?`,
    });
  }

  // 할 일 폼
  function openTodoForm(t, opts = {}) {
    const isNew = !t;
    const viewDate = opts.date || (state.view === 'todo' ? state.todoDate : today());
    const base = t || { date: viewDate, slot: opts.slot || (viewDate === today() ? slotOfTime(nowTime()) : 'morning'), priority: 'mid' };
    openForm({
      title: isNew ? '할 일 추가' : '할 일 수정',
      isNew,
      fields: [
        { name: 'title', label: '할 일', required: true, value: base.title, max: 100, placeholder: '예: 물 2L 마시기' },
        { name: 'slot', label: '시간대', type: 'seg', value: base.slot || 'any', options: ALL_SLOTS.map((s) => ({ value: s.id, label: s.label })) },
        { name: 'priority', label: '중요도', type: 'seg', value: base.priority || 'mid', options: PRIORITY_OPTIONS },
        { name: 'date', label: base.repeat ? '시작 날짜' : '날짜', type: 'date', required: true, value: base.date },
        { name: 'memo', label: '메모', value: base.memo, max: 200, placeholder: '선택 사항' },
        { name: 'repeat', label: '매일 반복 (데일리 체크리스트)', type: 'check', value: base.repeat, help: '켜면 이 날짜부터 매일 체크리스트에 나타나고, 날마다 따로 체크돼요.' },
      ],
      validate: (v) => (isDateKey(v.date) ? {} : { date: '올바른 날짜를 선택해 주세요.' }),
      onSubmit: (v) => {
        const data = { title: v.title.trim(), slot: v.slot || 'any', priority: v.priority || 'mid', date: v.date, memo: v.memo.trim(), repeat: !!v.repeat };
        if (isNew) {
          db.todos.push({ id: uid(), created: Date.now(), done: false, doneDates: [], ...data });
          toast('할 일을 추가했습니다.');
        } else {
          if (data.repeat && !t.repeat) data.doneDates = t.done ? [t.date] : [];
          if (!data.repeat && t.repeat) { data.done = (t.doneDates || []).includes(viewDate); data.date = v.date; }
          Object.assign(t, data, { updated: Date.now() });
          toast('할 일을 수정했습니다.');
        }
        save();
      },
      onDelete: isNew ? null : () => removeItem('todos', t.id),
      deleteMessage: isNew ? '' : `'${esc(base.title)}'을(를) 삭제할까요?${base.repeat ? ' 매일 반복 항목이라 모든 날짜에서 사라져요.' : ''}`,
    });
  }

  // 목표 폼
  function openGoalForm(g) {
    const isNew = !g;
    const base = g || { type: 'short', progress: 0 };
    openForm({
      title: isNew ? '목표 추가' : '목표 수정',
      isNew,
      fields: [
        { name: 'title', label: '목표', required: true, value: base.title, max: 100, placeholder: '예: 한 달에 책 2권 읽기' },
        { name: 'type', label: '기간', type: 'seg', value: base.type || 'short', options: [{ value: 'short', label: '단기 목표' }, { value: 'long', label: '장기 목표' }] },
        { name: 'desc', label: '상세 설명', type: 'textarea', rows: 3, value: base.desc, placeholder: '왜 이 목표를 세웠는지, 어떻게 달성할지' },
        { name: 'deadline', label: '달성 기한', type: 'date', value: base.deadline },
        { name: 'progress', label: '진행도', type: 'range', value: base.progress || 0 },
        { name: 'done', label: '목표 달성 (V 완료)', type: 'check', value: base.done, help: '체크하면 완료한 목표 목록으로 옮겨져요.' },
      ],
      validate: (v) => (v.deadline && !isDateKey(v.deadline) ? { deadline: '올바른 날짜를 선택해 주세요.' } : {}),
      onSubmit: (v) => {
        const data = { title: v.title.trim(), type: v.type || 'short', desc: v.desc.trim(), deadline: v.deadline, progress: clamp(v.progress, 0, 100) };
        const target = isNew ? { id: uid(), created: Date.now(), done: false } : g;
        const wasDone = !!target.done;
        Object.assign(target, data, isNew ? {} : { updated: Date.now() });
        if (isNew) db.goals.push(target);
        if (wasDone && !v.done) {
          // 완료 해제: 진행 중으로 되돌림
          target.done = false; target.doneAt = null;
          target.progress = Math.min(data.progress, 90);
        } else if (v.done || data.progress >= 100) {
          if (!wasDone) setGoalDone(target, true);
        }
        save();
        toast(target.done && !wasDone ? '🎉 목표 달성! 완료한 목표 목록에서 볼 수 있어요.' : isNew ? '목표를 추가했습니다.' : '목표를 수정했습니다.');
      },
      onDelete: isNew ? null : () => removeItem('goals', g.id),
      deleteMessage: isNew ? '' : `'${esc(base.title)}' 목표를 삭제할까요?`,
    });
  }

  // 중요 사항 폼
  function openNoteForm(n) {
    const isNew = !n;
    const base = n || { priority: 'high', pinned: false };
    openForm({
      title: isNew ? '중요 사항 추가' : '중요 사항',
      isNew,
      fields: [
        { name: 'title', label: '제목', required: true, value: base.title, max: 100, placeholder: '예: 관리비 납부 계좌' },
        { name: 'content', label: '내용', type: 'textarea', rows: 6, required: true, value: base.content, placeholder: '잊으면 안 되는 내용을 적어 두세요.' },
        { name: 'priority', label: '중요도', type: 'seg', value: base.priority || 'mid', options: PRIORITY_OPTIONS },
        { name: 'pinned', label: '📌 상단 고정', type: 'check', value: base.pinned, help: '보관함 맨 위와 홈 화면 요약에 표시돼요.' },
      ],
      onSubmit: (v) => {
        const data = { title: v.title.trim(), content: v.content.trim(), priority: v.priority || 'mid', pinned: !!v.pinned, updated: Date.now() };
        if (isNew) { db.notes.push({ id: uid(), created: Date.now(), ...data }); toast('중요 사항을 저장했습니다.'); }
        else { Object.assign(n, data); toast('중요 사항을 수정했습니다.'); }
        save();
      },
      onDelete: isNew ? null : () => removeItem('notes', n.id),
      deleteMessage: isNew ? '' : `'${esc(base.title)}'을(를) 보관함에서 삭제할까요?`,
    });
  }

  // 일기 폼
  function openDiaryForm(d, date) {
    const isNew = !d;
    const base = d || { date: date || today() };
    openForm({
      title: isNew ? '일기 쓰기' : '일기 수정',
      isNew,
      submitLabel: '저장',
      fields: [
        { name: 'date', label: '날짜', type: 'date', required: true, value: base.date },
        { name: 'mood', label: '오늘의 기분', type: 'mood', value: base.mood },
        { name: 'title', label: '제목', value: base.title, max: 100, placeholder: '예: 오랜만에 친구를 만난 날' },
        { name: 'body', label: '본문', type: 'textarea', rows: 9, required: true, value: base.body, placeholder: '오늘 있었던 일, 느낀 점, 감사한 일…' },
      ],
      validate: (v) => {
        if (!isDateKey(v.date)) return { date: '올바른 날짜를 선택해 주세요.' };
        const other = db.diary.find((x) => x.date === v.date && x !== d);
        if (other) return { date: `${fmtDate(v.date)}에는 이미 일기가 있어요. 목록에서 그 일기를 열어 수정해 주세요.` };
        return {};
      },
      onSubmit: (v) => {
        const data = { date: v.date, mood: v.mood || '', title: v.title.trim(), body: v.body.trim(), updated: Date.now() };
        if (isNew) { db.diary.push({ id: uid(), created: Date.now(), ...data }); toast('일기를 저장했습니다.'); }
        else { Object.assign(d, data); toast('일기를 수정했습니다.'); }
        save();
      },
      onDelete: isNew ? null : () => removeItem('diary', d.id),
      deleteMessage: isNew ? '' : `${fmtDate(base.date)} 일기를 삭제할까요?`,
    });
  }

  function openDiaryForDate(date) {
    const e = db.diary.find((x) => x.date === date);
    openDiaryForm(e || null, date);
  }

  function openDiaryRead(d) {
    const mood = moodMeta(d.mood);
    const root = openModal(`
      <div class="sheet-head"><h2>${fmtDate(d.date, true)}</h2><button type="button" class="icon-btn" data-close aria-label="닫기">${icon('x')}</button></div>
      <div class="sheet-body">
        <div class="read-meta">${mood ? `<span style="font-size:26px">${mood.emoji}</span><span>${mood.label}</span>` : ''}</div>
        ${d.title ? `<h3 style="margin:0 0 10px;font-size:19px">${esc(d.title)}</h3>` : ''}
        <div class="read-body">${d.body ? esc(d.body) : '<span class="muted">본문 없이 기분만 기록했어요.</span>'}</div>
        <p class="muted small" style="margin-top:16px">마지막 수정 ${fmtStamp(d.updated || d.created)}</p>
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn danger-ghost" data-act="del">${icon('trash')}삭제</button>
        <span class="spacer"></span>
        <button type="button" class="btn primary" data-act="edit">${icon('pen')}수정</button>
      </div>`);
    $('[data-act="edit"]', root).addEventListener('click', () => { closeModal(); openDiaryForm(d); });
    $('[data-act="del"]', root).addEventListener('click', async () => {
      if (!(await confirmBox({ title: '삭제할까요?', message: `${fmtDate(d.date)} 일기를 삭제해요. 되돌릴 수 없어요.`, ok: '삭제', danger: true }))) return;
      removeItem('diary', d.id);
      closeModal(); render(); toast('일기를 삭제했습니다.');
    });
  }

  // 홈 + 버튼: 무엇을 추가할지 선택
  function openAddChooser() {
    const root = openModal(`
      <div class="sheet-head"><h2>무엇을 추가할까요?</h2><button type="button" class="icon-btn" data-close aria-label="닫기">${icon('x')}</button></div>
      <div class="sheet-body"><div class="choice-grid">
        <button type="button" data-pick="todo">${icon('check')}할 일</button>
        <button type="button" data-pick="schedule">${icon('calendar')}일정</button>
        <button type="button" data-pick="goal">${icon('target')}목표</button>
        <button type="button" data-pick="note">${icon('star')}중요 사항</button>
        <button type="button" data-pick="diary" style="grid-column:1/-1">${icon('book')}오늘 일기</button>
      </div></div>`);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      closeModal();
      ({ todo: () => openTodoForm(null, { date: today() }), schedule: () => openScheduleForm(null, today()), goal: () => openGoalForm(), note: () => openNoteForm(), diary: () => openDiaryForDate(today()) })[b.dataset.pick]();
    });
  }

  // ---------------------------------------------------------
  // 백업 / 복원 / 초기화
  // ---------------------------------------------------------
  function exportData() {
    const payload = { app: 'haru-planner', version: APP_VERSION, exportedAt: new Date().toISOString(), data: db };
    const json = JSON.stringify(payload, null, 2);
    const filename = `haru-planner-backup-${today()}.json`;
    const markDone = () => {
      try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch {}
      toast('백업 파일을 저장했습니다.');
      if (state.view === 'more') render();
    };
    // 안드로이드 앱(APK)으로 실행 중이면 다운로드 폴더에 직접 저장
    if (window.HaruAndroid && typeof window.HaruAndroid.saveFile === 'function') {
      const r = window.HaruAndroid.saveFile(filename, json);
      if (r === 'ok') markDone(); else toast('백업 파일을 저장하지 못했어요.', 'error');
      return;
    }
    if (IS_ARTIFACT) {
      (async () => {
        const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
        if (!dl) { toast('이 화면에서는 파일 저장을 쓸 수 없어요.', 'error'); return; }
        try { await dl.save({ filename, data: new Blob([json], { type: 'application/json' }) }); markDone(); }
        catch (e) { if (e && e.code !== 'declined') toast('백업 파일을 저장하지 못했어요.', 'error'); }
      })();
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    markDone();
  }

  async function importFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast('JSON 백업 파일을 읽을 수 없어요. 파일을 확인해 주세요.', 'error');
      return;
    }
    const raw = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    if (!raw || typeof raw !== 'object' || !KEYS.some((k) => Array.isArray(raw[k]))) {
      toast('하루 플래너 백업 파일이 아니에요.', 'error');
      return;
    }
    const next = normalize(raw);
    const n = (d) => `일정 ${d.schedules.length} · 할 일 ${d.todos.length} · 목표 ${d.goals.length} · 중요 ${d.notes.length} · 일기 ${d.diary.length}`;
    const ok = await confirmBox({
      title: '백업으로 덮어쓸까요?',
      message: `현재 데이터가 백업 파일 내용으로 <b>모두 바뀌어요.</b><br><br>현재: ${n(db)}<br>백업: ${n(next)}${parsed.exportedAt ? `<br>(백업 날짜 ${esc(fmtStamp(Date.parse(parsed.exportedAt)))})` : ''}`,
      ok: '덮어쓰고 복원',
      danger: true,
    });
    if (!ok) { toast('복원을 취소했습니다.'); return; }
    db = next;
    if (save()) { render(); toast('백업에서 복원했습니다.'); }
  }

  async function wipeAll() {
    const ok = await confirmBox({
      title: '모든 데이터를 삭제할까요?',
      message: '일정, 할 일, 목표, 중요 사항, 일기가 <b>모두 삭제</b>되고 되돌릴 수 없어요. 먼저 백업 파일을 저장해 두는 것을 권장해요.',
      ok: '모두 삭제',
      danger: true,
    });
    if (!ok) return;
    db = emptyData();
    save();
    render();
    toast('모든 데이터를 삭제했습니다.');
  }

  function loadSample() {
    const t = today();
    const tm = addDays(t, 1);
    const now = Date.now();
    const mk = (o) => ({ id: uid(), created: now, ...o });
    db.todos.push(
      mk({ title: '물 한 잔 + 스트레칭', slot: 'morning', priority: 'mid', date: t, repeat: true, doneDates: [] }),
      mk({ title: '오늘 할 일 3가지 정하기', slot: 'morning', priority: 'high', date: t, done: false }),
      mk({ title: '점심 후 10분 산책', slot: 'lunch', priority: 'low', date: t, repeat: true, doneDates: [] }),
      mk({ title: '보고서 초안 마무리', slot: 'afternoon', priority: 'high', date: t, done: false }),
      mk({ title: '내일 준비물 챙기기', slot: 'evening', priority: 'mid', date: t, done: false }),
    );
    db.schedules.push(
      mk({ title: '팀 주간 회의', date: t, start: '10:00', end: '11:00', detail: '3층 회의실', memo: '지난주 진행 상황 공유', done: false }),
      mk({ title: '치과 정기 검진', date: tm, start: '15:30', end: '16:00', detail: '튼튼치과', memo: '', done: false }),
    );
    db.goals.push(
      mk({ title: '한 달에 책 2권 읽기', type: 'short', desc: '자기 전 20분 독서', deadline: addDays(t, 20), progress: 40, done: false }),
      mk({ title: '하프 마라톤 완주', type: 'long', desc: '주 3회 러닝으로 체력 키우기', deadline: addDays(t, 180), progress: 20, done: false }),
    );
    db.notes.push(
      mk({ title: '관리비 납부일', content: '매월 25일 자동이체\n농협 000-0000-0000-00', priority: 'high', pinned: true, updated: now }),
      mk({ title: '집 와이파이', content: '이름: HOME_5G\n비밀번호는 공유기 뒷면 스티커 참고', priority: 'mid', pinned: false, updated: now }),
    );
    save();
    render();
    toast('예시 데이터를 넣었어요. 자유롭게 수정·삭제해 보세요.');
  }

  // ---------------------------------------------------------
  // 이벤트 처리
  // ---------------------------------------------------------
  function shiftDate(target, n) {
    if (target === 'sched') state.schedDate = n === 0 ? today() : addDays(state.schedDate, n);
    if (target === 'todo') state.todoDate = n === 0 ? today() : addDays(state.todoDate, n);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.closest('#modal') || el.closest('#confirm')) return;
    const { action, id } = el.dataset;
    switch (action) {
      case 'nav': go(el.dataset.view); break;
      case 'theme': setTheme(getTheme() === 'dark' ? 'light' : 'dark'); break;
      case 'set-theme': if (el.dataset.value !== getTheme()) setTheme(el.dataset.value); break;
      case 'fab': VIEWS[state.view].fab && VIEWS[state.view].fab(); break;

      case 'add-schedule': openScheduleForm(); break;
      case 'edit-schedule': { const s = find('schedules', id); if (s) openScheduleForm(s); break; }
      case 'toggle-schedule': {
        const s = find('schedules', id); if (!s) break;
        s.done = !s.done; save(); render();
        toast(s.done ? '일정을 완료로 표시했습니다.' : '일정을 미완료로 바꿨습니다.');
        break;
      }
      case 'sched-filter': state.schedFilter = el.dataset.value; render(); break;

      case 'add-todo': openTodoForm(null, { slot: el.dataset.slot, date: el.dataset.date }); break;
      case 'edit-todo': { const t = find('todos', id); if (t) openTodoForm(t, { date: el.dataset.date }); break; }
      case 'toggle-todo': {
        const t = find('todos', id); if (!t) break;
        const done = toggleTodo(t, el.dataset.date);
        render();
        const date = el.dataset.date;
        const list = todosFor(date);
        if (done && list.length && list.every((x) => isTodoDone(x, date))) toast('🎉 오늘 체크리스트를 모두 끝냈어요!');
        break;
      }
      case 'todo-filter': state.todoFilter = el.dataset.value; render(); break;
      case 'date-shift': shiftDate(el.dataset.target, Number(el.dataset.n)); render(); break;
      case 'date-today': shiftDate(el.dataset.target, 0); render(); break;

      case 'add-goal': openGoalForm(); break;
      case 'edit-goal': { const g = find('goals', id); if (g) openGoalForm(g); break; }
      case 'toggle-goal': {
        const g = find('goals', id); if (!g) break;
        setGoalDone(g, !g.done); render();
        toast(g.done ? '🎉 목표 달성! 완료한 목표 목록으로 옮겼어요.' : '목표를 다시 진행 중으로 바꿨습니다.');
        break;
      }
      case 'goal-step': {
        const g = find('goals', id); if (!g) break;
        g.progress = clamp((g.progress || 0) + Number(el.dataset.n), 0, 100);
        if (g.progress >= 100) { setGoalDone(g, true); toast('🎉 진행도 100%! 목표를 완료했어요.'); }
        else save();
        render();
        break;
      }
      case 'goal-tab': state.goalTab = el.dataset.value; render(); break;
      case 'goal-type': state.goalType = el.dataset.value; render(); break;
      case 'goto-done-goals': state.goalTab = 'done'; go('goals'); break;

      case 'add-note': openNoteForm(); break;
      case 'edit-note': { const n = find('notes', id); if (n) openNoteForm(n); break; }
      case 'toggle-pin': {
        const n = find('notes', id); if (!n) break;
        n.pinned = !n.pinned; save(); render();
        toast(n.pinned ? '상단에 고정했습니다.' : '고정을 해제했습니다.');
        break;
      }

      case 'write-diary': openDiaryForDate(today()); break;
      case 'read-diary': { const d = find('diary', id); if (d) openDiaryRead(d); break; }
      case 'set-mood': {
        const t = today();
        let d = db.diary.find((x) => x.date === t);
        if (!d) { d = { id: uid(), created: Date.now(), date: t, title: '', body: '', mood: '' }; db.diary.push(d); }
        d.mood = d.mood === el.dataset.mood ? '' : el.dataset.mood;
        d.updated = Date.now();
        if (!d.mood && !d.title && !d.body) db.diary = db.diary.filter((x) => x !== d);
        save(); render();
        if (d.mood) toast(`오늘 기분: ${moodMeta(d.mood).emoji} ${moodMeta(d.mood).label}`);
        break;
      }

      case 'open-item': {
        const type = el.dataset.type;
        if (type === 'schedule') openScheduleForm(find('schedules', id));
        else if (type === 'todo') { const t = find('todos', id); if (t) openTodoForm(t, { date: t.repeat ? today() : t.date }); }
        else if (type === 'goal') openGoalForm(find('goals', id));
        else if (type === 'note') openNoteForm(find('notes', id));
        else if (type === 'diary') openDiaryRead(find('diary', id));
        break;
      }

      case 'export': exportData(); break;
      case 'import': $('#importFile').click(); break;
      case 'wipe': wipeAll(); break;
      case 'sample': loadSample(); break;
      case 'install':
        if (installPrompt) {
          installPrompt.prompt();
          installPrompt.userChoice.finally(() => { installPrompt = null; render(); });
        }
        break;
      default: break;
    }
  });

  // 키보드로 role="button" 항목 열기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden && $('#confirm').hidden) { closeModal(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-action]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  document.addEventListener('input', (e) => {
    const kind = e.target.dataset && e.target.dataset.search;
    if (kind === 'global') {
      state.searchQuery = e.target.value;
      $$('[data-results="global"]').forEach((r) => { r.innerHTML = searchResultsHTML(state.searchQuery); });
    } else if (kind === 'notes') {
      state.noteQuery = e.target.value;
      $('[data-results="notes"]').innerHTML = notesListHTML();
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'importFile') { importFile(el); return; }
    const c = el.dataset && el.dataset.change;
    if (c === 'date-set' && isDateKey(el.value)) {
      if (el.dataset.target === 'sched') state.schedDate = el.value;
      if (el.dataset.target === 'todo') state.todoDate = el.value;
      render();
    } else if (c === 'diary-date' && isDateKey(el.value)) {
      const d = db.diary.find((x) => x.date === el.value);
      if (d) openDiaryRead(d); else openDiaryForm(null, el.value);
      el.value = '';
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    const kind = form.dataset && form.dataset.form;
    if (!kind) return;
    e.preventDefault();
    if (kind === 'quick-todo') {
      const input = form.elements.title;
      const title = input.value.trim();
      if (!title) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        toast('할 일 내용을 입력해 주세요.', 'error');
        return;
      }
      db.todos.push({ id: uid(), created: Date.now(), title, slot: form.elements.slot.value, priority: 'mid', date: state.todoDate, repeat: false, done: false, doneDates: [] });
      save();
      render();
      const again = $('form[data-form="quick-todo"] input[name="title"]');
      if (again) again.focus();
      toast(`${slotMeta(form.elements.slot.value).label} 할 일을 추가했습니다.`);
    } else if (kind === 'quick-diary') {
      const input = form.elements.line;
      const line = input.value.trim();
      if (!line) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        toast('기록할 내용을 입력해 주세요.', 'error');
        return;
      }
      const t = today();
      let d = db.diary.find((x) => x.date === t);
      if (!d) { d = { id: uid(), created: Date.now(), date: t, title: '', body: '', mood: '' }; db.diary.push(d); }
      d.body = (d.body ? d.body + '\n' : '') + `[${nowTime()}] ${line}`;
      d.updated = Date.now();
      save();
      render();
      toast('오늘 일기에 기록했습니다.');
    }
  });

  // 다른 탭에서 데이터가 바뀌면 반영
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY) { db = load(); render(); }
    if (e.key === THEME_KEY) { applyTheme(getTheme()); render(); }
  });
  // 자정이 지나거나 앱으로 돌아왔을 때 화면 갱신
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && $('#modal').hidden) render();
  });

  window.addEventListener('hashchange', route);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    if (state.view === 'more') render();
  });

  // ---------------------------------------------------------
  // 시작
  // ---------------------------------------------------------
  function init() {
    applyTheme(getTheme());
    $('#searchBtn').innerHTML = icon('search');
    $('#settingsBtn').innerHTML = icon('settings');
    $('#fab').innerHTML = icon('plus');
    $('#nav').innerHTML = `<div class="nav-inner">${NAV.map(([v, l, i]) =>
      `<button type="button" class="nav-btn" data-action="nav" data-view="${v}">${icon(i)}<span>${l}</span></button>`).join('')}</div>`;
    route();

    // 브라우저가 저장 공간을 임의로 비우지 않도록 요청
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    // 오프라인 사용을 위한 Service Worker 등록 (HTTPS 또는 localhost 에서만 동작)
    if (!IS_ARTIFACT && !window.HaruAndroid && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch((err) => console.warn('Service Worker 등록 실패', err));
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (state.view === 'more') render(); });
    }
  }

  init();
  initCloud();
})();
