// ================= Holidays & Calendar =================
let holidays = {};
let displayYear, displayMonth; // 現在表示中の年月 (month:0-11)
async function getHolidays(year) {
  try {
    const response = await fetch('https://holidays-jp.github.io/api/v1/date.json');
    const data = await response.json();
    holidays = Object.fromEntries(
      Object.entries(data).filter(([dateStr]) => dateStr.startsWith(`${year}-`))
    );
  } catch (error) { console.error("祝日の取得に失敗しました", error); }
}
function getHolidayName(year, month, day) {
  const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return holidays[dateStr];
}
function createCalendar(year, month) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const firstDay = firstDayOfMonth.getDay();
  const lastDate = lastDayOfMonth.getDate();
  document.getElementById('current-month').textContent = `${year}年${month + 1}月`;
  let calendarHTML = `
    <div class="header">日</div>
    <div class="header">月</div>
    <div class="header">火</div>
    <div class="header">水</div>
    <div class="header">木</div>
    <div class="header">金</div>
    <div class="header">土</div>
  `;
  for (let i = 0; i < firstDay; i++) calendarHTML += '<div class="day"></div>';
  for (let date = 1; date <= lastDate; date++) {
    const isToday = (today.getFullYear() === year && today.getMonth() === month && today.getDate() === date);
    const holidayName = getHolidayName(year, month, date);
    const holidayClass = holidayName ? 'holiday' : '';
    const todayClass = isToday ? 'today' : '';
    const weekDay = (firstDay + date - 1) % 7;
    let weekClass = '';
    if (weekDay === 0) weekClass = 'sunday';
    if (weekDay === 6) weekClass = 'saturday';
    calendarHTML += `
      <div class="day ${holidayClass} ${todayClass} ${weekClass}">
        <div class="date-number">
          ${date}
          ${holidayName ? `<span class="holiday-name">${holidayName}</span>` : ''}
        </div>
        <div class="schedule">予定なし</div>
      </div>
    `;
  }
  document.getElementById('calendar').innerHTML = calendarHTML;
}
async function setupCalendar() {
  const now = new Date();
  displayYear = now.getFullYear();
  displayMonth = now.getMonth();
  await renderCalendar();
  attachCalendarNav();
}

async function renderCalendar() {
  await getHolidays(displayYear); // 年が変わる可能性考慮（単年度キャッシュならここ調整）
  createCalendar(displayYear, displayMonth);
  if (GOOGLE_CALENDAR_API_KEY && GOOGLE_CALENDAR_ID) {
    try {
      await fetchGoogleCalendarEvents(displayYear, displayMonth);
      populateCalendarEvents(displayYear, displayMonth);
    } catch (e) { console.warn('Googleカレンダー取得失敗', e); }
  }
  // Mark login days on calendar
  markLoginDaysOnCalendar();
  // 最終描画時刻を記録
  lastCalendarRenderTs = Date.now();
}

function attachCalendarNav() {
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  const refresh = document.getElementById('cal-refresh');
  const refreshBtn = document.getElementById('cal-refresh');
  if (!prevBtn || !nextBtn) return;
  prevBtn.addEventListener('click', async () => {
    displayMonth--;
    if (displayMonth < 0) { displayMonth = 11; displayYear--; }
    await renderCalendar();
  });
  nextBtn.addEventListener('click', async () => {
    displayMonth++;
    if (displayMonth > 11) { displayMonth = 0; displayYear++; }
    await renderCalendar();
  });
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
  if (refresh) {
    refresh.addEventListener('click', async () => {
      refresh.disabled = true;
      refresh.classList.add('cal-refresh-loading');
      // 現在月キャッシュ破棄
      const ymKey = `${displayYear}-${String(displayMonth+1).padStart(2,'0')}`;
      if (CAL_EVENTS_BY_DATE && CAL_EVENTS_BY_DATE[displayYear] && CAL_EVENTS_BY_DATE[displayYear][ymKey]) {
        delete CAL_EVENTS_BY_DATE[displayYear][ymKey];
      }
      try {
        await renderCalendar(displayYear, displayMonth);
      } finally {
        setTimeout(()=>{
          refresh.disabled = false;
          refresh.classList.remove('cal-refresh-loading');
        }, 400);
      }
    });
  }
  // 自動更新 (30分ごと): 現在表示している月のキャッシュを破棄して再取得
  if (calendarAutoTimer) clearInterval(calendarAutoTimer);
  calendarAutoTimer = setInterval(async () => {
    const ymKey = `${displayYear}-${String(displayMonth+1).padStart(2,'0')}`;
    if (CAL_EVENTS_BY_DATE && CAL_EVENTS_BY_DATE[displayYear] && CAL_EVENTS_BY_DATE[displayYear][ymKey]) {
      delete CAL_EVENTS_BY_DATE[displayYear][ymKey];
    }
    try { await renderCalendar(displayYear, displayMonth); } catch(e){ console.warn('自動カレンダー更新失敗', e);}        
  }, CALENDAR_REFRESH_INTERVAL_MS);
      const ymKey = `${displayYear}-${displayMonth}`;
      if (CAL_EVENTS_BY_DATE[displayYear]) delete CAL_EVENTS_BY_DATE[displayYear][ymKey];
      refreshBtn.disabled = true;
      refreshBtn.classList.add('cal-refresh-loading');
      try { await renderCalendar(); } finally {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('cal-refresh-loading');
      }
    });
  }
  // 自動更新 interval 設定（未設定時のみ）
  if (!calendarAutoTimer) {
    calendarAutoTimer = setInterval(async () => {
      const ymKey = `${displayYear}-${displayMonth}`;
      if (CAL_EVENTS_BY_DATE[displayYear]) delete CAL_EVENTS_BY_DATE[displayYear][ymKey];
      await renderCalendar();
    }, CALENDAR_REFRESH_INTERVAL_MS);
  }
}

