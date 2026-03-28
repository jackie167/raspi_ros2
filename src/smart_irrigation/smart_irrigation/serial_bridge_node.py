import rclpy
from rclpy.node import Node
from std_msgs.msg import String

from smart_irrigation.utils.json_utils import from_json, to_json
from smart_irrigation.utils.serial_utils import SerialClient


class SerialBridgeNode(Node):
    def __init__(self):
        super().__init__('serial_bridge_node')

        self.declare_parameter('serial_port', '/dev/ttyUSB0')
        self.declare_parameter('baudrate', 115200)

        port = self.get_parameter('serial_port').value
        baudrate = int(self.get_parameter('baudrate').value)

        self.serial_client = SerialClient(port=port, baudrate=baudrate, logger=self.get_logger())
        self.sensor_pub = self.create_publisher(String, 'irrigation/sensor_data', 10)
        self.config_test_pub = self.create_publisher(String, 'irrigation/esp32_config_test', 10)
        self.pump_sub = self.create_subscription(String, 'irrigation/pump_command', self.on_pump_command, 10)
        self.timer = self.create_timer(0.1, self.poll_serial)

    def on_pump_command(self, msg):
        payload = {'type': 'pump_command', 'value': msg.data.strip().upper()}
        self.serial_client.write_line(to_json(payload))

    def poll_serial(self):
        line = self.serial_client.read_line()
        if not line:
            return

        data = from_json(line)
        if data is None:
            self.get_logger().warning(f'Invalid serial JSON: {line}')
            return

        msg_type = data.get('type')

        if msg_type == 'sensor_data':
            out = String()
            out.data = to_json(data)
            self.sensor_pub.publish(out)
            return

        if msg_type == 'config_test':
            out = String()
            out.data = to_json(data)
            self.config_test_pub.publish(out)

            device_id = data.get('device_id', 'unknown')
            value = data.get('value')
            self.get_logger().info(
                f'ESP32 config_test received: device_id={device_id}, value={value}'
            )
            return

        self.get_logger().info(f'Serial message ignored (type={msg_type}): {line}')

    def destroy_node(self):
        self.serial_client.close()
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = SerialBridgeNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
