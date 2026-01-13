(function () {
  try {
    console.log('[once-per-day-redirect] v3 load href:', location.href);

    var el = document.currentScript || document.querySelector('script[data-redirect-url]');     // スクリプト要素
    var redirectUrl = (el && el.dataset.redirectUrl) || '/your-redirect.html';                  // リダイレクト先URL  
    var timeZone = (el && el.dataset.timezone) || 'UTC';                                        // 日付判定に使うタイムゾーン
    var storageKey = (el && el.dataset.storageKey) || 'oncePerDayRedirectDate';                 // localStorageのキー
    var skipParam = (el && el.dataset.skipParam) || 'no-redirect';                              // スキップ用URLパラメータ名

    var url = new URL(location.href);
    console.log('[once-per-day-redirect] search:', url.search);

    // テスト用: リセット/強制
    if (url.searchParams.has('reset-redirect')) {
      localStorage.removeItem(storageKey);
      console.log('[once-per-day-redirect] reset storageKey:', storageKey);
    }
    if (url.searchParams.has('force-redirect')) {
      console.log('[once-per-day-redirect] force redirect to:', redirectUrl);
      return location.replace(redirectUrl);
    }

    // スキップ指定なら何もしない
    if (url.searchParams.has(skipParam)) {
      console.log('[once-per-day-redirect] skip param detected -> no redirect');
      return;
    }

    // YYYY-MM-DD（指定タイムゾーン）を生成
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    var y = parts.find(p => p.type === 'year').value;
    var m = parts.find(p => p.type === 'month').value;
    var d = parts.find(p => p.type === 'day').value;
    var todayStamp = y + '-' + m + '-' + d;

    var prev = localStorage.getItem(storageKey);
    console.log('[once-per-day-redirect] prev:', prev, 'today:', todayStamp, 'url:', redirectUrl);

    if (prev === todayStamp) {
      console.log('[once-per-day-redirect] already redirected today -> do nothing');
      return;
    }

    localStorage.setItem(storageKey, todayStamp);
    console.log('[once-per-day-redirect] redirecting to:', redirectUrl);
    location.replace(redirectUrl);
  } catch (e) {
    console.warn('[once-per-day-redirect] error:', e);
  }
})();