// ================= Weather Provider Switch =================
// provider: 'openweathermap' | 'jma'
const WEATHER_PROVIDER = 'weatherapi'; // 'openweathermap' | 'weatherapi' | 'jma'
const WEATHER_SPLIT_BY_TIME = false; // JMA 用オプション（OWM は分割不要）
// 自動更新間隔 (30分)
const WEATHER_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 1800000ms
// RSS 自動更新間隔 (30分)
const RSS_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
// Google Calendar 設定（公開用カレンダー + API Key を想定）
// 例: window.GCAL_API_KEY = 'YOUR_KEY'; window.GCAL_CALENDAR_ID = 'xxxxx@group.calendar.google.com'; を index 読み込み前 or コンソールで設定
const GOOGLE_CALENDAR_API_KEY = window.GCAL_API_KEY || '';
const GOOGLE_CALENDAR_ID = window.GCAL_CALENDAR_ID || '';
// 取得したイベントを YYYY-MM-DD -> [{title,start,end,allDay}] で保持
const CAL_EVENTS_BY_DATE = {};
// ================= Retry Settings =================
// 失敗時のみ短い間隔で再試行（指数バックオフ上限つき）
const WEATHER_RETRY_BASE_MS = 15 * 1000; // 最初 15秒後
const WEATHER_RETRY_MAX_MS = 5 * 60 * 1000; // 最大 5分
const RSS_RETRY_BASE_MS = 20 * 1000; // 最初 20秒
const RSS_RETRY_MAX_MS = 5 * 60 * 1000; // 最大 5分
let weatherRetryCount = 0;
let rssRetryCount = 0;
let weatherRetryTimer = null;
let rssRetryTimer = null;
// カレンダー自動更新 (30分)
const CALENDAR_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
let calendarAutoTimer = null;
let lastCalendarRenderTs = 0;

function calcRetryDelay(base, max, count) {
  // 2^count * base (指数的) ただし上限 max
  const delay = Math.min(base * Math.pow(2, count), max);
  return delay;
}
function scheduleWeatherRetry() {
  if (weatherRetryTimer) return; // 既に待機中
  const delay = calcRetryDelay(WEATHER_RETRY_BASE_MS, WEATHER_RETRY_MAX_MS, weatherRetryCount);
  weatherRetryCount++;
  const infoEl = document.getElementById('weather-info');
  if (infoEl) {
    const sec = Math.round(delay/1000);
    infoEl.innerHTML += `<div class="retry-note" style="font-size:0.8em;color:#f88;">再試行予定: 約${sec}秒後 (試行${weatherRetryCount})</div>`;
  }
  weatherRetryTimer = setTimeout(() => {
    weatherRetryTimer = null;
    // 現在のプロバイダに応じて再取得
    if (WEATHER_PROVIDER === 'openweathermap') fetchWeatherOWM();
    else if (WEATHER_PROVIDER === 'weatherapi') fetchWeatherWAPI();
    else fetchWeatherJMA();
  }, delay);
}
function scheduleRSSRetry() {
  if (rssRetryTimer) return;
  const delay = calcRetryDelay(RSS_RETRY_BASE_MS, RSS_RETRY_MAX_MS, rssRetryCount);
  rssRetryCount++;
  const rssEl = document.getElementById('rss-list');
  if (rssEl) {
    const sec = Math.round(delay/1000);
    rssEl.innerHTML = `<div>RSSの取得に失敗しました。再試行: 約${sec}秒後 (試行${rssRetryCount})</div>`;
  }
  rssRetryTimer = setTimeout(() => {
    rssRetryTimer = null;
    loadRSS();
  }, delay);
}
// OpenWeatherMap 用座標（鹿児島）
const WEATHER_LAT = 31.5602;
const WEATHER_LON = 130.5581;
// ローカル利用のみ: 直接キー埋め込み (公開リポジトリにコミットしないこと)
window.WEATHERAPI_API_KEY = window.WEATHERAPI_API_KEY || '6fe49bea5a06475097b23220253009';

// ================= Google Calendar Events =================
async function fetchGoogleCalendarEvents(year, month) {
  // month: 0-based
  CAL_EVENTS_BY_DATE[year] ||= {};
  const ymKey = `${year}-${month}`;
  // 既にロード済みでもう一度取得したい場合は条件に応じて return
  // 今回は都度再取得せずキャッシュ
  if (CAL_EVENTS_BY_DATE[year][ymKey]) return;
  if (!GOOGLE_CALENDAR_API_KEY || !GOOGLE_CALENDAR_ID) throw new Error('API_KEY_OR_ID_MISSING');
  const start = new Date(year, month, 1, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  const timeMin = start.toISOString();
  const timeMax = end.toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&key=${encodeURIComponent(GOOGLE_CALENDAR_API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP_'+res.status);
  const data = await res.json();
  const items = data.items || [];
  // 初期化
  CAL_EVENTS_BY_DATE[year][ymKey] = {};
  function addEventForDate(dateStr, evObj){
    if (!CAL_EVENTS_BY_DATE[year][ymKey][dateStr]) CAL_EVENTS_BY_DATE[year][ymKey][dateStr] = [];
    CAL_EVENTS_BY_DATE[year][ymKey][dateStr].push(evObj);
  }
  items.forEach(it => {
    const title = it.summary || '(無題)';
    // all-day: start.date, end.date (end は翌日の日付が返る仕様)
    let startDateTime = it.start?.dateTime || it.start?.date;
    let endDateTime = it.end?.dateTime || it.end?.date;
    const allDay = !!it.start?.date;
    if (!startDateTime || !endDateTime) return;
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);
    if (allDay) {
      // end は翌日扱い -> 1日減らして含める
      endDate.setDate(endDate.getDate() - 1);
    }
    // 期間中の全ての日を追加
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth()+1).padStart(2,'0');
      const d = String(cursor.getDate()).padStart(2,'0');
      const key = `${y}-${m}-${d}`;
      addEventForDate(key, { title, allDay, start: startDateTime, end: endDateTime });
      cursor.setDate(cursor.getDate()+1);
    }
  });
  // カレンダーイベント取得成功
  if (typeof updateServiceStatus === 'function') updateServiceStatus('calendar-status', 'connected');
}

