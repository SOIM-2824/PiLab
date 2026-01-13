/**
 * 緊急地震速報 (EEW) / 地震情報 受信モジュール
 * P2P地震情報 WebSocket API を使用
 * https://www.p2pquake.net/
 */

const EarthquakeWarning = (function() {
    // WebSocket接続先
    const WS_URL = 'wss://api.p2pquake.net/v2/ws';
    
    // 接続状態
    let ws = null;
    let isConnected = false;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const RECONNECT_DELAY_BASE = 3000; // 3秒
    
    // 鹿児島県コード
    const KAGOSHIMA_CODE = 46;
    
    // コールバック関数
    let onEEWCallback = null;
    let onEarthquakeCallback = null;
    let onConnectionCallback = null;
    
    // 震度マップ
    const intensityMap = {
        '-1': '不明',
        '10': '震度1',
        '20': '震度2',
        '30': '震度3',
        '40': '震度4',
        '45': '震度5弱',
        '50': '震度5強',
        '55': '震度6弱',
        '60': '震度6強',
        '70': '震度7'
    };
    
    // 初期化
    function init(options = {}) {
        onEEWCallback = options.onEEW || null;
        onEarthquakeCallback = options.onEarthquake || null;
        onConnectionCallback = options.onConnection || null;
        
        connect();
    }
    
    // WebSocket接続
    function connect() {
        if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
            return;
        }
        
        try {
            ws = new WebSocket(WS_URL);
            
            ws.onopen = function() {
                console.log('[EEW] WebSocket connected');
                isConnected = true;
                reconnectAttempts = 0;
                if (onConnectionCallback) onConnectionCallback(true);
            };
            
            ws.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    handleMessage(data);
                } catch (e) {
                    console.error('[EEW] メッセージ解析エラー:', e);
                }
            };
            
            ws.onerror = function(error) {
                console.error('[EEW] WebSocket error:', error);
            };
            
            ws.onclose = function() {
                console.log('[EEW] WebSocket disconnected');
                isConnected = false;
                if (onConnectionCallback) onConnectionCallback(false);
                scheduleReconnect();
            };
            
        } catch (e) {
            console.error('[EEW] 接続エラー:', e);
            scheduleReconnect();
        }
    }
    
    // 再接続スケジュール
    function scheduleReconnect() {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts);
            reconnectAttempts++;
            console.log(`[EEW] ${delay/1000}秒後に再接続... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
            reconnectTimer = setTimeout(connect, delay);
        }
    }
    
    // メッセージ処理
    function handleMessage(data) {
        // 緊急地震速報（警報）
        if (data.code === 556) {
            console.log('[EEW] 緊急地震速報受信:', data);
            if (onEEWCallback) {
                onEEWCallback(formatEEW(data));
            }
        }
        
        // 地震情報
        if (data.code === 551) {
            console.log('[EEW] 地震情報受信:', data);
            if (onEarthquakeCallback) {
                onEarthquakeCallback(formatEarthquake(data));
            }
        }
        
        // 津波情報
        if (data.code === 552) {
            console.log('[EEW] 津波情報受信:', data);
        }
    }
    
    // 緊急地震速報フォーマット
    function formatEEW(data) {
        const earthquake = data.earthquake || {};
        const hypocenter = earthquake.hypocenter || {};
        
        return {
            type: 'eew',
            title: '緊急地震速報',
            time: earthquake.originTime || '',
            epicenter: hypocenter.name || '不明',
            magnitude: hypocenter.magnitude || '不明',
            depth: hypocenter.depth ? `${hypocenter.depth}km` : '不明',
            maxIntensity: intensityMap[earthquake.maxScale] || '不明',
            areas: data.areas || [],
            isWarning: data.issue && data.issue.type === '緊急地震速報（警報）',
            raw: data
        };
    }
    
    // 地震情報フォーマット
    function formatEarthquake(data) {
        const earthquake = data.earthquake || {};
        const hypocenter = earthquake.hypocenter || {};
        
        // 鹿児島の震度を取得
        let kagoshimaIntensity = null;
        if (data.points) {
            const kagoshimaPoint = data.points.find(p => p.pref && p.pref.includes('鹿児島'));
            if (kagoshimaPoint) {
                kagoshimaIntensity = intensityMap[kagoshimaPoint.scale] || null;
            }
        }
        
        return {
            type: 'earthquake',
            title: '地震情報',
            time: earthquake.time || '',
            epicenter: hypocenter.name || '不明',
            magnitude: earthquake.magnitude !== -1 ? `M${earthquake.magnitude}` : '不明',
            depth: hypocenter.depth ? `${hypocenter.depth}km` : '不明',
            maxIntensity: intensityMap[earthquake.maxScale] || '不明',
            kagoshimaIntensity: kagoshimaIntensity,
            tsunami: data.earthquake && data.earthquake.domesticTsunami || 'なし',
            raw: data
        };
    }
    
    // 接続状態確認
    function getConnectionStatus() {
        return isConnected;
    }
    
    // 切断
    function disconnect() {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (ws) {
            ws.close();
            ws = null;
        }
        isConnected = false;
    }
    
    // テスト用：模擬緊急地震速報発報
    function testEEW() {
        const testData = {
            type: 'eew',
            title: '【テスト】緊急地震速報',
            time: new Date().toISOString(),
            epicenter: 'テスト震源',
            magnitude: 'M6.0',
            depth: '10km',
            maxIntensity: '震度5弱',
            isWarning: true,
            isTest: true
        };
        
        if (onEEWCallback) {
            onEEWCallback(testData);
        }
    }
    
    return {
        init: init,
        connect: connect,
        disconnect: disconnect,
        getConnectionStatus: getConnectionStatus,
        testEEW: testEEW
    };
})();

// グローバルに公開
window.EarthquakeWarning = EarthquakeWarning;
