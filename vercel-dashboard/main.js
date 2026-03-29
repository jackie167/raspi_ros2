let client = null;

// Hardcoded broker settings as requested.
const BROKER_WSS_URL = 'wss://b005c9ecb8674930857a11ff36fcd93c.s1.eu.hivemq.cloud:8884/mqtt';
const TOPIC_PREFIX = 'smart_irrigation/dinhthi';

const brokerCardEl = document.getElementById('brokerCard');
const statusEl = document.getElementById('status');
const moistureEl = document.getElementById('moisture');
const tempEl = document.getElementById('temperature');
const humiEl = document.getElementById('humidity');
const pumpStateEl = document.getElementById('pumpState');
const moistureChartEl = document.getElementById('moistureChart');
const moistureChartMetaEl = document.getElementById('moistureChartMeta');

const brokerUserEl = document.getElementById('brokerUser');
const brokerPassEl = document.getElementById('brokerPass');
const rememberCfgEl = document.getElementById('rememberCfg');
const autoConnectEl = document.getElementById('autoConnect');

const STORAGE_KEY = 'smart_irrigation_dashboard_cfg_v2';
const LAST_PUMP_STATE_KEY = 'smart_irrigation_last_pump_state_v1';
const HOURLY_MOISTURE_KEY = 'smart_irrigation_hourly_moisture_v1';
const HISTORY_HOURS = 24;

let hourlyHistory = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function setBrokerCardVisible(visible) {
  if (visible) {
    brokerCardEl.classList.remove('hidden');
  } else {
    brokerCardEl.classList.add('hidden');
  }
}

function topic(name) {
  return TOPIC_PREFIX + '/' + name;
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const cfg = JSON.parse(raw);
    brokerUserEl.value = cfg.brokerUser || brokerUserEl.value;
    brokerPassEl.value = cfg.brokerPass || brokerPassEl.value;
    rememberCfgEl.checked = cfg.rememberCfg !== false;
    autoConnectEl.checked = cfg.autoConnect !== false;
  } catch {
    // Ignore corrupted local storage.
  }
}