function populateCalendarEvents(year, month) {
  const ymKey = `${year}-${month}`;
  const monthly = CAL_EVENTS_BY_DATE[year]?.[ymKey];
  if (!monthly) return;
  // 各 day セルの .schedule を埋める
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;
  const dayCells = calendarEl.querySelectorAll('.day');
  dayCells.forEach(cell => {
    const numEl = cell.querySelector('.date-number');
    const scheduleEl = cell.querySelector('.schedule');
    if (!numEl || !scheduleEl) return;
    const dayNum = numEl.textContent.match(/\d+/);
    if (!dayNum) return;
    const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum[0]).padStart(2,'0')}`;
    const evs = monthly[dStr];
    if (!evs || evs.length === 0) {
      scheduleEl.textContent = '予定なし';
    } else {
      // 先頭2件 + more
      const maxShow = 2;
      let html = '<div class="schedule-events">';
      evs.slice(0, maxShow).forEach(ev => {
        html += `<div class="event-item" title="${ev.title}">${ev.title}</div>`;
      });
      if (evs.length > maxShow) {
        html += `<div class="event-more">+${evs.length - maxShow}</div>`;
      }
      html += '</div>';
      scheduleEl.innerHTML = html;
    }
  });
}

// ========== Wind Direction Helpers ==========
function translateWindDir(code) {
  const map = {
    N:'北', NNE:'北北東', NE:'北東', ENE:'東北東', E:'東', ESE:'東南東', SE:'南東', SSE:'南南東',
    S:'南', SSW:'南南西', SW:'南西', WSW:'西南西', W:'西', WNW:'西北西', NW:'北西', NNW:'北北西'
  };
  return map[code] || code || '';
}
function windArrow(deg) {
  if (typeof deg !== 'number' || isNaN(deg)) return '';
  // 上矢印を北基準に回転
  return `<span class="wind-arrow" style="display:inline-block;transform:rotate(${deg}deg);">↑</span>`;
}
async function fetchWeatherJMA() { // fallback or future toggle
  const url = 'https://www.jma.go.jp/bosai/forecast/data/forecast/460100.json';
  const infoEl = document.getElementById('weather-info');
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    // 成功 -> リトライ情報リセット
    weatherRetryCount = 0;
    const timeSeriesList = data[0]?.timeSeries || [];

    // Weathers
    const weatherSeries = timeSeriesList.find(ts => ts.areas && ts.areas[0] && ts.areas[0].weathers);
    const tempSeries = timeSeriesList.find(ts => ts.areas && ts.areas[0] && (ts.areas[0].temps || ts.areas[0].tempsMin || ts.areas[0].tempsMax));
    const popsSeries = timeSeriesList.find(ts => ts.areas && ts.areas[0] && ts.areas[0].pops);

    const weatherTimes = weatherSeries?.timeDefines || [];
    const weathers = weatherSeries?.areas[0]?.weathers || [];
    const temps = tempSeries?.areas[0]?.temps || tempSeries?.areas[0]?.tempsMax || [];
    const tempsMin = tempSeries?.areas[0]?.tempsMin || [];
    const tempsMax = tempSeries?.areas[0]?.tempsMax || temps || [];
    const pops = popsSeries?.areas[0]?.pops || [];

    // 現在（最初の要素）を概要として表示
    if (weathers.length) {
      const raw = weathers[0];
      let htmlBody = '';
      if (WEATHER_SPLIT_BY_TIME) {
        const segments = splitWeatherByTime(raw); // 時間帯ごとに分割
        htmlBody = segments.length
          ? segments.map(seg => `<div class=\"weather-line\"><span class=\"time-badge\">${seg.label}</span><span class=\"weather-text\">${formatWeatherSentence(seg.text)}</span></div>`).join('')
          : `<div class=\"weather-line\"><span class=\"weather-text\">${formatWeatherSentence(raw)}</span></div>`;
      } else {
        htmlBody = `<div class=\"weather-line\"><span class=\"weather-text\">${formatWeatherSentence(raw)}</span></div>`;
      }
      let tempText = '';
      if (tempsMax[0] || tempsMin[0]) {
        tempText = `<div class=\"weather-line temp-range\">気温: ${tempsMin[0] ?? '-'} / ${tempsMax[0] ?? '-'} °C</div>`;
      }
      infoEl.innerHTML = `<span class=\"weather-label\">現在(推定)の天気</span><br>${htmlBody}${tempText}`;
    } else {
      infoEl.textContent = '天気データなし';
    }

    // 週間相当（JMA短期 + 翌日) をテーブル化 (最大5〜7 行程度) → weather-dropdown の weekly-weather-content に表示
    const weeklyContainer = document.getElementById('weekly-weather-content');
    if (weeklyContainer) {
      let html = '<table class="weekly-table"><tr><th>日時</th><th>天気</th><th>降水% </th><th>最低</th><th>最高</th></tr>';
      for (let i = 0; i < weatherTimes.length && i < 7; i++) {
        const dt = new Date(weatherTimes[i]);
        const label = `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}h`;
        html += `<tr><td>${label}</td><td>${weathers[i] || '-'}</td><td>${pops[i] || '-'}</td><td>${tempsMin[i] || '-'}</td><td>${tempsMax[i] || temps[i] || '-'}</td></tr>`;
      }
      html += '</table>';
      weeklyContainer.innerHTML = html;
    }
  } catch (e) {
    console.error(e);
    if (infoEl) infoEl.textContent = 'JMA天気取得失敗';
    const weeklyContainer = document.getElementById('weekly-weather-content');
    if (weeklyContainer) weeklyContainer.textContent = '取得できませんでした';
    scheduleWeatherRetry();
  }
}

