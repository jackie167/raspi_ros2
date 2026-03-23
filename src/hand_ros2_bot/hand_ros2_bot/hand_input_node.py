import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class HandInputNode(Node):
    def __init__(self):
        super().__init__('hand_input_node')
        self.publisher_ = self.create_publisher(String, 'cmd_input', 10)
        self.timer = self.create_timer(2.0, self.publish_command)
        self.commands = ['left', 'right', 'stop']
        self.index = 0

    def publish_command(self):
        msg = String()
        msg.data = self.commands[self.index]
        self.publisher_.publish(msg)
        self.get_logger().info(f'Hand: {msg.data}')
        self.index = (self.index + 1) % len(self.commands)


def main(args=None):
    rclpy.init(args=args)
    node = HandInputNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
