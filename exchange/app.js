// 환율노트: Frankfurter(ECB 기준환율, 키 불필요) + GDELT 뉴스(키 불필요) + 오프라인 저장
const CURRENCIES = [
  { code: 'USD', name: '미국 달러', short: '달러', flag: '🇺🇸', unit: 1,
    news: '("US dollar" OR "Federal Reserve" OR "dollar index")',
    drivers: ['미국 연준(Fed)의 기준금리 결정과 발언', '미국 고용·물가(CPI) 지표 발표', '전쟁·금융위기 때 안전자산(달러) 수요 증가', '한국 수출 실적과 외국인 주식 매수·매도'] },
  { code: 'EUR', name: '유로', short: '유로', flag: '🇪🇺', unit: 1,
    news: '("European Central Bank" OR "eurozone economy" OR "euro dollar")',
    drivers: ['유럽중앙은행(ECB)의 금리 결정', '유로존 물가·경기 지표 (특히 독일)', '에너지(가스·유가) 가격', '미국 달러 강세·약세의 반대 방향 움직임'] },
  { code: 'JPY', name: '일본 엔', short: '엔화', flag: '🇯🇵', unit: 100,
    news: '("Japanese yen" OR "Bank of Japan")',
    drivers: ['일본은행(BOJ)의 금리·통화정책 변화', '미국과 일본의 금리 차이', '위기 때 안전자산(엔화) 수요', '일본 정부의 외환시장 개입'] },
  { code: 'CNY', name: '중국 위안', short: '위안', flag: '🇨🇳', unit: 1,
    news: '("Chinese yuan" OR "People\'s Bank of China" OR renminbi)',
    drivers: ['중국 인민은행이 매일 발표하는 기준환율', '중국 경기·수출 지표', '미·중 무역 갈등과 관세', '원화는 위안화와 비슷하게 움직이는 경향'] },
  { code: 'GBP', name: '영국 파운드', short: '파운드', flag: '🇬🇧', unit: 1,
    news: '("British pound" OR "Bank of England" OR sterling)',
    drivers: ['영란은행(BoE)의 금리 결정', '영국 물가·임금 지표', '영국 정치·재정 이슈', '미국 달러 강세·약세'] },
];
const WON_NEWS = '("Korean won" OR "Bank of Korea" OR KOSPI)';

const RATE_KEY = 'fx-rates-v1';
const NEWS_KEY = 'fx-news-v1';
const NEWS_TTL = 3 * 3600 * 1000;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let data = load(RATE_KEY);   // { savedAt, series: { USD: [[date, 원], ...] } }
let period = 7;
let current = null;

// ---------- 데이터 받기 ----------
function ymd(d) { return d.toISOString().slice(0, 10); }

async function fetchRates() {
  const start = new Date(); start.setDate(start.getDate() - 45);
  const to = CURRENCIES.map((c) => c.code).join(',');
  const urls = [
    `https://api.frankfurter.app/${ymd(start)}..?from=KRW&to=${to}`,
    `https://api.frankfurter.dev/v1/${ymd(start)}..?base=KRW&symbols=${to}`,
  ];
  let json, lastErr;
  for (const u of urls) {
    try { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); json = await r.json(); break; }
    catch (e) { lastErr = e; }
  }
  if (!json) throw lastErr;
  // 1원당 외화 → 외화 1단위(엔은 100엔)당 원화로 뒤집기
  const series = {};
  for (const c of CURRENCIES) series[c.code] = [];
  for (const date of Object.keys(json.rates).sort()) {
    for (const c of CURRENCIES) {
      const v = json.rates[date][c.code];
      if (v) series[c.code].push([date, c.unit / v]);
    }
  }
  return { savedAt: Date.now(), series };
}