// 天気文フォーマット: 余計な全角/半角スペース除去・区切り語で分割し結合調整
function formatWeatherSentence(text) {
  if (!text) return '';
  // 全角スペースを半角へ統一 → 連続スペースを1個
  let t = text.replace(/　/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // “ 晴れ 夕方 から くもり 所により 夜 雨 ” のような語列を区切り語で処理
  const separators = ['から', '所により', '夜', '朝', '夕方', '昼過ぎ', '後', '一時', '時々'];
  // スペースで一旦トークン化
  const tokens = t.split(' ');
  let parts = [];
  let buffer = [];
  tokens.forEach(tok => {
    if (separators.includes(tok)) {
      if (buffer.length) { parts.push(buffer.join('')); buffer = []; }
      parts.push(tok);
    } else {
      buffer.push(tok);
    }
  });
  if (buffer.length) parts.push(buffer.join(''));
  // 連続する助詞・接続語の冗長化を軽減: ex) "から 所により" → "から 所により"
  // 同一語の連続を削除
  parts = parts.filter((p, i) => i === 0 || p !== parts[i-1]);
  // 表示組み立て: 主要天気語を最初、その後は '・' 区切り。ただし接続語(から/後/一時/時々)は直結
  const connectWords = new Set(['から','後']);
  const softWords = new Set(['一時','時々']);
  let result = '';
  for (let i=0;i<parts.length;i++) {
    const part = parts[i];
    if (i === 0) { result += part; continue; }
    if (connectWords.has(part)) {
      result += part; // 直後に続く
    } else if (softWords.has(part)) {
      result += part; // 直後
    } else if (part.length <= 2 && /[夜朝]/.test(part)) {
      // "夜", "朝" など短い時間語 -> 前にスペース
      result += ' ' + part + ' ';
    } else if (part === '所により') {
      result += ' ' + part + ' ';
    } else {
      // 一般語 -> 中点区切り
      if (!result.endsWith(' ') && !result.endsWith('から') && !result.endsWith('後')) {
        result += ' ・ ' + part;
      } else {
        result += part;
      }
    }
  }
  // 仕上げ: 余計なスペース調整
  result = result.replace(/\s{2,}/g,' ').replace(/ ・ /g,' · '); // 視認性向上のため中点を半角スペースで挟む
  return result.trim();
}

// 改善版: 既存挙動を保ちつつより自然な日本語へ（中点除去）
// NOTE: 上の関数を書き換えると影響大なので後段微修正を適用
const _origFormat = formatWeatherSentence;
formatWeatherSentence = function(text) {
  let s = _origFormat(text);
  // 中点 (·) をスペースに戻す
  s = s.replace(/\s*·\s*/g,' ');
  // "夕方からくもり 所により 夜 雨" -> "夕方からくもり 所により夜は雨" っぽく整形
  s = s
    .replace(/(所により)\s+夜\s+雨/g,'$1夜は雨')
    .replace(/(所により)\s+朝\s+雨/g,'$1朝は雨');
  // "晴れ夕方から" → "晴れ のち 夕方から" のように補助語追加（任意）
  s = s.replace(/晴れ(夕方から)/,'晴れ のち $1');
  // 余分スペース
  s = s.replace(/\s{2,}/g,' ').trim();
  return s;
};

// 天気文を時間帯キーワード（朝/昼/夕方/夜）で分割
function splitWeatherByTime(text) {
  if (!text) return [];
  // 正規化（全角スペース→半角）
  let t = text.replace(/　/g, ' ').replace(/\s{2,}/g,' ').trim();
  // キーワードリスト（順序保持）
  const keys = ['朝','昼','夕方','夜','明け方','日中'];
  // キーワードの前に区切りマーカー挿入
  keys.forEach(k => { t = t.replace(new RegExp('( '+k+')','g'), ' '+k); });
  // トークン分解
  const tokens = t.split(/\s+/);
  let result = [];
  let current = { label: '全体', text: '' };
  tokens.forEach(tok => {
    if (keys.includes(tok)) {
      if (current.text.trim()) result.push(current);
      current = { label: tok, text: '' };
    } else {
      current.text += (current.text ? ' ' : '') + tok;
    }
  });
  if (current.text.trim()) result.push(current);
  // ラベル正規化（"全体" は空なら除外）
  return result.filter(r => r.text.trim());
}

// Dropdown control for weather weekly + map
function attachWeatherDropdownEvents() {
  const weatherBtn = document.getElementById('weather-menu-btn');
  const dropdown = document.getElementById('weather-dropdown');
  if (!weatherBtn || !dropdown) return;
  // 上部タブ開閉時に現在選択中プロバイダで週間天気を更新
  function refreshDropdownWeather() {
    if (WEATHER_PROVIDER === 'openweathermap') {
      fetchWeatherOWM();
    } else if (WEATHER_PROVIDER === 'weatherapi') {
      fetchWeatherWAPI();
    } else {
      fetchWeatherJMA();
    }
    // 天気図は JMA データを利用するため常に更新（表示はそのまま活用）
    updateWeatherMap();
  }
  weatherBtn.addEventListener('click', (e) => {
    e.preventDefault();
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    if (dropdown.style.display === 'block') {
      refreshDropdownWeather();
    }
  });
  document.addEventListener('click', (e) => {
    if (!weatherBtn.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
  });
}
function updateWeatherMap() {
  const now = new Date();
  now.setMinutes(0,0,0);
  let hour = now.getHours();
  hour = hour - (hour % 3) - 3;
  if (hour < 0) { now.setDate(now.getDate() - 1); hour = 21; }
  now.setHours(hour);
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const d = String(now.getDate()).padStart(2,'0');
  const h = String(now.getHours()).padStart(2,'0');
  const url = `https://www.jma.go.jp/bosai/weather_map/data/png/analysis/${y}${m}${d}${h}00.png`;
  const img = document.getElementById('weather-map-img');
  if (img) img.src = url;
}

// ================= YouTube =================
const youtubeList = ["Kodo4moG5n0","coYw-eVU0Ks","eF9PohrRP_o","XFLrswaUMqs","GrEEoEmmrKs"]; // add more IDs as needed
let youtubeIndex = 0;
function setYoutubeVideo(index) {
  if (index < 0) index = youtubeList.length - 1;
  if (index >= youtubeList.length) index = 0;
  youtubeIndex = index;
  const iframe = document.getElementById('youtube-iframe');
  if (iframe) iframe.src = `https://www.youtube.com/embed/${youtubeList[youtubeIndex]}`;
}

// ================= RSS =================
async function loadRSS() {
  const rssUrl = "https://www3.nhk.or.jp/rss/news/cat0.xml";
  const proxy = "https://api.allorigins.win/get?url=" + encodeURIComponent(rssUrl);
  try {
    const res = await fetch(proxy);
    const data = await res.json();
    const parser = new DOMParser();
    const xml = parser.parseFromString(data.contents, "text/xml");
    const items = xml.querySelectorAll("item");
    let html = "<ul class='rss-ul'>";
    for (let i = 0; i < Math.min(7, items.length); i++) {
      const title = items[i].querySelector("title").textContent;
      const link = items[i].querySelector("link").textContent;
      html += `<li><a href="${link}" target="_blank" rel="noopener">${title}</a></li>`;
    }
    html += "</ul>";
    document.getElementById("rss-list").innerHTML = html;
    // 最終更新時刻を表示
    const updatedEl = document.getElementById('rss-updated');
    if (updatedEl) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth()+1).padStart(2,'0');
      const d = String(now.getDate()).padStart(2,'0');
      const h = String(now.getHours()).padStart(2,'0');
      const min = String(now.getMinutes()).padStart(2,'0');
      updatedEl.textContent = `最終更新: ${y}/${m}/${d} ${h}:${min}`;
    }
    // 成功 -> リトライ情報リセット
    rssRetryCount = 0;
    if (typeof updateServiceStatus === 'function') updateServiceStatus('rss-status', 'connected');
  } catch (e) {
    document.getElementById("rss-list").textContent = "RSSの取得に失敗しました。";
    if (typeof updateServiceStatus === 'function') updateServiceStatus('rss-status', 'disconnected');
    scheduleRSSRetry();
  }
}

