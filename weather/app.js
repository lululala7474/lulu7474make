// 전국날씨: Open-Meteo 무료 API (키 불필요) + 오프라인 저장
const CITIES = [
  { name: '서울', region: '서울특별시', lat: 37.5665, lon: 126.9780 },
  { name: '인천', region: '인천광역시', lat: 37.4563, lon: 126.7052 },
  { name: '수원', region: '경기도', lat: 37.2636, lon: 127.0286 },
  { name: '춘천', region: '강원도', lat: 37.8813, lon: 127.7298 },
  { name: '강릉', region: '강원도', lat: 37.7519, lon: 128.8761 },
  { name: '청주', region: '충청북도', lat: 36.6424, lon: 127.4890 },
  { name: '천안', region: '충청남도', lat: 36.8151, lon: 127.1139 },
  { name: '대전', region: '대전광역시', lat: 36.3504, lon: 127.3845 },
  { name: '세종', region: '세종특별자치시', lat: 36.4800, lon: 127.2890 },
  { name: '전주', region: '전라북도', lat: 35.8242, lon: 127.1480 },
  { name: '광주', region: '광주광역시', lat: 35.1595, lon: 126.8526 },
  { name: '목포', region: '전라남도', lat: 34.8118, lon: 126.3922 },
  { name: '여수', region: '전라남도', lat: 34.7604, lon: 127.6622 },
  { name: '대구', region: '대구광역시', lat: 35.8714, lon: 128.6014 },
  { name: '안동', region: '경상북도', lat: 36.5684, lon: 128.7294 },
  { name: '포항', region: '경상북도', lat: 36.0190, lon: 129.3435 },
  { name: '울산', region: '울산광역시', lat: 35.5384, lon: 129.3114 },
  { name: '창원', region: '경상남도', lat: 35.2280, lon: 128.6811 },
  { name: '부산', region: '부산광역시', lat: 35.1796, lon: 129.0756 },
  { name: '제주', region: '제주특별자치도', lat: 33.4996, lon: 126.5312 },
  { name: '서귀포', region: '제주특별자치도', lat: 33.2541, lon: 126.5600 },
  { name: '울릉도', region: '경상북도', lat: 37.4844, lon: 130.9057 },
];

const STORE_KEY = 'weather-cache-v1';

// WMO 날씨 코드 → 아이콘/설명
function wmo(code) {
  if (code === 0) return ['☀️', '맑음'];
  if (code === 1) return ['🌤️', '대체로 맑음'];
  if (code === 2) return ['⛅', '구름 조금'];
  if (code === 3) return ['☁️', '흐림'];
  if (code === 45 || code === 48) return ['🌫️', '안개'];
  if (code >= 51 && code <= 57) return ['🌦️', '이슬비'];
  if (code >= 61 && code <= 67) return ['🌧️', '비'];
  if (code >= 71 && code <= 77) return ['🌨️', '눈'];
  if (code >= 80 && code <= 82) return ['🌧️', '소나기'];
  if (code === 85 || code === 86) return ['❄️', '소낙눈'];
  if (code >= 95) return ['⛈️', '뇌우'];
  return ['🌡️', '정보 없음'];
}

const $ = (id) => document.getElementById(id);
let data = null;      // { savedAt, cities: [...] }
let current = null;   // 상세 보기 중인 도시 index

function loadCache() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; }
}
function saveCache(d) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch {}
}

async function fetchWeather() {
  const p = new URLSearchParams({
    latitude: CITIES.map(c => c.lat).join(','),
    longitude: CITIES.map(c => c.lon).join(','),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'Asia/Seoul',
    forecast_days: '7',
    wind_speed_unit: 'ms',
  });
  const res = await fetch('https://api.open-meteo.com/v1/forecast?' + p);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  let json = await res.json();
  if (!Array.isArray(json)) json = [json];
  return { savedAt: Date.now(), cities: json.map(j => ({ current: j.current, daily: j.daily })) };
}

function fmtTime(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function setStatus(msg, offline = false) {
  const s = $('status');
  s.textContent = msg;
  s.className = 'status' + (offline ? ' offline' : '');
}

// 오프라인일 때 '오늘' 기준으로 저장된 일별 예보에서 오늘 위치를 찾음
function todayIndex(daily) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const i = daily.time.indexOf(today);
  return i < 0 ? 0 : i;
}

