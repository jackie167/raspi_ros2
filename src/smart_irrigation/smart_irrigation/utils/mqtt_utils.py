try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None


class MqttClientWrapper:
    def __init__(self, host, port, logger, on_message, username='', password='', use_tls=False):
        self.host = host
        self.port = port
        self.logger = logger
        self.on_message = on_message
        self.username = username
        self.password = password
        self.use_tls = use_tls
        self.client = None

    def connect_and_start(self):
        if mqtt is None:
            self.logger.error('paho-mqtt missing. Install: sudo apt install -y python3-paho-mqtt')
            return

        self.client = mqtt.Client()
        self.client.on_message = self._on_message

        if self.username:
            self.client.username_pw_set(self.username, self.password)

        if self.use_tls:
            self.client.tls_set()

        self.client.connect(self.host, self.port, keepalive=60)
        self.client.loop_start()

        auth_mode = 'username/password' if self.username else 'anonymous'
        tls_mode = 'TLS' if self.use_tls else 'plain TCP'
        self.logger.info(f'MQTT connected {self.host}:{self.port} ({tls_mode}, {auth_mode})')

    def _on_message(self, client, userdata, msg):
        payload = msg.payload.decode('utf-8', errors='ignore')
        self.on_message(msg.topic, payload)

    def subscribe(self, topic):
        if self.client is not None:
            self.client.subscribe(topic)

    def publish(self, topic, payload):
        if self.client is not None:
            self.client.publish(topic, payload)

    def stop(self):
        if self.client is not None:
            self.client.loop_stop()
            self.client.disconnect()