// ================= Clock =================
function updateCurrentTime() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const el = document.getElementById('current-time');
  if (el) el.textContent = `現在時刻：${y}/${m}/${d} ${h}:${min}:${s}`;
}

// ================= Flip Clock Widget =================
let lastFlipTime = { h0: '', h1: '', m0: '', m1: '', s0: '', s1: '' };

function updateFlipUnit(unitId, newValue) {
  const unit = document.getElementById(unitId);
  if (!unit) return;
  
  const topSpan = unit.querySelector('.flip-card-top span');
  const bottomSpan = unit.querySelector('.flip-card-bottom span');
  
  if (topSpan && bottomSpan) {
    const currentValue = topSpan.textContent;
    if (currentValue !== newValue) {
      // Update display
      topSpan.textContent = newValue;
      bottomSpan.textContent = newValue;
      
      // Trigger flip animation
      unit.classList.add('flipping');
      setTimeout(() => {
        unit.classList.remove('flipping');
      }, 600);
    }
  }
}

function updateFlipClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const sec = String(now.getSeconds()).padStart(2, '0');
  
  // Update each flip unit
  if (lastFlipTime.h0 !== h[0]) {
    updateFlipUnit('flip-hour-tens', h[0]);
    lastFlipTime.h0 = h[0];
  }
  if (lastFlipTime.h1 !== h[1]) {
    updateFlipUnit('flip-hour-ones', h[1]);
    lastFlipTime.h1 = h[1];
  }
  if (lastFlipTime.m0 !== min[0]) {
    updateFlipUnit('flip-min-tens', min[0]);
    lastFlipTime.m0 = min[0];
  }
  if (lastFlipTime.m1 !== min[1]) {
    updateFlipUnit('flip-min-ones', min[1]);
    lastFlipTime.m1 = min[1];
  }
  if (lastFlipTime.s0 !== sec[0]) {
    updateFlipUnit('flip-sec-tens', sec[0]);
    lastFlipTime.s0 = sec[0];
  }
  if (lastFlipTime.s1 !== sec[1]) {
    updateFlipUnit('flip-sec-ones', sec[1]);
    lastFlipTime.s1 = sec[1];
  }
  
  // Update date display
  const bigDateEl = document.getElementById('big-date');
  if (bigDateEl) {
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const dayName = days[now.getDay()];
    bigDateEl.textContent = `${y}年${m}月${d}日（${dayName}）`;
  }
}