function saveConfig() {
  const cfg = {
    brokerUser: brokerUserEl.value.trim(),
    brokerPass: brokerPassEl.value,
    rememberCfg: rememberCfgEl.checked,
    autoConnect: autoConnectEl.checked,
  };

  if (rememberCfgEl.checked) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function setPumpState(state) {
  const normalized = String(state || '').toUpperCase().trim();
  if (normalized !== 'ON' && normalized !== 'OFF') {
    return;
  }
  pumpStateEl.textContent = normalized;
  localStorage.setItem(LAST_PUMP_STATE_KEY, normalized);
}

function loadLastPumpState() {
  const state = localStorage.getItem(LAST_PUMP_STATE_KEY);
  if (state === 'ON' || state === 'OFF') {
    pumpStateEl.textContent = state;
  }
}

function extractPumpState(payload) {
  const raw = String(payload || '').trim();
  if (!raw) return '-';

  const upper = raw.toUpperCase();
  if (upper === 'ON' || upper === 'OFF') {
    return upper;
  }

  try {
    const data = JSON.parse(raw);
    const candidate = data.state || data.value || data.pump_state || data.command || '';
    const state = String(candidate).toUpperCase().trim();
    if (state === 'ON' || state === 'OFF') {
      return state;
    }
  } catch {
    // Ignore parse errors.
  }

  return raw;
}

function hourStartMs(tsMs) {
  const d = new Date(tsMs);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function loadHourlyHistory() {
  try {
    const raw = localStorage.getItem(HOURLY_MOISTURE_KEY);
    if (!raw) {
      hourlyHistory = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      hourlyHistory = [];
      return;
    }

    const nowHour = hourStartMs(Date.now());
    const minHour = nowHour - (HISTORY_HOURS - 1) * 3600000;

    hourlyHistory = parsed
      .filter((item) => Number.isFinite(item.hour) && Number.isFinite(item.avg) && Number.isFinite(item.count))
      .filter((item) => item.hour >= minHour && item.hour <= nowHour)
      .sort((a, b) => a.hour - b.hour);
  } catch {
    hourlyHistory = [];
  }
}

function saveHourlyHistory() {
  localStorage.setItem(HOURLY_MOISTURE_KEY, JSON.stringify(hourlyHistory));
}

function upsertHourlyMoisture(moisture, tsMs) {
  const value = Number(moisture);
  if (!Number.isFinite(value)) return;

  const hour = hourStartMs(tsMs || Date.now());
  const idx = hourlyHistory.findIndex((item) => item.hour === hour);

  if (idx >= 0) {
    const current = hourlyHistory[idx];
    const nextCount = current.count + 1;
    const nextAvg = (current.avg * current.count + value) / nextCount;
    hourlyHistory[idx] = { hour, avg: nextAvg, count: nextCount };
  } else {
    hourlyHistory.push({ hour, avg: value, count: 1 });
  }

  hourlyHistory.sort((a, b) => a.hour - b.hour);
  const nowHour = hourStartMs(Date.now());
  const minHour = nowHour - (HISTORY_HOURS - 1) * 3600000;
  hourlyHistory = hourlyHistory.filter((item) => item.hour >= minHour && item.hour <= nowHour);

  saveHourlyHistory();
  renderMoistureChart();
}

function buildChartSeries() {
  const nowHour = hourStartMs(Date.now());
  const minHour = nowHour - (HISTORY_HOURS - 1) * 3600000;
  const map = new Map(hourlyHistory.map((item) => [item.hour, item.avg]));

  const points = [];
  for (let i = 0; i < HISTORY_HOURS; i++) {
    const hour = minHour + i * 3600000;
    points.push({
      hour,
      label: String(new Date(hour).getHours()).padStart(2, '0') + ':00',
      value: map.has(hour) ? map.get(hour) : null,
    });
  }
  return points;
}

function renderMoistureChart() {
  if (!moistureChartEl) return;

  const rect = moistureChartEl.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || 820));
  const height = 240;
  const dpr = window.devicePixelRatio || 1;
  moistureChartEl.width = Math.floor(width * dpr);
  moistureChartEl.height = Math.floor(height * dpr);

  const ctx = moistureChartEl.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const left = 46;
  const right = width - 12;
  const top = 16;
  const bottom = height - 30;

  ctx.strokeStyle = '#dbe5f1';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = top + ((bottom - top) * i) / 5;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#64748b';
  ctx.font = '12px ui-sans-serif, system-ui';
  for (let i = 0; i <= 5; i++) {
    const val = 100 - i * 20;
    const y = top + ((bottom - top) * i) / 5;
    ctx.fillText(String(val), 8, y + 4);
  }

  const series = buildChartSeries();
  const step = (right - left) / (HISTORY_HOURS - 1);

  ctx.fillStyle = '#64748b';
  for (let i = 0; i < series.length; i += 6) {
    const x = left + i * step;
    ctx.fillText(series[i].label, x - 14, height - 8);
  }

  const yFromValue = (v) => bottom - (Math.max(0, Math.min(100, v)) / 100) * (bottom - top);

  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < series.length; i++) {
    const point = series[i];
    if (point.value === null) {
      started = false;
      continue;
    }
    const x = left + i * step;
    const y = yFromValue(point.value);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  ctx.fillStyle = '#2563eb';
  for (let i = 0; i < series.length; i++) {
    const point = series[i];
    if (point.value === null) continue;
    const x = left + i * step;
    const y = yFromValue(point.value);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const hasData = series.some((p) => p.value !== null);
  if (!hasData) {
    moistureChartMetaEl.textContent = 'No sensor data in the last 24 hours yet.';
    return;
  }

  const last = [...series].reverse().find((p) => p.value !== null);
  moistureChartMetaEl.textContent = 'Last hourly avg: ' + last.value.toFixed(1) + '% at ' + last.label;
}

function onMessage(topicName, payloadBytes) {
  const payload = new TextDecoder().decode(payloadBytes);

  if (topicName.endsWith('/data/sensor')) {
    try {
      const data = JSON.parse(payload);
      const moisture = Number(data.soil_moisture);
      moistureEl.textContent = Number.isFinite(moisture) ? String(moisture) : '-';
      tempEl.textContent = String(data.temperature ?? '-');
      humiEl.textContent = String(data.humidity ?? '-');

      const tsMs = Number.isFinite(Number(data.ts)) ? Number(data.ts) * 1000 : Date.now();
      upsertHourlyMoisture(moisture, tsMs);
    } catch {
      // Ignore parse errors.
    }
  }

  if (topicName.endsWith('/data/pump_state')) {
    setPumpState(extractPumpState(payload));
  }
}

function connect() {
  saveConfig();

  if (client) {
    client.end(true);
    client = null;
  }

  const username = brokerUserEl.value.trim();
  const password = brokerPassEl.value;

  const options = {
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 2000,
    username: username || undefined,
    password: password || undefined,
    clientId: 'web_' + Math.random().toString(16).slice(2, 10),
  };

  setStatus('Connecting...');
  setBrokerCardVisible(true);
  client = mqtt.connect(BROKER_WSS_URL, options);

  client.on('connect', () => {
    setStatus('Connected');
    setBrokerCardVisible(false);
    client.subscribe(topic('data/sensor'));
    client.subscribe(topic('data/pump_state'));
    client.subscribe(topic('data/config_test'));
  });

  client.on('message', onMessage);
  client.on('reconnect', () => {
    setStatus('Reconnecting...');
    setBrokerCardVisible(true);
  });
  client.on('error', (err) => {
    setStatus('Error: ' + err.message);
    setBrokerCardVisible(true);
  });
  client.on('close', () => {
    setStatus('Disconnected');
    setBrokerCardVisible(true);
  });
}

function publishPump(value) {
  if (!client || !client.connected) {
    setStatus('Not connected');
    setBrokerCardVisible(true);
    return;
  }

  client.publish(topic('cmd/pump'), value, { qos: 0, retain: false });
  setPumpState(value);
}

document.getElementById('btnConnect').addEventListener('click', connect);
document.getElementById('btnOn').addEventListener('click', () => publishPump('ON'));
document.getElementById('btnOff').addEventListener('click', () => publishPump('OFF'));
window.addEventListener('resize', renderMoistureChart);

loadConfig();
loadLastPumpState();
loadHourlyHistory();
renderMoistureChart();
if (autoConnectEl.checked) {
  connect();
}
