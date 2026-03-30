let client = null;

// Hardcoded broker settings as requested.
const BROKER_WSS_URL = 'wss://b005c9ecb8674930857a11ff36fcd93c.s1.eu.hivemq.cloud:8884/mqtt';
const TOPIC_PREFIX = 'smart_irrigation/dinhthi';
const RAILWAY_API_BASE = localStorage.getItem('railway_api_base') || 'https://raspiros2-production.up.railway.app';
const HISTORY_HOURS = 24;

const brokerCardEl = document.getElementById('brokerCard');
const statusEl = document.getElementById('status');
const moistureEl = document.getElementById('moisture');
const tempEl = document.getElementById('temperature');
const humiEl = document.getElementById('humidity');
const sampleTimeEl = document.getElementById('sampleTime');
const pumpStateEl = document.getElementById('pumpState');
const pumpAckEl = document.getElementById('pumpAck');
const moistureChartEl = document.getElementById('moistureChart');
const moistureChartMetaEl = document.getElementById('moistureChartMeta');
const dbAckListEl = document.getElementById('dbAckList');

const brokerUserEl = document.getElementById('brokerUser');
const brokerPassEl = document.getElementById('brokerPass');
const rememberCfgEl = document.getElementById('rememberCfg');
const autoConnectEl = document.getElementById('autoConnect');

const STORAGE_KEY = 'smart_irrigation_dashboard_cfg_v2';
const LAST_PUMP_STATE_KEY = 'smart_irrigation_last_pump_state_v1';

let sampleSeries = []; // [{idx, ts_ms, moisture}]
let pendingPumpCommand = null;
let lastDbSamplesRefreshMs = 0;
let hasConnectedOnce = false;
let lastSensorTsMs = 0;

function setStatus(text) {
  statusEl.textContent = text;
}

function setBrokerCardVisible(visible) {
  if (visible) brokerCardEl.classList.remove('hidden');
  else brokerCardEl.classList.add('hidden');
}

function topic(name) {
  return TOPIC_PREFIX + '/' + name;
}

function formatSampleTime(tsMs, source) {
  if (Number.isFinite(tsMs) === false || tsMs <= 0) return '-';
  const d = new Date(tsMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear());
  return hh + ':' + mm + ':' + ss + ' ' + dd + '/' + mo + '/' + yy + ' (' + source + ')';
}

function setLiveSensorValues(args) {
  const moisture = Number(args.moisture);
  const temperature = Number(args.temperature);
  const humidity = Number(args.humidity);
  const tsMs = Number(args.tsMs);
  const source = args.source || 'sensor';

  if (Number.isFinite(moisture)) moistureEl.textContent = String(moisture);
  if (Number.isFinite(temperature)) tempEl.textContent = String(temperature);
  if (Number.isFinite(humidity)) humiEl.textContent = String(humidity);

  if (Number.isFinite(tsMs) && tsMs > 0) {
    lastSensorTsMs = tsMs;
    if (sampleTimeEl) sampleTimeEl.textContent = formatSampleTime(tsMs, source);
  }
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
  if (rememberCfgEl.checked) localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(STORAGE_KEY);
}

function setPumpAck(value) {
  if (pumpAckEl) pumpAckEl.textContent = String(value);
}

function setPumpState(state) {
  const normalized = String(state || '').toUpperCase().trim();
  if (normalized !== 'ON' && normalized !== 'OFF') return;
  pumpStateEl.textContent = normalized;
  localStorage.setItem(LAST_PUMP_STATE_KEY, normalized);
}

function loadLastPumpState() {
  const state = localStorage.getItem(LAST_PUMP_STATE_KEY);
  if (state === 'ON' || state === 'OFF') pumpStateEl.textContent = state;
}

function extractPumpState(payload) {
  const raw = String(payload || '').trim();
  if (!raw) return '-';
  const upper = raw.toUpperCase();
  if (upper === 'ON' || upper === 'OFF') return upper;
  try {
    const data = JSON.parse(raw);
    const candidate = data.state || data.value || data.pump_state || data.command || '';
    const state = String(candidate).toUpperCase().trim();
    if (state === 'ON' || state === 'OFF') return state;
  } catch {
    // Ignore parse errors.
  }
  return raw;
}