// ================= Login Streak Recording (PHP API + localStorage fallback) =================
const LOGIN_DATES_KEY = 'pilab_login_dates';
const LOGIN_API_URL = '../api/login.php';

// API利用可能フラグ（一度失敗したらフォールバック）
let useApi = true;

/**
 * ログイン日の取得（API優先、失敗時はlocalStorage）
 */
async function getLoginDatesAsync() {
  if (useApi) {
    try {
      const response = await fetch(LOGIN_API_URL);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // APIから取得成功 → localStorageにもバックアップ
          localStorage.setItem(LOGIN_DATES_KEY, JSON.stringify(data.dates));
          return data.dates;
        }
      }
      throw new Error('API response not ok');
    } catch (error) {
      console.log('PHP API not available, using localStorage fallback');
      useApi = false;
    }
  }
  
  // フォールバック: localStorage
  const stored = localStorage.getItem(LOGIN_DATES_KEY);
  return stored ? JSON.parse(stored) : [];
}

/**
 * 同期版（後方互換性用）
 */
function getLoginDates() {
  const stored = localStorage.getItem(LOGIN_DATES_KEY);
  return stored ? JSON.parse(stored) : [];
}

/**
 * 今日のログインを記録（API優先）
 */
async function recordTodayLoginAsync() {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  if (useApi) {
    try {
      const response = await fetch(LOGIN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // APIに記録成功 → localStorageにもバックアップ
          localStorage.setItem(LOGIN_DATES_KEY, JSON.stringify(data.dates));
          console.log('ログイン記録完了（サーバー保存）');
          return data.dates;
        }
      }
      throw new Error('API response not ok');
    } catch (error) {
      console.log('PHP API not available, using localStorage fallback');
      useApi = false;
    }
  }
  
  // フォールバック: localStorage
  let loginDates = getLoginDates();
  if (!loginDates.includes(dateStr)) {
    loginDates.push(dateStr);
    loginDates.sort();
    // Keep only last 365 days
    if (loginDates.length > 365) {
      loginDates = loginDates.slice(-365);
    }
    localStorage.setItem(LOGIN_DATES_KEY, JSON.stringify(loginDates));
    console.log('ログイン記録完了（ローカル保存）');
  }
  return loginDates;
}

/**
 * 同期版の記録（後方互換性用）
 */
function recordTodayLogin() {
  recordTodayLoginAsync().then(() => {
    // 非同期で記録後、カレンダーを更新
    markLoginDaysOnCalendar();
  });
}

