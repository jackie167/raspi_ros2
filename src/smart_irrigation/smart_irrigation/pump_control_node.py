import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class PumpControlNode(Node):
    def __init__(self):
        super().__init__('pump_control_node')
        self.command_sub = self.create_subscription(
            String,
            'irrigation/pump_command',
            self.on_command,
            10,
        )
        self.state_pub = self.create_publisher(String, 'irrigation/pump_state', 10)
        self.current_state = 'OFF'

    def on_command(self, msg):
        command = msg.data.strip().upper()
        if command in ('ON', 'OFF'):
            self.current_state = command
            self.get_logger().info(f'Pump command accepted: {command}')
        else:
            self.get_logger().warning(f'Unknown pump command: {msg.data}')
            return

        state_msg = String()
        state_msg.data = self.current_state
        self.state_pub.publish(state_msg)


def main(args=None):
    rclpy.init(args=args)
    node = PumpControlNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