// 같은 뉴스 요청이 동시에 두 번 나가지 않게 하고, GDELT 요청 간격(5초)을 지킴
const inflight = {};
let lastNewsAt = 0;
function fetchNews(query) {
  if (!inflight[query]) inflight[query] = fetchNewsOnce(query).finally(() => delete inflight[query]);
  return inflight[query];
}
async function gdelt(p) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = lastNewsAt + 5500 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNewsAt = Date.now();
    const r = await fetch('https://api.gdeltproject.org/api/v2/doc/doc?' + p);
    const text = await r.text();
    try { return JSON.parse(text); } catch { /* 요청이 잦으면 안내문이 옴 → 한 번 더 시도 */ }
  }
  throw new Error('news unavailable');
}
async function fetchNewsOnce(query) {
  const cache = load(NEWS_KEY) || {};
  const hit = cache[query];
  if (hit && Date.now() - hit.at < NEWS_TTL) return { items: hit.items, at: hit.at };
  const p = new URLSearchParams({ query: query + ' sourcelang:english', mode: 'artlist', format: 'json', maxrecords: '8', timespan: '7d', sort: 'datedesc' });
  try {
    const json = await gdelt(p);
    const items = (json.articles || []).map((a) => ({ title: a.title, url: a.url, domain: a.domain, date: a.seendate }));
    cache[query] = { at: Date.now(), items };
    save(NEWS_KEY, cache);
    return { items, at: Date.now() };
  } catch (e) {
    if (hit) return { items: hit.items, at: hit.at, stale: true };
    throw e;
  }
}

// ---------- 분석 ----------
function windowOf(series, days) {
  if (!series.length) return [];
  const last = new Date(series[series.length - 1][0]);
  last.setDate(last.getDate() - days);
  const cut = ymd(last);
  let s = 0;
  for (let i = 0; i < series.length; i++) if (series[i][0] <= cut) s = i;
  return series.slice(s);
}

function analyze(series, days) {
  const w = windowOf(series, days);
  if (w.length < 2) return null;
  const first = w[0][1], last = w[w.length - 1][1];
  let hi = w[0], lo = w[0], moves = [], big = null;
  for (let i = 1; i < w.length; i++) {
    if (w[i][1] > hi[1]) hi = w[i];
    if (w[i][1] < lo[1]) lo = w[i];
    const m = (w[i][1] / w[i - 1][1] - 1) * 100;
    moves.push(Math.abs(m));
    if (!big || Math.abs(m) > Math.abs(big.m)) big = { date: w[i][0], m };
  }
  const vol = moves.reduce((a, b) => a + b, 0) / moves.length;
  const recentBase = w[Math.max(0, w.length - 4)][1];
  return {
    w, first, last, diff: last - first, pct: (last / first - 1) * 100,
    hi, lo, range: (hi[1] / lo[1] - 1) * 100, vol, big,
    recent: (last / recentBase - 1) * 100, upDays: moves.length, // 거래일 수
  };
}

function trendWord(pct) {
  if (pct >= 2) return ['크게 올랐어요', 'up'];
  if (pct >= 0.5) return ['올랐어요', 'up'];
  if (pct > 0.15) return ['조금 올랐어요', 'up'];
  if (pct <= -2) return ['크게 내렸어요', 'down'];
  if (pct <= -0.5) return ['내렸어요', 'down'];
  if (pct < -0.15) return ['조금 내렸어요', 'down'];
  return ['거의 변동이 없어요', 'flat'];
}
function volWord(v) {
  if (v >= 0.6) return '변동성 큼 (하루에도 크게 출렁임)';
  if (v >= 0.3) return '변동성 보통';
  return '변동성 낮음 (안정적)';
}
const won = (v) => v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '원';
const sign = (v, d = 2) => (v > 0 ? '+' : '') + v.toFixed(d);
const md = (s) => { const [, m, d] = s.split('-'); return `${+m}/${+d}`; };
const unitLabel = (c) => `${c.unit === 100 ? '100' : '1'} ${c.code}`;
const josaUl = (w) => ((w.charCodeAt(w.length - 1) - 0xac00) % 28 ? '을' : '를');
const josaI = (w) => ((w.charCodeAt(w.length - 1) - 0xac00) % 28 ? '이' : '가');

