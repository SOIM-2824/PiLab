# PiLab 技術仕様書

## プロジェクト概要

Raspberry Pi 向けのスマートホームダッシュボード。時計、カレンダー、天気予報、YouTube、睡眠記録、緊急地震速報、アラームなどを統合した Web アプリケーション。

---

## システム構成

### ハードウェア

| コンポーネント | 説明                                   |
| -------------- | -------------------------------------- |
| Raspberry Pi 4 | メインボード                           |
| IR カメラ      | 暗視対応カメラモジュール（睡眠検出用） |
| USB マイク     | 音声入力（いびき・呼吸検出用）         |
| ディスプレイ   | タッチスクリーン推奨                   |

### ソフトウェア

| 項目           | 技術                       |
| -------------- | -------------------------- |
| OS             | Raspberry Pi OS            |
| Web サーバー   | Apache + PHP               |
| バックエンド   | Python 3（睡眠レコーダー） |
| フロントエンド | HTML/CSS/JavaScript        |
| サービス管理   | systemd                    |

---

## ディレクトリ構成

```
/var/www/html/                    # Webルート（PiLab-1）
├── index.html                    # メインダッシュボード
├── calendar.html                 # カレンダーページ
├── alarm.html                    # アラームページ
├── weather.html                  # 天気予報ページ
├── login.html                    # ログインページ
├── CSS/
│   ├── style.css                 # メインスタイル
│   ├── alarm.css                 # アラームページ用
│   └── login.css                 # ログインページ用
├── JS/
│   ├── script.js                 # メインスクリプト
│   ├── csvLoader.js              # CSVデータローダー
│   ├── earthquake.js             # 緊急地震速報
│   ├── alarm.js                  # アラーム機能
│   ├── calendar-page.js          # カレンダーページ用
│   ├── login.js                  # ログイン処理
│   ├── weatherApiProvider.js     # 天気API（WeatherAPI）
│   ├── weatherProvider.js        # 天気API（OpenWeatherMap）
│   └── once-per-day-redirect.js  # ログインリダイレクト
├── api/
│   ├── sleep_control.php         # 睡眠レコーダー制御API
│   └── login.php                 # ログインボーナスAPI
└── data/
    ├── sleep_records.csv         # 睡眠記録データ（シンボリックリンク）
    └── login_dates.json          # ログイン日記録

/home/admin/Desktop/pi/sleep/     # 睡眠レコーダー
├── sleep_recorder.py             # メインスクリプト
├── sleep_recorder.service        # systemdサービス定義
├── setup_service.sh              # セットアップスクリプト
├── fix_permissions.sh            # 権限修正スクリプト
├── sleep_records.csv             # 睡眠記録データ
├── sleep_status.json             # ステータスファイル
├── output.log                    # 通常ログ
└── error.log                     # エラーログ
```

---

## 機能一覧

### 1. フリップ時計

大型デジタル時計（フリップアニメーション付き）

**実装**: `script.js` - `updateFlipClock()`

### 2. カレンダー

- 月表示カレンダー
- 祝日表示（日本の祝日 API）
- Google カレンダー連携

**実装**: `script.js` - `createCalendar()`, `renderCalendar()`

**API**: Google Calendar API

```javascript
window.GCAL_API_KEY = "AIzaSy...";
window.GCAL_CALENDAR_ID = "xxxxx@gmail.com";
```

### 3. 天気予報

- 現在の天気
- 週間天気予報
- 天気マップ

**実装**: `script.js`, `weatherApiProvider.js`

**API**: WeatherAPI.com

```javascript
window.WEATHERAPI_API_KEY = "6fe49bea5a06475097b...";
const WEATHER_LAT = 31.5602; // 鹿児島
const WEATHER_LON = 130.5581;
```

### 4. RSS ニュース

Yahoo!ニュースの RSS フィードを表示

**実装**: `script.js` - `loadRSS()`

### 5. YouTube プレイヤー

埋め込み YouTube 動画プレイヤー

**実装**: `script.js` - `setYoutubeVideo()`

### 6. アラーム

- 時刻指定アラーム
- 相対時間アラーム（○ 分後）
- YouTube 動画で起床
- スヌーズ機能
- アラーム履歴

**実装**: `alarm.js`

**ストレージ**: localStorage

- `videoList`: 登録動画リスト
- `alarmHistory`: アラーム履歴

### 7. 緊急地震速報

P2P 地震情報の WebSocket API でリアルタイム受信

**実装**: `earthquake.js`

**WebSocket**: `wss://api.p2pquake.net/v2/ws`

**機能**:

- 緊急地震速報（コード 556）
- 地震情報（コード 551）
- 津波情報（コード 552）
- 自動再接続（指数バックオフ）

```javascript
const intensityMap = {
  10: "震度1",
  20: "震度2",
  30: "震度3",
  40: "震度4",
  45: "震度5弱",
  50: "震度5強",
  55: "震度6弱",
  60: "震度6強",
  70: "震度7",
};
```

### 8. ログインボーナス

毎日のログインを記録し、連続ログインを表示

**実装**: `login.php`, `script.js`

**API**:

- `?action=check`: ログイン状態確認
- `?action=login`: ログイン記録

**ストレージ**: `data/login_dates.json`

### 9. 睡眠レコーダー

Python 製の睡眠検知・記録システム

**実装**: `sleep_recorder.py`, `sleep_control.php`, `csvLoader.js`