function calculateStreak(loginDates) {
  if (loginDates.length === 0) return 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let streak = 0;
  let checkDate = new Date(today);
  
  // Sort dates descending
  const sortedDates = [...loginDates].sort().reverse();
  
  for (const dateStr of sortedDates) {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((checkDate - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (diffDays === 1 && streak === 0) {
      // If we haven't logged in today yet, check from yesterday
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}

function markLoginDaysOnCalendar() {
  const loginDates = getLoginDates();
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;
  
  const dayCells = calendarEl.querySelectorAll('.day');
  
  // First pass: mark all logged-in days and collect their indices
  const loggedInIndices = [];
  
  dayCells.forEach((cell, index) => {
    const numEl = cell.querySelector('.date-number');
    if (!numEl) return;
    
    const dayNum = numEl.textContent.match(/\d+/);
    if (!dayNum) return;
    
    // Build date string for this cell
    const dateStr = `${displayYear}-${String(displayMonth + 1).padStart(2, '0')}-${String(dayNum[0]).padStart(2, '0')}`;
    
    if (loginDates.includes(dateStr)) {
      cell.classList.add('logged-in');
      loggedInIndices.push(index);
      
      // Add "ログイン済み" badge
      const scheduleEl = cell.querySelector('.schedule');
      if (scheduleEl && !scheduleEl.querySelector('.login-badge')) {
        const badge = document.createElement('span');
        badge.className = 'login-badge';
        badge.textContent = 'ログイン済み';
        scheduleEl.appendChild(badge);
      }
    }
  });
  
  // Second pass: determine streak positions (start/middle/end/single)
  loggedInIndices.forEach((cellIndex, i) => {
    const cell = dayCells[cellIndex];
    const prevIsLogged = loggedInIndices.includes(cellIndex - 1);
    const nextIsLogged = loggedInIndices.includes(cellIndex + 1);
    
    // Remove old streak classes
    cell.classList.remove('streak-start', 'streak-middle', 'streak-end', 'streak-single', 'streak-connected');
    
    if (prevIsLogged && nextIsLogged) {
      // Middle of streak
      cell.classList.add('streak-middle');
    } else if (!prevIsLogged && nextIsLogged) {
      // Start of streak
      cell.classList.add('streak-start');
    } else if (prevIsLogged && !nextIsLogged) {
      // End of streak
      cell.classList.add('streak-end');
    } else {
      // Single day (no consecutive days)
      cell.classList.add('streak-single');
    }
  });
}


// ================= YouTube URL Input =================
function attachYoutubeControls() {
  const prevBtn = document.getElementById('yt-prev');
  const nextBtn = document.getElementById('yt-next');
  const playBtn = document.getElementById('youtube-url-play');
  const input = document.getElementById('youtube-url-input');
  if (prevBtn) prevBtn.addEventListener('click', () => setYoutubeVideo(youtubeIndex - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => setYoutubeVideo(youtubeIndex + 1));
  if (playBtn && input) {
    playBtn.onclick = () => {
      const url = input.value.trim();
      const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{11})/);
      if (match && match[1]) {
        const iframe = document.getElementById('youtube-iframe');
        if (iframe) iframe.src = `https://www.youtube.com/embed/${match[1]}`;
      } else {
        alert('正しいYouTube動画のURLを入力してください');
      }
    };
  }
  setYoutubeVideo(0);
}

// ================= Init =================
// OpenWeatherMap 表示処理
async function fetchWeatherOWM() {
  const infoEl = document.getElementById('weather-info');
  const weeklyContainer = document.getElementById('weekly-weather-content');
  try {
    const mod = await import('./weatherProvider.js');
    const data = await mod.fetchOpenWeather(WEATHER_LAT, WEATHER_LON, 7);
    const c = data.current;
    weatherRetryCount = 0; // 成功でリセット
    const iconTag = c.iconUrl ? `<img src="${c.iconUrl}" alt="icon" style="vertical-align:middle;width:48px;height:48px;">` : '';
    const windInfo = `風 ${windArrow(c.windDeg)} ${c.windSpeed}m/s`;
    infoEl.innerHTML = `<span class=\"weather-label\">現在の天気</span><br>${iconTag}<span class=\"weather-text\">${c.description}</span><br>`+
      `<span class=\"temp-range\">気温: ${Math.round(c.temp)}°C / 体感 ${Math.round(c.feelsLike)}°C 湿度 ${c.humidity}%<br>${windInfo}</span>`;
    // daily table
    if (weeklyContainer) {
      let html = '<table class="weekly-table"><tr><th>日付</th><th>天気</th><th>降水%</th><th>最低</th><th>最高</th></tr>';
      data.daily.forEach(d => {
        const dateLabel = `${d.date.getMonth()+1}/${d.date.getDate()}`;
        html += `<tr><td>${dateLabel}</td><td>${d.description}</td><td>${d.popPercent ?? '-'}%</td><td>${d.tMin ?? '-'}°</td><td>${d.tMax ?? '-'}°</td></tr>`;
      });
      html += '</table>';
      weeklyContainer.innerHTML = html;
    }
  } catch (e) {
    console.error(e);
    if (e.message === 'API_KEY_MISSING') {
      infoEl.innerHTML = 'OpenWeatherMap APIキーが設定されていません。<br>window.OPENWEATHER_API_KEY = "YOUR_KEY" を先に実行してください。';
    } else if (e.message === 'INVALID_API_KEY') {
      infoEl.textContent = 'APIキーが無効です。';
    } else if (e.message === 'RATE_LIMIT') {
      infoEl.textContent = 'レート制限に達しました。時間をおいて再試行してください。';
    } else {
      infoEl.textContent = '天気取得に失敗しました。';
    }
    if (weeklyContainer) weeklyContainer.textContent = '取得できませんでした';
    scheduleWeatherRetry();
  }
}

// WeatherAPI.com 表示処理
async function fetchWeatherWAPI() {
  const infoEl = document.getElementById('weather-info');
  const weeklyContainer = document.getElementById('weekly-weather-content');
  try {
    const mod = await import('./weatherApiProvider.js');
    const data = await mod.fetchWeatherApi(WEATHER_LAT, WEATHER_LON, 7);
    const c = data.current;
    weatherRetryCount = 0; // 成功でリセット
    if (typeof updateServiceStatus === 'function') updateServiceStatus('weather-status', 'connected');
    
    // 新しいホーム天気ウィジェット用の更新
    const tempEl = document.getElementById('home-weather-temp');
    const descEl = document.getElementById('home-weather-desc');
    const feelsEl = document.getElementById('home-weather-feels');
    const iconEl = document.getElementById('home-weather-icon');
    const humidityEl = document.getElementById('home-weather-humidity');
    const windEl = document.getElementById('home-weather-wind');
    
    if (tempEl) tempEl.textContent = `${Math.round(c.temp)}°`;
    if (descEl) descEl.textContent = c.description;
    if (feelsEl) feelsEl.textContent = `体感温度: ${Math.round(c.feelsLike)}°`;
    if (iconEl && c.iconUrl) iconEl.src = c.iconUrl;
    if (humidityEl) humidityEl.textContent = `湿度: ${c.humidity}%`;
    if (windEl) windEl.textContent = `風: ${Math.round(c.windKph / 3.6)} m/s`;
    
    // 旧フォーマット（互換性維持）
    if (infoEl) {
      const icon = c.iconUrl ? `<img src="${c.iconUrl}" alt="icon" style="vertical-align:middle;width:54px;height:54px;">` : '';
      const jpDir = translateWindDir(c.windDir);
      const windInfo = `風 ${windArrow(c.windDegree)} ${jpDir} ${c.windKph}km/h`;
      infoEl.innerHTML = `<span class="weather-label">現在の天気</span><br>`+
        `${icon}<span class="weather-text">${c.description}</span><br>`+
        `<span class="temp-range">気温: ${Math.round(c.temp)}°C / 体感 ${Math.round(c.feelsLike)}°C 湿度 ${c.humidity}%<br>${windInfo} UV ${c.uv}</span>`;
    }
    
    if (weeklyContainer) {
      let html = '<table class="weekly-table"><tr><th>日付</th><th>天気</th><th>降水%</th><th>最低</th><th>最高</th><th>湿度</th></tr>';
      data.daily.forEach(d => {
        html += `<tr><td>${d.date.slice(5).replace('-','/')}</td><td>${d.description}</td><td>${d.chanceOfRain ?? '-'}%</td><td>${Math.round(d.tMin)}°</td><td>${Math.round(d.tMax)}°</td><td>${d.avgHumidity ?? '-'}%</td></tr>`;
      });
      html += '</table>';
      weeklyContainer.innerHTML = html;
    }
  } catch (e) {
    console.error(e);
    if (e.message === 'API_KEY_MISSING') {
      infoEl.innerHTML = 'WeatherAPI.com APIキー未設定。<br>window.WEATHERAPI_API_KEY = "YOUR_KEY" をコンソールで設定してください。';
    } else if (e.message === 'INVALID_API_KEY') {
      infoEl.textContent = 'APIキーが無効です。';
    } else if (e.message === 'RATE_LIMIT') {
      infoEl.textContent = 'レート制限に達しました。しばらく待ってください。';
    } else {
      infoEl.textContent = '天気取得に失敗しました。';
    }
    if (weeklyContainer) weeklyContainer.textContent = '取得できませんでした';
    if (typeof updateServiceStatus === 'function') updateServiceStatus('weather-status', 'disconnected');
    scheduleWeatherRetry();
  }
}
// ================= Widget Carousel =================
let carouselIndex = 0;
const CAROUSEL_INTERVAL_MS = 8000; // 8秒ごとに切り替え

function showCarouselSlide(index) {
  const slides = document.querySelectorAll('.carousel-slide');
  const dots = document.querySelectorAll('.carousel-dot');
  
  if (slides.length === 0) return;
  
  // Wrap around
  if (index >= slides.length) index = 0;
  if (index < 0) index = slides.length - 1;
  
  carouselIndex = index;
  
  // Update slides
  slides.forEach((slide, i) => {
    slide.classList.remove('active');
    if (i === index) {
      slide.classList.add('active');
    }
  });
  
  // Update dots
  dots.forEach((dot, i) => {
    dot.classList.remove('active');
    if (i === index) {
      dot.classList.add('active');
    }
  });
}

function nextCarouselSlide() {
  showCarouselSlide(carouselIndex + 1);
}

function initWidgetCarousel() {
  // Click on dots to jump to slide
  const dots = document.querySelectorAll('.carousel-dot');
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const index = parseInt(dot.dataset.index);
      showCarouselSlide(index);
    });
  });
  
  // Auto-advance
  setInterval(nextCarouselSlide, CAROUSEL_INTERVAL_MS);
  
  // Initialize sleep widget display
  updateSleepWidget();
}

