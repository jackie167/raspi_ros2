let client = null;

const statusEl = document.getElementById('status');
const moistureEl = document.getElementById('moisture');
const tempEl = document.getElementById('temperature');
const humiEl = document.getElementById('humidity');
const pumpStateEl = document.getElementById('pumpState');
const rawEl = document.getElementById('raw');

const brokerUrlEl = document.getElementById('brokerUrl');
const brokerUserEl = document.getElementById('brokerUser');
const brokerPassEl = document.getElementById('brokerPass');
const topicPrefixEl = document.getElementById('topicPrefix');

function setStatus(text) {
  statusEl.textContent = text;
}

function topic(name) {
  const prefix = topicPrefixEl.value.trim().replace(/\/$/, '');
  return `${prefix}/${name}`;
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
    pumpStateEl.textContent = payload;
  }

  rawEl.textContent = `[${topicName}] ${payload}`;
}

function connect() {
  if (client) {
    client.end(true);
    client = null;
  }

  const url = brokerUrlEl.value.trim();
  const username = brokerUserEl.value.trim();
  const password = brokerPassEl.value;

  const options = {
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 2000,
    username: username || undefined,
    password: password || undefined,
    clientId: `web_${Math.random().toString(16).slice(2, 10)}`,
  };

  setStatus('Connecting...');
  client = mqtt.connect(url, options);

  client.on('connect', () => {
    setStatus('Connected');
    client.subscribe(topic('data/sensor'));
    client.subscribe(topic('data/pump_state'));
    client.subscribe(topic('data/config_test'));
  });

  client.on('message', onMessage);
  client.on('reconnect', () => setStatus('Reconnecting...'));
  client.on('error', (err) => setStatus(`Error: ${err.message}`));
  client.on('close', () => setStatus('Disconnected'));
}

function publishPump(value) {
  if (!client || !client.connected) {
    setStatus('Not connected');
    return;
  }

  client.publish(topic('cmd/pump'), value, { qos: 0, retain: false });
}

document.getElementById('btnConnect').addEventListener('click', connect);
document.getElementById('btnOn').addEventListener('click', () => publishPump('ON'));
document.getElementById('btnOff').addEventListener('click', () => publishPump('OFF'));