---

## 睡眠レコーダー詳細

### 検出技術

| 項目         | 技術                        |
| ------------ | --------------------------- |
| 動き検出     | OpenCV フレーム差分         |
| 顔・目検出   | Haar Cascade 分類器         |
| いびき検出   | FFT 周波数解析（100-500Hz） |
| 呼吸パターン | FFT 周波数解析（10-50Hz）   |
| カメラ制御   | libcamera-vid（フル FOV）   |

### 睡眠判定ロジック

```
睡眠中 = 顔検出あり AND 動きなし AND 目が閉じている AND 静寂
または
睡眠中 = いびき検出 OR 規則的な呼吸パターン
```

### 起床判定

```
起床 = 30秒以上の継続的な動き
```

### 寝返り判定

```
5秒以内の動き = 寝返りとして無視
```

### PHP API (`sleep_control.php`)

```php
// systemdサービス経由で制御
$SERVICE_NAME = 'sleep_recorder';

// アクション
?action=start   // サービス開始
?action=stop    // サービス停止
?action=status  // ステータス取得
```

### systemd サービス

```ini
[Unit]
Description=Sleep Recorder Service
After=network.target graphical.target

[Service]
Type=simple
User=admin
ExecStart=/home/admin/Desktop/pi/.venv/bin/python sleep_recorder.py
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/admin/.Xauthority

[Install]
WantedBy=multi-user.target
```

### CSV 形式（sleep_records.csv）

```csv
date,sleep_start,sleep_end,duration_hours,duration_minutes,snore_detected
2025-12-13,23:30:00,07:00:00,7,30,False
```

---

## CSVLoader 詳細

CSV ファイルを読み込み、睡眠グラフを更新

**設定**:

```javascript
const CONFIG = {
  sleepDataPath: "./data/sleep_records.csv",
  retryCount: 3,
  retryDelay: 2000,
  cacheTimeout: 5 * 60 * 1000, // 5分
  updateHours: [7, 8, 9],
};
```

**機能**:

- キャッシュバスティング
- 自動リトライ
- 日付ごとの集計
- 週間平均計算
- グラフ更新

---

## 便利コマンド集

### サービス管理

```bash
# 睡眠レコーダー
sudo systemctl start sleep_recorder
sudo systemctl stop sleep_recorder
sudo systemctl status sleep_recorder
sudo systemctl restart sleep_recorder
sudo systemctl enable sleep_recorder
```

### ログ確認

```bash
# 睡眠レコーダーログ
cat /home/admin/Desktop/pi/sleep/output.log
tail -f /home/admin/Desktop/pi/sleep/output.log  # リアルタイム監視
cat /home/admin/Desktop/pi/sleep/error.log

# Apacheログ
sudo tail -20 /var/log/apache2/error.log

# systemdジャーナル
sudo journalctl -u sleep_recorder --no-pager -n 50
```

### プロセス確認

```bash
ps aux | grep sleep_recorder
sudo pkill -f sleep_recorder
```

### カメラテスト

```bash
libcamera-hello                  # プレビュー
libcamera-jpeg -o test.jpg       # 静止画
libcamera-vid -t 10000 -o test.h264  # 動画
vcgencmd get_camera              # カメラ状態
```

### 権限設定

```bash
# グループ追加
sudo usermod -aG video www-data
sudo usermod -aG audio www-data

# ファイル権限
sudo chown admin:admin /path/to/file
sudo chmod 755 /path/to/directory
sudo chmod 644 /path/to/file
```

### Apache

```bash
sudo systemctl restart apache2
```

### セットアップ

```bash
sudo bash /home/admin/Desktop/pi/sleep/setup_service.sh
sudo bash /home/admin/Desktop/pi/sleep/fix_permissions.sh
```

---

## sudoers 設定

www-data のパスワードなしサービス制御:

```
# /etc/sudoers.d/sleep_recorder
www-data ALL=(ALL) NOPASSWD: /bin/systemctl start sleep_recorder
www-data ALL=(ALL) NOPASSWD: /bin/systemctl stop sleep_recorder
www-data ALL=(ALL) NOPASSWD: /bin/systemctl is-active sleep_recorder
```

---

##外部 API 一覧

| API                 | 用途             | URL                                       |
| ------------------- | ---------------- | ----------------------------------------- |
| Google Calendar API | カレンダー連携   | `https://www.googleapis.com/calendar/v3/` |
| WeatherAPI.com      | 天気予報         | `https://api.weatherapi.com/v1/`          |
| P2P 地震情報        | 緊急地震速報     | `wss://api.p2pquake.net/v2/ws`            |
| rss2json            | RSS フィード変換 | `https://api.rss2json.com/v1/`            |
| 日本の祝日 API      | 祝日取得         | `https://holidays-jp.github.io/api/v1/`   |

---

## トラブルシューティング

### 権限エラー

```bash
sudo bash /home/admin/Desktop/pi/sleep/fix_permissions.sh
```

### サービスが起動しない

```bash
sudo journalctl -u sleep_recorder --no-pager -n 50
```

### カメラが認識されない

```bash
libcamera-hello
vcgencmd get_camera
```

### CSV が更新されない

```bash
ls -la /var/www/html/data/sleep_records.csv
cat /home/admin/Desktop/pi/sleep/sleep_records.csv
```

### 音声デバイスエラー

ALSA/JACK 警告は無視して OK。`Traceback`のみ確認。