// ---------- 한줄 요약 (인터넷 없이 휴대폰 안에서 규칙으로 만듦) ----------
function kind(code) {
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code <= 1) return 'clear';
  return 'cloudy';
}
const KIND_TEXT = { clear: '맑고', cloudy: '구름이 많고', rain: '비가 오고', snow: '눈이 오고', storm: '천둥번개가 치고' };
// 받침 여부에 따라 은/는
const josa = (w) => ((w.charCodeAt(w.length - 1) - 0xac00) % 28 ? '은' : '는');

function cityLine(c, w, ti) {
  const d = w.daily, k = kind(d.weather_code[ti]);
  const hi = Math.round(d.temperature_2m_max[ti]), lo = Math.round(d.temperature_2m_min[ti]);
  const rain = d.precipitation_probability_max[ti] ?? 0;
  let tempPart;
  if (lo <= 0) tempPart = '아침엔 영하로 추워요';
  else if (hi >= 30) tempPart = '한낮엔 무더워요';
  else if (hi - lo >= 10) tempPart = `일교차가 ${hi - lo}도로 커요`;
  else tempPart = `기온은 ${lo}~${hi}도예요`;
  let line = `오늘 ${c.name}${josa(c.name)} ${KIND_TEXT[k]} ${tempPart}.`;
  if (k === 'snow') line += ' 빙판길 조심하세요 ❄️';
  else if (rain >= 60 || k === 'rain' || k === 'storm') line += ' 우산 꼭 챙기세요 ☂️';
  else if (rain >= 30) line += ' 작은 우산 하나 챙기면 좋아요.';
  else if (d.time[ti + 1] !== undefined) {
    const t = ti + 1, tr = d.precipitation_probability_max[t] ?? 0, tk = kind(d.weather_code[t]);
    const diff = Math.round(d.temperature_2m_max[t]) - hi;
    if (tk === 'snow' || tr >= 50) line += ` 내일은 ${tk === 'snow' ? '눈' : '비'} 소식이 있어요(${tr}%).`;
    else if (diff <= -5) line += ` 내일은 ${-diff}도 더 쌀쌀해져요.`;
    else if (diff >= 5) line += ` 내일은 ${diff}도 더 따뜻해져요.`;
  }
  return line;
}

function nationalLine() {
  const groups = { clear: [], cloudy: [], rain: [], snow: [], storm: [] };
  let hot = null, cold = null;
  CITIES.forEach((c, i) => {
    const w = data.cities[i]; if (!w) return;
    const ti = todayIndex(w.daily);
    groups[kind(w.daily.weather_code[ti])].push(c.name);
    const hi = w.daily.temperature_2m_max[ti], lo = w.daily.temperature_2m_min[ti];
    if (!hot || hi > hot.t) hot = { t: hi, n: c.name };
    if (!cold || lo < cold.t) cold = { t: lo, n: c.name };
  });
  const sunny = groups.clear.length, cloudy = groups.cloudy.length;
  let line = sunny >= cloudy ? '전국 대체로 맑아요' : '전국 대체로 구름이 많아요';
  const wet = [];
  if (groups.rain.length) wet.push(`${groups.rain.slice(0, 3).join('·')}${groups.rain.length > 3 ? ' 등' : ''} 비`);
  if (groups.storm.length) wet.push(`${groups.storm.slice(0, 2).join('·')} 뇌우`);
  if (groups.snow.length) wet.push(`${groups.snow.slice(0, 3).join('·')}${groups.snow.length > 3 ? ' 등' : ''} 눈`);
  if (wet.length) line += `. ${wet.join(', ')} 소식이 있어요`;
  line += `. 가장 추운 곳은 ${cold.n}(${Math.round(cold.t)}°), 가장 따뜻한 곳은 ${hot.n}(${Math.round(hot.t)}°)예요.`;
  return line;
}