function renderSampleChart() {
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

  if (!Array.isArray(sampleSeries) || sampleSeries.length === 0) {
    moistureChartMetaEl.textContent = 'No 24h history from DB yet';
    return;
  }

  const n = sampleSeries.length;
  const step = n > 1 ? (right - left) / (n - 1) : 0;
  const yFromValue = (v) => bottom - (Math.max(0, Math.min(100, v)) / 100) * (bottom - top);

  const tickStep = Math.max(1, Math.floor(n / 6));
  ctx.fillStyle = '#64748b';
  for (let i = 0; i < n; i += tickStep) {
    const x = left + i * step;
    const label = String(new Date(sampleSeries[i].ts_ms).getHours());
    ctx.fillText(label, x - 6, height - 8);
  }
  if ((n - 1) % tickStep !== 0) {
    const x = left + (n - 1) * step;
    ctx.fillText(String(new Date(sampleSeries[n - 1].ts_ms).getHours()), x - 6, height - 8);
  }

  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = sampleSeries[i];
    const x = left + i * step;
    const y = yFromValue(p.moisture);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = '#2563eb';
  for (let i = 0; i < n; i++) {
    const p = sampleSeries[i];
    const x = left + i * step;
    const y = yFromValue(p.moisture);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const first = sampleSeries[0];
  const last = sampleSeries[n - 1];
  const fromHour = String(new Date(first.ts_ms).getHours());
  const toHour = String(new Date(last.ts_ms).getHours());
  moistureChartMetaEl.textContent =
    '24h window | Last avg: ' + last.moisture.toFixed(1) + '% | Hours: ' + fromHour + ' -> ' + toHour;
}

async function refreshDbSensorSamples() {
  try {
    const base = RAILWAY_API_BASE.replace(/\/$/, '');
    const url = base + '/api/history/hourly?hours=' + HISTORY_HOURS;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      moistureChartMetaEl.textContent = 'DB 24h API error: ' + res.status;
      return;
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    const bucketMap = new Map();
    for (const it of items) {
      const ts = Date.parse(it.bucket || '');
      const avg = Number(it.avg_soil_moisture);
      if (!Number.isFinite(ts) || !Number.isFinite(avg)) continue;
      const d = new Date(ts);
      d.setMinutes(0, 0, 0);
      bucketMap.set(d.getTime(), avg);
    }

    const nowHour = new Date();
    nowHour.setMinutes(0, 0, 0);
    const endHourMs = nowHour.getTime();
    const startHourMs = endHourMs - (HISTORY_HOURS - 1) * 3600000;

    const series = [];
    let lastKnown = null;
    for (let i = 0; i < HISTORY_HOURS; i++) {
      const hourMs = startHourMs + i * 3600000;
      let value = null;
      if (bucketMap.has(hourMs)) {
        value = Number(bucketMap.get(hourMs));
        if (Number.isFinite(value)) lastKnown = value;
      } else if (lastKnown !== null) {
        value = lastKnown;
      }
      series.push({ idx: i + 1, ts_ms: hourMs, moisture: value });
    }

    const firstKnown = series.find((x) => Number.isFinite(x.moisture));
    if (!firstKnown) {
      sampleSeries = [];
      renderSampleChart();
      return;
    }

    let carry = firstKnown.moisture;
    for (let i = 0; i < series.length; i++) {
      if (!Number.isFinite(series[i].moisture)) {
        series[i].moisture = carry;
      } else {
        carry = series[i].moisture;
      }
    }

    sampleSeries = series;
    renderSampleChart();
  } catch (err) {
    moistureChartMetaEl.textContent = 'Cannot load DB 24h history: ' + err.message;
  }
}



async function refreshLatestFromDb() {
  try {
    const base = RAILWAY_API_BASE.replace(/\/$/, '');
    const res = await fetch(base + '/api/latest', { method: 'GET' });
    if (!res.ok) return;

    const data = await res.json();
    const sensor = data && data.sensor ? data.sensor : null;
    if (!sensor) return;

    const tsMs = Date.parse(sensor.created_at || '');
    if (Number.isFinite(tsMs) && tsMs < lastSensorTsMs) return;

    setLiveSensorValues({
      moisture: Number(sensor.soil_moisture),
      temperature: Number(sensor.temperature),
      humidity: Number(sensor.humidity),
      tsMs: Number.isFinite(tsMs) ? tsMs : Date.now(),
      source: 'DB',
    });
  } catch {
    // Ignore DB latest errors.
  }
}
function renderDbCommandRows(items) {
  if (!dbAckListEl) return;
  if (!Array.isArray(items) || items.length === 0) {
    dbAckListEl.textContent = 'No command rows yet';
    return;
  }
  const lines = items.map((x) => {
    const matched = x.matched === true ? 'true' : (x.matched === false ? 'false' : 'pending');
    return [
      x.created_at || '-',
      'cmd=' + (x.command || '-'),
      'ack=' + (x.ack_state || '-'),
      'matched=' + matched,
    ].join(' | ');
  });
  dbAckListEl.textContent = lines.join('\n');
}

async function refreshDbDebug() {
  if (!dbAckListEl) return;
  try {
    const url = RAILWAY_API_BASE.replace(/\/$/, '') + '/api/pump/commands?limit=12';
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      dbAckListEl.textContent = 'API error: ' + res.status;
      return;
    }
    const data = await res.json();
    renderDbCommandRows(data.items || []);
  } catch (err) {
    dbAckListEl.textContent = 'Cannot load DB debug: ' + err.message;
  }
}

