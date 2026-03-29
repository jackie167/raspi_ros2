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
const HISTORY_HOURS = 24;

let hourlyHistory = [];
let pendingPumpCommand = null;

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

function resetHourlyHistory() {
  hourlyHistory = [];
  renderMoistureChart();
}

function upsertHourlyHistoryEntry(hourEpoch, avgValue, countValue) {
  const hour = Number(hourEpoch);
  const avg = Number(avgValue);
  const count = Number(countValue);
  if (!Number.isFinite(hour) || !Number.isFinite(avg)) return;

  const idx = hourlyHistory.findIndex((item) => item.hour === hour);
  const item = {
    hour,
    avg,
    count: Number.isFinite(count) ? count : 1,
  };

  if (idx >= 0) {
    hourlyHistory[idx] = item;
  } else {
    hourlyHistory.push(item);
  }

  hourlyHistory.sort((a, b) => a.hour - b.hour);
  const nowHourEpoch = Math.floor(Date.now() / 3600000);
  const minHourEpoch = nowHourEpoch - (HISTORY_HOURS - 1);
  hourlyHistory = hourlyHistory.filter((x) => x.hour >= minHourEpoch && x.hour <= nowHourEpoch);

  renderMoistureChart();
}

function buildChartSeries() {
  const nowHourMs = hourStartMs(Date.now());
  const minHourMs = nowHourMs - (HISTORY_HOURS - 1) * 3600000;
  const valueByHourMs = new Map(
    hourlyHistory.map((item) => [item.hour * 3600000, item.avg]),
  );

  const points = [];
  for (let i = 0; i < HISTORY_HOURS; i++) {
    const hourMs = minHourMs + i * 3600000;
    points.push({
      hourMs,
      label: String(new Date(hourMs).getHours()).padStart(2, '0') + ':00',
      value: valueByHourMs.has(hourMs) ? valueByHourMs.get(hourMs) : null,
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
    moistureChartMetaEl.textContent = 'Waiting hourly history from MQTT...';
    return;
  }

  const last = [...series].reverse().find((p) => p.value !== null);
  moistureChartMetaEl.textContent = 'Last MQTT hourly avg: ' + last.value.toFixed(1) + '% at ' + last.label;
}

function parseHistoryMessage(topicName, payload) {
  const historyPrefix = topic('history/soil_moisture/hourly/') ;
  if (!topicName.startsWith(historyPrefix)) return;

  const hourFromTopic = Number(topicName.slice(historyPrefix.length));

  try {
    const data = JSON.parse(payload);
    const hourEpoch = Number.isFinite(Number(data.hour_epoch)) ? Number(data.hour_epoch) : hourFromTopic;
    const avg = data.avg_soil_moisture;
    const count = data.count;
    upsertHourlyHistoryEntry(hourEpoch, avg, count);
    return;
  } catch {
    // Fallback below if payload is non-JSON.
  }

  upsertHourlyHistoryEntry(hourFromTopic, Number(payload), 1);
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
    } catch {
      // Ignore parse errors.
    }
  }

  if (topicName.endsWith('/data/pump_state')) {
    const ackState = extractPumpState(payload);
    setPumpState(ackState);
    if (pendingPumpCommand && (ackState === 'ON' || ackState === 'OFF')) {
      if (ackState === pendingPumpCommand) {
        setStatus('ESP confirmed pump: ' + ackState);
      } else {
        setStatus('ESP state mismatch: expected ' + pendingPumpCommand + ', got ' + ackState);
      }
      pendingPumpCommand = null;
    }
  }

  parseHistoryMessage(topicName, payload);
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
    resetHourlyHistory();
    client.subscribe(topic('data/sensor'));
    client.subscribe(topic('data/pump_state'));
    client.subscribe(topic('data/config_test'));
    client.subscribe(topic('history/soil_moisture/hourly/+'));
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
  pendingPumpCommand = value;
  setStatus('Command sent: ' + value + ' (waiting ESP ack)');
}

document.getElementById('btnConnect').addEventListener('click', connect);
document.getElementById('btnOn').addEventListener('click', () => publishPump('ON'));
document.getElementById('btnOff').addEventListener('click', () => publishPump('OFF'));
window.addEventListener('resize', renderMoistureChart);

loadConfig();
loadLastPumpState();
renderMoistureChart();
if (autoConnectEl.checked) {
  connect();
}
