import time

import rclpy
from rclpy.node import Node
from std_msgs.msg import String

from smart_irrigation.utils.json_utils import to_json


class SensorNode(Node):
    def __init__(self):
        super().__init__('sensor_node')
        self.publisher = self.create_publisher(String, 'irrigation/sensor_data', 10)
        self.timer = self.create_timer(2.0, self.publish_sensor)
        self._tick = 0

    def publish_sensor(self):
        # Simulated sensor values for local testing.
        moisture = 35 + (self._tick % 25)
        payload = {
            'soil_moisture': moisture,
            'temperature': 28.5,
            'humidity': 72.0,
            'ts': int(time.time()),
            'source': 'sensor_node_sim',
        }
        self._tick += 1

        msg = String()
        msg.data = to_json(payload)
        self.publisher.publish(msg)
        self.get_logger().info(f'Published sensor_data: {msg.data}')


def main(args=None):
    rclpy.init(args=args)
    node = SensorNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
