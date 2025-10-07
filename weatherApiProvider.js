/**
 * WeatherAPI.com Provider
 * Sign up: https://www.weatherapi.com/
 * Free plan: current + forecast (最大 14 日)
 * Set window.WEATHERAPI_API_KEY = 'YOUR_KEY';
 * Endpoints:
 *  Current:  https://api.weatherapi.com/v1/current.json?key=KEY&q=LAT,LON&lang=ja
 *  Forecast: https://api.weatherapi.com/v1/forecast.json?key=KEY&q=LAT,LON&days=7&lang=ja
 */

const WAPI_BASE = 'https://api.weatherapi.com/v1';

export async function fetchWeatherApi(lat, lon, days = 7) {
  const key = window.WEATHERAPI_API_KEY;
  if (!key) throw new Error('API_KEY_MISSING');
  const url = `${WAPI_BASE}/forecast.json?key=${key}&q=${lat},${lon}&days=${days}&lang=ja`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) throw new Error('INVALID_API_KEY');
    if (res.status === 429) throw new Error('RATE_LIMIT');
    throw new Error(`HTTP_${res.status}`);
  }
  const data = await res.json();
  return normalizeWeatherApi(data);
}

function normalizeWeatherApi(data) {
  const current = data.current || {};
  const location = data.location || {};
  const forecastDays = (data.forecast?.forecastday) || [];
  return {
    meta: { name: location.name, country: location.country, tz: location.tz_id },
    current: {
      description: current.condition?.text || '-',
      iconUrl: current.condition?.icon ? ('https:' + current.condition.icon) : '',
      temp: current.temp_c,
      feelsLike: current.feelslike_c,
      humidity: current.humidity,
      windKph: current.wind_kph,
      windDir: current.wind_dir,
      windDegree: current.wind_degree,
      pressureMb: current.pressure_mb,
      uv: current.uv,
      lastUpdated: current.last_updated
    },
    daily: forecastDays.map(fd => ({
      date: fd.date,
      description: fd.day?.condition?.text || '-',
      iconUrl: fd.day?.condition?.icon ? ('https:' + fd.day.condition.icon) : '',
      tMin: fd.day?.mintemp_c,
      tMax: fd.day?.maxtemp_c,
      avgHumidity: fd.day?.avghumidity,
      chanceOfRain: fd.day?.daily_chance_of_rain,
      maxWindKph: fd.day?.maxwind_kph,
      uv: fd.day?.uv
    }))
  };
}