function onMessage(topicName, payloadBytes) {
  const payload = new TextDecoder().decode(payloadBytes);

  if (topicName.endsWith('/data/sensor')) {
    try {
      const data = JSON.parse(payload);
      const moisture = Number(data.soil_moisture);
      const temperature = Number(data.temperature);
      const humidity = Number(data.humidity);

      let tsMs = Date.now();
      if (Number.isFinite(Number(data.ts))) {
        const tsNum = Number(data.ts);
        tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
      }

      setLiveSensorValues({
        moisture,
        temperature,
        humidity,
        tsMs,
        source: 'MQTT',
      });

      const now = Date.now();
      if (now - lastDbSamplesRefreshMs > 5000) {
        lastDbSamplesRefreshMs = now;
        refreshDbSensorSamples();
        refreshLatestFromDb();
      }
    } catch {
      // Ignore parse errors.
    }
  }

  if (topicName.endsWith('/data/pump_state')) {
    const ackState = extractPumpState(payload);
    setPumpState(ackState);
    if (pendingPumpCommand && (ackState === 'ON' || ackState === 'OFF')) {
      if (ackState === pendingPumpCommand) {
        setPumpAck('true');
        setStatus('ESP confirmed pump: ' + ackState);
      } else {
        setPumpAck('false');
        setStatus('ESP state mismatch: expected ' + pendingPumpCommand + ', got ' + ackState);
      }
      pendingPumpCommand = null;
      refreshDbDebug();
    }
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
  if (!hasConnectedOnce) setBrokerCardVisible(true);
  client = mqtt.connect(BROKER_WSS_URL, options);

  client.on('connect', () => {
    hasConnectedOnce = true;
    setStatus('Connected');
    setBrokerCardVisible(false);
    client.subscribe(topic('data/sensor'));
    client.subscribe(topic('data/pump_state'));
    client.subscribe(topic('data/config_test'));
  });

  client.on('message', onMessage);
  client.on('reconnect', () => {
    setStatus('Reconnecting...');
    if (!hasConnectedOnce) setBrokerCardVisible(true);
  });
  client.on('error', (err) => {
    setStatus('Error: ' + err.message);
    if (!hasConnectedOnce) setBrokerCardVisible(true);
  });
  client.on('close', () => {
    setStatus(hasConnectedOnce ? 'Reconnecting...' : 'Disconnected');
    if (!hasConnectedOnce) setBrokerCardVisible(true);
  });
}

function publishPump(value) {
  if (!client || !client.connected) {
    setStatus('Not connected');
    if (!hasConnectedOnce) setBrokerCardVisible(true);
    return;
  }

  client.publish(topic('cmd/pump'), value, { qos: 0, retain: false });
  pendingPumpCommand = value;
  setPumpAck('pending');
  setStatus('Command sent: ' + value + ' (waiting ESP ack)');
  refreshDbDebug();
}

document.getElementById('btnConnect').addEventListener('click', connect);
document.getElementById('btnOn').addEventListener('click', () => publishPump('ON'));
document.getElementById('btnOff').addEventListener('click', () => publishPump('OFF'));
document.getElementById('btnRefreshDb').addEventListener('click', refreshDbDebug);
window.addEventListener('resize', renderSampleChart);

loadConfig();
loadLastPumpState();
renderSampleChart();
refreshDbSensorSamples();
refreshLatestFromDb();
refreshDbDebug();
setInterval(() => {
  refreshDbSensorSamples();
  refreshLatestFromDb();
  refreshDbDebug();
}, 10000);
if (autoConnectEl.checked) {
  connect();
}
