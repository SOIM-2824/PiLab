OpenWeatherMap 利用手順 (簡易メモ)
=================================
1. OpenWeatherMap に登録
   https://home.openweathermap.org/users/sign_up
2. API Keys 画面で API Key を取得 (数分～数時間で有効化されることがあります)
3. このページ (index.html をブラウザで開いたコンソール) で以下を実行:

   window.OPENWEATHER_API_KEY = 'あなたのAPIキー';
   // 必要なら再取得
   // fetchWeatherOWM(); // script.js 内の関数 (プロバイダが openweathermap のとき window.onload で自動実行)

4. 緯度経度を変更したい場合 script.js 冒頭の:
   const WEATHER_LAT = 31.5602;
   const WEATHER_LON = 130.5581;
   を編集

5. 週間表示日数を減らしたい場合 weatherProvider.js の fetchOpenWeather 呼び出し第二引数( 7 ) を変更

6. 失敗時メッセージ:
   API_KEY_MISSING : window.OPENWEATHER_API_KEY が未設定
   INVALID_API_KEY : キーが間違い
   RATE_LIMIT      : 呼び出し頻度制限 (429)

7. 日本語 description は &lang=ja パラメータで取得

8. アイコンURL: https://openweathermap.org/img/wn/{icon}@2x.png

将来別APIへ切替する場合:
- WEATHER_PROVIDER を 'jma' に戻す
- JMA 用 fetchWeatherJMA を再利用

---------------------------------
WeatherAPI.com 追加利用手順
---------------------------------
1. 公式サイトで登録: https://www.weatherapi.com/
2. Dashboard の API Key を取得
3. ブラウザコンソールで:
   window.WEATHERAPI_API_KEY = 'YOUR_KEY';
4. script.js の WEATHER_PROVIDER を 'weatherapi' に設定（既に設定済み）
5. 週間日数変更は weatherApiProvider.js の fetchWeatherApi 呼び出し days 引数調整
6. 主な項目:
   - 現在: condition.text / temp_c / feelslike_c / humidity / wind_kph / wind_dir / uv
   - 予報: forecastday[n].day (mintemp_c / maxtemp_c / daily_chance_of_rain / avghumidity)
7. レート制限・エラー時はメッセージを #weather-info に表示
8. JMA / OWM と切替したい場合は WEATHER_PROVIDER 値を変更