function renderList() {
  const g = $('grid');
  if (!data) { $('national').hidden = true; g.innerHTML = '<div class="empty">아직 저장된 날씨가 없습니다.<br>인터넷에 연결한 뒤 새로고침 해주세요.</div>'; return; }
  $('national').hidden = false;
  $('national').innerHTML = `<span class="label">📝 오늘 전국 한줄요약</span>${nationalLine()}`;
  g.innerHTML = '';
  CITIES.forEach((c, i) => {
    const w = data.cities[i]; if (!w) return;
    const ti = todayIndex(w.daily);
    const fresh = Date.now() - data.savedAt < 3 * 3600 * 1000;
    // 저장된 지 오래되면 '현재' 대신 오늘 예보를 보여줌
    const code = fresh ? w.current.weather_code : w.daily.weather_code[ti];
    const [icon] = wmo(code);
    const temp = fresh ? Math.round(w.current.temperature_2m) + '°' : '';
    const btn = document.createElement('button');
    btn.className = 'city';
    btn.innerHTML = `
      <div class="name">${c.name}</div><div class="region">${c.region}</div>
      <div class="row"><span class="icon">${icon}</span><span class="temp">${temp}</span></div>
      <div class="mm"><span class="hi">${Math.round(w.daily.temperature_2m_max[ti])}°</span> / <span class="lo">${Math.round(w.daily.temperature_2m_min[ti])}°</span> · 💧${w.daily.precipitation_probability_max[ti] ?? '-'}%</div>`;
    btn.onclick = () => showDetail(i);
    g.appendChild(btn);
  });
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function renderDetail() {
  const i = current, c = CITIES[i], w = data.cities[i];
  const ti = todayIndex(w.daily);
  const fresh = Date.now() - data.savedAt < 3 * 3600 * 1000;
  const [icon, desc] = wmo(fresh ? w.current.weather_code : w.daily.weather_code[ti]);
  const days = w.daily.time.map((t, k) => {
    if (k < ti) return '';
    const d = new Date(t + 'T00:00:00');
    const label = k === ti ? '오늘' : k === ti + 1 ? '내일' : DOW[d.getDay()] + '요일';
    const [di, dd] = wmo(w.daily.weather_code[k]);
    return `<div class="day">
      <div class="d">${label}<small>${d.getMonth() + 1}/${d.getDate()}</small></div>
      <div class="icon">${di}</div>
      <div><div>${dd}</div><div class="rain">💧 ${w.daily.precipitation_probability_max[k] ?? '-'}%</div></div>
      <div class="t"><span class="lo">${Math.round(w.daily.temperature_2m_min[k])}°</span> / <span class="hi">${Math.round(w.daily.temperature_2m_max[k])}°</span></div>
    </div>`;
  }).join('');
  $('detail').innerHTML = `
    <div class="hero">
      <div class="name">${c.name}</div><div class="desc">${c.region}</div>
      <div class="icon">${icon}</div>
      ${fresh ? `<div class="temp">${Math.round(w.current.temperature_2m)}°</div>` : ''}
      <div class="desc">${desc}</div>
      ${fresh ? `<div class="facts"><span>체감 ${Math.round(w.current.apparent_temperature)}°</span><span>습도 ${w.current.relative_humidity_2m}%</span><span>바람 ${w.current.wind_speed_10m}m/s</span></div>` : '<div class="facts"><span>오프라인: 저장된 예보 기준</span></div>'}
    </div>
    <div class="summary"><span class="label">📝 한줄요약</span>${cityLine(c, w, ti)}</div>
    <div class="week"><h2>주간 예보</h2>${days}</div>`;
}

function showDetail(i) {
  current = i;
  renderDetail();
  $('list-view').hidden = true;
  $('detail-view').hidden = false;
  $('title').textContent = CITIES[i].name + ' 날씨';
  history.pushState({ detail: i }, '');
  window.scrollTo(0, 0);
}
function showList() {
  current = null;
  $('list-view').hidden = false;
  $('detail-view').hidden = true;
  $('title').textContent = '전국날씨';
}

function render() {
  if (current !== null && data) renderDetail(); else renderList();
}

async function refresh() {
  const btn = $('refresh');
  btn.classList.add('spin');
  setStatus('날씨를 불러오는 중…');
  try {
    data = await fetchWeather();
    saveCache(data);
    setStatus('업데이트: ' + fmtTime(data.savedAt) + ' · 7일 예보 저장됨');
  } catch (e) {
    data = data || loadCache();
    setStatus(data
      ? `📴 오프라인: ${fmtTime(data.savedAt)}에 저장된 정보를 보여드립니다`
      : '📴 인터넷 연결이 없고 저장된 정보도 없습니다', true);
  } finally {
    btn.classList.remove('spin');
    render();
  }
}

$('refresh').onclick = refresh;
$('back').onclick = () => history.back();
window.addEventListener('popstate', showList);
window.addEventListener('online', refresh);
window.addEventListener('offline', () => data && setStatus(`📴 오프라인: ${fmtTime(data.savedAt)}에 저장된 정보를 보여드립니다`, true));

// 시작: 저장된 데이터 먼저 표시하고, 오래됐으면 갱신
data = loadCache();
render();
if (data) setStatus('업데이트: ' + fmtTime(data.savedAt));
refresh();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
