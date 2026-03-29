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

const brokerUserEl = document.getElementById('brokerUser');
const brokerPassEl = document.getElementById('brokerPass');
const rememberCfgEl = document.getElementById('rememberCfg');
const autoConnectEl = document.getElementById('autoConnect');

const STORAGE_KEY = 'smart_irrigation_dashboard_cfg_v2';
const LAST_PUMP_STATE_KEY = 'smart_irrigation_last_pump_state_v1';

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

  // Plain payload case: "ON" / "OFF"
  const upper = raw.toUpperCase();
  if (upper === 'ON' || upper === 'OFF') {
    return upper;
  }

  // JSON payload case
  try {
    const data = JSON.parse(raw);
    const candidate = data.state || data.value || data.pump_state || data.command || '';
    const state = String(candidate).toUpperCase().trim();
    if (state === 'ON' || state === 'OFF') {
      return state;
    }
  } catch {
    // ignore parse errors
  }

  return raw;
}

function onMessage(topicName, payloadBytes) {
  const payload = new TextDecoder().decode(payloadBytes);

  if (topicName.endsWith('/data/sensor')) {
    try {
      const data = JSON.parse(payload);
      moistureEl.textContent = String(data.soil_moisture ?? '-');
      tempEl.textContent = String(data.temperature ?? '-');
      humiEl.textContent = String(data.humidity ?? '-');
    } catch {
      // Ignore parse errors and still show raw payload.
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

loadConfig();
loadLastPumpState();
if (autoConnectEl.checked) {
  connect();
}