function verdictText(c, a) {
  const [word, cls] = trendWord(a.pct);
  let t = `최근 ${period}일 동안 ${c.short}${josaI(c.short)} 원화 대비 <b class="big ${cls}">${sign(a.pct)}% ${word}</b> `;
  t += `(${won(a.first)} → ${won(a.last)}, ${sign(a.diff)}원).<br>`;
  if (cls === 'up') t += `👉 ${c.short} 가치가 오르고 원화 가치는 떨어졌어요. 지금 ${c.short}${josaUl(c.short)} 사거나 해외 결제·여행을 하면 전보다 비싸요.`;
  else if (cls === 'down') t += `👉 ${c.short} 가치가 내리고 원화 가치는 올랐어요. 환전·해외 결제가 전보다 유리해졌어요.`;
  else t += '👉 큰 흐름 없이 제자리걸음이에요.';
  if (Math.sign(a.recent) !== Math.sign(a.pct) && Math.abs(a.recent) >= 0.3) {
    t += ` 다만 최근 3거래일은 <b class="${a.recent > 0 ? 'up' : 'down'}">${a.recent > 0 ? '반등' : '하락'} 중(${sign(a.recent)}%)</b>이에요.`;
  }
  return t;
}

function overallText() {
  const rows = CURRENCIES.map((c) => ({ c, a: analyze(data.series[c.code] || [], period) })).filter((r) => r.a);
  if (!rows.length) return '';
  const up = rows.filter((r) => r.a.pct > 0.15), down = rows.filter((r) => r.a.pct < -0.15);
  const sorted = [...rows].sort((x, y) => y.a.pct - x.a.pct);
  const top = sorted[0], bottom = sorted[sorted.length - 1];
  const wild = [...rows].sort((x, y) => y.a.vol - x.a.vol)[0];
  let t;
  if (up.length > down.length) t = `최근 ${period}일 원화는 <b class="down">약세</b>예요. ${rows.length}개 통화 중 ${up.length}개가 원화 대비 올랐어요.`;
  else if (down.length > up.length) t = `최근 ${period}일 원화는 <b class="up">강세</b>예요. ${rows.length}개 통화 중 ${down.length}개가 원화 대비 내렸어요.`;
  else t = `최근 ${period}일 원화는 통화별로 엇갈리며 큰 방향이 없어요.`;
  const topW = top.a.pct > 0 ? '가장 많이 오른' : '가장 적게 내린';
  const botW = bottom.a.pct < 0 ? '가장 많이 내린' : '가장 적게 오른';
  t += ` ${topW} 건 ${top.c.short}(${sign(top.a.pct)}%), ${botW} 건 ${bottom.c.short}(${sign(bottom.a.pct)}%)이고, 가장 크게 출렁인 통화는 ${wild.c.short}(하루 평균 ${wild.a.vol.toFixed(2)}%)예요.`;
  return t;
}

