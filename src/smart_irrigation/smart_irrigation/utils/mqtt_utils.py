try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None


class MqttClientWrapper:
    def __init__(self, host, port, logger, on_message):
        self.host = host
        self.port = port
        self.logger = logger
        self.on_message = on_message
        self.client = None

    def connect_and_start(self):
        if mqtt is None:
            self.logger.error('paho-mqtt missing. Install: sudo apt install -y python3-paho-mqtt')
            return

        self.client = mqtt.Client()
        self.client.on_message = self._on_message
        self.client.connect(self.host, self.port, keepalive=60)
        self.client.loop_start()
        self.logger.info(f'MQTT connected {self.host}:{self.port}')

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
