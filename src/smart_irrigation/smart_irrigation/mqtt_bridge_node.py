import json
import threading
import time

import rclpy
from rclpy.node import Node
from std_msgs.msg import String

from smart_irrigation.utils.mqtt_utils import MqttClientWrapper


class MqttBridgeNode(Node):
    def __init__(self):
        super().__init__('mqtt_bridge_node')

        self.declare_parameter('broker_host', 'test.mosquitto.org')
        self.declare_parameter('broker_port', 1883)
        self.declare_parameter('broker_username', '')
        self.declare_parameter('broker_password', '')
        self.declare_parameter('broker_use_tls', False)
        self.declare_parameter('topic_prefix', 'smart_irrigation/dinhthi')

        self.broker_host = self.get_parameter('broker_host').value
        self.broker_port = int(self.get_parameter('broker_port').value)
        self.broker_username = self.get_parameter('broker_username').value
        self.broker_password = self.get_parameter('broker_password').value
        self.broker_use_tls = bool(self.get_parameter('broker_use_tls').value)

        prefix = str(self.get_parameter('topic_prefix').value).strip('/')
        self.mqtt_sensor_topic = f'{prefix}/data/sensor'
        self.mqtt_cmd_topic = f'{prefix}/cmd/pump'
        self.mqtt_pump_state_topic = f'{prefix}/data/pump_state'
        self.mqtt_config_test_topic = f'{prefix}/data/config_test'
        self.mqtt_hourly_history_prefix = f'{prefix}/history/soil_moisture/hourly'

        self.sensor_pub = self.create_publisher(String, 'irrigation/sensor_data', 10)
        self.config_test_pub = self.create_publisher(String, 'irrigation/esp32_config_test', 10)

        self.pump_cmd_sub = self.create_subscription(
            String,
            'irrigation/pump_command',
            self.on_pump_command,
            10,
        )
        self.pump_state_sub = self.create_subscription(
            String,
            'irrigation/pump_state',
            self.on_pump_state,
            10,
        )

        self._inbound_queue = []
        self._lock = threading.Lock()
        self._hourly_stats = {}
        self.flush_timer = self.create_timer(0.05, self.flush_queue)

        self.client = MqttClientWrapper(
            host=self.broker_host,
            port=self.broker_port,
            logger=self.get_logger(),
            on_message=self.on_mqtt_message,
            username=self.broker_username,
            password=self.broker_password,
            use_tls=self.broker_use_tls,
        )
        self.client.connect_and_start()
        self.client.subscribe(self.mqtt_sensor_topic)
        self.client.subscribe(self.mqtt_config_test_topic)

        tls_mode = 'TLS' if self.broker_use_tls else 'plain'
        self.get_logger().info(
            f'MQTT bridge ready. Broker={self.broker_host}:{self.broker_port} ({tls_mode}). '
            f'IN: {self.mqtt_sensor_topic}, {self.mqtt_config_test_topic} | '
            f'OUT: {self.mqtt_cmd_topic}, {self.mqtt_pump_state_topic}, {self.mqtt_hourly_history_prefix}/+'
        )

    def on_mqtt_message(self, topic, payload):
        with self._lock:
            self._inbound_queue.append((topic, payload))

    def _publish_hourly_soil_history(self, sensor_payload):
        try:
            data = json.loads(sensor_payload)
        except json.JSONDecodeError:
            return

        moisture = data.get('soil_moisture')
        try:
            moisture = float(moisture)
        except (TypeError, ValueError):
            return

        ts = data.get('ts')
        try:
            ts = int(float(ts)) if ts is not None else int(time.time())
        except (TypeError, ValueError):
            ts = int(time.time())

        hour_epoch = ts // 3600
        stat = self._hourly_stats.get(hour_epoch, {'sum': 0.0, 'count': 0})
        stat['sum'] += moisture
        stat['count'] += 1
        self._hourly_stats[hour_epoch] = stat

        avg = stat['sum'] / stat['count']
        history_payload = json.dumps(
            {
                'hour_epoch': int(hour_epoch),
                'hour_start_unix': int(hour_epoch * 3600),
                'avg_soil_moisture': round(avg, 2),
                'count': int(stat['count']),
            },
            separators=(',', ':'),
        )

        history_topic = f'{self.mqtt_hourly_history_prefix}/{int(hour_epoch)}'
        self.client.publish(history_topic, history_payload, retain=True)

        # Keep small in-memory aggregation window (48h) to avoid unbounded growth.
        min_hour = (int(time.time()) // 3600) - 48
        self._hourly_stats = {
            k: v for k, v in self._hourly_stats.items() if k >= min_hour
        }

    def flush_queue(self):
        item = None
        with self._lock:
            if self._inbound_queue:
                item = self._inbound_queue.pop(0)

        if item is None:
            return

        topic, payload = item

        if topic == self.mqtt_sensor_topic:
            msg = String()
            msg.data = payload.strip()
            if not msg.data:
                return

            self.sensor_pub.publish(msg)
            self._publish_hourly_soil_history(msg.data)
            self.get_logger().info('MQTT -> ROS irrigation/sensor_data')
            return

        if topic == self.mqtt_config_test_topic:
            msg = String()
            msg.data = payload.strip()
            if not msg.data:
                return

            self.config_test_pub.publish(msg)
            self.get_logger().info('MQTT -> ROS irrigation/esp32_config_test')
            return

        self.get_logger().info(f'Ignored MQTT topic: {topic}')

    def on_pump_command(self, msg):
        command = msg.data.strip().upper()
        if command not in ('ON', 'OFF'):
            self.get_logger().warning(f'Invalid ROS pump_command for MQTT: {msg.data}')
            return

        self.client.publish(self.mqtt_cmd_topic, command)

    def on_pump_state(self, msg):
        state = msg.data.strip().upper()
        if not state:
            return

        # Retain latest pump state so dashboard reconnect gets last known value immediately.
        self.client.publish(self.mqtt_pump_state_topic, state, retain=True)

    def destroy_node(self):
        self.client.stop()
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = MqttBridgeNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