// ---------- 그래프 ----------
function sparkline(w, cls) {
  const W = 96, H = 34, vals = w.map((p) => p[1]);
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - 3 - ((v - mn) / r) * (H - 6)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="96" height="34"><polyline points="${pts}" fill="none" stroke="var(--${cls})" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

function bigChart(a, cls) {
  const W = 340, H = 170, L = 6, R = 6, T = 14, B = 22;
  const vals = a.w.map((p) => p[1]);
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const x = (i) => L + (i / (vals.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - mn) / r) * (H - T - B);
  const line = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `${x(0)},${H - B} ${line} ${x(vals.length - 1)},${H - B}`;
  const hiI = a.w.indexOf(a.hi), loI = a.w.indexOf(a.lo);
  const anchor = (i) => (i < vals.length * 0.2 ? 'start' : i > vals.length * 0.8 ? 'end' : 'middle');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="환율 추이 그래프">
    <polygon points="${area}" fill="var(--${cls})" opacity=".12"/>
    <polyline points="${line}" fill="none" stroke="var(--${cls})" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="${x(hiI)}" cy="${y(a.hi[1])}" r="3.5" fill="var(--up)"/>
    <circle cx="${x(loI)}" cy="${y(a.lo[1])}" r="3.5" fill="var(--down)"/>
    <text x="${x(hiI)}" y="${y(a.hi[1]) - 5}" text-anchor="${anchor(hiI)}">최고 ${a.hi[1].toFixed(2)}</text>
    <text x="${x(loI)}" y="${Math.min(H - B - 2, y(a.lo[1]) + 13)}" text-anchor="${anchor(loI)}">최저 ${a.lo[1].toFixed(2)}</text>
    <text x="${L}" y="${H - 6}">${md(a.w[0][0])}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end">${md(a.w[a.w.length - 1][0])}</text>
  </svg>`;
}

// ---------- 화면 ----------
function fmtTime(ts) { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function setStatus(msg, offline = false) { const s = $('status'); s.textContent = msg; s.className = 'status' + (offline ? ' offline' : ''); }

function renderList() {
  const list = $('list');
  if (!data) { $('overall').hidden = true; list.innerHTML = '<div class="empty">아직 저장된 환율이 없습니다.<br>인터넷에 연결한 뒤 새로고침 해주세요.</div>'; return; }
  $('overall').hidden = false;
  $('overall').innerHTML = `<span class="label">📝 한줄 분석</span>${overallText()}`;
  list.innerHTML = '';
  CURRENCIES.forEach((c, i) => {
    const a = analyze(data.series[c.code] || [], period); if (!a) return;
    const [, cls] = trendWord(a.pct);
    const b = document.createElement('button');
    b.className = 'cur';
    b.innerHTML = `
      <div><div class="nm">${c.flag} ${c.name}</div><div class="unit">${unitLabel(c)} 기준</div><div class="rate">${won(a.last)}</div></div>
      ${sparkline(a.w, cls)}
      <div class="chg ${cls}">${sign(a.pct)}%<small>${sign(a.diff)}원</small></div>`;
    b.onclick = () => showDetail(i);
    list.appendChild(b);
  });
  const nw = document.createElement('div');
  nw.className = 'card';
  nw.innerHTML = '<h2>📰 원화 관련 뉴스 <small>(최근 7일)</small></h2><div id="won-news" class="muted">뉴스 불러오는 중…</div>';
  list.appendChild(nw);
  renderNews(WON_NEWS, 'won-news');
}

function renderDetail() {
  const c = CURRENCIES[current], a = analyze(data.series[c.code] || [], period);
  if (!a) { $('detail').innerHTML = '<div class="empty">데이터가 부족합니다.</div>'; return; }
  const [word, cls] = trendWord(a.pct);
  $('detail').innerHTML = `
    <div class="card hero">
      <div class="nm">${c.flag} ${c.name} <span class="muted">(${unitLabel(c)})</span></div>
      <div class="rate">${won(a.last)}</div>
      <div class="chg ${cls}">${period}일 ${sign(a.pct)}% · ${sign(a.diff)}원 · ${word}</div>
      ${bigChart(a, cls)}
    </div>
    <div class="summary verdict"><span class="label">📝 결론</span>${verdictText(c, a)}</div>
    <div class="card">
      <h2>📊 ${period}일 움직임 <small>(${a.upDays}거래일)</small></h2>
      <div class="stats">
        <div class="stat"><div class="k">시작 → 현재</div><div class="v">${a.first.toFixed(2)} → ${a.last.toFixed(2)}</div></div>
        <div class="stat"><div class="k">오르내린 폭 (최고-최저)</div><div class="v">${(a.hi[1] - a.lo[1]).toFixed(2)}원 <small>${a.range.toFixed(2)}%</small></div></div>
        <div class="stat"><div class="k">최고</div><div class="v up">${a.hi[1].toFixed(2)} <small>${md(a.hi[0])}</small></div></div>
        <div class="stat"><div class="k">최저</div><div class="v down">${a.lo[1].toFixed(2)} <small>${md(a.lo[0])}</small></div></div>
        <div class="stat"><div class="k">하루 평균 변동 (거래 활발도)</div><div class="v">${a.vol.toFixed(2)}% <small>${volWord(a.vol).split(' (')[0]}</small></div></div>
        <div class="stat"><div class="k">가장 크게 움직인 날</div><div class="v ${a.big.m > 0 ? 'up' : 'down'}">${sign(a.big.m)}% <small>${md(a.big.date)}</small></div></div>
      </div>
      <p class="muted" style="margin:10px 0 0">※ 외환은 거래소가 하나로 모여 있지 않아 공식 거래량이 없어요. 대신 하루 평균 변동폭으로 시장이 얼마나 활발했는지 보여드려요. ${volWord(a.vol)}.</p>
    </div>
    <div class="card">
      <h2>🔎 ${c.short} 환율을 움직이는 요인</h2>
      <ul class="drivers">${c.drivers.map((d) => `<li>${d}</li>`).join('')}</ul>
    </div>`;
  $('news').innerHTML = '<div class="muted">뉴스 불러오는 중…</div>';
  renderNews(c.news, 'news');
}

async function renderNews(query, elId) {
  try {
    const { items, at, stale } = await fetchNews(query);
    const el = $(elId); if (!el) return;
    if (!items.length) { el.innerHTML = '<div class="muted">최근 7일 관련 뉴스가 없어요.</div>'; return; }
    el.className = 'news';
    el.innerHTML = items.map((n) => {
      const d = n.date ? `${+n.date.slice(4, 6)}/${+n.date.slice(6, 8)}` : '';
      return `<a href="${esc(n.url)}" target="_blank" rel="noopener"><div class="t">${esc(n.title)}</div><div class="m">${esc(n.domain || '')} · ${d}</div></a>`;
    }).join('') + (stale ? `<div class="muted" style="margin-top:6px">📴 ${fmtTime(at)}에 저장된 뉴스예요</div>` : '');
  } catch {
    const el = $(elId); if (el) el.innerHTML = '<div class="muted">뉴스를 불러오지 못했어요. 인터넷 연결을 확인하거나 잠시 후 새로고침 해주세요.</div>';
  }
}

function render() { if (current !== null && data) renderDetail(); else renderList(); }

function showDetail(i) {
  current = i;
  renderDetail();
  $('list-view').hidden = true; $('detail-view').hidden = false;
  $('title').textContent = CURRENCIES[i].short + ' 환율';
  history.pushState({ d: i }, '');
  window.scrollTo(0, 0);
}
function showList() {
  current = null;
  $('list-view').hidden = false; $('detail-view').hidden = true;
  $('title').textContent = '환율노트';
  renderList();
}

function setPeriod(p) {
  period = p;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.p === p));
  render();
}
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => setPeriod(+b.dataset.p)));

async function refresh() {
  $('refresh').classList.add('spin');
  setStatus('환율을 불러오는 중…');
  try {
    data = await fetchRates();
    save(RATE_KEY, data);
    const lastDate = data.series.USD.at(-1)[0];
    setStatus(`업데이트: ${fmtTime(data.savedAt)} · 기준일 ${md(lastDate)} · 30일치 저장됨`);
  } catch {
    data = data || load(RATE_KEY);
    setStatus(data ? `📴 오프라인: ${fmtTime(data.savedAt)}에 저장된 환율을 보여드립니다` : '📴 인터넷 연결이 없고 저장된 환율도 없습니다', true);
  } finally {
    $('refresh').classList.remove('spin');
    render();
  }
}

$('refresh').onclick = refresh;
$('back').onclick = () => history.back();
window.addEventListener('popstate', showList);
window.addEventListener('online', refresh);

render();
refresh();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
