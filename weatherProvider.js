/**
 * OpenWeatherMap Provider
 * Usage: set window.OPENWEATHER_API_KEY = 'YOUR_KEY'; before calling fetchOpenWeather()
 * One Call 3.0 API doc: https://openweathermap.org/api/one-call-3
 */

const OWM_BASE = 'https://api.openweathermap.org/data/3.0/onecall';

/**
 * Fetch weather (current + daily) and normalize
 * @param {number} lat
 * @param {number} lon
 * @param {number} days - number of daily entries to return (default 7)
 * @returns {Promise<{current: object, daily: Array}>}
 */
export async function fetchOpenWeather(lat, lon, days = 7) {
  const apiKey = window.OPENWEATHER_API_KEY;
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }
  const url = `${OWM_BASE}?lat=${lat}&lon=${lon}&units=metric&lang=ja&exclude=minutely,alerts&appid=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 401) throw new Error('INVALID_API_KEY');
    if (res.status === 429) throw new Error('RATE_LIMIT');
    throw new Error(`HTTP_${res.status}`);
  }
  const data = await res.json();
  const current = normalizeCurrent(data.current);
  const daily = (data.daily || []).slice(0, days).map(normalizeDaily);
  return { current, daily };
}

function normalizeCurrent(c) {
  if (!c) return {};
  const weather = (c.weather && c.weather[0]) || {};
  return {
    description: weather.description || '-',
    icon: weather.icon || '',
    iconUrl: weather.icon ? `https://openweathermap.org/img/wn/${weather.icon}@2x.png` : '',
    temp: c.temp,
    feelsLike: c.feels_like,
    humidity: c.humidity,
    windSpeed: c.wind_speed,
    windDeg: c.wind_deg,
    pressure: c.pressure,
    dt: c.dt * 1000
  };
}

function normalizeDaily(d) {
  const weather = (d.weather && d.weather[0]) || {};
  return {
    date: new Date(d.dt * 1000),
    description: weather.description || '-',
    icon: weather.icon || '',
    iconUrl: weather.icon ? `https://openweathermap.org/img/wn/${weather.icon}.png` : '',
    tMin: d.temp?.min ?? null,
    tMax: d.temp?.max ?? null,
    popPercent: typeof d.pop === 'number' ? Math.round(d.pop * 100) : null
  };
}