function updateSleepWidget() {
  const summaryEl = document.getElementById('sleep-summary');
  if (!summaryEl) return;
  
  // 睡眠データのサンプル表示（将来的にはAPIから取得）
  const now = new Date();
  const hour = now.getHours();
  let sleepMessage = '';
  
  if (hour >= 6 && hour < 12) {
    sleepMessage = '🌅 おはようございます！<br>昨夜の睡眠: 約7時間<br>睡眠の質: 良好';
  } else if (hour >= 12 && hour < 18) {
    sleepMessage = '☀️ 午後も頑張りましょう！<br>今週の平均睡眠: 6.5時間';
  } else if (hour >= 18 && hour < 22) {
    sleepMessage = '🌙 今日の睡眠目標: 7時間<br>推奨就寝時刻: 23:00';
  } else {
    sleepMessage = '😴 良い夢を！<br>デバイスを置いて休みましょう。';
  }
  
  summaryEl.innerHTML = sleepMessage;
}

// Update sleep chart with dynamic date labels (last 7 days: 7 days ago to yesterday)
function updateSleepChartLabels() {
  const dayLabels = document.querySelectorAll('#sleep-chart-box .sleep-day-label');
  if (dayLabels.length === 0) return;
  
  const today = new Date();
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  
  // Display last 7 days (7 days ago to yesterday - today's data not yet available)
  for (let i = 0; i < dayLabels.length; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - (7 - i)); // Start from 7 days ago, end at yesterday
    
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = days[date.getDay()];
    
    // Display as "12/5(木)" format with weekday on right
    dayLabels[i].textContent = `${month}/${day}(${dayOfWeek})`;
    dayLabels[i].title = `${month}月${day}日（${dayOfWeek}）`;
  }
}

window.onload = function() {
  // Record today's login
  recordTodayLogin();
  
  setupCalendar();
  if (WEATHER_PROVIDER === 'openweathermap') fetchWeatherOWM();
  else if (WEATHER_PROVIDER === 'weatherapi') fetchWeatherWAPI();
  else fetchWeatherJMA();
  // 30分ごとの自動更新
  function refreshActiveWeather() {
    if (WEATHER_PROVIDER === 'openweathermap') {
      fetchWeatherOWM();
    } else if (WEATHER_PROVIDER === 'weatherapi') {
      fetchWeatherWAPI();
    } else {
      fetchWeatherJMA();
    }
  }
  setInterval(refreshActiveWeather, WEATHER_REFRESH_INTERVAL_MS);
  attachWeatherDropdownEvents();
  attachYoutubeControls();
  loadRSS();
  // RSS 30分ごと自動更新
  setInterval(loadRSS, RSS_REFRESH_INTERVAL_MS);
  updateCurrentTime();
  setInterval(updateCurrentTime, 1000);
  // Flip Clock Widget
  updateFlipClock();
  setInterval(updateFlipClock, 1000);
  // Widget Carousel
  initWidgetCarousel();
  // Update sleep chart date labels
  updateSleepChartLabels();
};
