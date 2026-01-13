/**
 * CSV Data Loader
 * ウェブルートのCSVファイルを読み込み、データを提供するモジュール
 * 毎日7時/8時/9時の更新時にも問題なく動作するよう設計
 */

const CSVLoader = (function() {
    // 設定
    const CONFIG = {
        // ラズパイ上の睡眠レコーダーCSVファイルへのパス
        // シンボリックリンクまたはコピーで /var/www/html/data/ に配置
        sleepDataPath: './data/sleep_records.csv',
        retryCount: 3,                           // リトライ回数
        retryDelay: 2000,                        // リトライ間隔（ミリ秒）
        cacheTimeout: 5 * 60 * 1000,             // キャッシュ有効期限（5分）
        updateHours: [7, 8, 9]                   // 更新が入る時間帯
    };
    
    // キャッシュ
    let cache = {
        sleepData: null,
        lastFetch: 0
    };
    
    /**
     * 現在が更新時間帯かどうかを判定
     */
    function isUpdateTime() {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        
        // 更新時間帯の前後5分は更新中と見なす
        return CONFIG.updateHours.some(h => 
            (hour === h && minute < 5) || (hour === h - 1 && minute >= 55)
        );
    }
    
    /**
     * キャッシュバスティング付きでCSVを取得
     */
    async function fetchCSV(path, attempt = 1) {
        try {
            // キャッシュバスティング用のタイムスタンプ
            const timestamp = Date.now();
            const url = `${path}?t=${timestamp}`;
            
            const response = await fetch(url, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const text = await response.text();
            
            // 空ファイルチェック（更新中の可能性）
            if (!text || text.trim().length === 0) {
                throw new Error('EMPTY_FILE');
            }
            
            return text;
            
        } catch (error) {
            console.warn(`[CSVLoader] Fetch attempt ${attempt} failed:`, error.message);
            
            // リトライ
            if (attempt < CONFIG.retryCount) {
                const delay = isUpdateTime() ? CONFIG.retryDelay * 2 : CONFIG.retryDelay;
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchCSV(path, attempt + 1);
            }
            
            throw error;
        }
    }
    
    /**
     * CSVテキストをパースして配列に変換
     */
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length === 0) return [];
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((header, idx) => {
                    row[header] = values[idx];
                });
                data.push(row);
            }
        }
        
        return data;
    }
    
    /**
     * 睡眠データを取得
     * 実際のCSV形式:
     * date,sleep_start,sleep_end,duration_hours,duration_minutes,snore_detected
     * 2025-12-06,23:36:28,23:37:01,0,0,True
     */
    async function getSleepData(forceRefresh = false) {
        const now = Date.now();
        
        // キャッシュが有効な場合はキャッシュを返す
        if (!forceRefresh && cache.sleepData && (now - cache.lastFetch) < CONFIG.cacheTimeout) {
            return cache.sleepData;
        }
        
        try {
            const csvText = await fetchCSV(CONFIG.sleepDataPath);
            const rawData = parseCSV(csvText);
            
            // 日付ごとにデータを集計
            const aggregated = aggregateSleepDataByDate(rawData);
            
            // キャッシュを更新
            cache.sleepData = aggregated;
            cache.lastFetch = now;
            
            console.log('[CSVLoader] Sleep data loaded:', aggregated.length, 'days');
            return aggregated;
            
        } catch (error) {
            console.error('[CSVLoader] Failed to load sleep data:', error);
            
            // キャッシュがあれば古いデータを返す
            if (cache.sleepData) {
                console.warn('[CSVLoader] Using cached data');
                return cache.sleepData;
            }
            
            return null;
        }
    }
    
    /**
     * 睡眠データを日付ごとに集計
     * 同じ日に複数のセッションがある場合は合計する
     */
    function aggregateSleepDataByDate(rawData) {
        const byDate = {};
        
        rawData.forEach(record => {
            const date = record.date;
            if (!date) return;
            
            // 時間を計算
            const hours = parseFloat(record.duration_hours) || 0;
            const minutes = parseFloat(record.duration_minutes) || 0;
            const totalHours = hours + (minutes / 60);
            
            // いびき検出
            const snore = record.snore_detected === 'True' || record.snore_detected === 'true';
            
            if (!byDate[date]) {
                byDate[date] = {
                    date: date,
                    totalHours: 0,
                    sessions: 0,
                    snoreDetected: false,
                    sleepStart: record.sleep_start,
                    sleepEnd: record.sleep_end
                };
            }
            
            byDate[date].totalHours += totalHours;
            byDate[date].sessions++;
            if (snore) byDate[date].snoreDetected = true;
            
            // 最初と最後の時間を更新
            if (record.sleep_start && record.sleep_start < byDate[date].sleepStart) {
                byDate[date].sleepStart = record.sleep_start;
            }
            if (record.sleep_end && record.sleep_end > byDate[date].sleepEnd) {
                byDate[date].sleepEnd = record.sleep_end;
            }
        });
        
        // 配列に変換してソート
        return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    }
    
    /**
     * 睡眠データを取得して睡眠チャートを更新
     */
    async function updateSleepChart() {
        const chartContainer = document.querySelector('.sleep-chart-container');
        if (!chartContainer) return;
        
        const data = await getSleepData();
        if (!data || data.length === 0) {
            console.warn('[CSVLoader] No sleep data available');
            return;
        }
        
        // 直近7日分のデータを取得
        const last7Days = data.slice(-7);
        const barItems = chartContainer.querySelectorAll('.sleep-bar-item');
        
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        
        // まず全てをリセット
        barItems.forEach(item => {
            const bar = item.querySelector('.sleep-bar');
            const hours = item.querySelector('.sleep-hours');
            if (bar) bar.style.height = '0%';
            if (hours) hours.textContent = '0.0h';
        });
        
        // データがある分だけ更新
        last7Days.forEach((record, index) => {
            // データを後ろから埋める（最新が右端に来るように）
            const itemIndex = barItems.length - last7Days.length + index;
            if (itemIndex < 0 || itemIndex >= barItems.length) return;
            
            const item = barItems[itemIndex];
            const bar = item.querySelector('.sleep-bar');
            const label = item.querySelector('.sleep-day-label');
            const hours = item.querySelector('.sleep-hours');
            
            if (!bar || !label || !hours) return;
            
            // 睡眠時間（最大12時間を100%とする）
            const sleepHours = record.totalHours || 0;
            const heightPercent = Math.min((sleepHours / 12) * 100, 100);
            
            bar.style.height = `${heightPercent}%`;
            hours.textContent = `${sleepHours.toFixed(1)}h`;
            
            // 日付ラベル
            if (record.date) {
                const date = new Date(record.date);
                const month = date.getMonth() + 1;
                const day = date.getDate();
                const dayOfWeek = days[date.getDay()];
                label.textContent = `${month}/${day}(${dayOfWeek})`;
            }
        });
        
        // サマリーも更新
        updateSleepSummary(data);
        
        console.log('[CSVLoader] Sleep chart updated with', last7Days.length, 'days of data');
    }
    
    /**
     * 睡眠サマリーを更新
     */
    function updateSleepSummary(data) {
        const summaryEl = document.getElementById('sleep-summary');
        if (!summaryEl) return;
        
        if (!data || data.length === 0) {
            summaryEl.innerHTML = '睡眠データがありません';
            return;
        }
        
        // 直近のデータ（昨夜）
        const latest = data[data.length - 1];
        const latestHours = latest.totalHours || 0;
        
        // 週間平均を計算
        const last7 = data.slice(-7);
        const avgHours = last7.reduce((sum, d) => sum + (d.totalHours || 0), 0) / last7.length;
        
        // 就寝・起床時刻
        const sleepStart = latest.sleepStart || '--:--';
        const sleepEnd = latest.sleepEnd || '--:--';
        
        // 睡眠の評価
        let quality = '';
        let emoji = '';
        if (latestHours >= 7) {
            quality = '良好';
            emoji = '😊';
        } else if (latestHours >= 5) {
            quality = '普通';
            emoji = '😐';
        } else if (latestHours > 0) {
            quality = '不足';
            emoji = '😴';
        } else {
            quality = 'データなし';
            emoji = '❓';
        }
        
        // 日付表示
        const latestDate = new Date(latest.date);
        const dateStr = `${latestDate.getMonth() + 1}/${latestDate.getDate()}`;
        
        summaryEl.innerHTML = `
            <div style="margin-bottom:8px;">${emoji} <strong>${dateStr}の睡眠</strong></div>
            <div style="font-size:11px; line-height:1.6;">
                睡眠時間: <strong>${latestHours.toFixed(1)}時間</strong> (${quality})<br>
                就寝: ${sleepStart} → 起床: ${sleepEnd}<br>
                週間平均: ${avgHours.toFixed(1)}時間
            </div>
        `;
    }
    
    /**
     * 初期化
     */
    function init() {
        // ページ読み込み時にデータを取得
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', updateSleepChart);
        } else {
            updateSleepChart();
        }
        
        // 更新時間帯に自動リフレッシュ（7時、8時、9時台は5分ごとにチェック）
        setInterval(() => {
            if (isUpdateTime()) {
                console.log('[CSVLoader] Update time detected, refreshing data...');
                getSleepData(true).then(updateSleepChart);
            }
        }, 5 * 60 * 1000); // 5分ごと
        
        // 30分ごとに通常更新
        setInterval(() => {
            updateSleepChart();
        }, 30 * 60 * 1000);
    }
    
    // 公開API
    return {
        init: init,
        getSleepData: getSleepData,
        updateSleepChart: updateSleepChart,
        setPath: (path) => { CONFIG.sleepDataPath = path; }
    };
})();

// グローバルに公開
window.CSVLoader = CSVLoader;

// 自動初期化
CSVLoader.init();
