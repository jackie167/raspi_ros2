import rclpy
from rclpy.node import Node
from std_msgs.msg import String

from smart_irrigation.config.defaults import DEFAULT_CONFIG
from smart_irrigation.utils.json_utils import to_json


class ConfigNode(Node):
    def __init__(self):
        super().__init__('config_node')
        self.publisher = self.create_publisher(String, 'irrigation/config', 10)
        self.timer = self.create_timer(10.0, self.publish_config)
        self.publish_config()

    def publish_config(self):
        msg = String()
        msg.data = to_json(DEFAULT_CONFIG)
        self.publisher.publish(msg)
        self.get_logger().info('Published irrigation config')


def main(args=None):
    rclpy.init(args=args)
    node = ConfigNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
