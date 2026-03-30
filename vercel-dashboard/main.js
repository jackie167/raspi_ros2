let client = null;

// Hardcoded broker settings as requested.
const BROKER_WSS_URL = 'wss://b005c9ecb8674930857a11ff36fcd93c.s1.eu.hivemq.cloud:8884/mqtt';
const TOPIC_PREFIX = 'smart_irrigation/dinhthi';
const RAILWAY_API_BASE = localStorage.getItem('railway_api_base') || 'https://raspiros2-production.up.railway.app';
const SAMPLE_LIMIT = 120;

const brokerCardEl = document.getElementById('brokerCard');
const statusEl = document.getElementById('status');
const moistureEl = document.getElementById('moisture');
const tempEl = document.getElementById('temperature');
const humiEl = document.getElementById('humidity');
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
    moistureChartMetaEl.textContent = 'No sensor samples from DB yet';
    return;
  }

  const n = sampleSeries.length;
  const step = n > 1 ? (right - left) / (n - 1) : 0;
  const yFromValue = (v) => bottom - (Math.max(0, Math.min(100, v)) / 100) * (bottom - top);

  const tickStep = Math.max(1, Math.floor(n / 4));
  ctx.fillStyle = '#64748b';
  for (let i = 0; i < n; i += tickStep) {
    const x = left + i * step;
    const label = 'S' + String(sampleSeries[i].idx);
    ctx.fillText(label, x - 14, height - 8);
  }
  if ((n - 1) % tickStep !== 0) {
    const x = left + (n - 1) * step;
    ctx.fillText('S' + String(sampleSeries[n - 1].idx), x - 14, height - 8);
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
  const t1 = new Date(first.ts_ms);
  const t2 = new Date(last.ts_ms);
  const fromLabel = String(t1.getHours()).padStart(2, '0') + ':' + String(t1.getMinutes()).padStart(2, '0');
  const toLabel = String(t2.getHours()).padStart(2, '0') + ':' + String(t2.getMinutes()).padStart(2, '0');
  moistureChartMetaEl.textContent =
    'DB samples: ' + n +
    ' | Last: ' + last.moisture.toFixed(1) + '%' +
    ' | Range: S' + String(first.idx) + ' -> S' + String(last.idx) +
    ' (' + fromLabel + ' - ' + toLabel + ')';
}

async function refreshDbSensorSamples() {
  try {
    const base = RAILWAY_API_BASE.replace(/\/$/, '');
    const url = base + '/api/sensor/samples?limit=' + SAMPLE_LIMIT;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      moistureChartMetaEl.textContent = 'DB sample API error: ' + res.status;
      return;
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    sampleSeries = items
      .map((x, i) => {
        const tsRaw = Date.parse(x.created_at || '');
        const fallbackTs = Date.now() - (items.length - i) * 1000;
        const ts = Number.isFinite(tsRaw) ? tsRaw : fallbackTs;
        const moistureRaw = Number(x.soil_moisture);
        const moisture = Number.isFinite(moistureRaw)
          ? moistureRaw
          : Number(x?.raw_payload?.soil_moisture);
        if (!Number.isFinite(moisture)) return null;
        return { idx: i + 1, ts_ms: ts, moisture };
      })
      .filter((x) => x !== null);

    renderSampleChart();
  } catch (err) {
    moistureChartMetaEl.textContent = 'Cannot load DB samples: ' + err.message;
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
      moistureEl.textContent = Number.isFinite(moisture) ? String(moisture) : '-';
      tempEl.textContent = String(data.temperature ?? '-');
      humiEl.textContent = String(data.humidity ?? '-');

      const now = Date.now();
      if (now - lastDbSamplesRefreshMs > 5000) {
        lastDbSamplesRefreshMs = now;
        refreshDbSensorSamples();
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
refreshDbDebug();
setInterval(() => {
  refreshDbSensorSamples();
  refreshDbDebug();
}, 10000);
if (autoConnectEl.checked) {
  connect();
}
