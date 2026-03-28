import rclpy
from rclpy.node import Node
from std_msgs.msg import String

from smart_irrigation.config.defaults import DEFAULT_CONFIG
from smart_irrigation.utils.json_utils import from_json


class DecisionNode(Node):
    def __init__(self):
        super().__init__('decision_node')
        self.min_moisture = float(DEFAULT_CONFIG['min_moisture'])
        self.max_moisture = float(DEFAULT_CONFIG['max_moisture'])

        self.sensor_sub = self.create_subscription(
            String,
            'irrigation/sensor_data',
            self.on_sensor,
            10,
        )
        self.config_sub = self.create_subscription(
            String,
            'irrigation/config',
            self.on_config,
            10,
        )
        self.command_pub = self.create_publisher(String, 'irrigation/pump_command', 10)

    def on_config(self, msg):
        cfg = from_json(msg.data)
        if cfg is None:
            self.get_logger().warning('Invalid config JSON; ignored')
            return

        self.min_moisture = float(cfg.get('min_moisture', self.min_moisture))
        self.max_moisture = float(cfg.get('max_moisture', self.max_moisture))
        self.get_logger().info(
            f'Config updated: min={self.min_moisture}, max={self.max_moisture}'
        )

    def on_sensor(self, msg):
        data = from_json(msg.data)
        if data is None:
            self.get_logger().warning('Invalid sensor JSON; ignored')
            return

        moisture = data.get('soil_moisture')
        if moisture is None:
            self.get_logger().warning('sensor_data missing soil_moisture')
            return

        cmd = None
        if float(moisture) < self.min_moisture:
            cmd = 'ON'
        elif float(moisture) > self.max_moisture:
            cmd = 'OFF'

        if cmd is None:
            return

        out = String()
        out.data = cmd
        self.command_pub.publish(out)
        self.get_logger().info(
            f'Decision moisture={moisture} -> pump_command={cmd}'
        )


def main(args=None):
    rclpy.init(args=args)
    node = DecisionNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
