import rclpy
from rclpy.node import Node
from std_msgs.msg import String
import sys
import termios
import tty


class KeyboardNode(Node):
    def __init__(self):
        super().__init__('keyboard_node')
        self.publisher_ = self.create_publisher(String, 'cmd_input', 10)
        self.get_logger().info('Keyboard node started')

    def get_key(self):
        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            key = sys.stdin.read(1)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        return key

    def run(self):
        if not sys.stdin.isatty():
            self.get_logger().error(
                'No interactive TTY detected. '
                'Run with a real terminal or use launch arg use_keyboard:=false.'
            )
            return

        while rclpy.ok():
            key = self.get_key()

            msg = String()

            if key == 'w':
                msg.data = 'forward'
            elif key == 's':
                msg.data = 'backward'
            elif key == 'a':
                msg.data = 'left'
            elif key == 'd':
                msg.data = 'right'
            elif key == 'q':
                msg.data = 'stop'
            else:
                continue

            self.publisher_.publish(msg)
            self.get_logger().info(f'Publish: {msg.data}')


def main(args=None):
    rclpy.init(args=args)
    node = KeyboardNode()

    try:
        node.run()
    except KeyboardInterrupt:
        pass

    node.destroy_node()
    rclpy.shutdown()
